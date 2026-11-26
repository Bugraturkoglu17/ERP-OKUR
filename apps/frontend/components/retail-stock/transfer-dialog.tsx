"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, ArrowRightLeft, Check, Search } from "lucide-react";
import { apiGet, apiPost, getRequestErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Field, FieldLabel } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Separator } from "@/components/shadcn/separator";
import { Spinner } from "@/components/shadcn/spinner";
import { formatQuantity, parseQuantity, quantityForApi, quantityProblem, sanitizeQuantityInput } from "@/lib/quantity";
import { MaterialTitle, foldText } from "@/components/retail-stock/material-picker";
import { brand } from "@/lib/brand";

export type TransferDepot = { id: string; kind: "main" | "vehicle" | "project"; name: string; plate: string | null; assigned_user_id: string | null };
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
    if (depot.kind === "project") return depot.name;
    if (!manager) return `${depot.plate} · ${depot.name}`;
    const owner = depot.assigned_user_id ? staffNames[depot.assigned_user_id] : null;
    return `${depot.plate} · ${depot.name} — ${owner ?? (depot.assigned_user_id ? "atanmış" : "çalışan atanmamış")}`;
  };
  const main = depots.find((depot) => depot.kind === "main");
  const vehicles = depots.filter((depot) => depot.kind === "vehicle");
  const projectDepots = depots.filter((depot) => depot.kind === "project");
  // Yönetici her iki yönde aktarır (araç ve proje depoları dahil); çalışan yalnızca kendi aracından ana depoya iade eder.
  const sources = useMemo(
    () => (manager ? [...(main ? [main] : []), ...vehicles, ...projectDepots] : vehicles),
    [manager, main, vehicles, projectDepots],
  );
  const targetsOf = (sourceId: string) => {
    const source = depots.find((depot) => depot.id === sourceId);
    return source?.kind === "main" ? [...vehicles, ...(manager ? projectDepots : [])] : main ? [main] : [];
  };
  const defaultTarget = (sourceId: string) => {
    const options = targetsOf(sourceId);
    return options.length === 1 ? options[0].id : "";
  };

  // Yönetici her zaman "Ana depo → araç" ile başlar (en sık işlem); stok ekranında bir araç
  // seçiliyse hedef o araç olur. Çalışan yalnızca kendi aracından ana depoya iade eder.
  const pickedVehicle = manager ? vehicles.find((depot) => depot.id === initialSourceId) : undefined;
  const firstSource = manager && main ? main : (sources.find((depot) => depot.id === initialSourceId) ?? sources[0]);
  const [sourceId, setSourceId] = useState(firstSource?.id ?? "");
  const [targetId, setTargetId] = useState(() => pickedVehicle?.id ?? defaultTarget(firstSource?.id ?? ""));
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);

  const source =depots.find((depot) => depot.id === sourceId);
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

  /** "Tümünü aktar" onaylanınca tüm kalemlerin miktarı depodaki miktar olarak doldurulur. */
  function transferAll() {
    setConfirmAll(false);
    if (rows.length === 0) return;
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

  const NO_TARGET = "none";

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh] sm:max-w-2xl">
        <DialogHeader className="px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#bd0063]">{brand("OKUR DEPO", "DEPO")}</p>
          <DialogTitle>{manager ? "Depo aktarımı" : "Ana depoya iade"}</DialogTitle>
          <DialogDescription className="sr-only">Kaynak ve hedef depoyu seçip aktarılacak malzemelerin miktarını yazın.</DialogDescription>
        </DialogHeader>
        <Separator />

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <Field>
              <FieldLabel htmlFor="ak-nereden">Nereden</FieldLabel>
              <Select value={sourceId} onValueChange={changeSource}>
                <SelectTrigger id="ak-nereden"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{sources.map((depot) => <SelectItem key={depot.id} value={depot.id}>{depotLabel(depot)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            {manager
              ? <Button variant="outline" size="icon" onClick={swap} aria-label="Yönü değiştir" className="mx-auto"><ArrowRightLeft /></Button>
              : <ArrowRight className="mx-auto mb-3 hidden size-4 text-muted-foreground sm:block" />}
            <Field>
              <FieldLabel htmlFor="ak-nereye">Nereye</FieldLabel>
              <Select value={targetId || NO_TARGET} onValueChange={(value) => setTargetId(value === NO_TARGET ? "" : value)} disabled={targets.length === 0}>
                <SelectTrigger id="ak-nereye"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(targets.length === 0 || targets.length > 1) && <SelectItem value={NO_TARGET}>{targets.length === 0 ? "Hedef depo yok" : "Araç seçin"}</SelectItem>}
                    {targets.map((depot) => <SelectItem key={depot.id} value={depot.id}>{depotLabel(depot)}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="min-w-0 flex-1 basis-56">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ürün adı, kodu veya kategori ara" aria-label="Ürün ara" className="text-base sm:text-sm" />
            </InputGroup>
            <Button onClick={() => setConfirmAll(true)} disabled={loading || rows.length === 0}>Tümünü aktar</Button>
            <Button variant="outline" onClick={() => setQuantities({})} disabled={selected.length === 0}>Temizle</Button>
          </div>

          {loading ? <div className="flex justify-center py-10"><Spinner /></div>
            : rows.length === 0 ? <p className="rounded-md bg-muted px-4 py-8 text-center text-sm text-muted-foreground">Kaynak depoda aktarılabilecek stok yok.</p>
            : matching.length === 0 ? <p className="rounded-md bg-muted px-4 py-8 text-center text-sm text-muted-foreground">Aramayla eşleşen ürün yok.</p>
            : <ul className="divide-y rounded-lg border">
              {visible.map((row) => {
                const problem = problemOf(row);
                const chosen = Boolean(quantities[row.material_id]) && !problem;
                return (
                  <li key={row.material_id} className={cn("px-3 py-2", problem ? "bg-destructive/5" : chosen && "bg-[#fff6fa]")}>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-semibold leading-snug"><MaterialTitle sku={row.sku} name={row.name} spec={row.spec} /></p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">Stok: <span className="font-semibold text-foreground">{formatQuantity(row.quantity)} {row.unit}</span></p>
                      </div>
                      <Input inputMode="decimal" autoComplete="off" value={quantities[row.material_id] ?? ""} placeholder="Miktar" aria-label={`${row.name} aktarılacak miktar`}
                        aria-invalid={Boolean(problem) || undefined}
                        onChange={(event) => setQuantity(row.material_id, sanitizeQuantityInput(event.target.value))}
                        className="h-9 w-16 shrink-0 px-2 text-right text-base sm:text-xs" />
                      <Button variant="outline" size="sm" onClick={() => setFull(row)} className="h-9 w-16 shrink-0">Tümü</Button>
                      {chosen && <Check className="size-4 shrink-0 text-emerald-600" aria-label="Seçildi" />}
                    </div>
                    {problem && <p className="mt-1 text-[11px] font-medium text-destructive">{problem}</p>}
                  </li>
                );
              })}
            </ul>}
          {matching.length > VISIBLE_LIMIT && <p className="rounded-md bg-muted px-4 py-3 text-center text-xs text-muted-foreground">{matching.length - VISIBLE_LIMIT} ürün daha var; aramayı daraltarak bulun.</p>}

          {selected.length > 0 && <div className="rounded-lg border border-[#d90070]/20 bg-[#fff6fa] p-3">
            <p className="text-xs font-bold text-[#bd0063]">Aktarılacaklar ({selected.length} kalem)</p>
            <ul className="mt-2 flex max-h-32 flex-col gap-1 overflow-y-auto text-xs">
              {selected.map((row) => <li key={row.material_id} className="flex items-start justify-between gap-3"><span className="min-w-0"><MaterialTitle sku={row.sku} name={row.name} spec={row.spec} /></span><span className="shrink-0 font-semibold">{formatQuantity(parseQuantity(quantities[row.material_id]))} {row.unit}</span></li>)}
            </ul>
          </div>}

          <Field>
            <FieldLabel htmlFor="ak-not">Not <span className="font-normal text-muted-foreground">(isteğe bağlı)</span></FieldLabel>
            <Input id="ak-not" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>

        {/* Uyarı, kaydırılan listenin altında kaybolmasın diye düğmelerin hemen üstünde gösterilir. */}
        {error && <Alert variant="destructive" className="rounded-none border-x-0 border-b-0"><AlertCircle /><AlertDescription className="text-xs font-medium">{error}</AlertDescription></Alert>}
        <DialogFooter className="border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="ghost" onClick={onClose} disabled={busy}>İptal</Button>
          <Button onClick={() => void submit()} disabled={busy}>{busy && <Spinner data-icon="inline-start" />}Aktar{selected.length > 0 ? ` (${selected.length} kalem)` : ""}</Button>
        </DialogFooter>

        <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tümü aktarılsın mı?</AlertDialogTitle>
              <AlertDialogDescription>{rows.length} kalemin tamamı {source ? depotLabel(source) : "kaynak depo"} deposundan {target ? depotLabel(target) : "hedef depo"} deposuna aktarılacak.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction onClick={transferAll}>Tümünü Seç</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
