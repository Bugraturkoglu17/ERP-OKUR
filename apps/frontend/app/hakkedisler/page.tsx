"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Paperclip, Receipt, Search, Store } from "lucide-react";
import { apiGet } from "@/lib/api";

type Project = { id: string; name: string; project_no?: string; status: string; scope_codes?: string[] };

type ProgressPayment = {
  id: string;
  project_id: string;
  payment_type: string;
  period?: string;
  amount?: number;
  currency: string;
  file_name?: string;
  approval_status: string;
  submitted_for_approval: boolean;
  created_at: string;
};

type Row = { payment: ProgressPayment; project: Project };

const TYPE_LABELS: Record<string, string> = {
  bakim:     "Bakım & Onarım",
  tadilat:   "Tadilat",
  yeni_yapim: "Yeni Yapım",
  ara:       "Ara Hakkediş",
  final:     "Final Hakkediş",
};

const TYPE_COLORS: Record<string, string> = {
  bakim:      "bg-sky-50 text-sky-700",
  tadilat:    "bg-amber-50 text-amber-700",
  yeni_yapim: "bg-emerald-50 text-emerald-700",
  ara:        "bg-purple-50 text-purple-700",
  final:      "bg-slate-100 text-slate-700",
};

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:              { label: "Giriş Yapıldı",             cls: "bg-slate-100 text-slate-600"    },
  internal_pending:   { label: "İç Onay Bekliyor",          cls: "bg-amber-50 text-amber-700"     },
  pending:            { label: "İç Onay Bekliyor",          cls: "bg-amber-50 text-amber-700"     },
  bekliyor:           { label: "İç Onay Bekliyor",          cls: "bg-amber-50 text-amber-700"     },
  internal_approved:  { label: "İç Onay Alındı",            cls: "bg-blue-50 text-blue-700"       },
  migros_pending:     { label: "Migros Onayı Bekleniyor",   cls: "bg-indigo-50 text-indigo-700"   },
  migros_approved:    { label: "Migros Onayı Verildi",      cls: "bg-teal-50 text-teal-700"       },
  invoice_stage:      { label: "Faturalandırma Aşamasında", cls: "bg-emerald-50 text-emerald-700" },
  invoiced:           { label: "Faturalandırıldı",          cls: "bg-green-100 text-green-800"    },
  revision_requested: { label: "Revizyon İstendi",          cls: "bg-purple-50 text-purple-700"   },
  rejected:           { label: "Reddedildi",                cls: "bg-red-50 text-red-600"         },
  onaylandi:          { label: "İç Onay Alındı",            cls: "bg-blue-50 text-blue-700"       },
  reddedildi:         { label: "Reddedildi",                cls: "bg-red-50 text-red-600"         },
  revizyon:           { label: "Revizyon İstendi",          cls: "bg-purple-50 text-purple-700"   },
};

type Filter = "tumu" | "bakim" | "tadilat" | "yeni_yapim";

function fmtTRY(amount?: number, currency?: string) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency ?? "TRY" }).format(amount);
}

function getStatus(p: ProgressPayment) {
  if (!p.submitted_for_approval) return STATUS_CFG.draft;
  return STATUS_CFG[p.approval_status] ?? STATUS_CFG.internal_pending;
}

function matchesFilter(payment: ProgressPayment, project: Project, filter: Filter): boolean {
  if (filter === "tumu") return true;
  if (payment.payment_type === filter) return true;
  if (["ara", "final"].includes(payment.payment_type)) {
    return (project.scope_codes ?? []).includes(filter);
  }
  return false;
}

export default function HakkedislerPage() {
  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [query,   setQuery]   = useState("");
  const [filter,  setFilter]  = useState<Filter>("tumu");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [payments, projects] = await Promise.all([
          apiGet<ProgressPayment[]>("/progress-payments").catch(() => [] as ProgressPayment[]),
          apiGet<Project[]>("/projects?limit=5000").catch(() => [] as Project[]),
        ]);

        if (!Array.isArray(payments) || !Array.isArray(projects)) {
          setError("Veri alınamadı. Lütfen tekrar deneyin.");
          return;
        }

        const projectMap = new Map(projects.map((p) => [p.id, p]));

        const allRows: Row[] = payments
          .filter((pay) => projectMap.has(pay.project_id))
          .map((pay) => ({ payment: pay, project: projectMap.get(pay.project_id)! }))
          .sort((a, b) =>
            new Date(b.payment.created_at).getTime() - new Date(a.payment.created_at).getTime()
          );

        setRows(allRows);
      } catch {
        setError("Bağlantı hatası. Backend çalışıyor mu?");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const displayed = useMemo(() => {
    return rows.filter((r) => {
      const q = !query || r.project.name.toLowerCase().includes(query.toLowerCase()) ||
                (r.project.project_no ?? "").toLowerCase().includes(query.toLowerCase());
      const f = matchesFilter(r.payment, r.project, filter);
      return q && f;
    });
  }, [rows, query, filter]);

  const tabs: { key: Filter; label: string }[] = [
    { key: "tumu",       label: `Tümü (${rows.length})` },
    { key: "bakim",      label: "Bakım"                  },
    { key: "tadilat",    label: "Tadilat"                },
    { key: "yeni_yapim", label: "Yeni Yapım"             },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
          <Receipt className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Faturalar / Hakkedişler</h1>
          <p className="text-xs text-slate-500">Tüm mağazalara ait hakkediş ve fatura kayıtları</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Mağaza ara..."
            className="rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      <div className="flex gap-0.5 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              filter === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-600">{error}</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-slate-200">
          <Receipt className="h-10 w-10 text-slate-200" />
          <p className="text-sm font-semibold text-slate-500">
            {query || filter !== "tumu" ? "Arama sonucu bulunamadı." : "Henüz hakkediş / fatura kaydı girilmemiş."}
          </p>
          <p className="text-xs text-slate-400">Mağaza kartı › Hakkedişler sekmesinden kayıt ekleyin.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Mağaza</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Kod</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">İş Tipi</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Dönem</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tutar</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Durum</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayed.map(({ payment, project }) => {
                const st = getStatus(payment);
                const pt = payment.payment_type;
                return (
                  <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-slate-300 shrink-0" />
                        <Link href={`/projects/${project.id}?tab=hakkediş`}
                          className="font-medium text-slate-900 hover:text-blue-600 transition-colors">
                          {project.name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400 hidden sm:table-cell">{project.project_no ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[pt] ?? "bg-slate-100 text-slate-600"}`}>
                        {TYPE_LABELS[pt] ?? pt}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 hidden md:table-cell">{payment.period ?? "—"}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-800">{fmtTRY(payment.amount, payment.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/projects/${project.id}?tab=hakkediş`}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <FolderOpen className="h-3.5 w-3.5" /> Hakkedişe Git
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
