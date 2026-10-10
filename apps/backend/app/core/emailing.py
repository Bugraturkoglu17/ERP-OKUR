from __future__ import annotations

import json
from dataclasses import dataclass
from email.utils import parseaddr
from typing import Any, Sequence
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import (
    OutboundEmailAudit,
    PlatformTenantSettings,
    TenantEmailMode,
)


@dataclass
class EmailIdentity:
    from_email: str
    from_name: str
    reply_to: str | None
    mode_applied: TenantEmailMode


@dataclass
class TenantMailPreferences:
    notifications_enabled: bool
    digest_mode: str
    opt_out_templates: set[str]


def _normalize_email(value: str | None) -> str | None:
    if not value:
        return None
    _, email = parseaddr(value)
    normalized = (email or value).strip().lower()
    return normalized or None


def _parse_opt_out_templates(raw: str | None) -> set[str]:
    if not raw:
        return set()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return {str(item).strip() for item in parsed if str(item).strip()}
    except json.JSONDecodeError:
        return set()
    return set()


def resolve_tenant_preferences(tenant_settings: PlatformTenantSettings | None) -> TenantMailPreferences:
    if not tenant_settings:
        return TenantMailPreferences(
            notifications_enabled=True,
            digest_mode="immediate",
            opt_out_templates=set(),
        )

    digest_mode = (tenant_settings.email_digest_mode or "immediate").strip().lower()
    if digest_mode not in {"immediate", "daily"}:
        digest_mode = "immediate"

    return TenantMailPreferences(
        notifications_enabled=bool(tenant_settings.email_notifications_enabled),
        digest_mode=digest_mode,
        opt_out_templates=_parse_opt_out_templates(tenant_settings.email_opt_out_templates),
    )


def resolve_tenant_email_identity(tenant_settings: PlatformTenantSettings | None) -> EmailIdentity:
    default_from = _normalize_email(settings.EMAIL_FROM_DEFAULT) or "noreply@okur.local"
    default_from_name = (settings.EMAIL_FROM_NAME_DEFAULT or "OKUR").strip()
    default_reply_to = _normalize_email(settings.EMAIL_REPLY_TO_DEFAULT)

    if not tenant_settings:
        return EmailIdentity(
            from_email=default_from,
            from_name=default_from_name,
            reply_to=default_reply_to,
            mode_applied=TenantEmailMode.PLATFORM,
        )

    requested_mode = tenant_settings.email_mode or TenantEmailMode.PLATFORM
    from_name = (tenant_settings.from_name or default_from_name).strip()
    reply_to = _normalize_email(tenant_settings.reply_to) or default_reply_to
    tenant_from = _normalize_email(tenant_settings.from_email)

    if (
        requested_mode == TenantEmailMode.TENANT_DOMAIN
        and tenant_settings.email_domain_verified
        and tenant_from
    ):
        return EmailIdentity(
            from_email=tenant_from,
            from_name=from_name,
            reply_to=reply_to,
            mode_applied=TenantEmailMode.TENANT_DOMAIN,
        )

    return EmailIdentity(
        from_email=default_from,
        from_name=from_name,
        reply_to=reply_to,
        mode_applied=TenantEmailMode.PLATFORM,
    )


def should_deliver_template(template: str, tenant_settings: PlatformTenantSettings | None) -> tuple[bool, str | None]:
    prefs = resolve_tenant_preferences(tenant_settings)
    if not prefs.notifications_enabled:
        return False, "tenant_notifications_disabled"
    if prefs.digest_mode == "daily":
        return False, "tenant_daily_digest_mode"
    if template in prefs.opt_out_templates:
        return False, "tenant_template_opt_out"
    return True, None


async def _send_via_resend(*, identity: EmailIdentity, recipients: Sequence[str], subject: str, text: str, html: str | None) -> str:
    payload: dict[str, object] = {
        "from": f"{identity.from_name} <{identity.from_email}>",
        "to": list(recipients),
        "subject": subject,
        "text": text,
    }
    if html:
        payload["html"] = html
    if identity.reply_to:
        payload["reply_to"] = [identity.reply_to]

    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post("https://api.resend.com/emails", headers=headers, json=payload)
    response.raise_for_status()
    response_data = response.json()
    return str(response_data.get("id") or "")


async def send_tenant_email(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    tenant_settings: PlatformTenantSettings | None,
    template: str,
    to: Sequence[str],
    subject: str,
    text: str,
    html: str | None = None,
    raise_on_failure: bool = False,
) -> OutboundEmailAudit:
    identity = resolve_tenant_email_identity(tenant_settings)
    recipients = [addr.strip().lower() for addr in to if addr and addr.strip()]
    if not recipients:
        raise ValueError("At least one recipient is required.")

    should_deliver, reason = should_deliver_template(template, tenant_settings)

    audit = OutboundEmailAudit(
        tenant_id=tenant_id,
        template=template,
        recipient_count=len(recipients),
        provider=settings.EMAIL_PROVIDER,
        status="queued",
    )
    db.add(audit)
    await db.flush()

    if not should_deliver:
        audit.status = "skipped"
        audit.error_message = reason
        db.add(audit)
        await db.flush()
        return audit

    if settings.EMAIL_PROVIDER != "resend":
        audit.status = "failed"
        audit.error_message = f"Unsupported provider: {settings.EMAIL_PROVIDER}"
        db.add(audit)
        await db.flush()
        if raise_on_failure:
            raise RuntimeError(audit.error_message)
        return audit

    if not settings.RESEND_API_KEY:
        audit.status = "failed"
        audit.error_message = "RESEND_API_KEY is not configured."
        db.add(audit)
        await db.flush()
        if raise_on_failure:
            raise RuntimeError(audit.error_message)
        return audit

    try:
        provider_message_id = await _send_via_resend(
            identity=identity,
            recipients=recipients,
            subject=subject,
            text=text,
            html=html,
        )
        audit.status = "sent"
        audit.provider_message_id = provider_message_id or None
        audit.error_message = None
    except Exception as exc:
        audit.status = "failed"
        audit.error_message = str(exc)[:2000]
        if raise_on_failure:
            db.add(audit)
            await db.flush()
            raise

    db.add(audit)
    await db.flush()
    return audit


def enqueue_tenant_email(
    *,
    tenant_id: UUID,
    template: str,
    to: Sequence[str],
    subject: str,
    text: str,
    html: str | None = None,
) -> None:
    from app.core.workers.tasks import send_tenant_email_task

    recipients = [addr.strip().lower() for addr in to if addr and addr.strip()]
    if not recipients:
        return

    payload: dict[str, Any] = {
        "tenant_id": str(tenant_id),
        "template": template,
        "to": recipients,
        "subject": subject,
        "text": text,
        "html": html,
    }

    if settings.EMAIL_ASYNC_ENABLED:
        send_tenant_email_task.delay(payload)
    else:
        send_tenant_email_task.apply(args=[payload])
