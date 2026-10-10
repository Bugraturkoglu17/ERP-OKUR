"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { 
  Package, 
  Warehouse as WarehouseIcon, 
  ArrowRightLeft, 
  AlertTriangle, 
  X, 
  Plus, 
  Edit2, 
  Trash2,
  Search,
  Sliders,
  DollarSign,
  Activity,
  Info,
  Calendar,
  AlertCircle,
  FolderDot
} from "lucide-react";
import { getTokenPayloadFromStorage, getRoles } from "@/lib/auth";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<"materials" | "warehouses" | "transfers">("materials");
  const [materials, setMaterials] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Authentication & RBAC States
  const [roles, setRoles] = useState<string[]>([]);
  const [isSuper, setIsSuper] = useState(false); // platform_admin
  const [isAdmin, setIsAdmin] = useState(false); // platform_admin or admin

  // Search & Filter States
  const [materialSearch, setMaterialSearch] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");

  // Selected Warehouse State for Stock View
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const [warehouseStock, setWarehouseStock] = useState<any[]>([]);
  const [stockSearch, setStockSearch] = useState("");

  // Unified Stock Transaction Modal State
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txForm, setTxForm] = useState({
    transaction_type: "TRANSFER" as "TRANSFER" | "IN" | "OUT" | "RETURN" | "ADJUSTMENT",
    material_id: "",
    from_warehouse_id: "",
    to_warehouse_id: "",
    quantity: 1,
    unit_cost: 0,
    reference_no: "",
    notes: "",
    related_project_id: "",
  });

  // Transactions Log State
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txFilters, setTxFilters] = useState({
    material_id: "",
    warehouse_id: "",
    transaction_type: "",
  });

  // Add/Edit Material Modal State
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [materialForm, setMaterialForm] = useState({
    sku: "",
    name: "",
    unit: "Adet",
    unit_cost: 0,
    min_stock_level: 0,
    warehouse_id: "",
    initial_quantity: 0,
  });

  // Add/Edit Warehouse Modal State
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<any>(null);
  const [warehouseForm, setWarehouseForm] = useState({
    name: "",
    type: "site" as "site" | "main",
    code: "",
    location: "",
    project_id: "",
  });

  // Load User Authentication and Roles
  useEffect(() => {
    try {
      const payload = getTokenPayloadFromStorage();
      const userRoles = getRoles(payload);
      setRoles(userRoles);
      
      const superUser = userRoles.includes("platform_admin");
      const adminUser = userRoles.includes("admin") || superUser;
      
      setIsSuper(superUser);
      setIsAdmin(adminUser);
    } catch (err) {
      console.error("Auth payload parsing error:", err);
    }
  }, []);

  // Fetch Core Data
  async function loadData() {
    setLoading(true);
    try {
      const [mats, whs, projs] = await Promise.all([
        apiGet("/inventory/materials").catch(() => []),
        apiGet("/inventory/warehouses").catch(() => []),
        apiGet("/projects").catch(() => []),
      ]);
      setMaterials(Array.isArray(mats) ? mats : []);
      setWarehouses(Array.isArray(whs) ? whs : []);
      setProjects(Array.isArray(projs) ? projs : []);
    } catch (err) {
      console.error("Inventory core data load error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Select Warehouse Handler
  async function handleSelectWarehouse(wh: any) {
    setSelectedWarehouse(wh);
    try {
      const stock = await apiGet(`/inventory/warehouses/${wh.id}/stock`);
      setWarehouseStock(Array.isArray(stock) ? stock : []);
    } catch (err) {
      console.error("Stock fetch error:", err);
      setWarehouseStock([]);
    }
  }

  // Fetch Transactions List
  async function fetchTransactions() {
    setTxLoading(true);
    try {
      const params = new URLSearchParams();
      if (txFilters.material_id) params.append("material_id", txFilters.material_id);
      if (txFilters.warehouse_id) params.append("warehouse_id", txFilters.warehouse_id);
      if (txFilters.transaction_type) params.append("transaction_type", txFilters.transaction_type);
      
      const data = await apiGet(`/inventory/transactions?${params.toString()}`);
      setTransactions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Transactions fetch error:", err);
    } finally {
      setTxLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "transfers") {
      fetchTransactions();
    }
  }, [activeTab, txFilters]);

  // Handle Unified Stock Transaction Form Submit
  async function handleTxSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Field Validations based on Transaction Type
    const type = txForm.transaction_type;
    const payload: any = {
      material_id: txForm.material_id,
      quantity: Number(txForm.quantity),
      reference_no: txForm.reference_no || null,
      notes: txForm.notes || null,
      unit_cost: txForm.unit_cost ? Number(txForm.unit_cost) : null,
      related_project_id: txForm.related_project_id || null,
    };

    if (type === "TRANSFER") {
      if (!txForm.from_warehouse_id || !txForm.to_warehouse_id) {
        alert("Transfer işlemi için kaynak ve hedef depolar seçilmelidir.");
        return;
      }
      if (txForm.from_warehouse_id === txForm.to_warehouse_id) {
        alert("Kaynak ve hedef depo aynı olamaz.");
        return;
      }
      payload.from_warehouse_id = txForm.from_warehouse_id;
      payload.to_warehouse_id = txForm.to_warehouse_id;
    } else if (type === "IN" || type === "RETURN") {
      if (!txForm.to_warehouse_id) {
        alert("Malzeme girişi/iadesi için hedef depo seçilmelidir.");
        return;
      }
      payload.transaction_type = type;
      payload.to_warehouse_id = txForm.to_warehouse_id;
    } else if (type === "OUT" || type === "ADJUSTMENT") {
      if (!txForm.from_warehouse_id) {
        alert("Malzeme çıkışı/düzeltmesi için kaynak depo seçilmelidir.");
        return;
      }
      payload.transaction_type = type;
      payload.from_warehouse_id = txForm.from_warehouse_id;
    }

    try {
      if (type === "TRANSFER") {
        await apiPost("/inventory/transfer", payload);
      } else {
        await apiPost("/inventory/transactions", payload);
      }
      alert("Stok hareketi başarıyla kaydedildi.");
      setIsTxModalOpen(false);
      
      // Reset form
      setTxForm({
        transaction_type: "TRANSFER",
        material_id: "",
        from_warehouse_id: "",
        to_warehouse_id: "",
        quantity: 1,
        unit_cost: 0,
        reference_no: "",
        notes: "",
        related_project_id: "",
      });

      // Refresh Data
      loadData();
      if (selectedWarehouse) {
        handleSelectWarehouse(selectedWarehouse);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || "Stok hareketi işlemi başarısız oldu.");
    }
  }

  // Material Catalogs Crud
  function handleEditMaterial(m: any) {
    if (!isSuper) {
      alert("Bu işlem için yetkiniz bulunmamaktadır.");
      return;
    }
    setEditingMaterial(m);
    setMaterialForm({
      sku: m.sku,
      name: m.name,
      unit: m.unit,
      unit_cost: m.unit_cost || 0,
      min_stock_level: m.min_stock_level || 0,
      warehouse_id: "",
      initial_quantity: 0,
    });
    setIsMaterialModalOpen(true);
  }

  async function handleMaterialSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSuper) {
      alert("Bu işlem için yetkiniz bulunmamaktadır.");
      return;
    }
    try {
      const payload: any = {
        sku: materialForm.sku,
        name: materialForm.name,
        unit: materialForm.unit,
        unit_cost: Number(materialForm.unit_cost),
        min_stock_level: Number(materialForm.min_stock_level),
      };

      if (editingMaterial) {
        await apiPatch(`/inventory/materials/${editingMaterial.id}`, payload);
        alert("Malzeme başarıyla güncellendi.");
      } else {
        if (materialForm.warehouse_id && materialForm.initial_quantity > 0) {
          payload.warehouse_id = materialForm.warehouse_id;
          payload.initial_quantity = Number(materialForm.initial_quantity);
        }
        await apiPost("/inventory/materials", payload);
        alert("Malzeme başarıyla eklendi.");
      }
      setIsMaterialModalOpen(false);
      setEditingMaterial(null);
      setMaterialForm({ sku: "", name: "", unit: "Adet", unit_cost: 0, min_stock_level: 0, warehouse_id: "", initial_quantity: 0 });
      
      // Refresh
      const mats = await apiGet("/inventory/materials");
      setMaterials(Array.isArray(mats) ? mats : []);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Malzeme kaydı sırasında hata oluştu.");
    }
  }

  async function handleDeleteMaterial(id: string) {
    if (!isSuper) {
      alert("Bu işlem için yetkiniz bulunmamaktadır.");
      return;
    }
    if (!confirm("Bu malzemeyi silmek istediğinize emin misiniz?")) return;
    try {
      await apiDelete(`/inventory/materials/${id}`);
      alert("Malzeme başarıyla silindi.");
      const mats = await apiGet("/inventory/materials");
      setMaterials(Array.isArray(mats) ? mats : []);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Silme işlemi başarısız oldu.");
    }
  }

  // Warehouse CRUD
  function handleEditWarehouse(wh: any) {
    if (!isAdmin) {
      alert("Bu işlem için yetkiniz bulunmamaktadır.");
      return;
    }
    setEditingWarehouse(wh);
    setWarehouseForm({
      name: wh.name,
      type: wh.type as "site" | "main",
      code: wh.code || "",
      location: wh.location || "",
      project_id: wh.project_id || "",
    });
    setIsWarehouseModalOpen(true);
  }

  async function handleWarehouseSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) {
      alert("Bu işlem için yetkiniz bulunmamaktadır.");
      return;
    }

    const isSite = warehouseForm.type === "site";
    
    // Resolve project ID requirement for normal admin/tenant users
    if (isSite && !warehouseForm.project_id) {
      alert("Şantiye depoları için ilişkili bir proje seçmek zorunludur.");
      return;
    }

    const payload: any = {
      name: warehouseForm.name,
      type: warehouseForm.type,
      code: warehouseForm.code || null,
      location: warehouseForm.location || null,
      project_id: isSite ? warehouseForm.project_id : null,
    };

    try {
      if (editingWarehouse) {
        await apiPatch(`/inventory/warehouses/${editingWarehouse.id}`, payload);
        alert("Depo başarıyla güncellendi.");
      } else {
        await apiPost("/inventory/warehouses", payload);
        alert("Depo başarıyla eklendi.");
      }
      setIsWarehouseModalOpen(false);
      setEditingWarehouse(null);
      setWarehouseForm({ name: "", type: "site", code: "", location: "", project_id: "" });
      
      // Refresh
      const whs = await apiGet("/inventory/warehouses");
      setWarehouses(Array.isArray(whs) ? whs : []);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Depo kaydı sırasında hata oluştu.");
    }
  }

  async function handleDeleteWarehouse(id: string) {
    if (!isAdmin) {
      alert("Bu işlem için yetkiniz bulunmamaktadır.");
      return;
    }
    if (!confirm("Bu depoyu silmek istediğinize emin misiniz?")) return;
    try {
      await apiDelete(`/inventory/warehouses/${id}`);
      alert("Depo başarıyla silindi.");
      const whs = await apiGet("/inventory/warehouses");
      setWarehouses(Array.isArray(whs) ? whs : []);
      if (selectedWarehouse?.id === id) {
        setSelectedWarehouse(null);
        setWarehouseStock([]);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || "Silme işlemi başarısız oldu.");
    }
  }

  // Filter lists
  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(materialSearch.toLowerCase()) ||
    m.sku.toLowerCase().includes(materialSearch.toLowerCase())
  );

  const filteredWarehouses = warehouses.filter(wh =>
    wh.name.toLowerCase().includes(warehouseSearch.toLowerCase()) ||
    (wh.location && wh.location.toLowerCase().includes(warehouseSearch.toLowerCase()))
  );

  const filteredStock = warehouseStock.filter(stockItem =>
    stockItem.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    stockItem.sku.toLowerCase().includes(stockSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[500px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">Envanter modülü verileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      
      {/* Premium Solid Corporate Header */}
      <div className="corp-header">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-300 text-[10px] font-black uppercase tracking-wider mb-2 bg-indigo-900/50 px-3 py-1 rounded-md w-fit border border-indigo-800">
              <Activity className="w-3.5 h-3.5" /> Depo & Envanter Yönetimi
            </div>
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight font-sans">SİSMİK Stok Yönetimi</h2>
            <p className="text-slate-300 mt-1.5 text-xs lg:text-sm max-w-2xl font-medium leading-relaxed">
              Merkez depoları, dinamik şantiye envanterlerini ve stok hareketlerini gerçek zamanlı takip edin. 
              Rol tabanlı yetkilendirme ile kontrollü satın alma, sarfiyat ve transfer süreçleri yürütün.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Quick action button for all roles: Stock Movement Wizard */}
            <button 
              onClick={() => setIsTxModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-extrabold px-5 py-3 rounded-xl border border-indigo-700 shadow-sm transition-colors duration-150"
            >
              <ArrowRightLeft className="w-4 h-4" /> Stok Hareketi Ekle
            </button>

            {activeTab === "materials" && isSuper && (
              <button 
                onClick={() => {
                  setEditingMaterial(null);
                  setMaterialForm({ sku: "", name: "", unit: "Adet", unit_cost: 0, min_stock_level: 0, warehouse_id: "", initial_quantity: 0 });
                  setIsMaterialModalOpen(true);
                }}
                className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white text-xs font-extrabold px-5 py-3 rounded-xl border border-slate-700 shadow-sm transition-colors duration-150"
              >
                <Plus className="w-4 h-4 text-indigo-400" /> Malzeme Tanımla
              </button>
            )}

            {activeTab === "warehouses" && isAdmin && (
              <button 
                onClick={() => {
                  setEditingWarehouse(null);
                  setWarehouseForm({ name: "", type: "site", code: "", location: "", project_id: "" });
                  setIsWarehouseModalOpen(true);
                }}
                className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white text-xs font-extrabold px-5 py-3 rounded-xl border border-slate-700 shadow-sm transition-colors duration-150"
              >
                <Plus className="w-4 h-4 text-indigo-400" /> Depo Ekle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
        <div className="flex flex-wrap gap-1">
          {[
            { id: "materials", label: "Malzeme Kataloğu", icon: Package },
            { id: "warehouses", label: "Depolar & Stok Durumu", icon: WarehouseIcon },
            { id: "transfers", label: "Stok Hareketi Geçmişi", icon: Activity },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-extrabold tracking-wide uppercase transition-all duration-150 ${
                activeTab === tab.id 
                  ? "bg-white text-indigo-950 shadow-sm border border-slate-200" 
                  : "text-slate-500 hover:text-indigo-950 hover:bg-white/50"
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? "text-indigo-600" : "text-slate-400"}`} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dynamic Global Statistics Bar */}
        <div className="hidden lg:flex items-center gap-6 px-4 text-xs font-bold text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
            Katalog: <strong className="text-slate-900 font-extrabold">{materials.length}</strong> Malzeme
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Toplam: <strong className="text-slate-900 font-extrabold">{warehouses.length}</strong> Depo
          </div>
        </div>
      </div>

      {/* TAB 1: Materials Catalog */}
      {activeTab === "materials" && (
        <div className="space-y-4">
          {/* Filters card */}
          <div className="corp-card p-4 flex flex-col md:flex-row items-center gap-4">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text"
                placeholder="SKU veya malzeme adı ara..."
                className="corp-input pl-9"
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
              />
            </div>
            {!isSuper && (
              <div className="corp-badge-warning ml-auto px-3.5 py-2 font-bold flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0" />
                Malzeme ekleme, silme ve fiyat düzenleme yetkisi yalnızca geliştirici admine aittir.
              </div>
            )}
          </div>

          {/* Catalog Table */}
          <div className="corp-card">
            <div className="overflow-x-auto">
              <table className="corp-table">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="corp-th">SKU (Kod)</th>
                    <th className="corp-th">Malzeme Tanımı</th>
                    <th className="corp-th">Takip Birimi</th>
                    <th className="corp-th">Birim Maliyet</th>
                    <th className="corp-th">Eşik Seviyesi (Min)</th>
                    {isSuper && <th className="corp-th text-center">İşlemler</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {filteredMaterials.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-5 py-4 font-mono font-bold text-xs text-indigo-700 bg-slate-50/50 group-hover:bg-slate-50 transition-colors">{m.sku}</td>
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-800 text-sm">{m.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-semibold">Sistem ID: {m.id.substring(0,8)}...</div>
                      </td>
                      <td className="px-5 py-4 text-xs font-semibold text-slate-600">
                        {m.unit}
                      </td>
                      <td className="px-5 py-4 text-sm font-extrabold text-slate-900">
                        ₺{Number(m.unit_cost || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-4">
                        {m.min_stock_level > 0 ? (
                          <span className="corp-badge-warning">
                            {m.min_stock_level} {m.unit}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">Belirtilmemiş</span>
                        )}
                      </td>
                      {isSuper && (
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button 
                              onClick={() => handleEditMaterial(m)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors border border-slate-100 bg-white shadow-sm"
                              title="Düzenle"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDeleteMaterial(m.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-100 bg-white shadow-sm"
                              title="Katalogdan Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}

                  {filteredMaterials.length === 0 && (
                    <tr>
                      <td colSpan={isSuper ? 6 : 5} className="px-5 py-12 text-center text-slate-400 italic">
                        <Package className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        Arama kriterlerine uygun kayıtlı malzeme bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Warehouses & Stocks */}
      {activeTab === "warehouses" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left: Warehouse List */}
            <div className="lg:col-span-1 space-y-4">
              <div className="corp-card p-4 space-y-3">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <WarehouseIcon className="w-4 h-4 text-indigo-500" /> Depolar
                </h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input 
                    type="text"
                    placeholder="Depo adı veya şehir ara..."
                    className="corp-input pl-9"
                    value={warehouseSearch}
                    onChange={(e) => setWarehouseSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 max-h-[600px] overflow-y-auto pr-1">
                {filteredWarehouses.map((wh) => {
                  const isSelected = selectedWarehouse?.id === wh.id;
                  return (
                    <div 
                      key={wh.id} 
                      onClick={() => handleSelectWarehouse(wh)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all duration-150 ${
                        isSelected 
                          ? "border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500/20" 
                          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <div className={`p-1.5 rounded-lg mt-0.5 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            <WarehouseIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-sm text-slate-900 block leading-tight">{wh.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono mt-1 block">Kod: {wh.code || "Belirtilmemiş"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isAdmin && (
                            <>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditWarehouse(wh);
                                }}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Düzenle"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteWarehouse(wh.id);
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Sil"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            wh.type === 'main' 
                              ? 'bg-purple-100 text-purple-800 border border-purple-200/50' 
                              : 'bg-blue-100 text-blue-800 border border-blue-200/50'
                          }`}>
                            {wh.type === 'main' ? 'Merkez' : 'Şantiye'}
                          </span>
                        </div>
                      </div>

                      {/* Display project connection details if type is site */}
                      {wh.type === 'site' && wh.project_id && (
                        <div className="mt-3 text-[10px] text-indigo-700 bg-indigo-50 px-2 py-1 rounded w-fit font-bold flex items-center gap-1.5">
                          <FolderDot className="w-3 h-3" />
                          Proje: {projects.find(p => p.id === wh.project_id)?.name || "Mekanik Projesi"}
                        </div>
                      )}

                      <p className="text-xs text-slate-500 mt-2 font-medium italic line-clamp-1">{wh.location || "Konum bilgisi belirtilmemiş"}</p>
                    </div>
                  );
                })}

                {filteredWarehouses.length === 0 && (
                  <div className="bg-slate-50 border border-dashed border-slate-200 p-8 rounded-xl text-center text-slate-400 italic">
                    Kayıtlı depo bulunamadı.
                  </div>
                )}
              </div>
            </div>

            {/* Right: Stocks in Selected Warehouse */}
            <div className="lg:col-span-2">
              {selectedWarehouse ? (
                <div className="corp-card">
                  <div className="p-5 bg-slate-50 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-sm">{selectedWarehouse.name}</h3>
                      <p className="text-[11px] text-slate-500 font-medium mt-1">Bu deponun anlık malzeme stok seviyeleri</p>
                    </div>
                    
                    {/* Stocks Search */}
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                      <input 
                        type="text"
                        placeholder="Mevcut stoklarda ara..."
                        className="corp-input pl-9"
                        value={stockSearch}
                        onChange={(e) => setStockSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <table className="corp-table">
                    <thead>
                      <tr>
                        <th className="corp-th">Malzeme Tanımı</th>
                        <th className="corp-th">SKU</th>
                        <th className="corp-th text-right">Mevcut Miktar</th>
                        <th className="corp-th text-center">Stok Durumu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredStock.map((item) => {
                        const isLow = item.quantity <= (item.min_stock_level || 0);
                        return (
                          <tr key={item.material_id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-4">
                              <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                            </td>
                            <td className="px-5 py-4 font-mono text-xs text-indigo-700 font-semibold">{item.sku}</td>
                            <td className="px-5 py-4 text-right">
                              <span className="font-black text-slate-900 text-sm">
                                {item.quantity.toLocaleString("tr-TR")}
                              </span>
                              <span className="text-slate-400 text-xs ml-1 font-bold">{item.unit}</span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              {isLow ? (
                                <span className="corp-badge-danger">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Kritik Limit
                                </span>
                              ) : (
                                <span className="corp-badge-success">
                                  Güvenli Seviye
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      
                      {filteredStock.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-5 py-12 text-center text-slate-400 italic">
                            <AlertCircle className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                            Bu depoda envanter kaydı veya aranan kriterlerde stok bulunmuyor.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-300/80 text-slate-400 p-12 text-center">
                  <WarehouseIcon className="w-10 h-10 mb-4 text-slate-300" />
                  <h4 className="font-bold text-slate-700 text-sm">Depo Seçimi Yapılmadı</h4>
                  <p className="text-xs text-slate-500 max-w-sm mt-2">
                    Stok detaylarını, kritik limit uyarılarını ve depo ayrıntılarını incelemek için sol panelden bir depo seçiniz.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Transactions Log */}
      {activeTab === "transfers" && (
        <div className="space-y-4">
          
          {/* Filter Panel */}
          <div className="corp-card p-5 space-y-4">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-500" /> Detaylı Filtreleme Seçenekleri
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Malzeme Kataloğu</label>
                <select 
                  className="corp-select"
                  value={txFilters.material_id}
                  onChange={(e) => setTxFilters({...txFilters, material_id: e.target.value})}
                >
                  <option value="">Tümü</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.sku} - {m.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Depo Odaklı</label>
                <select 
                  className="corp-select"
                  value={txFilters.warehouse_id}
                  onChange={(e) => setTxFilters({...txFilters, warehouse_id: e.target.value})}
                >
                  <option value="">Tümü</option>
                  {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">İşlem Hareketi Tipi</label>
                <select 
                  className="corp-select"
                  value={txFilters.transaction_type}
                  onChange={(e) => setTxFilters({...txFilters, transaction_type: e.target.value})}
                >
                  <option value="">Tümü</option>
                  <option value="TRANSFER">Depolar Arası Transfer</option>
                  <option value="IN">Giriş (IN) - Satın Alma/Tedarik</option>
                  <option value="OUT">Çıkış (OUT) - Tüketim/Sarf</option>
                  <option value="RETURN">Şantiyeden İade (RETURN)</option>
                  <option value="ADJUSTMENT">Sayım Düzeltmesi (ADJUSTMENT)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Transactions Log Table */}
          <div className="corp-card">
            <div className="overflow-x-auto">
              <table className="corp-table">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="corp-th">Tarih / Saat</th>
                    <th className="corp-th">Malzeme</th>
                    <th className="corp-th">İşlem Yönü (Rota)</th>
                    <th className="corp-th text-right">Miktar</th>
                    <th className="corp-th">İşlem Tipi</th>
                    <th className="corp-th text-right">Maliyet (Birim/Top)</th>
                    <th className="corp-th">Ref / İrsaliye</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {txLoading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                        <div className="w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        Hareket geçmişi yükleniyor...
                      </td>
                    </tr>
                  ) : transactions.map((tx) => {
                    const material = materials.find(m => m.id === tx.material_id);
                    const fromWh = warehouses.find(wh => wh.id === tx.from_warehouse_id);
                    const toWh = warehouses.find(wh => wh.id === tx.to_warehouse_id);
                    
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-5 py-4 text-xs font-bold text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(tx.performed_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-800 text-sm">{material?.name || "Bilinmeyen Malzeme"}</div>
                          <div className="text-[10px] text-slate-400 font-mono font-semibold">{material?.sku || "-"}</div>
                        </td>
                        <td className="px-5 py-4 text-xs font-bold">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {fromWh?.name || "Dış Kaynak"}
                            </span>
                            <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="text-indigo-950 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-150">
                              {toWh?.name || "Sarfiyat / İade"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <strong className="text-slate-900 text-sm font-black">{tx.quantity}</strong>
                          <span className="text-slate-400 text-xs ml-1 font-bold">{material?.unit || ""}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wider uppercase ${
                            tx.transaction_type === 'TRANSFER' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            tx.transaction_type === 'IN' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            tx.transaction_type === 'OUT' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                            tx.transaction_type === 'RETURN' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-slate-50 text-slate-700 border border-slate-200'
                          }`}>
                            {tx.transaction_type}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {tx.unit_cost ? (
                            <div>
                              <div className="text-xs font-bold text-slate-900">₺{Number(tx.unit_cost).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5 font-bold">Top: ₺{Number(tx.total_cost || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-xs font-mono font-bold text-slate-600">
                          {tx.reference_no || "Girilmeyen"}
                        </td>
                      </tr>
                    );
                  })}
                  
                  {!txLoading && transactions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-400 italic">
                        <Activity className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                        Seçilen filtrelere göre kaydedilmiş stok hareketi geçmişi bulunmamaktadır.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Unified Stock Transaction Wizard */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
            
            <div className="p-5 border-b flex items-center justify-between bg-slate-900 text-white">
              <div>
                <h3 className="text-base font-black tracking-tight">Yeni Stok Hareketi Sihirbazı</h3>
                <p className="text-[10px] text-slate-300 mt-0.5 font-medium">Birim maliyet, irsaliye ve proje entegrasyonu ile stok yönetimi</p>
              </div>
              <button 
                onClick={() => setIsTxModalOpen(false)} 
                className="p-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleTxSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              
              {/* Type Select Box */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">İşlem Hareketi Tipi</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { id: "TRANSFER", label: "Depolar Arası Transfer", desc: "Çift Yönlü" },
                    { id: "IN", label: "Tedarik / Giriş", desc: "Tek Yönlü Giriş" },
                    { id: "OUT", label: "Sarfiyat / Çıkış", desc: "Tek Yönlü Çıkış" },
                    { id: "RETURN", label: "Depoya İade", desc: "Giriş Yönlü" },
                    { id: "ADJUSTMENT", label: "Sayım Düzeltmesi", desc: "Düzeltme Yönlü" }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTxForm({
                        ...txForm, 
                        transaction_type: t.id as any,
                        from_warehouse_id: t.id === "IN" || t.id === "RETURN" ? "" : txForm.from_warehouse_id,
                        to_warehouse_id: t.id === "OUT" || t.id === "ADJUSTMENT" ? "" : txForm.to_warehouse_id,
                      })}
                      className={`p-2.5 rounded-xl border text-left transition-all duration-150 ${
                        txForm.transaction_type === t.id 
                          ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                          : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
                      }`}
                    >
                      <span className="text-[11px] font-extrabold block leading-tight">{t.label}</span>
                      <span className="text-[9px] opacity-60 font-semibold mt-0.5 block">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Material Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Harekete Konu Malzeme</label>
                <select 
                  className="corp-select"
                  value={txForm.material_id}
                  onChange={(e) => setTxForm({...txForm, material_id: e.target.value})}
                  required
                >
                  <option value="">Malzeme seçiniz...</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>
                      [{m.sku}] {m.name} - Birim: {m.unit}
                    </option>
                  ))}
                </select>
              </div>

              {/* Warehouse inputs (Dynamic layout based on selected transaction type) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* FROM Warehouse - Required for TRANSFER, OUT, ADJUSTMENT */}
                {(txForm.transaction_type === "TRANSFER" || txForm.transaction_type === "OUT" || txForm.transaction_type === "ADJUSTMENT") && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Kaynak Depo</label>
                    <select 
                      className="corp-select"
                      value={txForm.from_warehouse_id}
                      onChange={(e) => setTxForm({...txForm, from_warehouse_id: e.target.value})}
                      required
                    >
                      <option value="">Seçiniz...</option>
                      {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
                    </select>
                  </div>
                )}

                {/* TO Warehouse - Required for TRANSFER, IN, RETURN */}
                {(txForm.transaction_type === "TRANSFER" || txForm.transaction_type === "IN" || txForm.transaction_type === "RETURN") && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Hedef Depo</label>
                    <select 
                      className="corp-select"
                      value={txForm.to_warehouse_id}
                      onChange={(e) => setTxForm({...txForm, to_warehouse_id: e.target.value})}
                      required
                    >
                      <option value="">Seçiniz...</option>
                      {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
                    </select>
                  </div>
                )}

              </div>

              {/* Quantity and Optional Cost */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">İşlem Miktarı</label>
                  <input 
                    type="number" 
                    className="corp-input font-bold"
                    value={txForm.quantity}
                    onChange={(e) => setTxForm({...txForm, quantity: Math.max(1, parseInt(e.target.value) || 1)})}
                    required
                    min="1"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Birim Maliyet (₺ - Opsiyonel)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="corp-input font-bold"
                    value={txForm.unit_cost}
                    onChange={(e) => setTxForm({...txForm, unit_cost: Math.max(0, parseFloat(e.target.value) || 0)})}
                  />
                </div>
              </div>

              {/* References & Connected Project */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">İrsaliye / Fiş Referans No</label>
                  <input 
                    type="text" 
                    placeholder="İrs-90342 vb."
                    className="corp-input font-bold"
                    value={txForm.reference_no}
                    onChange={(e) => setTxForm({...txForm, reference_no: e.target.value})}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">İlişkili Proje (Bütçe/Maliyet)</label>
                  <select 
                    className="corp-select"
                    value={txForm.related_project_id}
                    onChange={(e) => setTxForm({...txForm, related_project_id: e.target.value})}
                  >
                    <option value="">Proje yok (Genel Gider)</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Harekete Dair Açıklamalar</label>
                <textarea 
                  className="corp-input font-medium"
                  rows={2}
                  placeholder="Lojistik aracı plakası, teslim alan personel detayları veya sayım farkı nedenleri..."
                  value={txForm.notes}
                  onChange={(e) => setTxForm({...txForm, notes: e.target.value})}
                />
              </div>

              <button 
                type="submit"
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-sm transition-colors text-xs uppercase tracking-wider mt-4"
              >
                Hareketi Kaydet ve Stokları Güncelle
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Add / Edit Material */}
      {isMaterialModalOpen && isSuper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b flex items-center justify-between bg-slate-900 text-white">
              <div>
                <h3 className="text-base font-black tracking-tight">
                  {editingMaterial ? "Malzeme Tanımını Düzenle" : "Malzeme Kataloğuna Ekle"}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 font-medium">Sistem düzeyinde malzeme kartı tanımlayın</p>
              </div>
              <button onClick={() => {
                setIsMaterialModalOpen(false);
                setEditingMaterial(null);
              }} className="p-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleMaterialSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">SKU / Katalog Kodu</label>
                  <input 
                    type="text" 
                    placeholder="MLZ-839"
                    className="corp-input font-mono font-bold"
                    value={materialForm.sku}
                    onChange={(e) => setMaterialForm({...materialForm, sku: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Takip Birimi</label>
                  <input 
                    type="text" 
                    placeholder="Adet, Metre, Kg"
                    className="corp-input font-bold"
                    value={materialForm.unit}
                    onChange={(e) => setMaterialForm({...materialForm, unit: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Malzeme Tanımı (Adı)</label>
                <input 
                  type="text" 
                  placeholder="DN100 Deprem Kompansatörü"
                  className="corp-input font-semibold"
                  value={materialForm.name}
                  onChange={(e) => setMaterialForm({...materialForm, name: e.target.value})}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Birim Maliyet (₺)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="corp-input font-bold"
                    value={materialForm.unit_cost}
                    onChange={(e) => setMaterialForm({...materialForm, unit_cost: parseFloat(e.target.value) || 0})}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Min. Kritik Seviye</label>
                  <input 
                    type="number" 
                    className="corp-input font-bold"
                    value={materialForm.min_stock_level}
                    onChange={(e) => setMaterialForm({...materialForm, min_stock_level: parseInt(e.target.value) || 0})}
                    required
                  />
                </div>
              </div>
              
              {/* Optional initial stock entries for new materials */}
              {!editingMaterial && (
                <div className="pt-4 border-t mt-4 space-y-3">
                  <h4 className="text-[10px] font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-500" /> Opsiyonel İlk Stok Girişi
                  </h4>
                  <p className="text-[9px] text-slate-400 leading-tight">Bu malzeme kaydedilirken ilk envanter miktarını doğrudan tanımlayabilirsiniz.</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-500 uppercase block">Giriş Yapılacak Depo</label>
                      <select 
                        className="corp-select font-bold"
                        value={materialForm.warehouse_id}
                        onChange={(e) => setMaterialForm({...materialForm, warehouse_id: e.target.value})}
                      >
                        <option value="">Seçilmedi</option>
                        {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-500 uppercase block">Giriş Miktarı</label>
                      <input 
                        type="number" 
                        className="corp-input font-bold"
                        value={materialForm.initial_quantity}
                        onChange={(e) => setMaterialForm({...materialForm, initial_quantity: Math.max(0, parseInt(e.target.value) || 0)})}
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button 
                type="submit"
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-sm transition-colors text-xs uppercase tracking-wider mt-4"
              >
                {editingMaterial ? "Kataloğu Güncelle" : "Malzemeyi Kaydet"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Add / Edit Warehouse */}
      {isWarehouseModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b flex items-center justify-between bg-slate-900 text-white">
              <div>
                <h3 className="text-base font-black tracking-tight">
                  {editingWarehouse ? "Depo Kartını Düzenle" : "Yeni Depo Kaydet"}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 font-medium">Merkez veya şantiye lojistik deposu oluşturun</p>
              </div>
              <button onClick={() => {
                setIsWarehouseModalOpen(false);
                setEditingWarehouse(null);
              }} className="p-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleWarehouseSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Depo Tipi</label>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                  {[
                    { id: "site", label: "Şantiye Deposu" },
                    { id: "main", label: "Merkez Depo" }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setWarehouseForm({
                        ...warehouseForm, 
                        type: t.id as any,
                        project_id: t.id === "main" ? "" : warehouseForm.project_id
                      })}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all duration-150 ${
                        warehouseForm.type === t.id 
                          ? "bg-white text-indigo-950 shadow-sm border border-slate-200/50" 
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Depo Adı</label>
                  <input 
                    type="text" 
                    placeholder="Örn: Tuzla Merkez Depo"
                    className="corp-input font-semibold"
                    value={warehouseForm.name}
                    onChange={(e) => setWarehouseForm({...warehouseForm, name: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Depo Takip Kodu (Örn: DEP-01)</label>
                  <input 
                    type="text" 
                    placeholder="Örn: DEP-M1"
                    className="corp-input font-mono font-bold"
                    value={warehouseForm.code}
                    onChange={(e) => setWarehouseForm({...warehouseForm, code: e.target.value})}
                  />
                </div>
              </div>

              {/* Dynamic Project connection */}
              {warehouseForm.type === "site" && (
                <div className="space-y-1.5 p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                  <label className="text-[10px] font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1">
                    <FolderDot className="w-3.5 h-3.5 text-indigo-500" /> İlişkili Proje / Şantiye
                  </label>
                  <p className="text-[9px] text-indigo-700 font-semibold leading-tight">
                    Backend yetki kontrolleri gereğince şantiye depoları mutlaka bir projeyle eşleşmelidir.
                  </p>
                  
                  <select 
                    className="corp-select mt-2"
                    value={warehouseForm.project_id}
                    onChange={(e) => setWarehouseForm({...warehouseForm, project_id: e.target.value})}
                    required={warehouseForm.type === "site"}
                  >
                    <option value="">İlişkili proje seçiniz...</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fiziksel Konum / Adres</label>
                <textarea 
                  className="corp-input font-medium"
                  rows={2}
                  placeholder="Mahalle, cadde veya şantiye alanı adresi..."
                  value={warehouseForm.location}
                  onChange={(e) => setWarehouseForm({...warehouseForm, location: e.target.value})}
                />
              </div>

              <button 
                type="submit"
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-sm transition-colors text-xs uppercase tracking-wider mt-4"
              >
                {editingWarehouse ? "Depo Kartını Güncelle" : "Depoyu Kaydet"}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
