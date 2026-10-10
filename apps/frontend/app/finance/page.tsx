"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { openFileInNewTab } from "@/lib/download";
import { 
  CircleDollarSign, 
  Plus, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  Receipt,
  FileSpreadsheet,
  Coins,
  Search,
  Filter,
  User,
  Percent,
  CheckCircle2,
  AlertTriangle,
  X,
  Paperclip,
  Package
} from "lucide-react";

export default function FinancePage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  // Profitability Dashboard State
  const [profitabilityData, setProfitabilityData] = useState<any>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<"invoices" | "expenses" | "payments" | "profitability">("invoices");

  // Create Invoice Modal State
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    customer_id: "",
    project_id: "",
    invoice_no: "",
    title: "",
    issue_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    tax_rate: 20,
    items: [{ description: "", quantity: 1, unit_price: 0 }]
  });

  // Create Expense Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any | null>(null);
  const [stockMovementDetails, setStockMovementDetails] = useState<any | null>(null);
  const [loadingStockMovement, setLoadingStockMovement] = useState<boolean>(false);
  const [expenseForm, setExpenseForm] = useState({
    project_id: "",
    category: "material", // labour, material, transport, equipment, miscellaneous
    description: "",
    amount: "",
    quantity: "",
    expense_date: new Date().toISOString().split("T")[0],
    file: null as File | null
  });

  // Create Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    invoice_id: "",
    direction: "incoming", // incoming / outgoing
    amount: "",
    payment_method: "havale", // havale / eft / nakit
    reference_no: "",
    payment_date: new Date().toISOString().split("T")[0],
    notes: ""
  });

  useEffect(() => {
    if (selectedExpense && selectedExpense.stock_movement_id) {
      setLoadingStockMovement(true);
      setStockMovementDetails(null);
      apiGet(`/inventory/transactions/${selectedExpense.stock_movement_id}`)
        .then((data) => {
          setStockMovementDetails(data);
        })
        .catch((err) => {
          console.error("Failed to fetch stock movement details:", err);
          setStockMovementDetails(null);
        })
        .finally(() => {
          setLoadingStockMovement(false);
        });
    } else {
      setStockMovementDetails(null);
    }
  }, [selectedExpense]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [invs, exps, pays, projs, custs] = await Promise.all([
          apiGet("/finance/invoices").catch(() => []),
          apiGet("/finance/expenses").catch(() => []),
          apiGet("/finance/payments").catch(() => []),
          apiGet("/projects").catch(() => []),
          apiGet("/projects/customers").catch(() => [])
        ]);

        setInvoices(Array.isArray(invs) ? invs : []);
        setExpenses(Array.isArray(exps) ? exps : []);
        setPayments(Array.isArray(pays) ? pays : []);
        setProjects(Array.isArray(projs) ? projs : []);
        setCustomers(Array.isArray(custs) ? custs : []);

        if (Array.isArray(projs) && projs.length > 0) {
          loadProfitability(projs[0].id);
        }
      } catch (err) {
        console.error("Finance data fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function loadProfitability(projId: string) {
    try {
      const data = await apiGet(`/finance/dashboard/profitability/${projId}`);
      setProfitabilityData(data);
    } catch (err) {
      console.error("Profitability load error:", err);
      setProfitabilityData(null);
    }
  }

  // Invoice calculations
  const invoiceSubtotal = invoiceForm.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const invoiceTaxAmount = (invoiceSubtotal * invoiceForm.tax_rate) / 100;
  const invoiceGrandTotal = invoiceSubtotal + invoiceTaxAmount;

  async function handleInvoiceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceForm.customer_id) {
      alert("Lütfen bir müşteri seçiniz.");
      return;
    }

    try {
      const payload = {
        customer_id: invoiceForm.customer_id,
        project_id: invoiceForm.project_id || null,
        invoice_no: invoiceForm.invoice_no,
        title: invoiceForm.title,
        issue_date: new Date(invoiceForm.issue_date).toISOString(),
        due_date: invoiceForm.due_date ? new Date(invoiceForm.due_date).toISOString() : null,
        subtotal: invoiceSubtotal,
        tax_rate: invoiceForm.tax_rate,
        tax_amount: invoiceTaxAmount,
        grand_total: invoiceGrandTotal,
        status: "draft",
        items: invoiceForm.items.filter(item => item.description.trim() !== "")
      };

      await apiPost("/finance/invoices", payload);
      alert("Hakediş Faturası başarıyla oluşturuldu.");
      setIsInvoiceModalOpen(false);
      // Reload
      const invs = await apiGet<any[]>("/finance/invoices");
      setInvoices(Array.isArray(invs) ? invs : []);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Fatura oluşturulamadı.");
    }
  }

  async function handleExpenseSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        project_id: expenseForm.project_id,
        category: expenseForm.category,
        description: expenseForm.description,
        amount: parseFloat(expenseForm.amount),
        quantity: expenseForm.quantity ? parseFloat(expenseForm.quantity) : null,
        expense_date: new Date(expenseForm.expense_date).toISOString()
      };

      const createdExpense: any = await apiPost("/finance/expenses", payload);

      if (expenseForm.file && createdExpense?.id) {
        try {
          const formData = new FormData();
          formData.append("project_id", createdExpense.project_id);
          formData.append("doc_type", "expense_receipt");
          formData.append("expense_id", createdExpense.id);
          formData.append("revision_note", "Masraf belgesi");
          formData.append("file", expenseForm.file);

          await apiPost("/documents/upload", formData, true);
        } catch (uploadErr) {
          console.error("Belge yükleme başarısız:", uploadErr);
          alert("Gider kaydedildi ancak belge yüklenirken hata oluştu.");
        }
      }

      alert("Harcama/Gider kaydı başarıyla girildi.");
      setIsExpenseModalOpen(false);
      setExpenseForm({
        project_id: "",
        category: "material",
        description: "",
        amount: "",
        quantity: "",
        expense_date: new Date().toISOString().split("T")[0],
        file: null
      });
      // Reload
      const exps = await apiGet<any[]>("/finance/expenses");
      setExpenses(Array.isArray(exps) ? exps : []);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Gider kaydı eklenemedi.");
    }
  }

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        invoice_id: paymentForm.invoice_id || null,
        direction: paymentForm.direction,
        amount: parseFloat(paymentForm.amount),
        payment_method: paymentForm.payment_method,
        reference_no: paymentForm.reference_no || null,
        payment_date: new Date(paymentForm.payment_date).toISOString(),
        notes: paymentForm.notes || null
      };

      await apiPost("/finance/payments", payload);
      alert("Ödeme/Tahsilat kaydı başarıyla işlendi.");
      setIsPaymentModalOpen(false);
      setPaymentForm({
        invoice_id: "",
        direction: "incoming",
        amount: "",
        payment_method: "havale",
        reference_no: "",
        payment_date: new Date().toISOString().split("T")[0],
        notes: ""
      });
      // Reload
      const [invs, pays] = await Promise.all([
        apiGet<any[]>("/finance/invoices"),
        apiGet<any[]>("/finance/payments")
      ]);
      setInvoices(Array.isArray(invs) ? invs : []);
      setPayments(Array.isArray(pays) ? pays : []);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Ödeme işlenemedi.");
    }
  }

  // Summary Metrics
  const totalRevenue = invoices.reduce((sum, inv) => sum + (Number(inv.grand_total) || 0), 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  const netEarnings = totalRevenue - totalExpenses;
  const marginPct = totalRevenue > 0 ? (netEarnings / totalRevenue) * 100 : 0;

  const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: "Taslak", color: "text-slate-700 border-slate-200", bg: "bg-slate-50" },
    sent: { label: "Gönderildi", color: "text-blue-700 border-blue-200", bg: "bg-blue-50" },
    approved: { label: "Onaylandı", color: "text-indigo-700 border-indigo-200", bg: "bg-indigo-50" },
    paid: { label: "Ödendi", color: "text-emerald-700 border-emerald-200", bg: "bg-emerald-50" },
    overdue: { label: "Gecikmiş", color: "text-rose-700 border-rose-200", bg: "bg-rose-50" },
    cancelled: { label: "İptal", color: "text-red-700 border-red-200", bg: "bg-red-50" }
  };

  const CATEGORY_LABELS: Record<string, string> = {
    labour: "İşçilik & Taşeron",
    material: "Malzeme Tedariği",
    transport: "Nakliye & Lojistik",
    equipment: "Makine Kiralama",
    miscellaneous: "Diğer Giderler"
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[500px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">Finansal veriler yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header and Quick Stats */}
      <div className="corp-header">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Finansal Akış & İcmal Yönetimi</h2>
            <p className="text-slate-300 mt-1.5 text-xs max-w-xl">
              Projelerinizin hakediş (icmal) süreçlerini, şantiye giderlerini ve nakit akışını anlık takip edin.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={() => setIsInvoiceModalOpen(true)}
              className="corp-btn-primary"
            >
              <Plus className="w-4 h-4" /> Yeni Hakediş (İcmal) Ekle
            </button>
            <button 
              onClick={() => setIsExpenseModalOpen(true)}
              className="corp-btn-secondary bg-slate-800 hover:bg-slate-700 text-white border-slate-700 active:bg-slate-900"
            >
              <Coins className="w-4 h-4 text-orange-400" /> Masraf Girişi Yap
            </button>
          </div>
        </div>
      </div>

      {/* Financial KPIs Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="corp-card p-6 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-slate-50 text-slate-700 border border-slate-200/60">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Hakediş Cirosu (Gelir)</p>
            <p className="text-xl font-bold text-slate-900 mt-1">₺{totalRevenue.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</p>
            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5 mt-0.5">
              <ArrowUpRight className="w-3 h-3" /> Fatura Edilmiş
            </span>
          </div>
        </div>

        <div className="corp-card p-6 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-slate-50 text-slate-700 border border-slate-200/60">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Şantiye Giderleri (Maliyet)</p>
            <p className="text-xl font-bold text-slate-900 mt-1">₺{totalExpenses.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</p>
            <span className="text-[10px] text-rose-600 font-bold flex items-center gap-0.5 mt-0.5">
              <ArrowDownRight className="w-3 h-3" /> Malzeme & İşçilik
            </span>
          </div>
        </div>

        <div className="corp-card p-6 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-slate-50 text-slate-700 border border-slate-200/60">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Net Kâr</p>
            <p className={`text-xl font-bold mt-1 ${netEarnings >= 0 ? "text-slate-900" : "text-rose-600"}`}>
              ₺{netEarnings.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 font-semibold flex items-center mt-0.5">
              Tesisat Karlılığı
            </span>
          </div>
        </div>

        <div className="corp-card p-6 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-slate-50 text-slate-700 border border-slate-200/60">
            <Percent className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Ortalama Brüt Marj</p>
            <p className="text-xl font-bold text-slate-900 mt-1">%{marginPct.toFixed(1)}</p>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden border border-slate-200/50">
              <div 
                className="bg-indigo-600 h-full" 
                style={{ width: `${Math.min(100, Math.max(0, marginPct))}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Selector & Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Navigation Sidebar for Finance tabs */}
        <div className="lg:col-span-1 space-y-4">
          <div className="corp-card p-4 space-y-1">
            <button
              onClick={() => setActiveTab("invoices")}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-3 text-xs transition-colors duration-150 ${
                activeTab === "invoices" 
                  ? "bg-slate-900 text-white" 
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Receipt className="w-4 h-4" /> Hakedişler & Faturalar
            </button>
            <button
              onClick={() => setActiveTab("expenses")}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-3 text-xs transition-colors duration-150 ${
                activeTab === "expenses" 
                  ? "bg-slate-900 text-white" 
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Coins className="w-4 h-4" /> Şantiye Giderleri
            </button>
            <button
              onClick={() => setActiveTab("payments")}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-3 text-xs transition-colors duration-150 ${
                activeTab === "payments" 
                  ? "bg-slate-900 text-white" 
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <CircleDollarSign className="w-4 h-4" /> Tahsilat & Ödeme Planı
            </button>
            <button
              onClick={() => setActiveTab("profitability")}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-3 text-xs transition-colors duration-150 ${
                activeTab === "profitability" 
                  ? "bg-slate-900 text-white" 
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <TrendingUp className="w-4 h-4" /> Proje Karlılık (İcmal)
            </button>
          </div>

          {/* Quick Cash-Flow Warning */}
          <div className="bg-amber-50/70 p-5 rounded-2xl border border-amber-200/70 text-amber-900 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-black text-[10px] uppercase tracking-wider text-amber-800">Vade & Finansal Akış Uyarısı</span>
            </div>
            <p className="text-xs text-amber-700 leading-relaxed font-semibold">
              Gelecek 30 gün içerisinde tahsil edilecek 2 onaylı hakediş icmali bulunmaktadır. Taşeron ödemeleri ile eşleştirme yapılması önerilir.
            </p>
          </div>
        </div>

        {/* Tab Workspaces */}
        <div className="lg:col-span-3">
          {activeTab === "invoices" && (
            <div className="corp-card">
              <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50/55">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Hakediş Faturaları Listesi</h3>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Toplam {invoices.length} fatura</span>
              </div>
              <div className="overflow-x-auto">
                <table className="corp-table">
                  <thead>
                    <tr>
                      <th className="corp-th">Fatura No</th>
                      <th className="corp-th">Fatura Başlığı</th>
                      <th className="corp-th">KDV Dahil Toplam</th>
                      <th className="corp-th">Kesim Tarihi</th>
                      <th className="corp-th">Durum</th>
                      <th className="corp-th text-right">Tahsilat Ekle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      let statusBadgeClass = "corp-badge-secondary";
                      if (inv.status === "paid") statusBadgeClass = "corp-badge-success";
                      else if (inv.status === "sent" || inv.status === "approved") statusBadgeClass = "corp-badge-info";
                      else if (inv.status === "overdue" || inv.status === "cancelled") statusBadgeClass = "corp-badge-danger";
                      
                      const label = STATUS_LABELS[inv.status]?.label || "Taslak";
                      
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/50">
                          <td className="corp-td font-mono text-xs">{inv.invoice_no}</td>
                          <td className="corp-td">{inv.title || "İcmal Hakedişi"}</td>
                          <td className="corp-td font-bold text-slate-900">₺{Number(inv.grand_total).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td>
                          <td className="corp-td text-xs text-slate-500">{new Date(inv.issue_date).toLocaleDateString("tr-TR")}</td>
                          <td className="corp-td">
                            <span className={statusBadgeClass}>
                              {label}
                            </span>
                          </td>
                          <td className="corp-td text-right">
                            {inv.status !== "paid" ? (
                              <button
                                onClick={() => {
                                  setPaymentForm({
                                    ...paymentForm,
                                    invoice_id: inv.id,
                                    amount: inv.grand_total.toString()
                                  });
                                  setIsPaymentModalOpen(true);
                                }}
                                className="corp-btn-secondary px-3 py-1 text-[11px] h-auto rounded-lg"
                              >
                                Tahsil Et
                              </button>
                            ) : (
                              <span className="text-xs text-emerald-600 font-bold inline-flex items-center gap-1 justify-end">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Kapandı
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {invoices.length === 0 && (
                      <tr>
                        <td colSpan={6} className="corp-td text-center text-slate-400 italic py-12">
                          Kayıtlı hakediş faturası bulunmamaktadır. Sağ üst köşeden ilk icmali oluşturun.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "expenses" && (
            <div className="corp-card">
              <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50/55">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Şantiye Gider Fişleri</h3>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Toplam {expenses.length} harcama kaydı</span>
              </div>
              <div className="overflow-x-auto">
                <table className="corp-table">
                  <thead>
                    <tr>
                      <th className="corp-th">Açıklama</th>
                      <th className="corp-th">Harcama Grubu</th>
                      <th className="corp-th">Tutar</th>
                      <th className="corp-th">Harcama Tarihi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((exp) => (
                      <tr 
                        key={exp.id} 
                        className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedExpense(exp)}
                      >
                        <td className="corp-td">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                                {exp.description}
                                {exp.documents && exp.documents.length > 0 && (
                                  <span title="Belge Ekli">
                                    <Paperclip className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                  </span>
                                )}
                              </p>
                              <p className="text-[9px] font-mono text-slate-400 mt-0.5">ID: {exp.id.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="corp-td">
                          <span className="corp-badge-secondary">
                            {CATEGORY_LABELS[exp.category] || exp.category}
                          </span>
                        </td>
                        <td className="corp-td font-bold text-rose-600">₺{Number(exp.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td>
                        <td className="corp-td text-xs text-slate-500">{new Date(exp.expense_date).toLocaleDateString("tr-TR")}</td>
                      </tr>
                    ))}
                    {expenses.length === 0 && (
                      <tr>
                        <td colSpan={4} className="corp-td text-center text-slate-400 italic py-12">
                          Henüz hiçbir şantiye gider kaydı yapılmamış.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "payments" && (
            <div className="corp-card">
              <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50/55">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Tahsilatlar & Ödemeler (Nakit Akışı)</h3>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Toplam {payments.length} hareket</span>
              </div>
              <div className="overflow-x-auto">
                <table className="corp-table">
                  <thead>
                    <tr>
                      <th className="corp-th">Referans No</th>
                      <th className="corp-th">Hareket Yönü</th>
                      <th className="corp-th">Miktar</th>
                      <th className="corp-th">Ödeme Yöntemi</th>
                      <th className="corp-th">Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50/50">
                        <td className="corp-td font-mono text-xs">{pay.reference_no || `REF-${pay.id.slice(0, 8).toUpperCase()}`}</td>
                        <td className="corp-td">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${pay.direction === "incoming" ? "text-emerald-600" : "text-rose-600"}`}>
                            {pay.direction === "incoming" ? "Müşteri Tahsilatı (+)" : "Tedarikçi Ödemesi (-)"}
                          </span>
                        </td>
                        <td className={`corp-td font-bold ${pay.direction === "incoming" ? "text-emerald-600" : "text-rose-600"}`}>
                          ₺{Number(pay.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="corp-td font-mono text-xs text-slate-500 uppercase">{pay.payment_method}</td>
                        <td className="corp-td text-xs text-slate-500">{new Date(pay.payment_date).toLocaleDateString("tr-TR")}</td>
                      </tr>
                    ))}
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="corp-td text-center text-slate-400 italic py-12">
                          Nakit akış tablosunda işlem kaydı bulunmuyor.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "profitability" && (
            <div className="space-y-6">
              {/* Select Project for Profitability */}
              <div className="corp-card p-5 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Proje Bazlı Karlılık Analizi</h3>
                <div className="w-64">
                  <select
                    className="corp-select"
                    onChange={(e) => loadProfitability(e.target.value)}
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Profitability Result */}
              {profitabilityData ? (
                <div className="corp-card p-6 space-y-6">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 text-center">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Kesilen Hakediş</p>
                      <p className="text-lg font-bold text-slate-900 mt-1">₺{profitabilityData.revenue.toLocaleString("tr")}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 text-center">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Harcanan Gider</p>
                      <p className="text-lg font-bold text-rose-600 mt-1">₺{profitabilityData.cost.toLocaleString("tr")}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 text-center">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Net Kâr Miktarı</p>
                      <p className={`text-lg font-bold mt-1 ${profitabilityData.net_profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        ₺{profitabilityData.net_profit.toLocaleString("tr")}
                      </p>
                    </div>
                  </div>

                  {/* Horizontal Bar visualization */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-slate-500 font-black uppercase tracking-wider">
                      <span>Proje Maliyet & Kar Oranı</span>
                      <span className="text-indigo-600">Karlılık: %{profitabilityData.margin_pct.toFixed(0)}</span>
                    </div>
                    <div className="w-full h-8 bg-slate-100 rounded-xl overflow-hidden flex font-mono text-[10px] text-white font-bold shadow-inner border border-slate-200">
                      {profitabilityData.revenue > 0 ? (
                        <>
                          <div 
                            className="bg-rose-600 h-full flex items-center justify-center transition-all duration-300"
                            style={{ width: `${Math.max(5, (profitabilityData.cost / profitabilityData.revenue) * 100)}%` }}
                          >
                            MALİYET (%{((profitabilityData.cost / profitabilityData.revenue) * 100).toFixed(0)}%)
                          </div>
                          <div 
                            className="bg-emerald-600 h-full flex items-center justify-center transition-all duration-300 flex-1"
                          >
                            NET KÂR (%{profitabilityData.margin_pct.toFixed(0)}%)
                          </div>
                        </>
                      ) : (
                        <div className="w-full text-slate-400 flex items-center justify-center italic">Bu projede henüz hakediş kaydı bulunmuyor.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center bg-white rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 italic">
                  Karlılık verileri yüklenemedi.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Invoice Modal */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 my-8">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Dönem Hakediş İcmali Oluştur</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Müşteri ve projelere ait fatura kesim aracı</p>
              </div>
              <button onClick={() => setIsInvoiceModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleInvoiceSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Müşteri Firma</label>
                  <select 
                    className="corp-select"
                    value={invoiceForm.customer_id}
                    onChange={(e) => setInvoiceForm({...invoiceForm, customer_id: e.target.value})}
                    required
                  >
                    <option value="">Seçiniz</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">İlgili Şantiye / Proje</label>
                  <select 
                    className="corp-select"
                    value={invoiceForm.project_id}
                    onChange={(e) => setInvoiceForm({...invoiceForm, project_id: e.target.value})}
                  >
                    <option value="">Bağımsız (Projesiz)</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Fatura / İcmal No</label>
                  <input 
                    type="text" 
                    placeholder="Örn: SIS-2026-0001"
                    className="corp-input"
                    value={invoiceForm.invoice_no}
                    onChange={(e) => setInvoiceForm({...invoiceForm, invoice_no: e.target.value})}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Fatura Başlığı (Açıklama)</label>
                  <input 
                    type="text" 
                    placeholder="Örn: X Zincir Market HVAC Kurulum Hakedişi"
                    className="corp-input"
                    value={invoiceForm.title}
                    onChange={(e) => setInvoiceForm({...invoiceForm, title: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Düzenleme Tarihi</label>
                  <input 
                    type="date"
                    className="corp-input font-semibold"
                    value={invoiceForm.issue_date}
                    onChange={(e) => setInvoiceForm({...invoiceForm, issue_date: e.target.value})}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Son Ödeme Vadesi</label>
                  <input 
                    type="date"
                    className="corp-input font-semibold"
                    value={invoiceForm.due_date}
                    onChange={(e) => setInvoiceForm({...invoiceForm, due_date: e.target.value})}
                    required
                  />
                </div>
              </div>

              {/* Items List Dynamic Grid */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Fatura Kalemleri</span>
                  <button
                    type="button"
                    onClick={() => setInvoiceForm({
                      ...invoiceForm,
                      items: [...invoiceForm.items, { description: "", quantity: 1, unit_price: 0 }]
                    })}
                    className="text-xs text-indigo-600 font-bold flex items-center gap-1 hover:text-indigo-700"
                  >
                    <Plus className="w-3.5 h-3.5" /> Kalem Ekle
                  </button>
                </div>

                {invoiceForm.items.map((item, idx) => (
                  <div key={idx} className="flex gap-3 items-center">
                    <input
                      type="text"
                      placeholder="Malzeme/Hizmet Kalem Açıklaması"
                      className="corp-input flex-1"
                      value={item.description}
                      onChange={(e) => {
                        const newItems = [...invoiceForm.items];
                        newItems[idx].description = e.target.value;
                        setInvoiceForm({...invoiceForm, items: newItems});
                      }}
                      required
                    />
                    <input
                      type="number"
                      placeholder="Miktar"
                      className="corp-input w-20 text-center"
                      value={item.quantity}
                      onChange={(e) => {
                        const newItems = [...invoiceForm.items];
                        newItems[idx].quantity = parseFloat(e.target.value) || 0;
                        setInvoiceForm({...invoiceForm, items: newItems});
                      }}
                      required
                    />
                    <input
                      type="number"
                      placeholder="Birim Fiyat"
                      className="corp-input w-32"
                      value={item.unit_price}
                      onChange={(e) => {
                        const newItems = [...invoiceForm.items];
                        newItems[idx].unit_price = parseFloat(e.target.value) || 0;
                        setInvoiceForm({...invoiceForm, items: newItems});
                      }}
                      required
                    />
                    {invoiceForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newItems = invoiceForm.items.filter((_, i) => i !== idx);
                          setInvoiceForm({...invoiceForm, items: newItems});
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Grand totals display panel */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 font-bold">
                <div className="flex justify-between">
                  <span>Ara Toplam:</span>
                  <span className="font-mono">₺{invoiceSubtotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center mt-2.5">
                  <div className="flex items-center gap-1.5">
                    <span>KDV Oranı:</span>
                    <input
                      type="number"
                      className="w-14 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-center outline-none focus:border-indigo-500"
                      value={invoiceForm.tax_rate}
                      onChange={(e) => setInvoiceForm({...invoiceForm, tax_rate: parseFloat(e.target.value) || 0})}
                    />
                    <span>%</span>
                  </div>
                  <span className="font-mono">₺{invoiceTaxAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between pt-2.5 mt-2.5 border-t border-slate-200 text-sm font-black text-slate-900">
                  <span>Genel Toplam:</span>
                  <span className="font-mono text-base text-indigo-600">₺{invoiceGrandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <button 
                type="submit"
                className="corp-btn-primary w-full py-3"
              >
                Hakediş İcmalini Kaydet
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Masraf / Gider Girişi</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Şantiye malzeme, taşeron veya nakliye masrafları</p>
              </div>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Masrafın Ait Olduğu Proje</label>
                <select 
                  className="corp-select"
                  value={expenseForm.project_id}
                  onChange={(e) => setExpenseForm({...expenseForm, project_id: e.target.value})}
                  required
                >
                  <option value="">Seçiniz</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Harcama Grubu</label>
                <select 
                  className="corp-select"
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                  required
                >
                  <option value="material">Malzeme Tedariği</option>
                  <option value="labour">İşçilik & Taşeron Ücreti</option>
                  <option value="transport">Nakliye & Lojistik</option>
                  <option value="equipment">Ekipman Kiralama</option>
                  <option value="miscellaneous">Diğer</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Harcama Açıklaması</label>
                <input 
                  type="text" 
                  placeholder="Örn: 200 mt Çelik Boru Nakliyesi"
                  className="corp-input"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Tutar (TL)</label>
                  <input 
                    type="number" 
                    placeholder="0.00"
                    className="corp-input font-mono"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Tarih</label>
                  <input 
                    type="date" 
                    className="corp-input font-semibold"
                    value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm({...expenseForm, expense_date: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Belge / Fiş / Fatura Yükle (İsteğe Bağlı)</label>
                <input 
                  type="file" 
                  className="corp-input py-1.5 text-xs text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  onChange={(e) => setExpenseForm({...expenseForm, file: e.target.files?.[0] || null})}
                />
              </div>

              <button 
                type="submit"
                className="corp-btn-primary w-full py-3"
              >
                Gider Kaydını Tamamla
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Tahsilat / Ödeme Girişi</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Hakediş tahsilatı veya tedarikçi cari ödemesi</p>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-650 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-1.5 rounded-xl border border-slate-200 mb-2">
                <button
                  type="button"
                  onClick={() => setPaymentForm({...paymentForm, direction: "incoming"})}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    paymentForm.direction === "incoming" 
                      ? "bg-emerald-600 text-white shadow-sm" 
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Müşteri Geliri (+)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentForm({...paymentForm, direction: "outgoing"})}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    paymentForm.direction === "outgoing" 
                      ? "bg-rose-600 text-white shadow-sm" 
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Tedarikçi Gideri (-)
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">İşlem Miktarı (TL)</label>
                <input 
                  type="number" 
                  placeholder="0.00"
                  className="corp-input font-mono font-bold"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Ödeme Tipi</label>
                  <select 
                    className="corp-select"
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm({...paymentForm, payment_method: e.target.value})}
                    required
                  >
                    <option value="havale">Banka Havale</option>
                    <option value="eft">EFT Transfer</option>
                    <option value="kredi_karti">Kredi Kartı</option>
                    <option value="cek">Ticari Çek</option>
                    <option value="nakit">Nakit</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Dekont / Ref No</label>
                  <input 
                    type="text" 
                    placeholder="Örn: REF-1823"
                    className="corp-input font-mono"
                    value={paymentForm.reference_no}
                    onChange={(e) => setPaymentForm({...paymentForm, reference_no: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">İşlem Tarihi</label>
                <input 
                  type="date" 
                  className="corp-input font-semibold"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({...paymentForm, payment_date: e.target.value})}
                  required
                />
              </div>

              <button 
                type="submit"
                className="corp-btn-primary w-full py-3"
              >
                Finansal Hareketi Tamamla
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Selected Expense Detail Modal */}
      {selectedExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Masraf / Gider Detayı</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Harcama kaydı ayrıntılı bilgileri</p>
              </div>
              <button 
                onClick={() => setSelectedExpense(null)} 
                className="text-slate-400 hover:text-slate-650 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-3">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">AÇIKLAMA</span>
                  <span className="text-sm font-bold text-slate-800">{selectedExpense.description}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">HARCAMA GRUBU</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 mt-1 inline-block">
                      {CATEGORY_LABELS[selectedExpense.category] || selectedExpense.category}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">TUTAR</span>
                    <span className="text-sm font-bold text-rose-600 font-mono">
                      ₺{Number(selectedExpense.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">TARİH</span>
                    <span className="text-xs font-bold text-slate-700">
                      {new Date(selectedExpense.expense_date).toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">PROJE</span>
                    <span className="text-xs font-bold text-slate-700 truncate block">
                      {projects.find(p => p.id === selectedExpense.project_id)?.name || "Bilinmeyen Proje"}
                    </span>
                  </div>
                </div>
              </div>

              {selectedExpense.stock_movement_id && (
                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-150 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-150">
                    <Package className="w-4 h-4 text-slate-500 shrink-0" />
                    <div>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">İlişkili Stok Hareketi</span>
                      <p className="text-[9px] font-mono text-slate-400">ID: {selectedExpense.stock_movement_id.slice(0, 8)}</p>
                    </div>
                  </div>

                  {loadingStockMovement ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin"></div>
                      <span className="text-xs text-slate-500 ml-2">Yükleniyor...</span>
                    </div>
                  ) : stockMovementDetails ? (
                    <div className="space-y-3">
                      <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">MALZEME / ÜRÜN</span>
                        <span className="text-xs font-bold text-slate-850 block">{stockMovementDetails.material_name}</span>
                        {stockMovementDetails.material_sku && (
                          <span className="text-[9px] font-mono text-slate-400">SKU: {stockMovementDetails.material_sku}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">MİKTAR</span>
                          <span className="text-xs font-bold text-slate-700">
                            {stockMovementDetails.quantity} {stockMovementDetails.material_unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">BİRİM MALİYET</span>
                          <span className="text-xs font-bold text-slate-700 font-mono">
                            ₺{Number(stockMovementDetails.unit_cost || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">ÇIKIŞ DEPOSU</span>
                          <span className="text-xs font-bold text-slate-700 truncate block">
                            {stockMovementDetails.from_warehouse_name || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">İŞLEM TÜRÜ</span>
                          <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-2 py-0.5 mt-0.5 inline-block uppercase tracking-wider text-[10px]">
                            {stockMovementDetails.transaction_type}
                          </span>
                        </div>
                      </div>

                      {stockMovementDetails.reference_no && (
                        <div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">İRSALİYE / FİŞ NO</span>
                          <span className="text-xs font-bold text-slate-700">{stockMovementDetails.reference_no}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-2 text-slate-400 italic text-xs">
                      Stok hareket ayrıntıları yüklenemedi.
                    </div>
                  )}
                </div>
              )}

              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">EK BELGE / FİŞ</span>
                {selectedExpense.documents && selectedExpense.documents.length > 0 ? (
                  <div className="space-y-2">
                    {selectedExpense.documents.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Paperclip className="w-4 h-4 text-indigo-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate" title={doc.original_name}>{doc.original_name}</p>
                            <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                              {(doc.file_size_bytes / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await openFileInNewTab(async () => {
                                const res = await apiGet<{ url?: string }>(`/documents/${doc.id}/download`);
                                return typeof res?.url === "string" ? res.url : "";
                              });
                            } catch {
                              alert("Belge indirme bağlantısı alınamadı.");
                            }
                          }}
                          className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-wider px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors animate-fade-in"
                        >
                          İndir
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-slate-400 italic text-xs">
                    Bu gider kaydına eklenmiş herhangi bir fiş veya fatura bulunmamaktadır.
                  </div>
                )}
              </div>

              <button
                onClick={() => setSelectedExpense(null)}
                className="corp-btn-secondary w-full py-2.5"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
