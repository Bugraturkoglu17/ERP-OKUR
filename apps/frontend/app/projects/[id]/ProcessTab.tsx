"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, AlertTriangle, ArrowRight,
  CheckCircle2, ChevronDown, ChevronRight,
  Circle, Clock, FolderOpen,
  Loader2, Play, XCircle,
} from "lucide-react";
import { apiGet } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type StageStatus = "pending" | "in_progress" | "completed" | "delayed" | "cancelled";

type Stage = {
  id: string; process_id: string; name: string; order_index: number;
  status: StageStatus; responsible_name?: string;
  target_end_date?: string; completed_at?: string; note?: string;
};

type Process = {
  id: string; project_id: string; work_type: string; title: string;
  description?: string; status: string;
  start_date?: string; target_end_date?: string; completed_at?: string;
  responsible_name?: string; progress_percent: number;
  created_at: string; stages: Stage[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const STAGE_STATUS: Record<StageStatus, { label: string; icon: React.ElementType; text: string; bg: string }> = {
  pending:     { label: "Bekliyor",      icon: Circle,        text: "text-slate-500", bg: "bg-slate-50"  },
  in_progress: { label: "Devam Ediyor", icon: Play,          text: "text-blue-700",  bg: "bg-blue-50"   },
  completed:   { label: "Tamamlandı",   icon: CheckCircle2,  text: "text-green-700", bg: "bg-green-50"  },
  delayed:     { label: "Gecikti",      icon: AlertTriangle, text: "text-red-700",   bg: "bg-red-50"    },
  cancelled:   { label: "İptal",        icon: XCircle,       text: "text-slate-400", bg: "bg-slate-100" },
};

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function calcDays(target?: string): { text: string; color: string } {
  if (!target) return { text: "", color: "" };
  const d = Math.ceil((new Date(target).getTime() - Date.now()) / 86400000);
  if (d > 0)   return { text: `${d}g kaldı`,           color: "text-blue-600"  };
  if (d === 0) return { text: "Bugün teslim",           color: "text-amber-600" };
  return             { text: `${Math.abs(d)}g gecikti`, color: "text-red-600"   };
}

// ── ScopeCard (read-only) ──────────────────────────────────────────────────────

function ScopeCard({ process, projectId }: { process: Process; projectId: string }) {
  const [expanded, setExpanded] = useState(false);

  const isCompleted  = process.status === "completed";
  const currentStage = process.stages.find(s => s.status === "in_progress")
    ?? process.stages.find(s => s.status === "pending");
  const cd = isCompleted ? null : calcDays(process.target_end_date);

  const isBakim = process.work_type === "bakim";
  const klasorUrl = isBakim
    ? `/bakim/surecleri/${process.id}?p=${projectId}`
    : `/tadilat/surecleri/${process.id}?p=${projectId}`;

  return (
    <div className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${isCompleted ? "border-green-200" : "border-slate-200"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isCompleted ? "bg-green-50" : "bg-blue-50"}`}>
          {isCompleted ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-blue-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900">{process.title}</p>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              isCompleted ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
            }`}>
              {isCompleted ? "Tamamlandı" : process.work_type === "tadilat" ? "Tadilat" : process.work_type}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {!isCompleted && currentStage && (
              <span className="text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                {currentStage.name}
              </span>
            )}
            {cd && <span className={`text-[11px] font-medium ${cd.color}`}>{cd.text}</span>}
            {isCompleted && process.completed_at && (
              <span className="text-[11px] text-green-600">{fmtDate(process.completed_at)}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-bold ${isCompleted ? "text-green-600" : "text-blue-600"}`}>
            {process.progress_percent}%
          </p>
          <div className="w-16 h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
            <div className={`h-full rounded-full ${isCompleted ? "bg-green-400" : "bg-blue-400"}`}
              style={{ width: `${process.progress_percent}%` }} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-4 pb-3 flex-wrap">
        <button onClick={() => setExpanded(v => !v)}
          className="inline-flex items-center gap-1 text-[11px] text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Aşamalar ({process.stages.filter(s => s.status === "completed").length}/{process.stages.length})
        </button>
        <Link href={klasorUrl}
          className={`inline-flex items-center gap-1 text-[11px] border rounded-lg px-2.5 py-1 font-medium ${
            isBakim ? "text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100" : "text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100"
          }`}>
          <FolderOpen className="h-3 w-3" /> {isBakim ? "Bakım Klasörüne Git" : "Tadilat Klasörüne Git"}
        </Link>
      </div>

      {/* Expandable timeline — read-only */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-1.5 bg-slate-50/50">
          {process.stages.map((stage, idx) => {
            const cfg = STAGE_STATUS[stage.status] ?? STAGE_STATUS.pending;
            const Icon = cfg.icon;
            const isLast = idx === process.stages.length - 1;
            return (
              <div key={stage.id} className="flex gap-2.5">
                <div className="flex flex-col items-center pt-0.5">
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}>
                    <Icon className={`h-3 w-3 ${cfg.text}`} />
                  </div>
                  {!isLast && <div className="mt-0.5 flex-1 w-px bg-slate-200 min-h-[12px]" />}
                </div>
                <div className={`flex-1 rounded-lg border p-2.5 mb-1 ${
                  stage.status === "in_progress" ? "border-blue-100 bg-blue-50/60" :
                  stage.status === "completed"   ? "border-green-100 bg-green-50/40" :
                  "border-slate-100 bg-white"
                }`}>
                  <p className={`text-xs font-medium ${cfg.text}`}>{stage.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-slate-400">
                    {stage.note && <span className="italic truncate max-w-[200px]">{stage.note}</span>}
                    {stage.completed_at && <span className="text-green-600">{fmtDate(stage.completed_at)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="pt-2">
            <Link href={klasorUrl}
              className={`inline-flex items-center gap-1 text-[11px] border rounded-lg px-2.5 py-1 font-medium ${
                isBakim ? "text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100" : "text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100"
              }`}>
              <ArrowRight className="h-3 w-3" /> Aşamaları güncellemek için {isBakim ? "Bakım" : "Tadilat"} Klasörüne Git
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProcessTab ─────────────────────────────────────────────────────────────────

export default function ProcessTab({ projectId }: { projectId: string; workType?: string; onTabSwitch?: (tab: string) => void }) {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading]     = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const procs = await apiGet<Process[]>(`/process/projects/${projectId}/process`).catch(() => []);
    setProcesses(Array.isArray(procs) ? procs : []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-2">
      <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      <p className="text-xs text-slate-400">Yükleniyor...</p>
    </div>
  );

  const active    = processes.filter(p => p.status !== "completed" && p.status !== "cancelled" && p.status !== "deleted");
  const completed = processes.filter(p => p.status === "completed");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Süreç Takibi</h3>
        <div className="flex items-center gap-2">
          <Link href="/bakim"
            className="inline-flex items-center gap-1 text-[11px] text-sky-700 border border-sky-200 bg-sky-50 rounded-lg px-2.5 py-1.5 hover:bg-sky-100 font-medium">
            Bakım Başlat →
          </Link>
          <Link href="/tadilat"
            className="inline-flex items-center gap-1 text-[11px] text-amber-700 border border-amber-200 bg-amber-50 rounded-lg px-2.5 py-1.5 hover:bg-amber-100 font-medium">
            Tadilat Başlat →
          </Link>
        </div>
      </div>

      {/* Read-only banner */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <AlertCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Bu alan sadece görüntüleme içindir. Tadilat dosyalarını düzenlemek, aşama güncellemek ve dosya yüklemek için
          {" "}<span className="font-semibold text-amber-700">Tadilat Klasörüne</span> gidin.
        </p>
      </div>

      {processes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-4 rounded-2xl border border-dashed border-slate-200">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
            <Clock className="h-6 w-6 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">Bu mağazada aktif süreç yok</p>
            <p className="text-xs text-slate-400 mt-1">Bakım veya tadilat süreçlerini ilgili modülden başlatın.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/bakim"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100">
              Bakım & Onarım →
            </Link>
            <Link href="/tadilat"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100">
              Tadilat →
            </Link>
          </div>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Aktif İş Kalemleri — {active.length}</p>
              {active.map(proc => <ScopeCard key={proc.id} process={proc} projectId={projectId} />)}
            </div>
          )}
          {completed.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tamamlanan İş Kalemleri — {completed.length}</p>
              {completed.map(proc => <ScopeCard key={proc.id} process={proc} projectId={projectId} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
