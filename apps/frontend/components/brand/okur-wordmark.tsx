"use client";

import Image from "next/image";
import { HIDE_BRAND } from "@/lib/brand";

type OkurWordmarkProps = {
  className?: string;
  animated?: boolean;
  dark?: boolean;
  priority?: boolean;
};

/** The supplied OKUR lockup, without the product photo or a surrounding frame. */
export function OkurWordmark({
  className = "",
  animated = false,
  dark = false,
  priority = false,
}: OkurWordmarkProps) {
  if (HIDE_BRAND) {
    // Marka gizliyken logo yerine, kutunun genişliğine göre ölçeklenen sade "ERP" yazısı.
    return (
      <div role="img" aria-label="ERP" className={`shrink-0 ${className}`} style={{ containerType: "inline-size" }}>
        <span
          className={`block font-extrabold leading-none tracking-[-0.04em] ${dark ? "text-white" : "text-slate-900"}`}
          style={{ fontSize: "24cqw" }}
        >
          ERP
        </span>
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label="OKUR Teknik Soğutma"
      className={`okur-wordmark ${animated ? "okur-wordmark--animated" : ""} ${dark ? "okur-wordmark--dark" : ""} ${className}`}
    >
      <Image
        src="/branding/okur-wordmark.png"
        alt=""
        fill
        priority={priority}
        draggable={false}
        sizes="(max-width: 640px) 72vw, 450px"
        className="object-contain"
      />
      {dark && <span aria-hidden="true" className="okur-wordmark__light-script" />}
      {animated && <span aria-hidden="true" className="okur-wordmark__sheen" />}
    </div>
  );
}
