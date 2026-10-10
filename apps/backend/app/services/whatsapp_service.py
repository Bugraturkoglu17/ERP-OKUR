"""
WhatsApp Cloud API servisi — iş emri bildirimleri.

Env değişkenleri (opsiyonel — yoksa mock mod):
  WHATSAPP_ACCESS_TOKEN
  WHATSAPP_PHONE_NUMBER_ID
  WHATSAPP_BUSINESS_ACCOUNT_ID
  WHATSAPP_TEMPLATE_NAME      (default: work_order_notification)
  WHATSAPP_WEBHOOK_VERIFY_TOKEN
  FRONTEND_URL                (iş emri public link base URL)
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


@dataclass
class WorkOrderNotification:
    store_name: str
    store_code: Optional[str]
    work_type_label: str
    title: str
    description: Optional[str]
    store_address: Optional[str]
    store_phone: Optional[str]
    public_url: str
    to_phone: str
    assigned_name: Optional[str]
    attachment_url: Optional[str] = None


WORK_TYPE_LABELS = {
    "maintenance":   "Bakım",
    "fault":         "Arıza",
    "repair":        "Onarım",
    "renovation":    "Tadilat",
    "manufacturing": "İmalat",
    "other":         "Diğer",
}


def _get_env(key: str, default: str = "") -> str:
    return os.environ.get(key, "") or default


def _build_message_text(n: WorkOrderNotification) -> str:
    lines = [
        "🔧 *SİSMİK İş Emri*",
        "",
        f"Mağaza: {n.store_name}",
    ]
    if n.store_code:
        lines.append(f"Kod: {n.store_code}")
    lines.append(f"İş Tipi: {n.work_type_label}")
    lines.append(f"Konu: {n.title}")

    if n.description:
        lines += ["", "Detay:", n.description]

    if n.store_phone:
        lines.append(f"Telefon: {n.store_phone}")
    lines.append("")
    lines.append("Adres / Konum:")
    lines.append(n.store_address if n.store_address else "Adres bilgisi bulunmuyor.")

    lines.append("")
    lines.append("Ek Fotoğraf / Dosya:")
    lines.append(n.attachment_url if n.attachment_url else "Yok")

    lines += [
        "",
        "İşi görüntülemek, sonucu bildirmek ve fotoğraf/servis formu yüklemek için:",
        n.public_url,
        "",
        "Lütfen iş tamamlandığında gerekli fotoğraf veya servis formunu yükleyiniz.",
    ]
    return "\n".join(lines)


def _format_phone(phone: str) -> str:
    """E.164 formatına dönüştür: +90 veya 0 öneki ile gelen numaraları normalize et."""
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("+"):
        return phone[1:]
    if phone.startswith("00"):
        return phone[2:]
    if phone.startswith("0"):
        return "90" + phone[1:]
    return phone


class WhatsAppService:
    """
    WhatsApp Cloud API ile iş emri bildirimi gönderir.
    ACCESS_TOKEN yoksa log çıkar, hata yükseltmez (mock mod).
    """

    GRAPH_URL = "https://graph.facebook.com/v19.0"

    def __init__(self) -> None:
        self.access_token        = _get_env("WHATSAPP_ACCESS_TOKEN")
        self.phone_number_id     = _get_env("WHATSAPP_PHONE_NUMBER_ID")
        self.template_name       = _get_env("WHATSAPP_TEMPLATE_NAME", "work_order_notification")
        self.verify_token        = _get_env("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "sismik_verify")
        self.frontend_url        = _get_env("FRONTEND_URL", "http://localhost:3001")
        self.mock_mode           = not self.access_token or not self.phone_number_id

        if self.mock_mode:
            logger.warning(
                "[WhatsApp] WHATSAPP_ACCESS_TOKEN veya WHATSAPP_PHONE_NUMBER_ID eksik — "
                "mock modda çalışıyor. Mesajlar gönderilmeyecek."
            )

    def build_public_url(self, token: str) -> str:
        return f"{self.frontend_url}/is-emri/{token}"

    async def send_work_order(self, notification: WorkOrderNotification) -> dict:
        """
        İş emri bildirimi gönderir.
        Döner: {"success": bool, "message_id": str | None, "error": str | None}
        """
        text = _build_message_text(notification)

        if self.mock_mode:
            logger.info(
                "[WhatsApp MOCK] → %s\n%s",
                notification.to_phone,
                text,
            )
            return {"success": True, "message_id": "mock-" + notification.to_phone, "error": None}

        phone = _format_phone(notification.to_phone)
        payload = {
            "messaging_product": "whatsapp",
            "to": phone,
            "type": "text",
            "text": {"body": text},
        }

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self.GRAPH_URL}/{self.phone_number_id}/messages",
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type":  "application/json",
                    },
                    json=payload,
                )
            data = resp.json()
            if resp.status_code == 200:
                msg_id = data.get("messages", [{}])[0].get("id")
                logger.info("[WhatsApp] Gönderildi → %s  msg_id=%s", phone, msg_id)
                return {"success": True, "message_id": msg_id, "error": None}
            else:
                err = str(data.get("error", data))
                logger.error("[WhatsApp] API hatası: %s", err)
                return {"success": False, "message_id": None, "error": err}
        except Exception as exc:
            logger.exception("[WhatsApp] İstek hatası: %s", exc)
            return {"success": False, "message_id": None, "error": str(exc)}


whatsapp_service = WhatsAppService()
