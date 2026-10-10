"use client";

import { useEffect, useState } from "react";
import {
  ShoppingCart, Plus, Check, X, AlertTriangle, Truck, Building2,
  Package, Search, Clock, CheckCircle2, XCircle, ClipboardCheck,
} from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { getTokenPayloadFromStorage, getRoles } from "@/lib/auth";

// ── Types ──────────────────────────────────────────────────────────────────
interface Material { id: string; name: string; sku: string; unit: string; }
interface Project   { id: string; name: string; project_no?: string; }
interface Warehouse { id: string; name: string; type: string; }
interface Supplier  { id: string; name: string; contact_name?: string; phone?: string; email?: string; tax_no?: string; is_active: boolean; }
interface PurchaseRequest {
  id: string; material_id: string; material_name?: string;
  project_id?: string; project_name?: string;
  quantity: number; priority: string; notes?: string;
  status: string; requested_by?: string; requested_at: string;
  review_note?: string;
}
interface POItem { material_id: string; material_name?: string; quantity: number; unit_price?: number; total_price?: number; notes?: string; }
interface PurchaseOrder {
  id: string; po_no: string; supplier_id?: string; supplier_name?: string;
  project_id?: string; project_name?: string; warehouse_id?: string;
  status: string; order_date?: string; expected_date?: string;
  received_at?: string; total_amount?: number; notes?: string;
  created_at: string; items: POItem[];
}

const PRIORITY_LABELS: Record<string, string> = { normal: "Normal", urgent: "Acil", critical: "Kritik" };
const PRIORITY_COLORS: Record<string, string> = {
  normal: "corp-badge-secondary",
  urgent: "corp-badge-warning",
  critical: "corp-badge-danger",
};
const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Onay Bekliyor", approved: "Onaylandı", rejected: "Reddedildi",
  draft: "Taslak", ordered: "Sipariş Verildi", received: "Teslim Alındı", cancelled: "İptal",
};
const STATUS_COLORS: Record<string, string> = {
  pending_approval: "corp-badge-warning", approved: "corp-badge-success",
  rejected: "corp-badge-danger", draft: "corp-badge-secondary",
  ordered: "corp-badge-info", received: "corp-badge-success", cancelled: "corp-badge-danger",
};

export default function ProcurementPage() {
  const [activeTab, setActiveTab] = useState<"requests" | "orders" | "suppliers">("requests");
  const [roles, setRoles] = useState<string[]>([]);
  const isAdmin = roles.includes("admin") || roles.includes("platform_admin");

  // Data
  const [requests, setRequests]   = useState<PurchaseRequest[]>([]);
  const [orders, setOrders]       = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [projects, setProjects]   = useState<Project[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading]     = useState(true);
  const [searchQ, setSearchQ]     = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [showRequestModal, setShowRequestModal]   = useState(false);
  const [showOrderModal, setShowOrderModal]       = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [reviewTarget, setReviewTarget]           = useState<PurchaseRequest | null>(null);
  const [receiveTarget, setReceiveTarget]         = useState<PurchaseOrder | null>(null);

  // Forms
  const [reqForm, setReqForm] = useState({ material_id: "", project_id: "", quantity: 1, priority: "normal", notes: "" });
  const [orderForm, setOrderForm] = useState({ po_no: "", supplier_id: "", project_id: "", warehouse_id: "", expected_date: "", notes: "", items: [{ material_id: "", quantity: 1, unit_price: "", notes: "" }] });
  const [supplierForm, setSupplierForm] = useState({ name: "", contact_name: "", phone: "", email: "", tax_no: "", address: "" });
  const [reviewForm, setReviewForm] = useState({ action: "approve", review_note: "" });

  useEffect(() => {
    const payload = getTokenPayloadFromStorage();
    setRoles(getRoles(payload));
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [reqs, ords, sups, mats, projs, whs] = await Promise.allSettled([
        apiGet<PurchaseRequest[]>("/procurement/requests"),
        apiGet<PurchaseOrder[]>("/procurement/orders"),
        apiGet<Supplier[]>("/procurement/suppliers"),
        apiGet<Material[]>("/inventory/materials"),
        apiGet<Project[]>("/projects"),
        apiGet<Warehouse[]>("/inventory/warehouses"),
      ]);
      if (reqs.status === "fulfilled") setRequests(Array.isArray(reqs.value) ? reqs.value : []);
      if (ords.status === "fulfilled") setOrders(Array.isArray(ords.value) ? ords.value : []);
      if (sups.status === "fulfilled") setSuppliers(Array.isArray(sups.value) ? sups.value : []);
      if (mats.status === "fulfilled") setMaterials(Array.isArray(mats.value) ? mats.value : []);
      if (projs.status === "fulfilled") setProjects(Array.isArray(projs.value) ? projs.value : []);
      if (whs.status === "fulfilled") setWarehouses(Array.isArray(whs.value) ? whs.value : []);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRequest() {
    if (!reqForm.material_id || reqForm.quantity < 1) return;
    try {
      await apiPost("/procurement/requests", {
        material_id: reqForm.material_id,
        project_id: reqForm.project_id || null,
        quantity: reqForm.quantity,
        priority: reqForm.priority,
        notes: reqForm.notes || null,
      });
      setShowRequestModal(false);
      setReqForm({ material_id: "", project_id: "", quantity: 1, priority: "normal", notes: "" });
      await loadData();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Talep oluşturulamadı.");
    }
  }

  async function handleReview() {
    if (!reviewTarget) return;
    try {
      await apiPatch(`/procurement/requests/${reviewTarget.id}/review`, {
        action: reviewForm.action,
        review_note: reviewForm.review_note || null,
      });
      setReviewTarget(null);
      setReviewForm({ action: "approve", review_note: "" });
      await loadData();
    } catch (e: any) {
      alert(e.response?.data?.detail || "İşlem başarısız.");
    }
  }

  async function handleCreateOrder() {
    if (!orderForm.po_no || !orderForm.warehouse_id) return;
    try {
      const validItems = orderForm.items.filter(i => i.material_id && i.quantity > 0);
      if (validItems.length === 0) { alert("En az bir malzeme satırı ekleyin."); return; }
      await apiPost("/procurement/orders", {
        po_no: orderForm.po_no,
        supplier_id: orderForm.supplier_id || null,
        project_id: orderForm.project_id || null,
        warehouse_id: orderForm.warehouse_id,
        expected_date: orderForm.expected_date ? new Date(orderForm.expected_date).toISOString() : null,
        notes: orderForm.notes || null,
        items: validItems.map(i => ({ material_id: i.material_id, quantity: Number(i.quantity), unit_price: i.unit_price ? Number(i.unit_price) : null, notes: i.notes || null })),
      });
      setShowOrderModal(false);
      setOrderForm({ po_no: "", supplier_id: "", project_id: "", warehouse_id: "", expected_date: "", notes: "", items: [{ material_id: "", quantity: 1, unit_price: "", notes: "" }] });
      await loadData();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Sipariş oluşturulamadı.");
    }
  }

  async function handleReceive() {
    if (!receiveTarget) return;
    try {
      await apiPatch(`/procurement/orders/${receiveTarget.id}/receive`, {});
      setReceiveTarget(null);
      await loadData();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Teslim alma işlemi başarısız.");
    }
  }

  async function handleCreateSupplier() {
    if (!supplierForm.name) return;
    try {
      await apiPost("/procurement/suppliers", {
        name: supplierForm.name,
        contact_name: supplierForm.contact_name || null,
        phone: supplierForm.phone || null,
        email: supplierForm.email || null,
        tax_no: supplierForm.tax_no || null,
        address: supplierForm.address || null,
      });
      setShowSupplierModal(false);
      setSupplierForm({ name: "", contact_name: "", phone: "", email: "", tax_no: "", address: "" });
      await loadData();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Tedarikçi oluşturulamadı.");
    }
  }

  const filteredRequests = requests.filter(r => {
    const q = searchQ.toLowerCase();
    const matchSearch = !q || (r.material_name || "").toLowerCase().includes(q) || (r.project_name || "").toLowerCase().includes(q);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredOrders = orders.filter(o => {
    const q = searchQ.toLowerCase();
    const matchSearch = !q || o.po_no.toLowerCase().includes(q) || (o.supplier_name || "").toLowerCase().includes(q);
    const matchStatus = !statusFilter || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pendingCount = requests.filter(r => r.status === "pending_approval").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh] flex-col gap-3">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 font-semibold text-sm">Satın alma verileri yükleniyor...</p>
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
              <ShoppingCart className="h-7 w-7" />
              Satın Alma & Tedarik
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500 text-white text-xs font-bold px-2.5 py-0.5">
                  {pendingCount} bekliyor
                </span>
              )}
            </h2>
            <p className="text-slate-300 mt-1.5 text-xs max-w-xl">
              Malzeme taleplerini yönetin, satın alma siparişi oluşturun ve tedarikçilerinizi kayıt altına alın.
            </p>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            {activeTab === "requests" && (
              <button onClick={() => setShowRequestModal(true)} className="corp-btn-primary">
                <Plus className="h-4 w-4" /> Yeni Talep
              </button>
            )}
            {activeTab === "orders" && isAdmin && (
              <button onClick={() => setShowOrderModal(true)} className="corp-btn-primary">
                <Plus className="h-4 w-4" /> Yeni Sipariş (PO)
              </button>
            )}
            {activeTab === "suppliers" && isAdmin && (
              <button onClick={() => setShowSupplierModal(true)} className="corp-btn-primary">
                <Plus className="h-4 w-4" /> Tedarikçi Ekle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {(["requests", "orders", "suppliers"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSearchQ(""); setStatusFilter(""); }}
            className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${
              activeTab === tab
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "requests" ? `Talepler${pendingCount > 0 ? ` (${pendingCount})` : ""}` : tab === "orders" ? "Siparişler (PO)" : "Tedarikçiler"}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      {activeTab !== "suppliers" && (
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              className="corp-input pl-9"
              placeholder="Ara..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
          </div>
          <select className="corp-select w-48" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Tüm Durumlar</option>
            {activeTab === "requests" ? (
              <>
                <option value="pending_approval">Onay Bekliyor</option>
                <option value="approved">Onaylandı</option>
                <option value="rejected">Reddedildi</option>
              </>
            ) : (
              <>
                <option value="ordered">Sipariş Verildi</option>
                <option value="received">Teslim Alındı</option>
                <option value="cancelled">İptal</option>
              </>
            )}
          </select>
        </div>
      )}

      {/* ── TALEPLER TAB ── */}
      {activeTab === "requests" && (
        <div className="corp-card">
          <table className="corp-table">
            <thead>
              <tr>
                <th className="corp-th">Malzeme</th>
                <th className="corp-th">Proje</th>
                <th className="corp-th">Miktar</th>
                <th className="corp-th">Öncelik</th>
                <th className="corp-th">Durum</th>
                <th className="corp-th">Tarih</th>
                {isAdmin && <th className="corp-th">İşlem</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 6} className="corp-td text-center text-slate-400 py-12">Talep bulunamadı.</td></tr>
              ) : filteredRequests.map(req => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="corp-td">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-800">{req.material_name || req.material_id.slice(0, 8)}</span>
                    </div>
                  </td>
                  <td className="corp-td text-slate-600">{req.project_name || "—"}</td>
                  <td className="corp-td font-bold text-slate-800">{req.quantity}</td>
                  <td className="corp-td">
                    <span className={PRIORITY_COLORS[req.priority] || "corp-badge-secondary"}>
                      {PRIORITY_LABELS[req.priority] || req.priority}
                    </span>
                  </td>
                  <td className="corp-td">
                    <span className={STATUS_COLORS[req.status] || "corp-badge-secondary"}>
                      {STATUS_LABELS[req.status] || req.status}
                    </span>
                  </td>
                  <td className="corp-td text-slate-500 text-xs">
                    {new Date(req.requested_at).toLocaleDateString("tr-TR")}
                  </td>
                  {isAdmin && (
                    <td className="corp-td">
                      {req.status === "pending_approval" ? (
                        <button
                          onClick={() => { setReviewTarget(req); setReviewForm({ action: "approve", review_note: "" }); }}
                          className="corp-btn-secondary text-[11px] py-1.5 px-3"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" /> İncele
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">{req.review_note || "—"}</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SİPARİŞLER TAB ── */}
      {activeTab === "orders" && (
        <div className="corp-card">
          <table className="corp-table">
            <thead>
              <tr>
                <th className="corp-th">PO No</th>
                <th className="corp-th">Tedarikçi</th>
                <th className="corp-th">Proje</th>
                <th className="corp-th">Tutar</th>
                <th className="corp-th">Durum</th>
                <th className="corp-th">Beklenen Tarih</th>
                {isAdmin && <th className="corp-th">İşlem</th>}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 6} className="corp-td text-center text-slate-400 py-12">Sipariş bulunamadı.</td></tr>
              ) : filteredOrders.map(po => (
                <tr key={po.id} className="hover:bg-slate-50">
                  <td className="corp-td font-bold text-slate-800">{po.po_no}</td>
                  <td className="corp-td">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>{po.supplier_name || "—"}</span>
                    </div>
                  </td>
                  <td className="corp-td text-slate-600">{po.project_name || "—"}</td>
                  <td className="corp-td font-bold text-slate-800">
                    {po.total_amount ? `₺${po.total_amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="corp-td">
                    <span className={STATUS_COLORS[po.status] || "corp-badge-secondary"}>
                      {STATUS_LABELS[po.status] || po.status}
                    </span>
                  </td>
                  <td className="corp-td text-slate-500 text-xs">
                    {po.expected_date ? new Date(po.expected_date).toLocaleDateString("tr-TR") : "—"}
                  </td>
                  {isAdmin && (
                    <td className="corp-td">
                      {po.status === "ordered" ? (
                        <button
                          onClick={() => setReceiveTarget(po)}
                          className="corp-btn-primary text-[11px] py-1.5 px-3"
                        >
                          <Truck className="h-3.5 w-3.5" /> Teslim Al
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">
                          {po.received_at ? new Date(po.received_at).toLocaleDateString("tr-TR") : "—"}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TEDARİKÇİLER TAB ── */}
      {activeTab === "suppliers" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.length === 0 && (
            <div className="col-span-full corp-card p-10 text-center text-slate-400 text-sm">
              <Building2 className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              Henüz tedarikçi kaydı bulunmuyor.
            </div>
          )}
          {suppliers.map(s => (
            <div key={s.id} className="corp-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-slate-800 text-sm">{s.name}</h3>
                <span className={s.is_active ? "corp-badge-success" : "corp-badge-danger"}>
                  {s.is_active ? "Aktif" : "Pasif"}
                </span>
              </div>
              {s.contact_name && <p className="text-xs text-slate-600 font-medium">{s.contact_name}</p>}
              <div className="space-y-1 text-xs text-slate-500">
                {s.phone && <p>📞 {s.phone}</p>}
                {s.email && <p>✉️ {s.email}</p>}
                {s.tax_no && <p>🏢 VN: {s.tax_no}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── YENİ TALEP MODAL ── */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowRequestModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-800">Malzeme Talebi Oluştur</h3>
              <button onClick={() => setShowRequestModal(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Malzeme *</label>
                <select className="corp-select mt-1" value={reqForm.material_id} onChange={e => setReqForm({...reqForm, material_id: e.target.value})}>
                  <option value="">Seçin...</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.sku})</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">İlgili Proje</label>
                <select className="corp-select mt-1" value={reqForm.project_id} onChange={e => setReqForm({...reqForm, project_id: e.target.value})}>
                  <option value="">Proje Seçin (Opsiyonel)</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Miktar *</label>
                  <input type="number" min={1} className="corp-input mt-1" value={reqForm.quantity} onChange={e => setReqForm({...reqForm, quantity: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Öncelik</label>
                  <select className="corp-select mt-1" value={reqForm.priority} onChange={e => setReqForm({...reqForm, priority: e.target.value})}>
                    <option value="normal">Normal</option>
                    <option value="urgent">Acil</option>
                    <option value="critical">Kritik</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Açıklama / Neden</label>
                <textarea className="corp-input mt-1 h-20 resize-none" placeholder="Neden bu malzemeye ihtiyaç duyulduğunu açıklayın..." value={reqForm.notes} onChange={e => setReqForm({...reqForm, notes: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowRequestModal(false)} className="flex-1 corp-btn-secondary">İptal</button>
              <button onClick={handleCreateRequest} className="flex-1 corp-btn-primary"><Check className="h-4 w-4" /> Talep Gönder</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ONAY / RED MODAL ── */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setReviewTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-800">Talebi İncele</h3>
              <button onClick={() => setReviewTarget(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-sm space-y-1">
              <p><span className="font-bold text-slate-500">Malzeme:</span> <span className="font-semibold">{reviewTarget.material_name}</span></p>
              <p><span className="font-bold text-slate-500">Miktar:</span> <span className="font-semibold">{reviewTarget.quantity}</span></p>
              <p><span className="font-bold text-slate-500">Öncelik:</span> <span className="font-semibold">{PRIORITY_LABELS[reviewTarget.priority]}</span></p>
              {reviewTarget.notes && <p><span className="font-bold text-slate-500">Not:</span> {reviewTarget.notes}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setReviewForm({...reviewForm, action: "approve"})} className={`flex-1 py-2.5 text-xs font-bold rounded-xl border transition-colors ${reviewForm.action === "approve" ? "bg-emerald-600 text-white border-emerald-700" : "bg-white text-slate-600 border-slate-200"}`}>
                <CheckCircle2 className="h-4 w-4 inline mr-1" /> Onayla
              </button>
              <button onClick={() => setReviewForm({...reviewForm, action: "reject"})} className={`flex-1 py-2.5 text-xs font-bold rounded-xl border transition-colors ${reviewForm.action === "reject" ? "bg-rose-600 text-white border-rose-700" : "bg-white text-slate-600 border-slate-200"}`}>
                <XCircle className="h-4 w-4 inline mr-1" /> Reddet
              </button>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Not (Opsiyonel)</label>
              <textarea className="corp-input mt-1 h-16 resize-none" placeholder="Onay / Red gerekçesi..." value={reviewForm.review_note} onChange={e => setReviewForm({...reviewForm, review_note: e.target.value})} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setReviewTarget(null)} className="flex-1 corp-btn-secondary">Vazgeç</button>
              <button onClick={handleReview} className={`flex-1 ${reviewForm.action === "approve" ? "corp-btn-primary" : "corp-btn-danger"}`}>
                {reviewForm.action === "approve" ? "Onayla" : "Reddet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TELSİM ALMA MODAL ── */}
      {receiveTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setReceiveTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-extrabold text-slate-800 border-b border-slate-100 pb-3">Siparişi Teslim Al</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-semibold">
              <AlertTriangle className="h-4 w-4 inline mr-1.5" />
              <strong>{receiveTarget.po_no}</strong> siparişini teslim alındı olarak işaretlemek istediğinize emin misiniz?
              Bu işlem siparişin tüm kalemleri için otomatik Stok Giriş (IN) hareketi oluşturacaktır.
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-sm space-y-1">
              <p><span className="font-bold text-slate-500">PO No:</span> {receiveTarget.po_no}</p>
              <p><span className="font-bold text-slate-500">Tedarikçi:</span> {receiveTarget.supplier_name || "—"}</p>
              <p><span className="font-bold text-slate-500">Toplam Tutar:</span> {receiveTarget.total_amount ? `₺${receiveTarget.total_amount.toLocaleString("tr-TR")}` : "—"}</p>
              <p><span className="font-bold text-slate-500">Kalem Sayısı:</span> {receiveTarget.items.length}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setReceiveTarget(null)} className="flex-1 corp-btn-secondary">İptal</button>
              <button onClick={handleReceive} className="flex-1 corp-btn-primary">
                <Truck className="h-4 w-4" /> Teslim Alındı Olarak İşaretle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── YENİ PO MODAL ── */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowOrderModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4 my-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-800">Satın Alma Siparişi (PO) Oluştur</h3>
              <button onClick={() => setShowOrderModal(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">PO Numarası *</label>
                <input className="corp-input mt-1" placeholder="ÖRN: PO-2024-001" value={orderForm.po_no} onChange={e => setOrderForm({...orderForm, po_no: e.target.value})} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tedarikçi</label>
                <select className="corp-select mt-1" value={orderForm.supplier_id} onChange={e => setOrderForm({...orderForm, supplier_id: e.target.value})}>
                  <option value="">Seçin (Opsiyonel)</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Hedef Depo *</label>
                <select className="corp-select mt-1" value={orderForm.warehouse_id} onChange={e => setOrderForm({...orderForm, warehouse_id: e.target.value})}>
                  <option value="">Seçin...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.type})</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Beklenen Teslim Tarihi</label>
                <input type="date" className="corp-input mt-1" value={orderForm.expected_date} onChange={e => setOrderForm({...orderForm, expected_date: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">İlgili Proje</label>
                <select className="corp-select mt-1" value={orderForm.project_id} onChange={e => setOrderForm({...orderForm, project_id: e.target.value})}>
                  <option value="">Seçin (Opsiyonel)</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sipariş Kalemleri *</label>
                <button
                  type="button"
                  onClick={() => setOrderForm({...orderForm, items: [...orderForm.items, { material_id: "", quantity: 1, unit_price: "", notes: "" }]})}
                  className="corp-btn-secondary text-[11px] py-1 px-2.5"
                >
                  <Plus className="h-3 w-3" /> Kalem Ekle
                </button>
              </div>
              {orderForm.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div className="col-span-5">
                    <select className="corp-select" value={item.material_id} onChange={e => { const items = [...orderForm.items]; items[idx].material_id = e.target.value; setOrderForm({...orderForm, items}); }}>
                      <option value="">Malzeme Seçin...</option>
                      {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input type="number" min={1} placeholder="Adet" className="corp-input" value={item.quantity} onChange={e => { const items = [...orderForm.items]; items[idx].quantity = Number(e.target.value); setOrderForm({...orderForm, items}); }} />
                  </div>
                  <div className="col-span-3">
                    <input type="number" placeholder="Birim Fiyat (₺)" className="corp-input" value={item.unit_price} onChange={e => { const items = [...orderForm.items]; items[idx].unit_price = e.target.value; setOrderForm({...orderForm, items}); }} />
                  </div>
                  <div className="col-span-2 flex items-center justify-center">
                    {orderForm.items.length > 1 && (
                      <button onClick={() => { const items = orderForm.items.filter((_, i) => i !== idx); setOrderForm({...orderForm, items}); }} className="text-rose-500 hover:text-rose-700">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowOrderModal(false)} className="flex-1 corp-btn-secondary">İptal</button>
              <button onClick={handleCreateOrder} className="flex-1 corp-btn-primary"><Check className="h-4 w-4" /> Siparişi Oluştur</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TEDARİKÇİ EKLE MODAL ── */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowSupplierModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-800">Tedarikçi Ekle</h3>
              <button onClick={() => setShowSupplierModal(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Firma Adı *</label>
                <input className="corp-input mt-1" placeholder="Tedarikçi firma adı" value={supplierForm.name} onChange={e => setSupplierForm({...supplierForm, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Yetkili Kişi</label>
                  <input className="corp-input mt-1" placeholder="Ad Soyad" value={supplierForm.contact_name} onChange={e => setSupplierForm({...supplierForm, contact_name: e.target.value})} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Telefon</label>
                  <input className="corp-input mt-1" placeholder="0xxx xxx xxxx" value={supplierForm.phone} onChange={e => setSupplierForm({...supplierForm, phone: e.target.value})} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">E-posta</label>
                  <input className="corp-input mt-1" placeholder="info@tedarikci.com" value={supplierForm.email} onChange={e => setSupplierForm({...supplierForm, email: e.target.value})} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vergi Numarası</label>
                  <input className="corp-input mt-1" placeholder="VN" value={supplierForm.tax_no} onChange={e => setSupplierForm({...supplierForm, tax_no: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Adres</label>
                <textarea className="corp-input mt-1 h-16 resize-none" placeholder="Tedarikçi adresi" value={supplierForm.address} onChange={e => setSupplierForm({...supplierForm, address: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowSupplierModal(false)} className="flex-1 corp-btn-secondary">İptal</button>
              <button onClick={handleCreateSupplier} className="flex-1 corp-btn-primary"><Check className="h-4 w-4" /> Tedarikçiyi Kaydet</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
