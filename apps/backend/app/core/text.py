"""Turkish-aware casing for human-readable names and addresses."""

_TURKISH_I = str.maketrans({"i": "İ", "ı": "I"})


def upper_tr(value: str) -> str:
    return value.translate(_TURKISH_I).upper()
