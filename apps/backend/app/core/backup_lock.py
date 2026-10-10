# ─────────────────────────────────────────────────────────────────────────────
#  Sismik Mekanik ERP — Yedekleme Eşzamanlılık Kilidi
#
#  Northflank muhtemelen birden çok backend instance/worker koşturuyor, bu
#  yüzden basit bir process-içi kilit (login rate-limiter'daki gibi) çoklu
#  instance'ta yeterli DEĞİL. Redis (zaten Celery broker'ı olarak bağımlılık)
#  üzerinden SET NX EX tabanlı dağıtık kilit kullanılır.
#
#  Redis erişilemezse (örn. yerel geliştirme ortamında Redis çalışmıyorsa),
#  aynı login-rate-limiter deseniyle tek-instance'a özgü bellek-içi bir
#  fallback'e düşülür — yerelde tek uvicorn process'i çalıştığı için doğru
#  sonuç verir, ama çoklu instance production'da bu dala HİÇ düşülmemesi
#  beklenir (Redis prod'da zaten Celery için zorunlu).
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio
import time
from typing import Optional

import redis.asyncio as aioredis

from app.core.config import settings

_redis_client: Optional["aioredis.Redis"] = None

# Bellek-içi fallback: key -> kilidin bitiş zamanı (time.monotonic() bazlı).
_inmemory_locks: dict[str, float] = {}
_inmemory_guard = asyncio.Lock()


def _get_redis() -> "aioredis.Redis":
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
        )
    return _redis_client


async def acquire_lock(key: str, ttl_seconds: int) -> bool:
    """Kilidi almayı dener. Alınabildiyse True, hâlihazırda tutuluyorsa False döner."""
    try:
        client = _get_redis()
        acquired = await client.set(key, "1", nx=True, ex=ttl_seconds)
        return bool(acquired)
    except Exception as exc:  # Redis'e ulaşılamıyor — bellek-içi fallback
        print(f"[WARN] Redis kilit servisi kullanılamıyor ({exc}); tek-instance bellek-içi kilide düşülüyor.")
        async with _inmemory_guard:
            now = time.monotonic()
            expiry = _inmemory_locks.get(key)
            if expiry is not None and expiry > now:
                return False
            _inmemory_locks[key] = now + ttl_seconds
            return True


async def release_lock(key: str) -> None:
    """Kilidi serbest bırakır — hem Redis hem bellek-içi fallback'te (job başarısız/tamamlanınca çağrılır)."""
    try:
        client = _get_redis()
        await client.delete(key)
    except Exception:
        pass
    async with _inmemory_guard:
        _inmemory_locks.pop(key, None)
