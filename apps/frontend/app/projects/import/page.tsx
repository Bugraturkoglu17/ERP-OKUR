"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import * as XLSX from "xlsx";
import { apiGet } from "@/lib/api";
import { createStore, updateStore } from "@/services/stores";

// ── Types ──────────────────────────────────────────────────────────────────────

type Customer = { id: string; name: string };
type Region   = { id: string; name: string; city: string };
type Branch   = { id: string; name: string; city: string };

type SystemField = {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
};

type RowStatus = "new" | "update" | "error" | "warning";

type PreviewRow = {
  _idx: number;
  name: string;
  project_no: string;
  bolge: string;
  format: string;
  address: string;
  tel1: string;
  tel2: string;
  tel3: string;
  tel4: string;
  acilis_tarihi: string;
  status: string;
  rowStatus: RowStatus;
  errors: string[];
  warnings: string[];
  existingId?: string;
  existingDesc?: string;
};

type ImportResult = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const SYSTEM_FIELDS: SystemField[] = [
  { key: "name",          label: "Mağaza Adı",    required: true,  aliases: ["mağaza adı","magaza adi","şube adı","sube adi","store name","ad","isim","mağaza","şube"] },
  { key: "project_no",    label: "Mağaza Kodu",   required: true,  aliases: ["mağaza kodu","magaza kodu","şube kodu","sube kodu","store code","kod","kodu","no","numara","store no"] },
  { key: "bolge",         label: "Bölge",         required: false, aliases: ["bölge","bolge","region","bölge adı","bolge adi"] },
  { key: "format",        label: "Format",        required: false, aliases: ["format adı","format adi","format","format_adi"] },
  { key: "address",       label: "Adres",         required: false, aliases: ["adres","address","açık adres","tam adres"] },
  { key: "tel1",          label: "Telefon 1",     required: false, aliases: ["telno1","tel no1","tel1","telefon1","telefon","tel","phone","gsm","iletişim"] },
  { key: "tel2",          label: "Telefon 2",     required: false, aliases: ["telno2","tel no2","tel2","telefon2"] },
  { key: "tel3",          label: "Telefon 3",     required: false, aliases: ["telno3","tel no3","tel3","telefon3"] },
  { key: "tel4",          label: "Telefon 4",     required: false, aliases: ["telno4","tel no4","tel4","telefon4"] },
  { key: "acilis_tarihi", label: "Açılış Tarihi", required: false, aliases: ["acilstarih","açılış tarihi","acilis tarihi","acilis_tarihi","openingdate","opening date"] },
  { key: "status",        label: "Durum",         required: false, aliases: ["durum","status","proje durumu","saha durumu"] },
];

const STATUS_MAP: Record<string, string> = {
  "keşif": "inquiry", "kesif": "inquiry",
  "onaylandı": "approved", "onaylandi": "approved",
  "devam ediyor": "in_progress", "sahada": "in_progress", "in progress": "in_progress",
  "beklemede": "invoice_pend", "hakediş bekliyor": "invoice_pend",
  "tamamlandı": "completed", "tamamlandi": "completed",
};

const SKIP_FIELD = "__skip__";

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeKey(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function autoMapColumn(colName: string): string {
  const norm = normalizeKey(colName);
  // Pas 1: tam eşleşme önceliklidir — "adres" gibi kısa alias'ların ("ad")
  // başka bir alanın adının içinde alt-string olarak yanlış eşleşmesini önler.
  for (const field of SYSTEM_FIELDS) {
    if (field.aliases.some((a) => norm === a)) return field.key;
  }
  // Pas 2: tam eşleşme yoksa alt-string eşleşmesine düş.
  for (const field of SYSTEM_FIELDS) {
    if (field.aliases.some((a) => norm.includes(a))) return field.key;
  }
  return SKIP_FIELD;
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const headers = ["Mağaza Adı", "Mağaza Kodu", "Bölge", "Format Adı", "Adres", "telNo1", "telNo2", "telNo3", "telNo4", "AcilisTarih", "Durum"];
  const example = ["Migros Ataşehir MMM", "3421", "İç Anadolu", "MMM", "Örnek Mah. Ana Cad. No:1", "08501234567", "", "", "", "2015-03-15", "Devam Ediyor"];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, "Mağazalar");
  XLSX.writeFile(wb, "magaza_sablonu.xlsx");
}

// ── Step components ────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Dosya Yükle"   },
  { n: 2, label: "Kolon Eşleştir" },
  { n: 3, label: "Önizleme"      },
  { n: 4, label: "İçe Aktar"     },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const done   = current > s.n;
        const active = current === s.n;
        return (
          <div key={s.n} className="flex items-center gap-1">
            <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-blue-600 text-white" : done ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"
            }`}>
              {done ? <Check className="h-3 w-3" /> : <span>{s.n}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isManager = pathname?.startsWith("/manager");
  const isAdmin = pathname?.startsWith("/admin");
  const backHref = isManager ? "/manager/magaza-karti" : isAdmin ? "/admin/stores" : "/projects";
  const [step, setStep]         = useState(1);

  // Step 1
  const fileRef                 = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows]   = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState("");

  // Step 2
  const [mapping, setMapping]   = useState<Record<string, string>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [regions,   setRegions]   = useState<Region[]>([]);
  const [branches,  setBranches]  = useState<Branch[]>([]);
  const [defaultCustomerId, setDefaultCustomerId] = useState("");
  const [defaultRegionId,   setDefaultRegionId]   = useState("");
  const [defaultBranchId,   setDefaultBranchId]   = useState("");
  const [duplicateAction,   setDuplicateAction]   = useState<"update" | "skip">("update");

  // Step 3
  const [previewRows,   setPreviewRows]   = useState<PreviewRow[]>([]);
  const [existingProjs, setExistingProjs] = useState<{ id: string; project_no?: string; description?: string }[]>([]);
  const [excludeErrors, setExcludeErrors] = useState(true);

  // Step 4
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState<ImportResult | null>(null);
  const [importLog,     setImportLog]     = useState<string[]>([]);

  // Load customers on mount — otomatik olarak ilk (tek) zinciri varsayılan seç
  useEffect(() => {
    apiGet<Customer[]>("/projects/customers").then((d) => {
      const list = Array.isArray(d) ? d : [];
      setCustomers(list);
      if (list.length > 0) onCustomerChange(list[0].id);
    }).catch(() => {});
    apiGet<{ id: string; project_no?: string; description?: string }[]>("/projects?limit=5000").then((d) => setExistingProjs(Array.isArray(d) ? d : [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCustomerChange = async (id: string) => {
    setDefaultCustomerId(id); setDefaultRegionId(""); setDefaultBranchId("");
    setRegions([]); setBranches([]);
    if (!id) return;
    const d = await apiGet<Region[]>(`/projects/regions/${id}`).catch(() => [] as Region[]);
    setRegions(Array.isArray(d) ? d : []);
  };

  const onRegionChange = async (id: string) => {
    setDefaultRegionId(id); setDefaultBranchId("");
    setBranches([]);
    if (!id) return;
    const d = await apiGet<Branch[]>(`/projects/branches/${id}`).catch(() => [] as Branch[]);
    setBranches(Array.isArray(d) ? d : []);
  };

  // ── Step 1: Parse Excel ────────────────────────────────────────────────────

  const handleFile = (file: File) => {
    setParseError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        if (rows.length === 0) { setParseError("Excel dosyası boş görünüyor."); return; }
        const headers = Object.keys(rows[0]);
        const strRows = rows.map((r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "").trim()])));
        setRawHeaders(headers);
        setRawRows(strRows);
        setFileName(file.name);

        // Auto-map
        const autoMap: Record<string, string> = {};
        for (const h of headers) autoMap[h] = autoMapColumn(h);
        setMapping(autoMap);
        setStep(2);
      } catch {
        setParseError("Excel dosyası okunamadı. Lütfen .xlsx veya .xls formatında olduğundan emin olun.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Step 3: Build preview ──────────────────────────────────────────────────

  const buildPreview = () => {
    const mapped = rawRows.map((row, idx): PreviewRow => {
      const get = (fieldKey: string): string => {
        const col = Object.entries(mapping).find(([, fk]) => fk === fieldKey)?.[0];
        return col ? (row[col] ?? "") : "";
      };

      const name          = get("name");
      const project_no    = get("project_no");
      const bolge         = get("bolge");
      const format        = get("format");
      const address       = get("address");
      const tel1          = get("tel1");
      const tel2          = get("tel2");
      const tel3          = get("tel3");
      const tel4          = get("tel4");
      const acilis_tarihi = get("acilis_tarihi");
      const status_raw    = get("status");

      const status = STATUS_MAP[normalizeKey(status_raw)] ?? "inquiry";

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!name) errors.push("Mağaza adı boş.");
      if (!project_no) errors.push("Mağaza kodu boş.");

      const dupeInFile = rawRows.slice(0, idx).some((r) => {
        const col = Object.entries(mapping).find(([, fk]) => fk === "project_no")?.[0];
        return col && r[col] === project_no && project_no;
      });
      if (dupeInFile) warnings.push("Bu mağaza kodu listede tekrar ediyor.");

      const existing = existingProjs.find((p) => p.project_no && p.project_no === project_no);

      let rowStatus: RowStatus = "new";
      if (errors.length > 0)        rowStatus = "error";
      else if (existing)             rowStatus = duplicateAction === "update" ? "update" : "error";
      else if (warnings.length > 0) rowStatus = "warning";

      return { _idx: idx, name, project_no, bolge, format, address, tel1, tel2, tel3, tel4, acilis_tarihi, status, rowStatus, errors, warnings, existingId: existing?.id, existingDesc: existing?.description };
    });
    setPreviewRows(mapped);
    setStep(3);
  };

  // ── Step 4: Import ─────────────────────────────────────────────────────────

  const doImport = async () => {
    if (!defaultBranchId) { alert("Lütfen mağaza konumu seçin."); return; }
    setImporting(true);
    const log: string[] = [];
    const result: ImportResult = { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 };

    const rows = excludeErrors ? previewRows.filter((r) => r.rowStatus !== "error") : previewRows;
    result.total = rows.length;

    for (const row of rows) {
      if (duplicateAction === "skip" && row.existingId) {
        result.skipped++;
        log.push(`⊘ Atlandı: ${row.name} (${row.project_no})`);
        continue;
      }
      try {
        let description: string;

        if (row.existingId) {
          // Mevcut mağaza: sadece boş alanları güncelle
          let base: Record<string, string> = {};
          try { base = JSON.parse(row.existingDesc || "{}"); } catch {}
          if (row.bolge         && !base.bolge)         base.bolge         = row.bolge;
          if (row.format        && !base.format)        base.format        = row.format;
          if (row.tel1          && !base.tel1)          base.tel1          = row.tel1;
          if (row.tel2          && !base.tel2)          base.tel2          = row.tel2;
          if (row.tel3          && !base.tel3)          base.tel3          = row.tel3;
          if (row.tel4          && !base.tel4)          base.tel4          = row.tel4;
          if (row.address       && !base.adres)         base.adres         = row.address;
          if (row.acilis_tarihi && !base.acilis_tarihi) base.acilis_tarihi = row.acilis_tarihi;
          description = JSON.stringify(base);

          await updateStore(row.existingId, {
            name:        row.name,
            project_no:  row.project_no || null,
            description,
            status:      row.status,
          });
          result.updated++;
          log.push(`✓ Güncellendi: ${row.name} (${row.project_no})`);
        } else {
          const descObj: Record<string, string> = {};
          if (row.bolge)         descObj.bolge         = row.bolge;
          if (row.format)        descObj.format        = row.format;
          if (row.tel1)          descObj.tel1          = row.tel1;
          if (row.tel2)          descObj.tel2          = row.tel2;
          if (row.tel3)          descObj.tel3          = row.tel3;
          if (row.tel4)          descObj.tel4          = row.tel4;
          if (row.address)       descObj.adres         = row.address;
          if (row.acilis_tarihi) descObj.acilis_tarihi = row.acilis_tarihi;
          description = JSON.stringify(descObj);

          await createStore({
            name:           row.name,
            project_no:     row.project_no || null,
            description,
            start_date:     new Date().toISOString(),
            due_date:       new Date(Date.now() + 90 * 86400000).toISOString(),
            scope_codes:    [],
            status:         row.status,
            contract_value: null,
            customer_id:    defaultCustomerId,
            region_id:      defaultRegionId,
            branch_id:      defaultBranchId,
          });
          result.created++;
          log.push(`✓ Oluşturuldu: ${row.name} (${row.project_no})`);
        }
      } catch (ex: any) {
        result.errors++;
        log.push(`✗ Hata: ${row.name} — ${ex?.response?.data?.detail ?? "Bilinmeyen hata"}`);
      }
    }

    setImportLog(log);
    setImportResult(result);
    setImporting(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const validRows   = previewRows.filter((r) => r.rowStatus !== "error");
  const errorRows   = previewRows.filter((r) => r.rowStatus === "error");
  const displayRows = excludeErrors ? validRows : previewRows;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={backHref} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Excel'den Mağaza İçe Aktar</h1>
          <p className="mt-0.5 text-sm text-slate-500">Mağaza listesini Excel dosyasından toplu olarak sisteme aktarın.</p>
        </div>
      </div>

      {/* Step Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <StepBar current={step} />
      </div>

      {/* ── Step 1: Upload ── */}
      {step === 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 mb-1">Excel Dosyası Yükle</h2>
            <p className="text-xs text-slate-500">Mağaza bilgilerini içeren .xlsx veya .xls dosyasını seçin.</p>
          </div>

          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-700">Excel Dosyası Seç</p>
            <p className="text-xs text-slate-400 mt-1">ya da buraya sürükleyip bırakın</p>
            <p className="text-[11px] text-slate-300 mt-2">Desteklenen format: .xlsx, .xls</p>
          </div>

          {parseError && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3">
              <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{parseError}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={downloadTemplate}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <Download className="h-4 w-4" /> Örnek Şablonu İndir
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Column Mapping + Location ── */}
      {step === 2 && (
        <div className="space-y-4">

          {/* Column Mapping */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-1">Kolon Eşleştirme</h2>
              <p className="text-xs text-slate-500">
                Dosya: <span className="font-medium text-slate-700">{fileName}</span> — {rawRows.length} satır okundu. Kolonları sistem alanlarıyla eşleştirin.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-4 text-xs font-medium text-slate-500 w-1/2">Excel Kolonu</th>
                    <th className="text-left py-2 text-xs font-medium text-slate-500 w-1/2">Sistem Alanı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rawHeaders.map((h) => (
                    <tr key={h}>
                      <td className="py-2 pr-4">
                        <div>
                          <p className="text-xs font-medium text-slate-800">{h}</p>
                          <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                            {rawRows[0]?.[h] ?? ""}
                          </p>
                        </div>
                      </td>
                      <td className="py-2">
                        <select
                          value={mapping[h] ?? SKIP_FIELD}
                          onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                        >
                          <option value={SKIP_FIELD}>— Bu kolonu atla —</option>
                          {SYSTEM_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Default Location */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-1">Varsayılan Konum</h2>
              <p className="text-xs text-slate-500">İçe aktarılacak mağazalar bu konuma bağlanacak. Zorunludur.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Şehir / Bölge *</label>
                <select value={defaultRegionId} onChange={(e) => onRegionChange(e.target.value)}
                  disabled={!defaultCustomerId}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50">
                  <option value="">Şehir seçin...</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.city}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Konum *</label>
                <select value={defaultBranchId} onChange={(e) => setDefaultBranchId(e.target.value)}
                  disabled={!defaultRegionId}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50">
                  <option value="">Konum seçin...</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Mevcut mağaza kodu bulunursa ne yapılsın?</label>
              <div className="flex gap-3">
                {(["update", "skip"] as const).map((opt) => (
                  <label key={opt} className={`flex items-center gap-2 cursor-pointer rounded-xl border px-4 py-2.5 text-sm transition-colors ${duplicateAction === opt ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                    <input type="radio" value={opt} checked={duplicateAction === opt} onChange={() => setDuplicateAction(opt)} className="accent-blue-600" />
                    {opt === "update" ? "Güncelle" : "Atla"}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between gap-2">
            <button onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Geri
            </button>
            <button
              onClick={buildPreview}
              disabled={!defaultBranchId || !Object.values(mapping).some((v) => v === "name") || !Object.values(mapping).some((v) => v === "project_no")}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              Önizlemeye Geç <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 mb-1">Önizleme ve Doğrulama</h2>
                <p className="text-xs text-slate-500">{rawRows.length} satır okundu.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-green-50 text-green-700 px-2 py-0.5 font-medium">
                  {previewRows.filter((r) => r.rowStatus === "new").length} Yeni
                </span>
                <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 font-medium">
                  {previewRows.filter((r) => r.rowStatus === "update").length} Güncellenecek
                </span>
                <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 font-medium">
                  {previewRows.filter((r) => r.rowStatus === "warning").length} Uyarı
                </span>
                <span className="rounded-full bg-red-50 text-red-700 px-2 py-0.5 font-medium">
                  {errorRows.length} Hatalı
                </span>
              </div>
            </div>

            {errorRows.length > 0 && (
              <label className="flex items-center gap-2 mb-4 cursor-pointer">
                <input type="checkbox" checked={excludeErrors} onChange={(e) => setExcludeErrors(e.target.checked)} className="accent-blue-600" />
                <span className="text-xs text-slate-600">{errorRows.length} hatalı satırı içe aktarmadan hariç tut</span>
              </label>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-3 font-medium text-slate-500 whitespace-nowrap">Durum</th>
                    <th className="text-left py-2 pr-3 font-medium text-slate-500 whitespace-nowrap">Mağaza Adı</th>
                    <th className="text-left py-2 pr-3 font-medium text-slate-500 whitespace-nowrap">Kodu</th>
                    <th className="text-left py-2 pr-3 font-medium text-slate-500 whitespace-nowrap">Bölge</th>
                    <th className="text-left py-2 pr-3 font-medium text-slate-500 whitespace-nowrap">Telefon</th>
                    <th className="text-left py-2 font-medium text-slate-500">Uyarı/Hata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayRows.map((row) => {
                    const statusCls = {
                      new:     "bg-green-50 text-green-700",
                      update:  "bg-blue-50 text-blue-700",
                      warning: "bg-amber-50 text-amber-700",
                      error:   "bg-red-50 text-red-700",
                    }[row.rowStatus];
                    const statusLabel = { new: "Yeni Kayıt", update: "Güncellenecek", warning: "Uyarı", error: "Hatalı" }[row.rowStatus];

                    return (
                      <tr key={row._idx} className={row.rowStatus === "error" ? "opacity-50" : ""}>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCls}`}>{statusLabel}</span>
                        </td>
                        <td className="py-2 pr-3 max-w-[160px] truncate font-medium text-slate-800">{row.name || <span className="text-red-400">Boş</span>}</td>
                        <td className="py-2 pr-3 font-mono text-slate-500">{row.project_no || <span className="text-red-400">Boş</span>}</td>
                        <td className="py-2 pr-3 text-slate-500">{row.bolge || "—"}</td>
                        <td className="py-2 pr-3 text-slate-500">{row.tel1 || "—"}</td>
                        <td className="py-2">
                          {row.errors.concat(row.warnings).length > 0 ? (
                            <ul className="space-y-0.5">
                              {row.errors.map((e, i) => (
                                <li key={i} className="text-red-600 flex items-start gap-1"><XCircle className="h-3 w-3 shrink-0 mt-0.5" />{e}</li>
                              ))}
                              {row.warnings.map((w, i) => (
                                <li key={i} className="text-amber-600 flex items-start gap-1"><AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{w}</li>
                              ))}
                            </ul>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between gap-2">
            <button onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Geri
            </button>
            <button onClick={() => { setStep(4); doImport(); }}
              disabled={(excludeErrors ? validRows : previewRows).length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 transition-colors">
              <Upload className="h-4 w-4" /> {(excludeErrors ? validRows : previewRows).length} Mağazayı İçe Aktar
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Import & Result ── */}
      {step === 4 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          {importing ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              <p className="text-sm font-medium text-slate-700">Mağazalar aktarılıyor...</p>
              <p className="text-xs text-slate-400">Lütfen bekleyin ve sayfayı yenilemeyin.</p>
            </div>
          ) : importResult ? (
            <>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">İçe Aktarma Tamamlandı</h2>
                  <p className="text-xs text-slate-500">İşlem sonuçları aşağıda görüntüleniyor.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Toplam Satır",     value: importResult.total,   cls: "bg-slate-50"   },
                  { label: "Yeni Oluşturuldu", value: importResult.created, cls: "bg-green-50"   },
                  { label: "Güncellendi",       value: importResult.updated, cls: "bg-blue-50"    },
                  { label: "Atlanan",           value: importResult.skipped, cls: "bg-slate-50"   },
                ].map((s) => (
                  <div key={s.label} className={`rounded-xl ${s.cls} px-4 py-3 text-center`}>
                    <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {importResult.errors > 0 && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{importResult.errors} satır aktarılamadı. Günlük detaylarını aşağıda inceleyebilirsiniz.</p>
                </div>
              )}

              {/* Import log */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 max-h-48 overflow-y-auto p-3">
                {importLog.map((line, i) => (
                  <p key={i} className={`text-[11px] font-mono mb-0.5 ${line.startsWith("✓") ? "text-green-700" : line.startsWith("✗") ? "text-red-600" : "text-slate-400"}`}>
                    {line}
                  </p>
                ))}
              </div>

              <div className="flex gap-2">
                <Link href={backHref}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors">
                  Mağazalar Listesine Git
                </Link>
                <button onClick={() => { setStep(1); setFileName(""); setRawHeaders([]); setRawRows([]); setImportResult(null); setImportLog([]); }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <RefreshCw className="h-4 w-4" /> Yeni Dosya İçe Aktar
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
