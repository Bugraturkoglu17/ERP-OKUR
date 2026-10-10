# ─────────────────────────────────────────────────────────────────────────────
#  V1 — Documents Routes
#  File Management / OCI Storage / Versioning
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import time
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Path, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.storage import storage, sanitize_filename
from app.core.exceptions import NotFoundError, ConflictError
from app.db.models import Document, User
from app.core.dependencies import get_current_user, is_platform_admin
from app.db.models import Project
from app.db.schemas import (
    ArchiveTransferRequest,
    DocumentCreate,
    DocumentRead,
    DocumentUpdate,
    DocumentVersionCreate,
    DocumentDownloadResponse,
)

router = APIRouter()


def _is_manager(user: User) -> bool:
    return is_platform_admin(user) or (user.default_role or "") in {"admin", "manager"}


def _ensure_project_scope(user: User, project: Project) -> None:
    if not is_platform_admin(user) and (not user.tenant_id or project.tenant_id != user.tenant_id):
        raise HTTPException(status_code=403, detail="Bu mağaza şirket kapsamınız dışında.")


async def _ensure_document_scope(user: User, doc: Document, db: AsyncSession) -> None:
    if is_platform_admin(user):
        return
    if doc.project_id:
        project = await db.get(Project, doc.project_id)
        if project:
            _ensure_project_scope(user, project)
            return
    uploader = await db.get(User, doc.uploaded_by) if doc.uploaded_by else None
    if not uploader or uploader.tenant_id != user.tenant_id:
        raise HTTPException(status_code=403, detail="Bu dosya şirket kapsamınız dışında.")


async def populate_uploader_details(docs: list[Document] | Document, db: AsyncSession) -> list[Document] | Document:
    is_single = False
    if isinstance(docs, Document):
        is_single = True
        docs_list = [docs]
    else:
        docs_list = list(docs)
        
    uploader_ids = {d.uploaded_by for d in docs_list if d.uploaded_by}
    if not uploader_ids:
        return docs if not is_single else docs_list[0]
        
    users_result = await db.execute(select(User).where(User.id.in_(uploader_ids)))
    users_lookup = {u.id: u for u in users_result.scalars()}
    
    for d in docs_list:
        if d.uploaded_by and d.uploaded_by in users_lookup:
            u = users_lookup[d.uploaded_by]
            object.__setattr__(d, "uploaded_by_name", u.full_name)
            object.__setattr__(d, "uploaded_by_email", u.email)
            
    return docs_list[0] if is_single else docs_list


@router.post(
    "/upload",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni döküman yükle",
)
async def upload_document(
    project_id:    uuid.UUID = Form(...),
    doc_type:      str       = Form(...),
    revision_note: str | None = Form(None),
    expense_id:    uuid.UUID | None = Form(None),
    process_id:    uuid.UUID | None = Form(None),
    vi_meta:       str | None = Form(None),
    file:          UploadFile = File(...),
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
) -> Document:
    project = await db.get(Project, project_id)
    if not project:
        raise NotFoundError(detail="Mağaza bulunamadı.")
    _ensure_project_scope(current_user, project)
    # ── 1 · Dosyayı oku ve S3/OCI'ya yükle ───────────────────────────────────────
    content = await file.read()
    safe_name = sanitize_filename(file.filename or "file")
    file_key = f"projects/{project_id}/{doc_type}/{int(time.time())}_{safe_name}"
    
    try:
        uploaded_key = await storage.upload_file(
            file_content=content,
            file_key=file_key,
            content_type=file.content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulut depolama hatası: {e}")

    # ── 2 · DB kaydını oluştur ──────────────────────────────────────────────────
    doc = Document(
        project_id    = project_id,
        doc_type      = doc_type,
        original_name = file.filename,
        file_key      = uploaded_key,
        bucket_name   = storage.bucket_name,
        file_size_bytes = len(content),
        mime_type     = file.content_type,
        revision_note = revision_note,
        version       = 1,
        uploaded_by   = current_user.id,
        expense_id    = expense_id,
        process_id    = process_id,
        vi_meta       = vi_meta,
    )
    db.add(doc)
    
    try:
        await db.commit()
        await db.refresh(doc)
    except Exception as e:
        # Fiziksel dosyayı temizle
        await storage.delete_file(uploaded_key)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Veritabanı kaydı başarısız: {e}")

    await populate_uploader_details(doc, db)
    return doc


@router.get(
    "/project/{project_id}",
    response_model=list[DocumentRead],
    summary="Projeye ait dökümanları listele",
)
async def list_project_documents(
    project_id: uuid.UUID,
    db:         AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
) -> list[Document]:
    project = await db.get(Project, project_id)
    if not project:
        raise NotFoundError(detail="Mağaza bulunamadı.")
    _ensure_project_scope(current_user, project)
    # Only return the latest version of each document group (parent_id is None or current)
    # A simpler way: just list all and let frontend handle or list only archived=False
    query = select(Document).where(
        Document.project_id == project_id,
        Document.archived == False
    )

    # Apply discipline-based restriction for discipline_only engineers
    if current_user.discipline_only and current_user.discipline:
        allowed_types = ["field_report", "photo", "revision", "other"]
        mapped_drawing = f"drawing_{current_user.discipline}"
        allowed_types.append(mapped_drawing)
        query = query.where(Document.doc_type.in_(allowed_types))

    query = query.order_by(Document.created_at.desc())
    
    result = await db.execute(query)
    docs = list(result.scalars())
    await populate_uploader_details(docs, db)
    return docs


@router.get(
    "/{doc_id}/download",
    response_model=DocumentDownloadResponse,
    summary="Döküman için indirme linki oluştur",
)
async def download_document(
    doc_id: uuid.UUID,
    download: bool = Query(False),
    db:     AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentDownloadResponse:
    doc = await db.get(Document, doc_id)
    if not doc:
        raise NotFoundError(detail="Döküman bulunamadı.")
    await _ensure_document_scope(current_user, doc, db)
    
    url = await storage.generate_presigned_url(
        doc.file_key,
        download_name=doc.original_name if download else None,
    )
    return DocumentDownloadResponse(url=url, expires_in=3600)


@router.post(
    "/{doc_id}/version",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Döküman yeni versiyonu yükle",
)
async def upload_document_version(
    doc_id:        uuid.UUID = Path(...),
    revision_note: str | None = Form(None),
    file:          UploadFile = File(...),
    db:            AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
) -> Document:
    # ── 1 · Eski dökümanı bul ───────────────────────────────────────────────────
    old_doc = await db.get(Document, doc_id)
    if not old_doc:
        raise NotFoundError(detail="Kaynak döküman bulunamadı.")
    
    # ── 2 · Dosyayı yükle ───────────────────────────────────────────────────────
    content = await file.read()
    safe_name = sanitize_filename(file.filename or "file")
    new_file_key = f"projects/{old_doc.project_id}/{old_doc.doc_type}/{int(time.time())}_{safe_name}"
    
    try:
        uploaded_key = await storage.upload_file(
            file_content=content,
            file_key=new_file_key,
            content_type=file.content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulut depolama hatası: {e}")

    # ── 3 · Versiyonlama mantığı ────────────────────────────────────────────────
    # Eskisini arşive al
    old_doc.archived = True
    
    # Yeni versiyon kaydı
    # If old_doc was already a version, use its parent_id; otherwise it's the parent.
    parent_id = old_doc.parent_id if old_doc.parent_id else old_doc.id
    
    new_doc = Document(
        project_id    = old_doc.project_id,
        doc_type      = old_doc.doc_type,
        original_name = file.filename,
        file_key      = uploaded_key,
        bucket_name   = storage.bucket_name,
        file_size_bytes = len(content),
        mime_type     = file.content_type,
        revision_note = revision_note,
        version       = old_doc.version + 1,
        parent_id     = parent_id,
        uploaded_by   = current_user.id,
    )
    db.add(new_doc)
    
    try:
        await db.commit()
        await db.refresh(new_doc)
    except Exception as e:
        await storage.delete_file(uploaded_key)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Versiyon kaydı başarısız: {e}")

    await populate_uploader_details(new_doc, db)
    return new_doc


@router.patch(
    "/{doc_id}",
    response_model=DocumentRead,
    summary="Döküman bilgilerini güncelle",
)
async def update_document(
    doc_id: uuid.UUID,
    body:   DocumentUpdate,
    db:     AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    doc = await db.get(Document, doc_id)
    if not doc:
        raise NotFoundError(detail="Döküman bulunamadı.")
    await _ensure_document_scope(current_user, doc, db)

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(doc, key, value)
    
    try:
        await db.commit()
        await db.refresh(doc)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Güncelleme başarısız: {e}")
    
    return doc


@router.delete(
    "/{doc_id}",
    summary="Dökümanı sil (arşive al)",
)
async def delete_document(
    doc_id: uuid.UUID,
    db:     AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Dosya silme yetkiniz yok.")
    doc = await db.get(Document, doc_id)
    if not doc:
        raise NotFoundError(detail="Döküman bulunamadı.")
    await _ensure_document_scope(current_user, doc, db)
    
    doc.archived = True
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get(
    "/{doc_id}/versions",
    response_model=list[DocumentRead],
    summary="Dökümanın tüm versiyon geçmişini listele",
)
async def list_document_versions(
    doc_id: uuid.UUID,
    db:     AsyncSession = Depends(get_db),
    current_user: User   = Depends(get_current_user),
) -> list[Document]:
    doc = await db.get(Document, doc_id)
    if not doc:
        raise NotFoundError(detail="Döküman bulunamadı.")
    
    root_id = doc.parent_id if doc.parent_id else doc.id
    
    query = select(Document).where(
        (Document.parent_id == root_id) | (Document.id == root_id)
    ).order_by(Document.version.desc())
    
    result = await db.execute(query)
    versions = list(result.scalars())
    await populate_uploader_details(versions, db)
    return versions


# ── Genel Arşiv ───────────────────────────────────────────────────────────────

async def _populate_transfer_project(docs: list[Document], db: AsyncSession) -> None:
    """Taşındıysa hedef mağaza adını ve kodunu ekle."""
    project_ids = {d.transferred_project_id for d in docs if d.transferred_project_id}
    if not project_ids:
        return
    result = await db.execute(select(Project).where(Project.id.in_(project_ids)))
    proj_map = {p.id: p for p in result.scalars()}
    for d in docs:
        if d.transferred_project_id and d.transferred_project_id in proj_map:
            p = proj_map[d.transferred_project_id]
            object.__setattr__(d, "transferred_project_name", p.name)
            object.__setattr__(d, "transferred_project_no", p.project_no)


@router.post(
    "/archive/upload",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Genel Arşive dosya yükle (proje bağlantısı yok)",
)
async def upload_archive_document(
    doc_type:      str        = Form(default="other"),
    revision_note: str | None = Form(None),
    file:          UploadFile = File(...),
    db:            AsyncSession = Depends(get_db),
    current_user:  User         = Depends(get_current_user),
) -> Document:
    content  = await file.read()
    safe_name = sanitize_filename(file.filename or "file")
    file_key  = f"archive/{int(time.time())}_{safe_name}"

    try:
        uploaded_key = await storage.upload_file(
            file_content=content,
            file_key=file_key,
            content_type=file.content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulut depolama hatası: {e}")

    doc = Document(
        project_id      = None,
        doc_type        = doc_type,
        original_name   = file.filename,
        file_key        = uploaded_key,
        bucket_name     = storage.bucket_name,
        file_size_bytes = len(content),
        mime_type       = file.content_type,
        revision_note   = revision_note,
        version         = 1,
        uploaded_by     = current_user.id,
        is_archive      = True,
        archive_status  = "archive",
    )
    db.add(doc)
    try:
        await db.commit()
        await db.refresh(doc)
    except Exception as e:
        await storage.delete_file(uploaded_key)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Veritabanı kaydı başarısız: {e}")

    await populate_uploader_details(doc, db)
    return doc


@router.get(
    "/archive",
    response_model=list[DocumentRead],
    summary="Genel Arşiv dosya listesi",
)
async def list_archive_documents(
    q:            str | None = None,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
) -> list[Document]:
    query = select(Document).where(
        Document.is_archive == True,
        Document.archived   == False,
    )
    if not is_platform_admin(current_user):
        query = query.join(User, Document.uploaded_by == User.id).where(User.tenant_id == current_user.tenant_id)
    if q:
        like = f"%{q.lower()}%"
        from sqlalchemy import func as sa_func
        query = query.where(
            sa_func.lower(Document.original_name).like(like)
        )
    query = query.order_by(Document.created_at.desc())
    result = await db.execute(query)
    docs = list(result.scalars())
    await populate_uploader_details(docs, db)
    await _populate_transfer_project(docs, db)
    return docs


@router.post(
    "/archive/{doc_id}/transfer",
    response_model=DocumentRead,
    summary="Arşiv dosyasını mağaza kartına taşı",
)
async def transfer_archive_document(
    doc_id:       uuid.UUID,
    body:         ArchiveTransferRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
) -> Document:
    doc = await db.get(Document, doc_id)
    if not doc:
        raise NotFoundError(detail="Döküman bulunamadı.")
    if not doc.is_archive:
        raise HTTPException(status_code=400, detail="Bu döküman arşiv dosyası değil.")

    project = await db.get(Project, body.project_id)
    if not project:
        raise NotFoundError(detail="Proje bulunamadı.")
    _ensure_project_scope(current_user, project)

    if not is_platform_admin(current_user):
        uploader = await db.get(User, doc.uploaded_by) if doc.uploaded_by else None
        if not uploader or uploader.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=403, detail="Bu dosya şirket kapsamınız dışında.")

    from app.db.models import utc_now as _utc_now
    doc.project_id              = body.project_id
    doc.doc_type                = body.doc_type
    doc.archive_status          = "transferred"
    doc.transferred_project_id  = body.project_id
    doc.transferred_category    = body.doc_type
    doc.transferred_at          = _utc_now()

    try:
        await db.commit()
        await db.refresh(doc)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Taşıma başarısız: {e}")

    await populate_uploader_details(doc, db)
    object.__setattr__(doc, "transferred_project_name", project.name)
    object.__setattr__(doc, "transferred_project_no", project.project_no)
    return doc
