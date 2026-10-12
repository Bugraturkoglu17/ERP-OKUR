"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AlertCircle, Boxes, CheckCircle2, ExternalLink, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { apiDelete, apiGet, apiPut, getRequestErrorMessage } from "@/lib/api";
import { uploadFormData } from "@/lib/upload";
import { formatQuantity, parseQuantity, quantityForApi, quantityProblem, sanitizeQuantityInput } from "@/lib/quantity";
import { MaterialPicker, MaterialTitle } from "@/components/retail-stock/material-picker";

export type ServiceForm = {
  id: string; file_name?: string | null; file_size_bytes?: number | null;
  uploaded_by_name?: string | null; uploaded_at: string; url?: string | null;
};

export type CompletionMaterial = {
  id: string; material_id: string; sku: string; name: string; spec?: string | null; unit: string;
  quantity: string | number; depot_name: string; depot_plate?: string | null;
  status: "planned" | "issued"; issued_at?: string | null;
};

type StockItem = { material_id: string; sku: string; name: string; unit: string; spec?: string | null; brand?: string | null; quantity: string | number };
type Row = { key: string; materialId: string; quantity: string };

export const formatDateTime = (iso?: string | null) => {
  if (!iso) return "";
  const utc = /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
  return new Date(utc).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

let rowSeed = 0;
const newRow = (materialId = "", quantity = ""): Row => ({ key: `row-${++rowSeed}`, materialId, quantity });

/**
 * Servis formu + kullanılan malzemeler durumu. Sayfa düzeyinde tutulur; çünkü
 * aşama sekmesi her çizimde yeniden kurulur ve yerel durum kaybolurdu.
 */
export function useWorkOrderCompletion(workOrderId: string | undefined, depotId: string | null | undefined) {
  const [forms, setForms] = useState<ServiceForm[]>([]);
  const [lines, setLines] = useState<CompletionMaterial[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState("");
  const dirtyRef = useRef(false);
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;

  const markDirty = (value: boolean) => { dirtyRef.current = value; setDirty(value); };

  const reload = useCallback(async () => {
    if (!workOrderId) return;
    const [formRows, lineRows, stockRows] = await Promise.all([
      apiGet<ServiceForm[]>(`/work-orders/${workOrderId}/service-forms`).catch(() => [] as ServiceForm[]),
      apiGet<CompletionMaterial[]>(`/work-orders/${workOrderId}/materials`).catch(() => [] as CompletionMaterial[]),
      depotId
        ? apiGet<StockItem[]>("/retail-stock/stock", { depot_id: depotId }).catch(() => [] as StockItem[])
        : Promise.resolve([] as StockItem[]),
    ]);
    setForms(Array.isArray(formRows) ? formRows : []);
    const safeLines = Array.isArray(lineRows) ? lineRows : [];
    setLines(safeLines);
    setStock(Array.isArray(stockRows) ? stockRows : []);
    // Kullanıcı yazarken sunucu verisi taslağın üstüne yazılmaz.
    if (!dirtyRef.current) {
      setRows(safeLines.filter((line) => line.status === "planned").map((line) => newRow(line.material_id, String(Number(line.quantity)))));
    }
  }, [workOrderId, depotId]);

  const availableOf = useCallback(
    (materialId: string) => Number(stock.find((item) => item.material_id === materialId)?.quantity ?? 0),
    [stock],
  );

  const rowProblem = useCallback((row: Row) => {
    if (!row.materialId && !row.quantity) return "";
    if (!row.materialId) return "Malzeme seçin.";
    const invalid = quantityProblem(row.quantity);
    if (invalid) return invalid;
    const quantity = parseQuantity(row.quantity);
    const available = availableOf(row.materialId);
    if (quantity > available) return `Cep depoda en fazla ${formatQuantity(available)} var.`;
    return "";
  }, [availableOf]);

  const updateRow = (key: string, patch: Partial<Row>) => {
    markDirty(true);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };
  const addRow = () => { markDirty(true); setRows((current) => [...current, newRow()]); };
  const removeRow = (key: string) => { markDirty(true); setRows((current) => current.filter((row) => row.key !== key)); };

  /** Listeyi sunucuya yazar. Geçersiz satır varsa hata verir ve kaydetmez. */
  const saveMaterials = useCallback(async () => {
    const filled = rowsRef.current.filter((row) => row.materialId || row.quantity);
    const invalid = filled.find((row) => rowProblem(row));
    if (invalid) throw new Error(rowProblem(invalid));
    const seen = new Set<string>();
    for (const row of filled) {
      if (seen.has(row.materialId)) throw new Error("Aynı malzeme listede birden fazla kez var.");
      seen.add(row.materialId);
    }
    setSaving(true); setError("");
    try {
      await apiPut(`/work-orders/${workOrderId}/materials`, {
        materials: filled.map((row) => ({ material_id: row.materialId, quantity: quantityForApi(row.quantity) })),
      });
      markDirty(false);
      await reload();
    } catch (reason) {
      const message = getRequestErrorMessage(reason, "Malzeme listesi kaydedilemedi.");
      setError(message);
      throw new Error(message);
    } finally { setSaving(false); }
  }, [workOrderId, reload, rowProblem]);

  const uploadForm = useCallback(async (file: File) => {
    setError("");
    const body = new FormData();
    body.append("file", file);
    setUploading(0);
    try {
      await uploadFormData(`/work-orders/${workOrderId}/service-forms`, { formData: body, onProgress: setUploading });
      await reload();
    } catch (reason) {
      setError(getRequestErrorMessage(reason, "Servis formu yüklenemedi."));
    } finally { setUploading(null); }
  }, [workOrderId, reload]);

  const removeForm = useCallback(async (formId: string) => {
    setError("");
    try {
      await apiDelete(`/work-orders/${workOrderId}/service-forms/${formId}`);
      await reload();
    } catch (reason) { setError(getRequestErrorMessage(reason, "Servis formu silinemedi.")); }
  }, [workOrderId, reload]);

  return {
    forms, lines, stock, rows, dirty, saving, uploading, error, setError,
    hasForm: forms.length > 0, availableOf, rowProblem, updateRow, addRow, removeRow,
    saveMaterials, uploadForm, removeForm, reload,
  };
}

export type WorkOrderCompletion = ReturnType<typeof useWorkOrderCompletion>;

/** Aşama listesinde "Tamamlandı" aşamasının hemen üstünde gösterilir. */
export function CompletionPanel({ c, closed, depotLabel }: { c: WorkOrderCompletion; closed: boolean; depotLabel?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const issued = c.lines.filter((line) => line.status === "issued");
  const chosen = useMemo(() => new Set(c.rows.map((row) => row.materialId)), [c.rows]);
  const options = c.stock.filter((item) => Number(item.quantity) > 0);

  return (
    <div className="space-y-3">
      {c.error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{c.error}
        </div>
      )}

      {/* Servis Formu */}
      <section className="rounded-2xl border-2 border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-slate-500" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Servis Formu</h3>
              <p className="text-[11px] text-slate-500">Yalnızca imzalı servis formunun fotoğrafı veya PDF&apos;i. Tamamlamak için zorunludur.</p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.hasForm ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {c.hasForm ? "Yüklendi" : "Bekleniyor"}
          </span>
        </div>

        {c.forms.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {c.forms.map((form) => (
              <li key={form.id} className="flex items-center gap-3 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-800">{form.file_name ?? "Servis formu"}</p>
                  <p className="text-[11px] text-slate-400">{[form.uploaded_by_name, formatDateTime(form.uploaded_at)].filter(Boolean).join(" · ")}</p>
                </div>
                {form.url && (
                  <a href={form.url} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Servis formunu aç">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                {!closed && (
                  <button type="button" onClick={() => { if (confirm("Bu servis formu silinsin mi?")) void c.removeForm(form.id); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Servis formunu sil">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!closed && (
          <div className="mt-3">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(event) => { const file = event.target.files?.[0]; if (file) void c.uploadForm(file); event.target.value = ""; }} />
            <button type="button" disabled={c.uploading !== null} onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {c.uploading !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {c.uploading !== null ? `Yükleniyor %${c.uploading}` : c.hasForm ? "Başka Sayfa Ekle" : "Servis Formu Yükle"}
            </button>
          </div>
        )}
      </section>

      {/* Kullanılan Malzemeler */}
      <section className="rounded-2xl border-2 border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Boxes className="h-4 w-4 shrink-0 text-slate-500" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Kullanılan Malzemeler</h3>
              <p className="text-[11px] text-slate-500">
                {closed ? "Bu iş tamamlandı; aşağıdaki malzemeler cep depodan düşüldü." : "Metraj veya adet yazın. Tamamlandı denildiğinde bu miktarlar cep depodan otomatik düşer ve yöneticiye bildirilir."}
              </p>
            </div>
          </div>
          {depotLabel && <span className="shrink-0 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{depotLabel}</span>}
        </div>

        {closed ? (
          issued.length === 0 ? (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">Bu iş için malzeme kullanımı girilmedi; stoktan düşülen malzeme yok.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {issued.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0"><p className="text-sm font-medium text-slate-900"><MaterialTitle sku={line.sku} name={line.name} spec={line.spec} /></p></div>
                  <div className="shrink-0 text-right"><p className="text-sm font-semibold text-slate-900">{formatQuantity(line.quantity)} {line.unit}</p><p className="flex items-center justify-end gap-1 text-[11px] font-medium text-emerald-600"><CheckCircle2 className="h-3 w-3" />Stoktan düşüldü · {formatDateTime(line.issued_at)}</p></div>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            <div className="mt-3 space-y-2">
              {c.rows.length === 0 && <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">Henüz malzeme eklenmedi. Malzeme kullanılmadıysa boş bırakabilirsiniz.</p>}
              {c.rows.map((row) => {
                const problem = c.rowProblem(row);
                const item = c.stock.find((stockItem) => stockItem.material_id === row.materialId);
                return (
                  <div key={row.key} className={`rounded-lg border p-1.5 ${problem ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
                    <div className="flex items-center gap-1.5">
                      <div className="min-w-0 flex-1">
                        <MaterialPicker compact value={row.materialId} onChange={(id) => c.updateRow(row.key, { materialId: id })} disabledIds={chosen}
                          options={options.map((option) => ({ id: option.material_id, name: option.name, spec: option.spec, brand: option.brand, sku: option.sku, hint: `Stok ${formatQuantity(option.quantity)} ${option.unit}` }))} />
                      </div>
                      <div className="relative w-[4.6rem] shrink-0">
                        <input inputMode="decimal" autoComplete="off" value={row.quantity} placeholder="0" aria-label="Miktar"
                          onChange={(event) => c.updateRow(row.key, { quantity: sanitizeQuantityInput(event.target.value) })}
                          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-1.5 pr-8 text-right text-xs outline-none focus:border-blue-500" />
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">{item?.unit ?? ""}</span>
                      </div>
                      <button type="button" onClick={() => c.removeRow(row.key)} className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Satırı sil"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {problem && <p className="mt-1 px-1 text-[11px] font-medium text-red-700">{problem}</p>}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={c.addRow} disabled={options.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" />Malzeme Ekle
              </button>
              <button type="button" disabled={!c.dirty || c.saving} onClick={() => void c.saveMaterials().catch(() => undefined)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                {c.saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Listeyi Kaydet
              </button>
              {c.dirty && <span className="text-[11px] font-medium text-amber-700">Kaydedilmemiş değişiklik var; tamamlarken otomatik kaydedilir.</span>}
              {options.length === 0 && <span className="text-[11px] text-slate-500">Cep depoda stok yok.</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
