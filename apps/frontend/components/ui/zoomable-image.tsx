"use client";

import { useRef, useState, useEffect, type CSSProperties } from "react";

// Zoom = pinch/çift dokunma ile büyütme + tek parmakla kaydırma (pan).
// Pan HER ZAMAN kenar taşması olmadan sınırlanır (clamp): görselin kenarları
// hiçbir zoom/pan kombinasyonunda kapsayıcının dışına taşıp boşluk/crop
// göstermez (bkz. clampOffset). Önceki sürümde pan tamamen sınırsızdı —
// görsel ekran dışına sonsuz sürüklenebiliyordu, "crop" hatasının kaynağı
// buydu. Ondan önceki düzeltme pan'ı tümden kaldırıp zoom'u matematiksel
// olarak ~1.3x'e sabitlemişti (MAX_SCALE = 1/BASE_FRACTION) — bu da zoom'u
// kullanılamaz derecede düşürdü. Bu sürüm pan'ı GERİ getirir ama düzgün
// sınırlar, böylece hem gerçek zoom aralığı (MAX_SCALE) hem de "asla ekran
// dışına taşmama" garantisi birlikte sağlanır.
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 3;
const DOUBLE_TAP_MS = 300;

type Point = { x: number; y: number };

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Sayfa genelinde viewport zoom kapalı (user-scalable=no) — bu bileşen sadece
 * kendi içinde, dokunmatik iki-parmak pinch, çift-dokunma ve sürükleyerek
 * kaydırma ile manuel büyütme/küçültme sağlar. Görsel taban görünümde
 * (scale=1) her zaman tamamen görünür ve ortalanmış (object-contain); zoom
 * arttıkça sürüklenebilir ama kenarları asla kapsayıcının dışına taşıp
 * boşluk göstermez. Sadece fotoğraf görüntüleme (lightbox) gibi yerlerde
 * kullanılmalı, sayfanın geneline uygulanmamalı.
 */
export function ZoomableImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);

  const pinchStartDist = useRef(0);
  const pinchStartScale = useRef(MIN_SCALE);
  const pinchAnchor = useRef<Point>({ x: 0, y: 0 });
  const panStart = useRef<Point | null>(null);
  const offsetStart = useRef<Point>({ x: 0, y: 0 });
  const lastTap = useRef(0);

  // Yeni fotoğrafa geçince zoom/pan sıfırlansın (fit-to-screen görünüme dön).
  useEffect(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  // Görselin kenarları kapsayıcının dışına taşıp boşluk göstermesin diye
  // pan miktarını sınırlar. img.clientWidth/Height CSS transform'dan
  // etkilenmez — yani scale ne olursa olsun her zaman scale=1'deki
  // (object-contain ile hesaplanmış) taban render boyutunu verir.
  const clampOffset = (next: Point, nextScale: number): Point => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return { x: 0, y: 0 };
    const maxX = Math.max(0, (img.clientWidth * nextScale - container.clientWidth) / 2);
    const maxY = Math.max(0, (img.clientHeight * nextScale - container.clientHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const zoomAt = (point: Point, nextScaleRaw: number) => {
    const nextScale = clampScale(nextScaleRaw);
    const el = containerRef.current;
    if (!el) {
      setScale(nextScale);
      return;
    }
    const rect = el.getBoundingClientRect();
    const cx = point.x - rect.left - rect.width / 2;
    const cy = point.y - rect.top - rect.height / 2;
    setOffset((prev) => {
      const ratio = nextScale / scale;
      return clampOffset({ x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio }, nextScale);
    });
    setScale(nextScale);
  };

  const resetZoom = () => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const a = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const b = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      pinchStartDist.current = distance(a, b);
      pinchStartScale.current = scale;
      pinchAnchor.current = midpoint(a, b);
      panStart.current = null;
      setIsInteracting(true);
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        if (scale > MIN_SCALE) resetZoom();
        else zoomAt({ x: e.touches[0].clientX, y: e.touches[0].clientY }, DOUBLE_TAP_SCALE);
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
      if (scale > MIN_SCALE) {
        panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        offsetStart.current = offset;
        setIsInteracting(true);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const a = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const b = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      const dist = distance(a, b);
      if (pinchStartDist.current > 0) {
        const next = pinchStartScale.current * (dist / pinchStartDist.current);
        zoomAt(pinchAnchor.current, next);
      }
    } else if (e.touches.length === 1 && panStart.current && scale > MIN_SCALE) {
      e.preventDefault();
      const dx = e.touches[0].clientX - panStart.current.x;
      const dy = e.touches[0].clientY - panStart.current.y;
      setOffset(clampOffset({ x: offsetStart.current.x + dx, y: offsetStart.current.y + dy }, scale));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchStartDist.current = 0;
    if (e.touches.length === 0) {
      panStart.current = null;
      setIsInteracting(false);
    }
  };

  const imgStyle: CSSProperties = {
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    transformOrigin: "center",
    transition: isInteracting ? "none" : "transform 150ms ease-out",
    touchAction: "none",
    cursor: scale > MIN_SCALE ? "grab" : "zoom-in",
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (scale > MIN_SCALE) resetZoom();
        else zoomAt({ x: e.clientX, y: e.clientY }, DOUBLE_TAP_SCALE);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt ?? ""}
        draggable={false}
        className={`max-h-full max-w-full object-contain ${className ?? ""}`}
        style={imgStyle}
      />
    </div>
  );
}
