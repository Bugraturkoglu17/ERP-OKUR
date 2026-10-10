"use client";

type BrandTone = "red" | "amber";

const toneColor: Record<BrandTone, string> = {
  red: "#ff3131",
  amber: "#fbbf24",
};

const ICON_PATH =
  "M 1284.949219 187.699219 L 1284.949219 1312.292969 L 911.484375 985.53125 C 854.46875 935.667969 854.46875 846.976562 911.484375 797.113281 L 1143.132812 999.835938 L 1143.132812 500.15625 L 215.039062 1312.292969 L 215.039062 187.699219 L 696.167969 608.695312 L 670.921875 630.777344 C 623.703125 672.089844 553.257812 672.089844 506.039062 630.777344 L 356.859375 500.15625 L 356.859375 999.785156 Z M 1284.949219 187.699219 ";

export function BrandMark({ tone = "red", className = "h-8 w-8", animated = false }: {
  tone?: BrandTone;
  className?: string;
  animated?: boolean;
}) {
  // Statik id — SSR/hydrate arasında useId sapması (kayıp SVG clip/gradient
  // referansı → açılışta logonun bir an "kırık" görünmesi) olmasın diye.
  // `animated` amblem aynı anda yalnızca TEK yerde (açılış ekranı) render
  // edilir; çakışma olmaz.
  const clipId = "erp-mark-clip";
  const sheenId = "erp-mark-sheen";

  return (
    <svg
      viewBox="0 0 1500 1500"
      role="img"
      aria-label="Sismik ERP amblemi"
      className={`${className} ${animated ? "erp-brand-mark--animated" : ""}`}
      style={{ color: toneColor[tone] }}
      fill="none"
    >
      {animated && (
        <defs>
          <clipPath id={clipId}>
            <path d={ICON_PATH} />
          </clipPath>
          <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="38%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="white" stopOpacity="0.95" />
            <stop offset="62%" stopColor="white" stopOpacity="0" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      <path className="erp-brand-fill" fill={toneColor[tone]} d={ICON_PATH} />
      {animated && (
        <g clipPath={`url(#${clipId})`}>
          <rect
            className="erp-brand-sheen"
            x="-450"
            y="-1900"
            width="450"
            height="5300"
            fill={`url(#${sheenId})`}
          />
        </g>
      )}
    </svg>
  );
}

export type { BrandTone };
