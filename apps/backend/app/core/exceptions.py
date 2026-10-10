# ─────────────────────────────────────────────────────────────────────────────
#  Sismik Mekanik ERP — Custom Exceptions
# ─────────────────────────────────────────────────────────────────────────────

class AppException(Exception):
    """Tüm özel exception'ların temel sınıfı."""

    status_code: int = 400
    detail: str = "Bir hata oluştu."

    def __init__(self, detail: str | None = None, status_code: int | None = None) -> None:
        self.detail   = detail   or self.detail
        self.status_code = status_code or self.status_code
        super().__init__(self.detail)


class NotFoundError(AppException):
    status_code = 404
    detail = "Kayıt bulunamadı."


class ForbiddenError(AppException):
    status_code = 403
    detail = "Bu işlem için yetkiniz yok."


class UnauthorizedError(AppException):
    status_code = 401
    detail = "Kimlik doğrulama gerekli."


class ValidationError(AppException):
    status_code = 422
    detail = "Doğrulama hatası."


class ConflictError(AppException):
    status_code = 409
    detail = "Kayıt zaten mevcut."
