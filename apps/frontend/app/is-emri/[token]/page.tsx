"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle, Camera, CheckCircle2, FileText, Loader2,
  MapPin, Phone, Search, Trash2, XCircle,
} from "lucide-react";
import { buildApiUrl } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type AdminPhoto = { id: string; file_url?: string; photo_type: string; file_name?: string };

type WorkOrderData = {
  id: string; project_id: string;
  project_name: string; project_no?: string;
  project_address?: string; project_phone?: string;
  work_type: string; work_type_label: string;
  title: string; description?: string;
  priority: string; status: string;
  location_url?: string; due_date?: string;
  photos: AdminPhoto[]; has_service_form: boolean;
};

// Fotoğraf önizleme için yerel tip
type LocalPhoto = { id: string; file_url?: string; previewUrl?: string; file_name?: string };

const STATUS_OPTIONS = [
  { value: "started",          label: "İşe Başladım",    color: "border-amber-400 bg-amber-50 text-amber-800"      },
  { value: "completed",        label: "İş Tamamlandı",   color: "border-emerald-500 bg-emerald-50 text-emerald-800" },
  { value: "failed",           label: "Tamamlanmadı",    color: "border-red-400 bg-red-50 text-red-800"            },
  { value: "material_waiting", label: "Malzeme Bekliyor",color: "border-orange-400 bg-orange-50 text-orange-800"   },
  { value: "revisit",          label: "Tekrar Gidilecek",color: "border-purple-400 bg-purple-50 text-purple-800"   },
  { value: "cancelled",        label: "İptal Edildi",    color: "border-slate-400 bg-slate-50 text-slate-700"      },
];

const FINISHED_STATUSES = new Set(["completed", "failed", "cancelled"]);

const PRIORITY_LABELS: Record<string, string> = {
  normal: "Normal", urgent: "⚠️ Acil", critical: "🔴 Kritik",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Taslak", sent: "Gönderildi", started: "Devam Ediyor",
  completed: "Tamamlandı", failed: "Tamamlanmadı", cancelled: "İptal",
  material_waiting: "Malzeme Bekliyor", revisit: "Tekrar Gidilecek",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function apiErrDetail(ex: unknown): string {
  const e = ex as { response?: { data?: { detail?: string } } };
  return e?.response?.data?.detail ?? "Bir hata oluştu. Lütfen tekrar deneyin.";
}

async function publicUpload(url: string, fd: FormData): Promise<unknown> {
  const r = await fetch(url, { method: "POST", body: fd });
  if (!r.ok) throw { response: { data: await r.json().catch(() => ({})) } };
  return r.json();
}

async function publicPost(url: string, body: unknown): Promise<unknown> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw { response: { data: await r.json().catch(() => ({})) } };
  return r.json();
}

// ── Photo Grid — önizleme + silme ─────────────────────────────────────────────

function PhotoGrid({ photos, onRemove }: { photos: LocalPhoto[]; onRemove: (id: string) => void }) {
  if (photos.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map(ph => (
        <div key={ph.id} className="relative group rounded-xl overflow-hidden border border-slate-200">
          {(ph.previewUrl || ph.file_url) ? (
            <img
              src={ph.previewUrl ?? ph.file_url}
              alt={ph.file_name ?? "foto"}
              className="w-full h-24 object-cover"
            />
          ) : (
            <div className="w-full h-24 bg-slate-100 flex items-center justify-center">
              <Camera className="h-6 w-6 text-slate-300" />
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(ph.id)}
            className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Photo Uploader ─────────────────────────────────────────────────────────────

function PhotoUploader({
  token, photos, onAdd, onRemove,
}: {
  token: string;
  photos: LocalPhoto[];
  onAdd: (photo: LocalPhoto) => void;
  onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true); setErr("");
    try {
      for (const file of Array.from(files)) {
        // Anında önizleme göster
        const previewUrl = URL.createObjectURL(file);
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        onAdd({ id: tempId, previewUrl, file_name: file.name });

        const fd = new FormData();
        fd.append("file", file);
        fd.append("photo_type", "completion");
        const res = await publicUpload(buildApiUrl(`/public/work-orders/${token}/photos`), fd) as { id: string; file_url?: string };
        // Geçici ID'yi sunucu ID'siyle değiştir
        onRemove(tempId);
        onAdd({ id: res.id, file_url: res.file_url, previewUrl, file_name: file.name });
      }
    } catch (ex) {
      setErr(apiErrDetail(ex));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <PhotoGrid photos={photos} onRemove={onRemove} />
      {/* Gizli input: mobilde kamera + galeri, masaüstünde dosya seçici */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={e => upload(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-500 hover:border-blue-400 hover:text-blue-600 active:scale-95 transition-all disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        {busy ? "Yükleniyor..." : photos.length > 0 ? "Fotoğraf Ekle" : "Fotoğraf Çek / Seç"}
      </button>
      {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
    </div>
  );
}

// ── Service Form Uploader ──────────────────────────────────────────────────────

function ServiceFormUploader({ token, onUploaded }: { token: string; onUploaded: () => void }) {
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");
  const [uploaded, setUploaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const now = new Date();

  const upload = async (file: File | null | undefined) => {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("year",  String(now.getFullYear()));
      fd.append("month", String(now.getMonth() + 1));
      fd.append("uploaded_by_name", "");
      await publicUpload(buildApiUrl(`/public/work-orders/${token}/service-form`), fd);
      setUploaded(true);
      onUploaded();
    } catch (ex) {
      setErr(apiErrDetail(ex));
    } finally { setBusy(false); }
  };

  if (uploaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> Servis formu başarıyla yüklendi ✓
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls"
        hidden
        onChange={e => upload(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-500 hover:border-emerald-400 hover:text-emerald-600 active:scale-95 transition-all disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
        {busy ? "Yükleniyor..." : "Servis Formu Yükle (PDF / Fotoğraf / Excel)"}
      </button>
      {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
    </div>
  );
}

// ── Completed Summary ──────────────────────────────────────────────────────────

function CompletedView({ data, photos }: { data: WorkOrderData; photos: LocalPhoto[] }) {
  const statusLabel = STATUS_LABELS[data.status] ?? data.status;
  const isCompleted = data.status === "completed";

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border-2 p-5 text-center ${isCompleted ? "border-emerald-400 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}>
        {isCompleted
          ? <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
          : <XCircle className="h-10 w-10 text-slate-400 mx-auto mb-2" />}
        <p className="text-base font-bold text-slate-800">{statusLabel}</p>
        <p className="text-xs text-slate-500 mt-1">Bu iş emri işlendi. Tekrar düzenleme yapılamaz.</p>
      </div>
      {photos.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Yüklenen Fotoğraflar</p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map(ph => ph.file_url ? (
              <a key={ph.id} href={ph.file_url} target="_blank" rel="noreferrer">
                <img src={ph.file_url} alt={ph.file_name ?? "foto"} className="rounded-xl w-full h-24 object-cover border border-slate-200" />
              </a>
            ) : null)}
          </div>
        </div>
      )}
      {data.has_service_form && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Servis formu yüklendi ✓
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PublicWorkOrderPage() {
  const params = useParams();
  const token = params.token as string;

  const [data,    setData]    = useState<WorkOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [selectedStatus, setSelectedStatus] = useState("");
  const [notes,          setNotes]          = useState("");
  const [photos,         setPhotos]         = useState<LocalPhoto[]>([]);
  const [hasServiceForm, setHasServiceForm] = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [submitErr,      setSubmitErr]      = useState("");
  const [submitted,      setSubmitted]      = useState(false);

  useEffect(() => {
    fetch(buildApiUrl(`/public/work-orders/${token}`))
      .then(r => {
        if (r.status === 404) { setError("not_found"); return null; }
        if (!r.ok)            { setError("server_error"); return null; }
        return r.json();
      })
      .then((d: WorkOrderData | null) => {
        if (!d) return;
        setData(d);
        setPhotos(
          (d.photos ?? []).map(p => ({ id: p.id, file_url: p.file_url, file_name: p.file_name }))
        );
        setHasServiceForm(d.has_service_form);
        // Zaten işlenmiş durumdaysa seçili durumu ayarla
        if (d.status && !["draft", "sent"].includes(d.status)) {
          setSelectedStatus(d.status);
        }
      })
      .catch(() => setError("server_error"))
      .finally(() => setLoading(false));
  }, [token]);

  const addPhoto    = (ph: LocalPhoto) => setPhotos(prev => [...prev, ph]);
  const removePhoto = (id: string)     => setPhotos(prev => prev.filter(p => p.id !== id));

  const handleSubmit = async () => {
    if (!selectedStatus) { setSubmitErr("Lütfen bir durum seçin."); return; }
    const completionPhotos = photos.filter(p => !data?.photos.find(ap => ap.id === p.id));
    const totalPhotos = photos.length;

    if (selectedStatus === "completed") {
      if (totalPhotos === 0) {
        setSubmitErr("İşi tamamlandı olarak kapatmak için en az bir fotoğraf yüklemelisiniz.");
        return;
      }
      if (data?.work_type === "maintenance" && !hasServiceForm) {
        setSubmitErr("Bakım işini tamamlamak için servis formu yüklemelisiniz.");
        return;
      }
    }

    setSubmitting(true); setSubmitErr("");
    try {
      await publicPost(buildApiUrl(`/public/work-orders/${token}/submit`), {
        status: selectedStatus,
        completion_notes: notes.trim() || null,
      });
      setSubmitted(true);
    } catch (ex) {
      setSubmitErr(apiErrDetail(ex));
    } finally { setSubmitting(false); }
  };

  // ── Yükleniyor ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Token geçersiz / silinmiş ────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 gap-4 text-center">
        <XCircle className="h-16 w-16 text-red-300" />
        <div>
          <p className="text-lg font-bold text-slate-700">
            {error === "not_found" ? "Bu iş emri artık aktif değil." : "İş Emri Bulunamadı"}
          </p>
          <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">
            Bu bağlantı geçersiz veya süresi dolmuş olabilir. Yöneticinizle iletişime geçin.
          </p>
        </div>
      </div>
    );
  }

  // ── Başarılı gönderim ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 gap-4 text-center">
        <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        <div>
          <p className="text-lg font-bold text-slate-800">İş sonucu başarıyla gönderildi.</p>
          <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">
            Bildiriminiz alındı. Teşekkürler!
          </p>
        </div>
        <p className="text-[11px] text-slate-400 mt-4">SİSMİK Mekanik ERP</p>
      </div>
    );
  }

  const isAlreadyFinished = FINISHED_STATUSES.has(data.status);
  const isMaintenance = data.work_type === "maintenance";
  const needsServiceForm = isMaintenance && selectedStatus === "completed" && !hasServiceForm;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobil header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2 sticky top-0 z-10">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
          <span className="text-[10px] font-black text-white">S</span>
        </div>
        <span className="text-sm font-bold text-slate-800">SİSMİK İş Emri</span>
        <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
          {data.work_type_label}
        </span>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4 pb-10">

        {/* İş bilgileri */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500">{PRIORITY_LABELS[data.priority]}</span>
            {data.due_date && (
              <span className="text-[11px] text-slate-400">
                Termin: {new Date(data.due_date).toLocaleDateString("tr-TR")}
              </span>
            )}
          </div>
          <h1 className="text-base font-bold text-slate-900 leading-tight">{data.title}</h1>
          {data.description && (
            <p className="text-sm text-slate-600 leading-relaxed">{data.description}</p>
          )}
        </div>

        {/* Mağaza bilgileri */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mağaza</p>
          <div>
            <p className="text-sm font-bold text-slate-900">{data.project_name}</p>
            {data.project_no && <p className="text-xs text-slate-400 font-mono mt-0.5">{data.project_no}</p>}
            {data.project_address && <p className="text-xs text-slate-500 mt-1">{data.project_address}</p>}
          </div>
          <div className="flex gap-2">
            {data.location_url && (
              <a href={data.location_url} target="_blank" rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white active:scale-95 transition-transform">
                <MapPin className="h-4 w-4" /> Konuma Git
              </a>
            )}
            {!data.location_url && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.project_name + " " + (data.project_no ?? ""))}`}
                target="_blank" rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white active:scale-95 transition-transform">
                <Search className="h-4 w-4" /> Mağazayı Bul
              </a>
            )}
            {data.project_phone ? (
              <a href={`tel:${data.project_phone}`}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 bg-white active:scale-95 transition-transform">
                <Phone className="h-4 w-4" /> Ara
              </a>
            ) : null}
          </div>
        </div>

        {/* Admin tarafından eklenen fotoğraflar */}
        {data.photos.filter(p => p.photo_type !== "completion").length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ekli Referans Fotoğrafları</p>
            <div className="grid grid-cols-3 gap-2">
              {data.photos.filter(p => p.photo_type !== "completion").map(ph => (
                ph.file_url ? (
                  <a key={ph.id} href={ph.file_url} target="_blank" rel="noreferrer">
                    <img src={ph.file_url} alt={ph.file_name ?? "foto"} className="rounded-xl w-full h-24 object-cover border border-slate-200" />
                  </a>
                ) : null
              ))}
            </div>
          </div>
        )}

        {/* Tamamlanmış iş emri — düzenleme engelle */}
        {isAlreadyFinished ? (
          <CompletedView data={data} photos={photos} />
        ) : (
          <>
            {/* Fotoğraf yükleme */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Fotoğraf Yükle</p>
                {selectedStatus === "completed" && photos.length === 0 && (
                  <span className="text-[10px] text-red-500 font-semibold">Zorunlu</span>
                )}
              </div>
              <PhotoUploader
                token={token}
                photos={photos.filter(p => data.photos.find(ap => ap.id === p.id) === undefined)}
                onAdd={addPhoto}
                onRemove={removePhoto}
              />
            </div>

            {/* Servis formu (bakım) */}
            {isMaintenance && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Servis Formu</p>
                  {needsServiceForm && (
                    <span className="text-[10px] text-red-500 font-semibold">Zorunlu</span>
                  )}
                </div>
                {hasServiceForm ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> Servis formu yüklendi ✓
                  </div>
                ) : (
                  <>
                    <ServiceFormUploader token={token} onUploaded={() => setHasServiceForm(true)} />
                    {isMaintenance && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        ⚠️ Bakım işlerinde servis formu zorunludur.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Durum seçimi */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">İş Durumu</p>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setSelectedStatus(opt.value)}
                    className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold text-left transition-all active:scale-95 ${
                      selectedStatus === opt.value
                        ? opt.color + " border-current shadow-sm"
                        : "border-slate-200 text-slate-700 hover:border-slate-300 bg-white"
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Açıklama / Not</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  rows={3} placeholder="Varsa notunuzu yazın..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none resize-none" />
              </div>
            </div>

            {/* Hata mesajı */}
            {submitErr && (
              <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 leading-relaxed">{submitErr}</p>
              </div>
            )}

            {/* Gönder butonu */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !selectedStatus}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-base font-bold text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all shadow-md"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              {submitting ? "Gönderiliyor..." : "Sonucu Bildir"}
            </button>
          </>
        )}

        <p className="text-center text-[10px] text-slate-400 pb-2">
          SİSMİK Mekanik ERP · İş Emri Takip Sistemi
        </p>
      </div>
    </div>
  );
}
