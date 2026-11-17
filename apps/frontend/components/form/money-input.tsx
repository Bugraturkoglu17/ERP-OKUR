"use client";

import { useLayoutEffect, useRef, type InputHTMLAttributes } from "react";

/**
 * Para yazımı (Türkçe): nokta binlik ayırıcı, virgül ondalık, en fazla 2 kuruş hanesi.
 * "1500000" → "1.500.000", "1500,5" → "1.500,5". Sona yazılan nokta ondalık virgülü sayılır
 * ("1500." → "1.500,"), çünkü binlik noktalarını kullanıcı değil bu fonksiyon koyar.
 */
export function formatMoneyInput(raw: string): string {
  let text = raw.replace(/[^0-9.,]/g, "");
  if (text.endsWith(".") && !text.includes(",")) text = `${text.slice(0, -1)},`;
  text = text.replace(/\./g, "");
  const comma = text.indexOf(",");
  const hasFraction = comma !== -1;
  let whole = hasFraction ? text.slice(0, comma) : text;
  const fraction = hasFraction ? text.slice(comma + 1).replace(/,/g, "").slice(0, 2) : "";
  whole = whole.replace(/^0+(?=\d)/, "");
  if (!whole && hasFraction) whole = "0";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return hasFraction ? `${grouped},${fraction}` : grouped;
}

/** API'den gelen sayı → düzenleme kutusundaki yazım ("98700.5" → "98.700,5"). */
export function moneyInputFromNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

/** "15.000,50" → "15000.50"; boş → null; geçersiz → undefined. */
export function parseMoneyInput(raw: string): string | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  const normalized = text.replace(/\./g, "").replace(",", ".").replace(/\.$/, "");
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? normalized : undefined;
}

const significant = (text: string) => text.replace(/[^0-9,]/g, "").length;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** Yazarken binlik ayırıcı koyan para kutusu; imleç yerini korur. */
export function MoneyInput({ value, onValueChange, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || caret.current === null) return;
    let position = 0;
    for (let seen = 0; position < value.length && seen < caret.current; position += 1) {
      if (/[0-9,]/.test(value[position])) seen += 1;
    }
    caret.current = null;
    if (document.activeElement === el) el.setSelectionRange(position, position);
  });

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(event) => {
        let raw = event.target.value;
        // Yapıştırılan "1500.50" gibi noktalı ondalık yazımı virgüle çevir (tek tek yazımda nokta binliktir).
        const native = event.nativeEvent as InputEvent;
        const pasted = native.inputType === "insertFromPaste" || (native.data?.length ?? 0) > 1;
        if (pasted && /^\d+\.\d{1,2}$/.test(raw.trim())) raw = raw.trim().replace(".", ",");
        const before = raw.slice(0, event.target.selectionStart ?? raw.length);
        const typedDecimalDot = raw.endsWith(".") && !raw.includes(",") && before.length === raw.length;
        caret.current = significant(before) + (typedDecimalDot ? 1 : 0);
        onValueChange(formatMoneyInput(raw));
      }}
    />
  );
}
