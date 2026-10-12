"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, ArrowRightLeft, Check, Loader2, Search, X } from "lucide-react";
import { apiGet, apiPost, getRequestErrorMessage } from "@/lib/api";
import { formatQuantity, parseQuantity, quantityForApi, quantityProblem, sanitizeQuantityInput } from "@/lib/quantity";
import { MaterialTitle, foldText } from "@/components/retail-stock/material-picker";

export type TransferDepot = { id: string; kind: "main" | "vehicle"; name: string; plate: string | null; assigned_user_id: string | null };
type SourceRow = {
  material_id: string; sku: string; name: string; unit: string; category: string | null;
  brand?: string | null; spec?: string | null; quantity: string;
};

const VISIBLE_LIMIT = 40;

/**
 * Ana depo ↔ cep depo aktarımı: nereden/nereye seçilir, ürünler işaretlenip miktar yazılır
 * (veya "Tümünü aktar"). Tüm kalemler sunucuda tek işlemde uygulanır.
 */
export function TransferDialog({ depots, manager, initialSourceId, staffNames = {}, onClose, onDone }: {
  depots: TransferDepot[]; manager: boolean; initialSourceId?: string;
  /** Kullanıcı kimliği → ad; araç seçiminde kime ait olduğu görünsün diye. */
  staffNames?: Record<string, string>;
  onClose: () => void; onDone: (message: string) => void;
}) {
  const depotLabel = (depot: TransferDepot) => {
    if (depot.kind === "main") return `Ana depo · ${depot.name}`;
    const owner = depot.assigned_user_id ? staffNames[depot.assigned_user_id] : null;
    return `${depot.plate} · ${depot.name} — ${owner ?? (depot.assigned_user_id ? "atanmış" : "çalışan atanmamış")}`;
  };
  const main = depots.find((depot) => depot.kind === "main");
  const vehicles = depots.filter((depot) => depot.kind === "vehicle");
  // Yönetici her iki yönde aktarır; çalışan yalnızca kendi aracından ana depoya iade eder.
  const sources = useMemo(() => (manager ? [...(main ? [main] : []), ...vehicles] : vehicles), [manager, main, vehicles]);
  const targetsOf = (sourceId: string) => {
    const source = depots.find((depot) => depot.id === sourceId);
    return source?.kind === "main" ? vehicles : main ? [main] : [];
  };
  const defaultTarget = (sourceId: string) => {
    const options = targetsOf(sourceId);
    return options.length === 1 ? options[0].id : "";
  };

  const firstSource = sources.find((depot) => depot.id === initialSourceId) ?? sources[0];
  const [sourceId, setSourceId] = useState(firstSource?.id ?? "");
  const [targetId, setTargetId] = useState(() => defaultTarget(firstSource?.id ?? ""));
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const source = depots.find((depot) => depot.id === sourceId);
  const target = depots.find((depot) => depot.id === targetId);
  const targets = targetsOf(sourceId);

  useEffect(() => {
    if (!sourceId) return;
    let active = true;
    setLoading(true); setQuantities({}); setError("");
    apiGet<SourceRow[]>("/retail-stock/stock", { depot_id: sourceId })
      .then((data) => { if (active) setRows(data.filter((row) => Number(row.quantity) > 0)); })
      .catch((reason) => { if (active) setError(getRequestErrorMessage(reason, "Kaynak depo stoğu yüklenemedi.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sourceId]);

  const matching = useMemo(() => {
    const terms = foldText(search).split(/\s+/).filter(Boolean);
    return rows
      .filter((row) => {
        const haystack = foldText([row.name, row.spec, row.brand, row.sku, row.category].filter(Boolean).join(" "));
        return terms.every((term) => haystack.includes(term));
      })
      .sort((a, b) => a.sku.localeCompare(b.sku, "tr", { numeric: true }));
  }, [rows, search]);
  const visible = matching.slice(0, VISIBLE_LIMIT);

  const problemOf = (row: SourceRow) => {
    const raw = quantities[row.material_id];
    if (!raw) return "";
    const invalid = quantityProblem(raw);
    if (invalid) return invalid;
    return parseQuantity(raw) > Number(row.quantity) ? `Depoda en fazla ${formatQuantity(row.quantity)} ${row.unit} var.` : "";
  };
  const selected = rows.filter((row) => quantities[row.material_id] && !quantityProblem(quantities[row.material_id]));
  const setQuantity = (id: string, value: string) => { setError(""); setQuantities((current) => ({ ...current, [id]: value })); };
  const setFull = (row: SourceRow) => setQuantity(row.material_id, String(Number(row.quantity)).replace(".", ","));

  function changeSource(id: string) {
    setSourceId(id);
    setTargetId(defaultTarget(id));
    setSearch("");
  }

  function swap() {
    if (!manager || !source || !target) return;
    if (source.kind === "main") { setSourceId(target.id); setTargetId(main?.id ?? ""); }
    else { setSourceId(main?.id ?? ""); setTargetId(source.id); }
    setSearch("");
  }

  function transferAll() {
    if (rows.length === 0) return;
    if (!window.confirm(`${rows.length} kalemin tamamı ${source ? depotLabel(source) : "kaynak depo"} deposundan ${target ? depotLabel(target) : "hedef depo"} deposuna aktarılacak. Devam edilsin mi?`)) return;
    setQuantities(Object.fromEntries(rows.map((row) => [row.material_id, String(Number(row.quantity)).replace(".", ",")])));
  }

  async function submit() {
    const invalid = rows.find((row) => problemOf(row));
    if (invalid) {
      const overStock = !quantityProblem(quantities[invalid.material_id]);
      setError(overStock
        ? `Stok yetersiz: ${invalid.name} için depoda yalnızca ${formatQuantity(invalid.quantity)} ${invalid.unit} var.`
        : `${invalid.name}: ${problemOf(invalid)}`);
      return;
    }
    if (selected.length === 0) { setError("Aktarılacak en az bir ürün seçin ve miktarını yazın."); return; }
    if (!sourceId || !targetId) { setError("Aktarılacak aracı \"Nereye\" alanından seçin."); return; }
    setBusy(true); setError("");
    try {
      await apiPost("/retail-stock/transfer", {
        source_depot_id: sourceId, target_depot_id: targetId,
        lines: selected.map((row) => ({ material_id: row.material_id, quantity: quantityForApi(quantities[row.material_id]) })),
        note: note.trim() || null,
      });
      onDone(`${selected.length} kalem aktarıldı: ${source ? depotLabel(source) : ""} → ${target ? depotLabel(target) : ""}`);
    } catch (reason) {
      setError(getRequestErrorMessage(reason, "Aktarım yapılamadı."));
    } finally { setBusy(false); }
  }

  const selectClass = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#d90070]";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 backdrop-blur-sm sm:items-center sm:p-3" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Depo aktarımı" className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-[#bd0063]">OKUR DEPO</p><h2 className="mt-1 text-lg font-bold text-slate-950">{manager ? "Depo aktarımı" : "Ana depoya iade"}</h2></div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <label className="block text-xs font-semibold text-slate-600">Nereden
              <select value={sourceId} onChange={(event) => changeSource(event.target.value)} className={selectClass}>
                {sources.map((depot) => <option key={depot.id} value={depot.id}>{depotLabel(depot)}</option>)}
              </select>
            </label>
            {manager ? <button type="button" onClick={swap} aria-label="Yönü değiştir" className="mx-auto mb-0.5 rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:border-[#d90070]/40 hover:text-[#d90070]"><ArrowRightLeft className="h-4 w-4" /></button> : <ArrowRight className="mx-auto mb-3 hidden h-4 w-4 text-slate-300 sm:block" />}
            <label className="block text-xs font-semibold text-slate-600">Nereye
              <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className={selectClass}>
                {targets.length === 0 ? <option value="">Hedef depo yok</option> : targets.length > 1 && <option value="">Araç seçin</option>}
                {targets.map((depot) => <option key={depot.id} value={depot.id}>{depotLabel(depot)}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ürün adı, kodu veya kategori ara" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-base outline-none focus:border-[#d90070] sm:text-sm" /></div>
            <button type="button" onClick={transferAll} disabled={loading || rows.length === 0} className="rounded-xl bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-40">Tümünü aktar</button>
            <button type="button" onClick={() => setQuantities({})} disabled={selected.length === 0} className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-600 disabled:opacity-40">Temizle</button>
          </div>

          {loading ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Stok yükleniyor…</p>
            : rows.length === 0 ? <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Kaynak depoda aktarılabilecek stok yok.</p>
            : matching.length === 0 ? <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Aramayla eşleşen ürün yok.</p>
            : <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {visible.map((row) => {
                const problem = problemOf(row);
                const chosen = Boolean(quantities[row.material_id]) && !problem;
                return (
                  <li key={row.material_id} className={`px-3 py-2 ${problem ? "bg-red-50" : chosen ? "bg-[#fff6fa]" : ""}`}>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-semibold leading-snug text-slate-900"><MaterialTitle sku={row.sku} name={row.name} spec={row.spec} /></p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">Stok: <span className="font-semibold text-slate-700">{formatQuantity(row.quantity)} {row.unit}</span></p>
                      </div>
                      <input inputMode="decimal" autoComplete="off" value={quantities[row.material_id] ?? ""} placeholder="Miktar" aria-label={`${row.name} aktarılacak miktar`}
                        onChange={(event) => setQuantity(row.material_id, sanitizeQuantityInput(event.target.value))}
                        className="w-16 shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-base outline-none focus:border-[#d90070] sm:text-xs" />
                      <button type="button" onClick={() => setFull(row)} className="shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-[#d90070]/40">Tümü</button>
                      {chosen && <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Seçildi" />}
                    </div>
                    {problem && <p className="mt-1 text-[11px] font-medium text-red-700">{problem}</p>}
                  </li>
                );
              })}
            </ul>}
          {matching.length > VISIBLE_LIMIT && <p className="rounded-xl bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">{matching.length - VISIBLE_LIMIT} ürün daha var; aramayı daraltarak bulun.</p>}

          {selected.length > 0 && <div className="rounded-xl border border-[#d90070]/20 bg-[#fff6fa] p-3">
            <p className="text-xs font-bold text-[#bd0063]">Aktarılacaklar ({selected.length} kalem)</p>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-700">
              {selected.map((row) => <li key={row.material_id} className="flex items-start justify-between gap-3"><span className="min-w-0"><MaterialTitle sku={row.sku} name={row.name} spec={row.spec} /></span><span className="shrink-0 font-semibold">{formatQuantity(parseQuantity(quantities[row.material_id]))} {row.unit}</span></li>)}
            </ul>
          </div>}

          <label className="block text-xs font-semibold text-slate-600">Not <span className="font-normal text-slate-400">(isteğe bağlı)</span>
            <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#d90070]" /></label>
        </div>

        {/* Uyarı, kaydırılan listenin altında kaybolmasın diye düğmelerin hemen üstünde gösterilir. */}
        {error && <div role="alert" className="flex items-start gap-2 border-t border-rose-200 bg-rose-50 px-5 py-2.5 text-xs font-medium text-rose-700"><AlertCircle className="mt-px h-4 w-4 shrink-0" />{error}</div>}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500">İptal</button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#d90070] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Aktar{selected.length > 0 ? ` (${selected.length} kalem)` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
