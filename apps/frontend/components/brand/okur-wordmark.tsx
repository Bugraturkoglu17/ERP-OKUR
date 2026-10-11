"use client";

import Image from "next/image";

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
