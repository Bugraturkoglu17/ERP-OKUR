"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList, Plus, Check, X, ChevronDown, ChevronUp,
  Search, CheckCircle2, Clock, User, Calendar, Cloud,
  Users, HardHat, Trash2, Send, Eye,
} from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { getTokenPayloadFromStorage, getRoles } from "@/lib/auth";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Project { id: string; name: string; project_no?: string; }
interface ReportItem {
  id: string; report_id: string; activity_type: string;
  description: string; location?: string;
  hours_spent?: number; workers_count?: number; sort_order: number;
}
interface FieldReport {
  id: string; project_id: string; project_name?: string;
  author_id: string; author_name?: string;
  report_date: string; summary?: string; weather?: string;
  team_size?: number; hours_worked?: number;
  submitted: boolean; approved_by?: string; approved_at?: string;
  created_at: string; items: ReportItem[];
}

const ACTIVITY_LABELS: Record<string, string> = {
  installation:   "Montaj",
  testing:        "Test & Devreye Alma",
  inspection:     "Keşif / Denetim",
  procurement:    "Malzeme Temin",
  documentation:  "Çizim / Döküman",
  coordination:   "Koordinasyon",
  other:          "Diğer",
};

const ACTIVITY_COLORS: Record<string, string> = {
  installation:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  testing:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  inspection:    "bg-amber-50 text-amber-700 border-amber-200",
  procurement:   "bg-blue-50 text-blue-700 border-blue-200",
  documentation: "bg-violet-50 text-violet-700 border-violet-200",
  coordination:  "bg-slate-50 text-slate-600 border-slate-200",
  other:         "bg-gray-50 text-gray-600 border-gray-200",
};

const WEATHER_OPTS = ["Güneşli", "Bulutlu", "Yağmurlu", "Rüzgarlı", "Karlı", "Sisli"];

export default function FieldReportsPage() {
  const [roles, setRoles] = useState<string[]>([]);
  const isAdmin = roles.includes("admin") || roles.includes("platform_admin");

  const [reports, setReports]   = useState<FieldReport[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);

  // Filters
  const [searchQ, setSearchQ]         = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [submittedFilter, setSubmittedFilter] = useState<"all" | "pending" | "approved">("all");

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New Report Modal
  const [showModal, setShowModal] = useState(false);
  const [reportForm, setReportForm] = useState({
    project_id: "", report_date: new Date().toISOString().split("T")[0],
    summary: "", weather: "", team_size: "", hours_worked: "",
  });
  const [formItems, setFormItems] = useState([
    { activity_type: "installation", description: "", location: "", hours_spent: "", workers_count: "" }
  ]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const payload = getTokenPayloadFromStorage();
    setRoles(getRoles(payload));
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [reps, projs] = await Promise.allSettled([
        apiGet<FieldReport[]>("/field-reports/"),
        apiGet<Project[]>("/projects"),
      ]);
      if (reps.status === "fulfilled")   setReports(Array.isArray(reps.value) ? reps.value : []);
      if (projs.status === "fulfilled")  setProjects(Array.isArray(projs.value) ? projs.value : []);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!reportForm.project_id || !reportForm.report_date) return;
    setSubmitting(true);
    try {
      const validItems = formItems.filter(i => i.description.trim());
      await apiPost("/field-reports/", {
        project_id:   reportForm.project_id,
        report_date:  new Date(reportForm.report_date).toISOString(),
        summary:      reportForm.summary || null,
        weather:      reportForm.weather || null,
        team_size:    reportForm.team_size ? Number(reportForm.team_size) : null,
        hours_worked: reportForm.hours_worked ? Number(reportForm.hours_worked) : null,
        items: validItems.map((item, idx) => ({
          activity_type: item.activity_type,
          description:   item.description,
          location:      item.location || null,
          hours_spent:   item.hours_spent ? Number(item.hours_spent) : null,
          workers_count: item.workers_count ? Number(item.workers_count) : null,
          sort_order:    idx,
        })),
      });
      setShowModal(false);
      setReportForm({ project_id: "", report_date: new Date().toISOString().split("T")[0], summary: "", weather: "", team_size: "", hours_worked: "" });
      setFormItems([{ activity_type: "installation", description: "", location: "", hours_spent: "", workers_count: "" }]);
      await loadData();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Rapor oluşturulamadı.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(reportId: string) {
    if (!confirm("Bu raporu onaya göndermek istediğinize emin misiniz?")) return;
    try {
      await apiPatch(`/field-reports/${reportId}/submit`);
      await loadData();
    } catch (e: any) {
      alert(e.response?.data?.detail || "İşlem başarısız.");
    }
  }

  async function handleApprove(reportId: string) {
    if (!confirm("Bu raporu onaylamak istediğinize emin misiniz?")) return;
    try {
      await apiPatch(`/field-reports/${reportId}/approve`);
      await loadData();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Onay işlemi başarısız.");
    }
  }

  async function handleDelete(reportId: string) {
    if (!confirm("Bu raporu silmek istediğinize emin misiniz?")) return;
    try {
      await apiDelete(`/field-reports/${reportId}`);
      await loadData();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Rapor silinemedi.");
    }
  }

  const filteredReports = reports.filter(r => {
    const q = searchQ.toLowerCase();
    const matchSearch = !q ||
      (r.project_name || "").toLowerCase().includes(q) ||
      (r.summary || "").toLowerCase().includes(q) ||
      (r.author_name || "").toLowerCase().includes(q);
    const matchProject = !projectFilter || r.project_id === projectFilter;
    const matchStatus =
      submittedFilter === "all" ? true :
      submittedFilter === "pending" ? (r.submitted && !r.approved_by) :
      submittedFilter === "approved" ? !!r.approved_by : true;
    return matchSearch && matchProject && matchStatus;
  });

  const pendingApprovalCount = reports.filter(r => r.submitted && !r.approved_by).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh] flex-col gap-3">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 font-semibold text-sm">Saha raporları yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">

      {/* Header */}
      <div className="corp-header">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-3">
              <ClipboardList className="h-7 w-7" />
              Saha Günlük Raporları
              {pendingApprovalCount > 0 && isAdmin && (
                <span className="rounded-full bg-amber-500 text-white text-xs font-bold px-2.5 py-0.5">
                  {pendingApprovalCount} onay bekliyor
                </span>
              )}
            </h2>
            <p className="text-slate-300 mt-1.5 text-xs max-w-xl">
              Şantiye günlük faaliyetlerini kaydedin, ekip saatlerini takip edin ve onay süreçlerini yönetin.
            </p>
          </div>
          <button onClick={() => setShowModal(true)} className="corp-btn-primary self-start md:self-auto">
            <Plus className="h-4 w-4" /> Yeni Günlük Rapor
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Toplam Rapor", value: reports.length, icon: ClipboardList, color: "text-indigo-600" },
          { label: "Taslak", value: reports.filter(r => !r.submitted).length, icon: Clock, color: "text-slate-500" },
          { label: "Onay Bekliyor", value: pendingApprovalCount, icon: Send, color: "text-amber-600" },
          { label: "Onaylandı", value: reports.filter(r => !!r.approved_by).length, icon: CheckCircle2, color: "text-emerald-600" },
        ].map(card => (
          <div key={card.label} className="corp-card p-4 flex items-center gap-4">
            <div className={`${card.color} bg-slate-50 p-3 rounded-xl border border-slate-200`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-800">{card.value}</p>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            className="corp-input pl-9"
            placeholder="Proje, özet veya yazar ara..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>
        <select className="corp-select w-52" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="">Tüm Projeler</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="corp-select w-48" value={submittedFilter} onChange={e => setSubmittedFilter(e.target.value as any)}>
          <option value="all">Tüm Durumlar</option>
          <option value="pending">Onay Bekliyor</option>
          <option value="approved">Onaylandı</option>
        </select>
      </div>

      {/* Reports Table */}
      <div className="corp-card">
        <table className="corp-table">
          <thead>
            <tr>
              <th className="corp-th w-8"></th>
              <th className="corp-th">Rapor Tarihi</th>
              <th className="corp-th">Proje</th>
              <th className="corp-th">Yazar</th>
              <th className="corp-th">Ekip / Saat</th>
              <th className="corp-th">Aktiviteler</th>
              <th className="corp-th">Durum</th>
              <th className="corp-th">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {filteredReports.length === 0 ? (
              <tr>
                <td colSpan={8} className="corp-td text-center text-slate-400 py-12">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  Rapor bulunamadı.
                </td>
              </tr>
            ) : filteredReports.map(report => (
              <>
                <tr
                  key={report.id}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                >
                  <td className="corp-td text-slate-400">
                    {expandedId === report.id
                      ? <ChevronUp className="h-4 w-4" />
                      : <ChevronDown className="h-4 w-4" />}
                  </td>
                  <td className="corp-td">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="font-bold text-slate-800">
                        {new Date(report.report_date).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })}
                      </span>
                    </div>
                  </td>
                  <td className="corp-td font-semibold text-slate-700">{report.project_name || "—"}</td>
                  <td className="corp-td">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-[10px] font-bold text-indigo-700">
                        {(report.author_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs font-semibold text-slate-700">{report.author_name || "—"}</span>
                    </div>
                  </td>
                  <td className="corp-td">
                    <div className="flex gap-3 text-xs font-semibold text-slate-600">
                      {report.team_size != null && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-slate-400" /> {report.team_size} kişi
                        </span>
                      )}
                      {report.hours_worked != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400" /> {report.hours_worked}s
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="corp-td">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                      <HardHat className="h-3.5 w-3.5 text-slate-400" />
                      {report.items.length} aktivite
                    </span>
                  </td>
                  <td className="corp-td" onClick={e => e.stopPropagation()}>
                    {report.approved_by ? (
                      <span className="corp-badge-success"><CheckCircle2 className="h-3 w-3" /> Onaylandı</span>
                    ) : report.submitted ? (
                      <span className="corp-badge-warning"><Clock className="h-3 w-3" /> Onay Bekliyor</span>
                    ) : (
                      <span className="corp-badge-secondary">Taslak</span>
                    )}
                  </td>
                  <td className="corp-td" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1.5 flex-wrap">
                      {!report.submitted && (
                        <>
                          <button
                            onClick={() => handleSubmit(report.id)}
                            className="corp-btn-primary text-[11px] py-1.5 px-2.5"
                            title="Onaya Gönder"
                          >
                            <Send className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(report.id)}
                            className="corp-btn-danger text-[11px] py-1.5 px-2.5"
                            title="Sil"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                      {isAdmin && report.submitted && !report.approved_by && (
                        <button
                          onClick={() => handleApprove(report.id)}
                          className="corp-btn-primary text-[11px] py-1.5 px-2.5"
                          title="Onayla"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded Details Row */}
                {expandedId === report.id && (
                  <tr key={`${report.id}-expanded`} className="bg-slate-50/80">
                    <td colSpan={8} className="px-6 py-4 border-b border-slate-100">
                      <div className="space-y-3">
                        {/* Meta */}
                        <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                          {report.weather && (
                            <span className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 font-semibold">
                              <Cloud className="h-3.5 w-3.5 text-slate-400" /> {report.weather}
                            </span>
                          )}
                          {report.summary && (
                            <span className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 font-semibold max-w-xl">
                              {report.summary}
                            </span>
                          )}
                          {report.approved_at && (
                            <span className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {new Date(report.approved_at).toLocaleDateString("tr-TR")} tarihinde onaylandı
                            </span>
                          )}
                        </div>

                        {/* Activity Items */}
                        {report.items.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Aktiviteler</p>
                            {report.items.map((item, idx) => (
                              <div key={item.id} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide shrink-0 ${ACTIVITY_COLORS[item.activity_type] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
                                  {ACTIVITY_LABELS[item.activity_type] || item.activity_type}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-slate-800">{item.description}</p>
                                  {item.location && <p className="text-[11px] text-slate-500 mt-0.5">📍 {item.location}</p>}
                                </div>
                                <div className="flex gap-3 text-[11px] text-slate-500 font-semibold shrink-0">
                                  {item.hours_spent != null && <span>{item.hours_spent}s</span>}
                                  {item.workers_count != null && <span>{item.workers_count} kişi</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── YENİ RAPOR MODAL ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-5 my-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="font-extrabold text-slate-800 text-base">Günlük Saha Raporu Oluştur</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Report Header Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Proje *</label>
                <select
                  className="corp-select mt-1"
                  value={reportForm.project_id}
                  onChange={e => setReportForm({...reportForm, project_id: e.target.value})}
                >
                  <option value="">Proje Seçin...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Rapor Tarihi *</label>
                <input
                  type="date"
                  className="corp-input mt-1"
                  value={reportForm.report_date}
                  onChange={e => setReportForm({...reportForm, report_date: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Hava Durumu</label>
                <select
                  className="corp-select mt-1"
                  value={reportForm.weather}
                  onChange={e => setReportForm({...reportForm, weather: e.target.value})}
                >
                  <option value="">Seçin (Opsiyonel)</option>
                  {WEATHER_OPTS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ekip (Kişi)</label>
                  <input
                    type="number" min={0}
                    className="corp-input mt-1"
                    placeholder="0"
                    value={reportForm.team_size}
                    onChange={e => setReportForm({...reportForm, team_size: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Toplam Saat</label>
                  <input
                    type="number" min={0} step={0.5}
                    className="corp-input mt-1"
                    placeholder="0"
                    value={reportForm.hours_worked}
                    onChange={e => setReportForm({...reportForm, hours_worked: e.target.value})}
                  />
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gün Özeti</label>
                <textarea
                  className="corp-input mt-1 h-16 resize-none"
                  placeholder="Bugün sahada genel olarak neler yapıldı?"
                  value={reportForm.summary}
                  onChange={e => setReportForm({...reportForm, summary: e.target.value})}
                />
              </div>
            </div>

            {/* Activity Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Aktiviteler (Yapılan İşler)</p>
                <button
                  type="button"
                  onClick={() => setFormItems([...formItems, { activity_type: "installation", description: "", location: "", hours_spent: "", workers_count: "" }])}
                  className="corp-btn-secondary text-[11px] py-1 px-2.5"
                >
                  <Plus className="h-3 w-3" /> Aktivite Ekle
                </button>
              </div>
              {formItems.map((item, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <select
                      className="corp-select w-48"
                      value={item.activity_type}
                      onChange={e => { const items = [...formItems]; items[idx].activity_type = e.target.value; setFormItems(items); }}
                    >
                      {Object.entries(ACTIVITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {formItems.length > 1 && (
                      <button
                        onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))}
                        className="text-rose-500 hover:text-rose-700 p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <textarea
                    className="corp-input h-14 resize-none"
                    placeholder="Yapılan iş detayı (ör: 3. Kat koridoru sismik askı montajı tamamlandı)"
                    value={item.description}
                    onChange={e => { const items = [...formItems]; items[idx].description = e.target.value; setFormItems(items); }}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      className="corp-input"
                      placeholder="Konum / Kat"
                      value={item.location}
                      onChange={e => { const items = [...formItems]; items[idx].location = e.target.value; setFormItems(items); }}
                    />
                    <input
                      type="number" min={0} step={0.5}
                      className="corp-input"
                      placeholder="Süre (saat)"
                      value={item.hours_spent}
                      onChange={e => { const items = [...formItems]; items[idx].hours_spent = e.target.value; setFormItems(items); }}
                    />
                    <input
                      type="number" min={0}
                      className="corp-input"
                      placeholder="Çalışan (kişi)"
                      value={item.workers_count}
                      onChange={e => { const items = [...formItems]; items[idx].workers_count = e.target.value; setFormItems(items); }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="flex-1 corp-btn-secondary">İptal</button>
              <button onClick={handleCreate} disabled={submitting} className="flex-1 corp-btn-primary disabled:opacity-60">
                {submitting ? "Kaydediliyor..." : <><Check className="h-4 w-4" /> Raporu Kaydet</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
