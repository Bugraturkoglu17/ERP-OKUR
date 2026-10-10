import logging
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel
import json
import hmac
import hashlib
from uuid import UUID

from app.core.config import settings
from app.core.database import get_db
from app.db.models import OutboundWhatsAppAudit
from app.core.workers.tasks import send_whatsapp_message_task

logger = logging.getLogger(__name__)

class TestTemplateRequest(BaseModel):
    tenant_id: UUID
    phone_number: str
    technician_name: str
    project_name: str
    form_token: Optional[str] = None
    form_url: Optional[str] = None
    template_name: str = "servis_gorev_atamasi_v2"
    location_lat: Optional[str] = "41.0082"
    location_long: Optional[str] = "28.9784"
    location_name: Optional[str] = "Proje Konumu"
    location_address: Optional[str] = "İstanbul, Türkiye"

router = APIRouter()

@router.get("/webhook")
async def verify_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
):
    """Meta webhook verification endpoint."""
    if hub_mode == "subscribe":
        if hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
            return Response(content=hub_challenge, media_type="text/plain")
        else:
            raise HTTPException(status_code=403, detail="Verification token mismatch")
    raise HTTPException(status_code=400, detail="Invalid request")


@router.post("/webhook")
async def receive_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Handle incoming webhook events from Meta (messages, statuses)."""
    # 1. Signature Verification
    body_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    
    if settings.WHATSAPP_APP_SECRET and signature:
        expected_sig = hmac.new(
            settings.WHATSAPP_APP_SECRET.encode('utf-8'),
            body_bytes,
            hashlib.sha256
        ).hexdigest()
        
        # Meta sends signature as "sha256=..."
        if not signature.startswith("sha256=") or not hmac.compare_digest(expected_sig, signature[7:]):
            logger.warning("Invalid X-Hub-Signature-256")
            raise HTTPException(status_code=403, detail="Invalid signature")

    payload = json.loads(body_bytes.decode('utf-8'))
    logger.info(f"WhatsApp Webhook Payload: {payload}")
    
    try:
        if payload.get("object") == "whatsapp_business_account":
            for entry in payload.get("entry", []):
                for change in entry.get("changes", []):
                    value = change.get("value", {})
                    
                    if "statuses" in value:
                        for status_event in value["statuses"]:
                            wamid = status_event.get("id")
                            status = status_event.get("status")
                            timestamp_str = status_event.get("timestamp")
                            
                            if wamid and status:
                                result = await db.execute(
                                    select(OutboundWhatsAppAudit).where(OutboundWhatsAppAudit.provider_message_id == wamid)
                                )
                                audit = result.scalars().first()
                                
                                if audit:
                                    audit.status = status
                                    
                                    # Extract pricing and conversation info
                                    conversation = status_event.get("conversation", {})
                                    pricing = status_event.get("pricing", {})
                                    
                                    if conversation.get("id"):
                                        audit.conversation_id = conversation.get("id")
                                    if pricing.get("pricing_model") or pricing.get("category"):
                                        audit.pricing_category = pricing.get("category", "unknown")

                                    if timestamp_str:
                                        ts = datetime.fromtimestamp(int(timestamp_str))
                                        if status == "delivered":
                                            audit.delivered_at = ts
                                        elif status == "read":
                                            audit.read_at = ts
                                            
                                    if "errors" in status_event:
                                        audit.error_message = str(status_event["errors"])
                                        
                                    await db.commit()
                                else:
                                    logger.warning(f"WhatsApp webhook status received for unknown wamid: {wamid}")
                                
        return Response(content="EVENT_RECEIVED", status_code=200)
    except Exception as e:
        logger.error(f"Error processing WhatsApp webhook: {str(e)}")
        return Response(content="EVENT_RECEIVED", status_code=200)

@router.post("/test-template")
async def test_template(
    body: TestTemplateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Uçtan uca WhatsApp şablon test endpoint'i.
    Servis görev ataması şablonu (servis_gorev_atamasi) gönderimi için kuyruğa atar.
    """
    components = []
    
    if body.template_name == "servis_gorev_atamasi_v2":
        components = [
            {
                "type": "header",
                "parameters": [
                    {
                        "type": "location",
                        "location": {
                            "latitude": body.location_lat,
                            "longitude": body.location_long,
                            "name": body.location_name,
                            "address": body.location_address
                        }
                    }
                ]
            },
            {
                "type": "body",
                "parameters": [
                    {"type": "text", "text": body.technician_name or "-"},
                    {"type": "text", "text": body.project_name or "-"}
                ]
            },
            {
                "type": "button",
                "sub_type": "url",
                "index": "0",
                "parameters": [
                    {"type": "text", "text": body.form_token or "-"}
                ]
            }
        ]
    else:
        components = [
            {
                "type": "body",
                "parameters": [
                    {"type": "text", "text": body.technician_name or "-"},
                    {"type": "text", "text": body.project_name or "-"},
                    {"type": "text", "text": body.form_url or "-"}
                ]
            }
        ]

    payload = {
        "components": components
    }
    
    audit = OutboundWhatsAppAudit(
        tenant_id=body.tenant_id,
        phone_number=body.phone_number,
        template_name=body.template_name,
        status="queued",
        payload_json=json.dumps(payload, ensure_ascii=False)
    )
    
    db.add(audit)
    await db.commit()
    await db.refresh(audit)
    
    # Celery kuyruğuna audit ID gönder
    send_whatsapp_message_task.delay(str(audit.id))
    
    return {
        "audit_id": str(audit.id),
        "status": "queued",
        "message": "Template sending task enqueued successfully."
    }
