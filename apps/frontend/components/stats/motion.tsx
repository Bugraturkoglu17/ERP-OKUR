"use client";

import {
  createContext, useContext, useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type DependencyList, type ReactNode,
} from "react";

type Listener = (progress: number) => void;
type Clock = {
  /** 0 → 1 arası son ilerleme. */
  progress: number;
  /** everyFrame: her karede (halka yayları); değilse saniyede en çok ~25 kez (sayılar). */
  subscribe: (listener: Listener, everyFrame?: boolean) => () => void;
};

/** Saat yokken her şey son değerinde durur. */
const FINISHED: Clock = { progress: 1, subscribe: () => () => undefined };
const ClockContext = createContext<Clock>(FINISHED);

/** Sayıların yeniden yazılma aralığı (ms). Her karede yazmak eski bilgisayarlarda kasıyordu. */
const STEP_MS = 40;

/**
 * İstatistik sayfasının tek saati. Eski bilgisayarlarda kasmaması için React'i yeniden
 * çizdirmez: sayılar (CountUp) ve halkalar (useClockEffect) ilerlemeyi doğrudan DOM'a yazar,
 * çubuklar (.stat-grow-x / .stat-grow-y) ise aynı gecikme, süre ve hız eğrisiyle ekran
 * kartının çalıştırdığı CSS animasyonudur (`--stat-delay`).
 * Sekme arka plandaysa doğrudan son değeri verir.
 */
export function StatClock({ delay = 0, duration = 1600, className, children }: {
  delay?: number; duration?: number; className?: string; children: ReactNode;
}) {
  const [clock] = useState(() => {
    const frame = new Set<Listener>();
    const step = new Set<Listener>();
    return {
      progress: 0, frame, step,
      subscribe(listener: Listener, everyFrame = false) {
        const set = everyFrame ? frame : step;
        set.add(listener);
        return () => { set.delete(listener); };
      },
    };
  });

  useEffect(() => {
    const emit = (progress: number, withSteps: boolean) => {
      clock.progress = progress;
      clock.frame.forEach((listener) => listener(progress));
      if (withSteps) clock.step.forEach((listener) => listener(progress));
    };
    if (document.hidden) { emit(1, true); return; }
    let handle = 0;
    let start: number | null = null;
    let lastStep = -Infinity;
    const tick = (time: number) => {
      if (start === null) start = time;
      const ratio = Math.min(Math.max((time - start - delay) / duration, 0), 1);
      // Yavaş başlar, ortada hızlanır, yavaş biter (CSS tarafındaki cubic-bezier(0.65, 0, 0.35, 1) ile aynı eğri).
      const progress = ratio < 0.5 ? 4 * ratio ** 3 : 1 - Math.pow(-2 * ratio + 2, 3) / 2;
      if (ratio > 0) {
        const stepDue = ratio >= 1 || time - lastStep >= STEP_MS;
        if (stepDue) lastStep = time;
        emit(progress, stepDue);
      }
      if (ratio < 1) handle = requestAnimationFrame(tick);
    };
    emit(0, true);
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [clock, delay, duration]);

  return (
    <ClockContext.Provider value={clock}>
      <div className={className} style={{ "--stat-delay": `${delay}ms` } as CSSProperties}>{children}</div>
    </ClockContext.Provider>
  );
}

/**
 * İlerleme değiştikçe `apply` çağrılır (React yeniden çizilmez); `deps` değişince o anki
 * ilerlemeyle yeniden uygulanır. Halka grafikler için her karede çalışır.
 */
export function useClockEffect(apply: Listener, deps: DependencyList): void {
  const clock = useContext(ClockContext);
  useLayoutEffect(() => {
    apply(clock.progress);
    return clock.subscribe(apply, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, ...deps]);
}

/**
 * Tam sayının ilerlemeye göre o anki değeri. Yukarı yuvarlanır ve son adım en sona saklanır:
 * küçük sayılar da (ör. 4) ilk adımda saymaya başlar ve büyüklerle aynı anda biter.
 */
export function countAt(value: number, progress: number): number {
  if (progress >= 1 || value <= 0) return value;
  return Math.max(0, Math.min(Math.ceil(value * progress - 1e-9), value - 1));
}

/** Sıfırdan hedef değere sayarak artan sayı. */
export function CountUp({ value, format }: { value: number; format?: (value: number) => string }) {
  const clock = useContext(ClockContext);
  const ref = useRef<HTMLSpanElement>(null);
  const formatRef = useRef(format);
  formatRef.current = format;

  useLayoutEffect(() => {
    const write = (progress: number) => {
      if (!ref.current) return;
      const fn = formatRef.current;
      const text = fn ? fn(progress >= 1 ? value : value * progress) : countAt(value, progress).toLocaleString("tr-TR");
      if (ref.current.textContent !== text) ref.current.textContent = text;
    };
    write(clock.progress);
    return clock.subscribe(write);
  }, [clock, value]);

  return <span ref={ref} />;
}

/** Sırayla beliren kutu: index büyüdükçe daha geç girer. */
export function Reveal({ index = 0, step = 60, className = "", children, as: Tag = "div", style }: {
  index?: number; step?: number; className?: string; children: ReactNode; as?: "div" | "section" | "li"; style?: CSSProperties;
}) {
  return <Tag className={`stat-reveal ${className}`} style={{ animationDelay: `${index * step}ms`, ...style }}>{children}</Tag>;
}

export const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });
