"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { getRequestErrorMessage } from "@/lib/api";
import {
  getSubcontractorAssignment, listSubcontractors, setSubcontractorAssignment, setSubcontractorRating,
  type Subcontractor, type SubcontractorAssignment, type WorkTarget,
} from "@/services/subcontractors";

/**
 * İş emri ya da proje adımı için taşeron seçimi ve iş tamamlanınca 1–5 puan.
 * Yalnız yönetici ekranlarında kullanılır (uç noktalar yöneticiye açıktır).
 * `doneHint` değişince (iş tamamlandı vb.) atama yeniden okunur.
 */
export function SubcontractorAssignmentBox({ target, editable = true, doneHint, className = "" }: {
  target: WorkTarget; editable?: boolean; doneHint?: unknown; className?: string;
}) {
  const [options, setOptions] = useState<Subcontractor[]>([]);
  const [data, setData] = useState<SubcontractorAssignment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = "work_order_id" in target ? `wo-${target.work_order_id}` : `st-${target.stage_id}`;

  const load = useCallback(async () => {
    try {
      const [list, current] = await Promise.all([listSubcontractors(), getSubcontractorAssignment(target)]);
      setOptions(list); setData(current); setError("");
    } catch (reason) { setError(getRequestErrorMessage(reason, "Taşeron bilgisi yüklenemedi.")); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { void load(); }, [load, doneHint]);

  async function run(action: () => Promise<SubcontractorAssignment>, fallback: string) {
    setBusy(true); setError("");
    try { setData(await action()); } catch (reason) { setError(getRequestErrorMessage(reason, fallback)); } finally { setBusy(false); }
  }

  const id = `taseron-${key}`;
  const current = data?.subcontractor_id ?? "";
  // Pasife alınmış ama bu işe atanmış taşeronun adı da görünsün.
  const missing = current && !options.some((o) => o.id === current);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs text-muted-foreground">Taşeron</label>
      <div className="flex items-center gap-2">
        <select id={id} disabled={!editable || busy || !data} value={current}
          onChange={(e) => void run(() => setSubcontractorAssignment(target, e.target.value || null), "Taşeron kaydedilemedi.")}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-60">
          <option value="">Taşeron yok</option>
          {missing && <option value={current}>{data?.subcontractor_name ?? "Taşeron"}</option>}
          {options.map((o) => <option key={o.id} value={o.id}>{o.company_name}</option>)}
        </select>
        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />}
      </div>
      {data?.subcontractor_id && data.done && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Puan</span>
          <div className="flex items-center" role="radiogroup" aria-label="Taşeron puanı">
            {[1, 2, 3, 4, 5].map((score) => {
              const on = (data.score ?? 0) >= score;
              return (
                <button key={score} type="button" role="radio" aria-checked={data.score === score} aria-label={`${score} puan`}
                  disabled={!editable || busy}
                  onClick={() => void run(() => setSubcontractorRating(target, data.score === score ? null : score, data.note), "Puan kaydedilemedi.")}
                  className="rounded p-0.5 disabled:cursor-not-allowed">
                  <Star className={`h-5 w-5 ${on ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                </button>
              );
            })}
          </div>
          {data.score === null && <span className="text-xs text-slate-400">verilmedi</span>}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
