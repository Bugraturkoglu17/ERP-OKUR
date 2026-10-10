import logging
import httpx
from typing import Any, Dict

from app.core.config import settings

logger = logging.getLogger(__name__)

async def send_whatsapp_template(
    phone_number: str,
    template_name: str,
    language_code: str = "tr",
    components: list[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    WhatsApp Cloud API üzerinden şablon mesaj gönderir.
    """
    token = settings.WHATSAPP_ACCESS_TOKEN
    phone_id = settings.WHATSAPP_PHONE_NUMBER_ID
    api_version = settings.WHATSAPP_API_VERSION
    
    if not token or not phone_id:
        raise ValueError("WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured.")

    url = f"https://graph.facebook.com/{api_version}/{phone_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "messaging_product": "whatsapp",
        "to": phone_number,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {
                "code": language_code
            }
        }
    }
    
    if components:
        payload["template"]["components"] = components

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()
