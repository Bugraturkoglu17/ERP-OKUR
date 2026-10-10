"use client";

import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";

export default function HierarchyAdminPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [regionsByCustomer, setRegionsByCustomer] = useState<Record<string, any[]>>({});
  const [branchesByRegion, setBranchesByRegion] = useState<Record<string, any[]>>({});

  const [customerName, setCustomerName] = useState("");
  const [regionForm, setRegionForm] = useState({ customer_id: "", name: "", city: "", code: "" });
  const [branchForm, setBranchForm] = useState({ region_id: "", name: "", address: "", code: "" });

  async function loadAll() {
    const custsData = await apiGet<any[]>("/projects/customers").catch(() => []);
    const custs = Array.isArray(custsData) ? custsData : [];
    setCustomers(custs);

    const regionMap: Record<string, any[]> = {};
    const branchMap: Record<string, any[]> = {};

    await Promise.all(custs.map(async (c: any) => {
      const regs = await apiGet(`/projects/regions/${c.id}`).catch(() => []);
      regionMap[c.id] = Array.isArray(regs) ? regs : [];
      await Promise.all((regionMap[c.id] || []).map(async (r: any) => {
        const brs = await apiGet(`/projects/branches/${r.id}`).catch(() => []);
        branchMap[r.id] = Array.isArray(brs) ? brs : [];
      }));
    }));

    setRegionsByCustomer(regionMap);
    setBranchesByRegion(branchMap);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    await apiPost("/projects/customers", { name: customerName });
    setCustomerName("");
    await loadAll();
  }

  async function createRegion(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...regionForm,
      code: regionForm.code.trim() || null,
    };
    await apiPost("/projects/regions", payload);
    setRegionForm({ customer_id: "", name: "", city: "", code: "" });
    await loadAll();
  }

  async function createBranch(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...branchForm,
      code: branchForm.code.trim() || null,
      address: branchForm.address.trim() || null,
    };
    await apiPost("/projects/branches", payload);
    setBranchForm({ region_id: "", name: "", address: "", code: "" });
    await loadAll();
  }

  async function renameCustomer(id: string, current: string) {
    const name = prompt("Yeni müşteri adı", current);
    if (!name) return;
    await apiPatch(`/projects/customers/${id}`, { name });
    await loadAll();
  }

  async function renameRegion(id: string, current: any) {
    const name = prompt("Yeni bölge adı", current.name);
    if (!name) return;
    await apiPatch(`/projects/regions/${id}`, { name });
    await loadAll();
  }

  async function renameBranch(id: string, current: any) {
    const name = prompt("Yeni şube adı", current.name);
    if (!name) return;
    await apiPatch(`/projects/branches/${id}`, { name });
    await loadAll();
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="rounded-2xl bg-white border border-slate-200 p-5">
        <h2 className="text-xl font-bold text-slate-900">Müşteri - Bölge - Şube Yönetimi</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <form onSubmit={createCustomer} className="rounded-2xl bg-white border p-4 space-y-2">
          <p className="text-sm font-bold">Müşteri Ekle</p>
          <input className="w-full border rounded-lg p-2" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Firma adı" required />
          <button className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-bold"><Plus className="inline w-4 h-4 mr-1" /> Ekle</button>
        </form>

        <form onSubmit={createRegion} className="rounded-2xl bg-white border p-4 space-y-2">
          <p className="text-sm font-bold">Bölge Ekle</p>
          <select className="w-full border rounded-lg p-2" value={regionForm.customer_id} onChange={(e) => setRegionForm({ ...regionForm, customer_id: e.target.value })} required>
            <option value="">Müşteri seçin</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="w-full border rounded-lg p-2" value={regionForm.name} onChange={(e) => setRegionForm({ ...regionForm, name: e.target.value })} placeholder="Bölge adı" required />
          <input className="w-full border rounded-lg p-2" value={regionForm.city} onChange={(e) => setRegionForm({ ...regionForm, city: e.target.value })} placeholder="Şehir" required />
          <button className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-bold"><Plus className="inline w-4 h-4 mr-1" /> Ekle</button>
        </form>

        <form onSubmit={createBranch} className="rounded-2xl bg-white border p-4 space-y-2">
          <p className="text-sm font-bold">Şube Ekle</p>
          <select className="w-full border rounded-lg p-2" value={branchForm.region_id} onChange={(e) => setBranchForm({ ...branchForm, region_id: e.target.value })} required>
            <option value="">Bölge seçin</option>
            {Object.values(regionsByCustomer).flat().map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input className="w-full border rounded-lg p-2" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} placeholder="Şube adı" required />
          <button className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-bold"><Plus className="inline w-4 h-4 mr-1" /> Ekle</button>
        </form>
      </div>

      <div className="rounded-2xl bg-white border p-4 space-y-4">
        {customers.map((c) => (
          <div key={c.id} className="border rounded-xl p-3">
            <div className="flex items-center justify-between">
              <button onClick={() => renameCustomer(c.id, c.name)} className="font-bold text-left">{c.name}</button>
              <button onClick={async () => { if (confirm("Müşteri silinsin mi?")) { await apiDelete(`/projects/customers/${c.id}`); await loadAll(); } }} className="text-rose-600"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="mt-2 pl-3 space-y-2">
              {(regionsByCustomer[c.id] || []).map((r: any) => (
                <div key={r.id} className="border rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <button onClick={() => renameRegion(r.id, r)} className="text-sm font-semibold">{r.name} ({r.city})</button>
                    <button onClick={async () => { if (confirm("Bölge silinsin mi?")) { await apiDelete(`/projects/regions/${r.id}`); await loadAll(); } }} className="text-rose-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="pl-3 mt-1 space-y-1">
                    {(branchesByRegion[r.id] || []).map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between text-sm border rounded-md p-2">
                        <button onClick={() => renameBranch(b.id, b)}>{b.name}</button>
                        <button onClick={async () => { if (confirm("Şube silinsin mi?")) { await apiDelete(`/projects/branches/${b.id}`); await loadAll(); } }} className="text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
