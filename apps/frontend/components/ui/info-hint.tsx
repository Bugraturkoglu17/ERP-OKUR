"use client";

import { Info } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const WIDTH = 260;

/**
 * Başlığın yanındaki "i" simgesi; üstüne gelince (ya da odaklanınca / dokununca) açıklamayı gösterir.
 * Kutu sayfa gövdesine çizilir; böylece kart ve pencere kenarlarında kesilmez, başlığın yazı biçimini almaz.
 */
export function InfoHint({ text, className = "" }: { text: ReactNode; className?: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const show = useCallback(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const above = rect.bottom + 96 > window.innerHeight;
    setPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8)),
      top: above ? rect.top - 6 : rect.bottom + 6,
      above,
    });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  return (
    <span className={`ml-1.5 inline-flex shrink-0 align-middle ${className}`}>
      <span
        ref={anchor}
        tabIndex={0}
        role="note"
        aria-label={typeof text === "string" ? text : "Açıklama"}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); show(); }}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-slate-400 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      {pos && createPortal(
        <span
          role="tooltip"
          style={{ position: "fixed", left: pos.left, top: pos.top, maxWidth: WIDTH, transform: pos.above ? "translateY(-100%)" : undefined }}
          className="pointer-events-none z-[1000] w-max rounded-lg bg-slate-900 px-2.5 py-1.5 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg"
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}
