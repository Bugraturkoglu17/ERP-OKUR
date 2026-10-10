const fs = require('fs');
const path = require('path');

const workspaceDir = "c:\\Users\\murat\\sismik-web";
const localesDir = path.join(workspaceDir, "apps", "frontend", "locales");
const appDir = path.join(workspaceDir, "apps", "frontend", "app");
const componentsDir = path.join(workspaceDir, "apps", "frontend", "components");

const trJsonPath = path.join(localesDir, "tr.json");
const enJsonPath = path.join(localesDir, "en.json");

function updateLocales() {
  console.log("Updating translation dictionaries...");
  const trData = JSON.parse(fs.readFileSync(trJsonPath, 'utf8'));
  const enData = JSON.parse(fs.readFileSync(enJsonPath, 'utf8'));

  // 1. Finance additions
  if (!trData.finance) trData.finance = {};
  if (!enData.finance) enData.finance = {};

  trData.finance.categories = {
    "material": "Malzeme Tedariği",
    "transport": "Nakliye & Lojistik",
    "equipment": "Ekipman Kiralama"
  };
  enData.finance.categories = {
    "material": "Material Supply",
    "transport": "Shipping & Logistics",
    "equipment": "Equipment Rental"
  };
  trData.finance.skuColon = "SKU:";
  enData.finance.skuColon = "SKU:";
  trData.finance.additionalDocument = "EK BELGE / FİŞ";
  enData.finance.additionalDocument = "ADDITIONAL DOCUMENT / RECEIPT";

  // 2. Inventory additions
  if (!trData.inventory) trData.inventory = {};
  if (!enData.inventory) enData.inventory = {};

  const inventoryTr = {
    "catalog": "Malzeme Kataloğu",
    "warehouseFocused": "Depo Odaklı",
    "inboundPurchase": "Giriş (IN) - Satın Alma/Tedarik",
    "adjustment": "Sayım Düzeltmesi (ADJUSTMENT)",
    "dateTime": "Tarih / Saat",
    "material": "Malzeme",
    "quantity": "Miktar",
    "costUnitTotal": "Maliyet (Birim/Top)",
    "refWaybill": "Ref / İrsaliye",
    "totalTL": "Top: ₺",
    "newStockMovement": "Yeni Stok Hareketi Sihirbazı",
    "newStockMovementDesc": "Birim maliyet, irsaliye ve proje entegrasyonu ile stok yönetimi",
    "movementMaterial": "Harekete Konu Malzeme",
    "selectMaterial": "Malzeme seçiniz...",
    "sourceWarehouse": "Kaynak Depo",
    "targetWarehouse": "Hedef Depo",
    "unitCostOptional": "Birim Maliyet (₺ - Opsiyonel)",
    "noProject": "Proje yok (Genel Gider)",
    "movementNotes": "Harekete Dair Açıklamalar",
    "defineMaterialCard": "Platform düzeyinde malzeme kartı tanımlayın",
    "skuCatalogCode": "SKU / Katalog Kodu",
    "trackingUnit": "Takip Birimi",
    "materialDescription": "Malzeme Tanımı (Adı)",
    "unitCostTL": "Birim Maliyet (₺)",
    "minCriticalLevel": "Min. Kritik Seviye",
    "initialStockDesc": "Bu malzeme kaydedilirken ilk envanter miktarını doğrudan tanımlayabilirsiniz.",
    "initialWarehouse": "Giriş Yapılacak Depo",
    "initialQuantity": "Giriş Miktarı",
    "createWarehouseDesc": "Merkez veya şantiye lojistik deposu oluşturun",
    "warehouseType": "Depo Tipi",
    "warehouseName": "Depo Adı",
    "warehouseCodeExample": "Depo Takip Kodu (Örn: DEP-01)",
    "physicalLocation": "Fiziksel Konum / Adres"
  };

  const inventoryEn = {
    "catalog": "Material Catalog",
    "warehouseFocused": "Warehouse Oriented",
    "inboundPurchase": "Inbound (IN) - Purchase/Procurement",
    "adjustment": "Count Adjustment (ADJUSTMENT)",
    "dateTime": "Date / Time",
    "material": "Material",
    "quantity": "Quantity",
    "costUnitTotal": "Cost (Unit/Total)",
    "refWaybill": "Ref / Waybill",
    "totalTL": "Total: ₺",
    "newStockMovement": "New Stock Movement Wizard",
    "newStockMovementDesc": "Inventory management with unit cost, waybill, and project integration",
    "movementMaterial": "Material Subject to Movement",
    "selectMaterial": "Select material...",
    "sourceWarehouse": "Source Warehouse",
    "targetWarehouse": "Target Warehouse",
    "unitCostOptional": "Unit Cost (₺ - Optional)",
    "noProject": "No Project (General Expense)",
    "movementNotes": "Descriptions Regarding Movement",
    "defineMaterialCard": "Define a material card at platform level",
    "skuCatalogCode": "SKU / Catalog Code",
    "trackingUnit": "Tracking Unit",
    "materialDescription": "Material Description (Name)",
    "unitCostTL": "Unit Cost (₺)",
    "minCriticalLevel": "Min. Critical Level",
    "initialStockDesc": "While registering this material, you can directly define the initial inventory quantity.",
    "initialWarehouse": "Inbound Warehouse",
    "initialQuantity": "Inbound Quantity",
    "createWarehouseDesc": "Create a central or site logistics warehouse",
    "warehouseType": "Warehouse Type",
    "warehouseName": "Warehouse Name",
    "warehouseCodeExample": "Warehouse Tracking Code (e.g. WH-01)",
    "physicalLocation": "Physical Location / Address"
  };

  Object.assign(trData.inventory, inventoryTr);
  Object.assign(enData.inventory, inventoryEn);

  // 3. Procurement additions
  if (!trData.procurement) trData.procurement = {};
  if (!enData.procurement) enData.procurement = {};

  const procurementTr = {
    "loading": "Satın alma verileri yükleniyor...",
    "status": {
      "pendingApproval": "Onay Bekliyor",
      "approved": "Onaylandı",
      "rejected": "Reddedildi",
      "ordered": "Sipariş Verildi",
      "received": "Teslim Alındı"
    },
    "expected": "Beklenen ",
    "createRequest": "Malzeme Talebi Oluştur",
    "materialRequired": "Malzeme *",
    "selectProjectOptional": "Proje Seçin (Opsiyonel)",
    "quantityRequired": "Miktar *",
    "priority": {
      "normal": "Normal",
      "urgent": "Acil",
      "critical": "Kritik"
    },
    "receiveOrder": "Siparişi Teslim Al",
    "poNo": "PO No:",
    "supplierColon": "Tedarikçi:",
    "totalAmountColon": "Toplam Tutar:",
    "itemCountColon": "Kalem Sayısı:",
    "createPO": "Satın Alma Siparişi (PO) Oluştur",
    "poNumberRequired": "PO Numarası *",
    "supplier": "Tedarikçi",
    "targetWarehouseRequired": "Hedef Depo *",
    "expectedDeliveryDate": "Beklenen Teslim Tarihi",
    "orderItemsRequired": "Sipariş Kalemleri *",
    "selectMaterialEllipsis": "Malzeme Seçin...",
    "addSupplier": "Tedarikçi Ekle",
    "companyNameRequired": "Firma Adı *",
    "authorizedPerson": "Yetkili Kişi",
    "phone": "Telefon",
    "taxNumber": "Vergi Numarası",
    "address": "Adres"
  };

  const procurementEn = {
    "loading": "Procurement data loading...",
    "status": {
      "pendingApproval": "Pending Approval",
      "approved": "Approved",
      "rejected": "Rejected",
      "ordered": "Ordered",
      "received": "Received"
    },
    "expected": "Expected ",
    "createRequest": "Create Material Request",
    "materialRequired": "Material *",
    "selectProjectOptional": "Select Project (Optional)",
    "quantityRequired": "Quantity *",
    "priority": {
      "normal": "Normal",
      "urgent": "Urgent",
      "critical": "Critical"
    },
    "receiveOrder": "Receive Order",
    "poNo": "PO No:",
    "supplierColon": "Supplier:",
    "totalAmountColon": "Total Amount:",
    "itemCountColon": "Item Count:",
    "createPO": "Create Purchase Order (PO)",
    "poNumberRequired": "PO Number *",
    "supplier": "Supplier",
    "targetWarehouseRequired": "Target Warehouse *",
    "expectedDeliveryDate": "Expected Delivery Date",
    "orderItemsRequired": "Order Items *",
    "selectMaterialEllipsis": "Select Material...",
    "addSupplier": "Add Supplier",
    "companyNameRequired": "Company Name *",
    "authorizedPerson": "Authorized Person",
    "phone": "Phone",
    "taxNumber": "Tax Number",
    "address": "Address"
  };

  Object.assign(trData.procurement, procurementTr);
  Object.assign(enData.procurement, procurementEn);

  // 4. Documents additions
  if (!trData.documents) trData.documents = {};
  if (!enData.documents) enData.documents = {};

  const documentsTr = {
    "types": {
      "drawing_hvac": "HVAC Çizimleri",
      "drawing_fire": "Yangın Çizimleri",
      "drawing_seismic": "Sismik Çizimler",
      "drawing_mep": "MEP Çizimleri",
      "invoice_doc": "Hakediş Dosyaları",
      "field_report": "Saha Raporları",
      "expense_receipt": "Gider Belgeleri (Fatura/Fiş)"
    },
    "autocadLiveView": "AutoCAD Vector Live View (Simüle Edilmiş)",
    "uploadNewFile": "Yeni Dosya Yükle"
  };

  const documentsEn = {
    "types": {
      "drawing_hvac": "HVAC Drawings",
      "drawing_fire": "Firefighting Drawings",
      "drawing_seismic": "Seismic Protection Drawings",
      "drawing_mep": "MEP Coordination Drawings",
      "invoice_doc": "Progress Billing Documents",
      "field_report": "Field Reports",
      "expense_receipt": "Expense Receipts (Invoices)"
    },
    "autocadLiveView": "AutoCAD Vector Live View (Simulated)",
    "uploadNewFile": "Upload New File"
  };

  Object.assign(trData.documents, documentsTr);
  Object.assign(enData.documents, documentsEn);

  // 5. Dashboard additions
  trData.dashboard = {
    "loading": "Mekanik ERP Operasyon Panosu yükleniyor...",
    "title": "Operasyon Panosu",
    "projects": "Projeler ",
    "actionQueue": "Onay Sırası (Aksiyon)",
    "warehouses": "Depo ",
    "stockIdeal": "Stok seviyeleri ideal",
    "financialHealth": "Finansal Sağlık ",
    "urgentAction": "Acil Aksiyon ",
    "fieldReportsUpToDate": "Saha Raporları Güncel",
    "noPendingReports": "Onay bekleyen günlük saha raporu bulunmuyor.",
    "noActivities": "Faaliyet kaydı eklenmemiş.",
    "noPendingRequests": "Onay sırasını bekleyen malzeme talebi bulunmuyor.",
    "quantityColon": "Miktar: ",
    "warehouseStocksSafe": "Depo Stokları Güvende",
    "noLowStockAlerts": "Kritik seviyenin altına düşen malzeme bulunmuyor.",
    "stockMovement": "Stok Hareketi",
    "enterMovement": "Giriş / Çıkış Gir",
    "fieldReport": "Saha Raporu",
    "recordActivity": "Faaliyet Kaydet",
    "newMaterial": "Yeni Malzeme",
    "openRequest": "Tedarik Talebi Aç",
    "financeAnalysis": "Finans Analiz",
    "revenue": "Ciro ",
    "activeProjects": "Aktif Projeler ",
    "projectCode": "Proje Kodu ",
    "mechanicalDisciplines": "Mekanik Disiplinler",
    "timeProgress": "Zaman İlerlemesi",
    "status": "Durum",
    "noProjectsRegistered": "Kayıtlı proje bulunmamaktadır.",
    "totalSiteExpenses": "Toplam Şantiye Masrafı",
    "warehouseCapacities": "Depo Kapasiteleri ",
    "activeWarehousesEmpty": "Aktif depo havuzu boş.",
    "codeColon": "KOD: ",
    "noActivePOs": "Aktif PO Bulunmuyor",
    "noPendingPOs": "Yolda veya bekleyen satın alma siparişi bulunmuyor.",
    "expectedDeliveryColon": "Teslim: ",
    "criticalStockRequest": "Kritik Stok Tedarik Talebi",
    "materialColon": "Malzeme:",
    "currentStatusColon": "Mevcut Durum:",
    "requestQuantityRequired": "Talep Miktarı (Adet) *",
    "priority": {
      "normal": "Normal",
      "urgent": "Acil",
      "critical": "Kritik"
    },
    "receiveOrder": "Siparişi Teslim Al",
    "orderNoColon": "Sipariş No:",
    "supplierColon": "Tedarikçi:",
    "projectColon": "Proje:",
    "totalVolumeColon": "Toplam Hacim:",
    "deliveryNotes": "Teslimat Notu"
  };

  enData.dashboard = {
    "loading": "Mechanical ERP Dashboard loading...",
    "title": "Operations Dashboard",
    "projects": "Projects ",
    "actionQueue": "Approval Queue (Action)",
    "warehouses": "Warehouse ",
    "stockIdeal": "Stock levels ideal",
    "financialHealth": "Financial Health ",
    "urgentAction": "Urgent Action ",
    "fieldReportsUpToDate": "Field Reports Up to Date",
    "noPendingReports": "No pending daily field reports.",
    "noActivities": "No activities recorded.",
    "noPendingRequests": "No pending material requests in queue.",
    "quantityColon": "Quantity: ",
    "warehouseStocksSafe": "Warehouse Stocks Safe",
    "noLowStockAlerts": "No materials below critical level.",
    "stockMovement": "Stock Movement",
    "enterMovement": "Enter Inbound/Outbound",
    "fieldReport": "Field Report",
    "recordActivity": "Record Activity",
    "newMaterial": "New Material",
    "openRequest": "Open Procurement Request",
    "financeAnalysis": "Finance Analysis",
    "revenue": "Revenue ",
    "activeProjects": "Active Projects ",
    "projectCode": "Project Code ",
    "mechanicalDisciplines": "Mechanical Disciplines",
    "timeProgress": "Time Progress",
    "status": "Status",
    "noProjectsRegistered": "No registered projects exist.",
    "totalSiteExpenses": "Total Site Expenses",
    "warehouseCapacities": "Warehouse Capacities ",
    "activeWarehousesEmpty": "Active warehouse pool is empty.",
    "codeColon": "CODE: ",
    "noActivePOs": "No Active POs",
    "noPendingPOs": "No in-transit or pending purchase orders.",
    "expectedDeliveryColon": "Delivery: ",
    "criticalStockRequest": "Critical Stock Procurement Request",
    "materialColon": "Material:",
    "currentStatusColon": "Current Status:",
    "requestQuantityRequired": "Request Quantity (Units) *",
    "priority": {
      "normal": "Normal",
      "urgent": "Urgent",
      "critical": "Critical"
    },
    "receiveOrder": "Receive Order",
    "orderNoColon": "Order No:",
    "supplierColon": "Supplier:",
    "projectColon": "Project:",
    "totalVolumeColon": "Total Volume:",
    "deliveryNotes": "Delivery Notes"
  };

  fs.writeFileSync(trJsonPath, JSON.stringify(trData, null, 2), 'utf8');
  fs.writeFileSync(enJsonPath, JSON.stringify(enData, null, 2), 'utf8');
  console.log("Translation dictionaries updated successfully!");
}

function refactorTenants() {
  console.log("Refactoring platform/tenants/page.tsx...");
  const filePath = path.join(appDir, "platform", "tenants", "page.tsx");
  let content = fs.readFileSync(filePath, 'utf8');

  const target = "out += chars[Math.floor(Math.random() * chars.length)];";
  const replacement = "out += chars.charAt(Math.floor(Math.random() * chars.length));";

  if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("tenants page refactored!");
  } else {
    console.log("tenants page target not found or already refactored.");
  }
}

function refactorFieldReports() {
  console.log("Refactoring field-reports/page.tsx...");
  const filePath = path.join(appDir, "field-reports", "page.tsx");
  let content = fs.readFileSync(filePath, 'utf8');

  const replacements = [
    ['<span className="corp-badge-secondary">Taslak</span>', '<span className="corp-badge-secondary">{t("fieldReports.draft")}</span>'],
    ['<span className="corp-badge-success"><CheckCircle2 className="h-3 w-3" /> Onaylandı</span>', '<span className="corp-badge-success"><CheckCircle2 className="h-3 w-3" /> {t("fieldReports.approved")}</span>'],
    ['<span className="corp-badge-warning"><Clock className="h-3 w-3" /> Onay Bekliyor</span>', '<span className="corp-badge-warning"><Clock className="h-3 w-3" /> {t("fieldReports.pendingApproval")}</span>']
  ];

  let modified = false;
  for (const [target, rep] of replacements) {
    if (content.includes(target)) {
      content = content.replace(target, rep);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("field-reports page refactored!");
  } else {
    console.log("field-reports targets not found or already refactored.");
  }
}

function refactorFinance() {
  console.log("Refactoring finance/page.tsx...");
  const filePath = path.join(appDir, "finance", "page.tsx");
  let content = fs.readFileSync(filePath, 'utf8');

  const replacements = [
    ['<option value="material">Malzeme Tedariği</option>', '<option value="material">{t("finance.categories.material")}</option>'],
    ['<option value="transport">Nakliye & Lojistik</option>', '<option value="transport">{t("finance.categories.transport")}</option>'],
    ['<option value="equipment">Ekipman Kiralama</option>', '<option value="equipment">{t("finance.categories.equipment")}</option>'],
    ['SKU: {stockMovementDetails.material_sku}', '{t("finance.skuColon")} {stockMovementDetails.material_sku}'],
    ['EK BELGE / FİŞ', '{t("finance.additionalDocument")}']
  ];

  let modified = false;
  for (const [target, rep] of replacements) {
    if (content.includes(target)) {
      content = content.replace(target, rep);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("finance page refactored!");
  } else {
    console.log("finance targets not found or already refactored.");
  }
}

function refactorInventory() {
  console.log("Refactoring inventory/page.tsx...");
  const filePath = path.join(appDir, "inventory", "page.tsx");
  let content = fs.readFileSync(filePath, 'utf8');

  const replacements = [
    ['<label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Malzeme Kataloğu</label>', '<label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("inventory.catalog")}</label>'],
    ['<label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Depo Odaklı</label>', '<label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("inventory.warehouseFocused")}</label>'],
    ['<option value="IN">Giriş (IN) - Satın Alma/Tedarik</option>', '<option value="IN">{t("inventory.inboundPurchase")}</option>'],
    ['<option value="ADJUSTMENT">Sayım Düzeltmesi (ADJUSTMENT)</option>', '<option value="ADJUSTMENT">{t("inventory.adjustment")}</option>'],
    ['<th className="corp-th">Tarih / Saat</th>', '<th className="corp-th">{t("inventory.dateTime")}</th>'],
    ['<th className="corp-th">Malzeme</th>', '<th className="corp-th">{t("inventory.material")}</th>'],
    ['<th className="corp-th text-right">Miktar</th>', '<th className="corp-th text-right">{t("inventory.quantity")}</th>'],
    ['<th className="corp-th text-right">Maliyet (Birim/Top)</th>', '<th className="corp-th text-right">{t("inventory.costUnitTotal")}</th>'],
    ['<th className="corp-th">Ref / İrsaliye</th>', '<th className="corp-th">{t("inventory.refWaybill")}</th>'],
    ['Top: ₺', '{t("inventory.totalTL")}'],
    ['<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Yeni Stok Hareketi Sihirbazı</h3>', '<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{t("inventory.newStockMovement")}</h3>'],
    ['<p className="text-[11px] text-slate-400 font-bold">Birim maliyet, irsaliye ve proje entegrasyonu ile stok yönetimi</p>', '<p className="text-[11px] text-slate-400 font-bold">{t("inventory.newStockMovementDesc")}</p>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Harekete Konu Malzeme</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.movementMaterial")}</label>'],
    ['<option value="">Malzeme seçiniz...</option>', '<option value="">{t("inventory.selectMaterial")}</option>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Kaynak Depo</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.sourceWarehouse")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Hedef Depo</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.targetWarehouse")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Birim Maliyet (₺ - Opsiyonel)</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.unitCostOptional")}</label>'],
    ['<option value="">Proje yok (Genel Gider)</option>', '<option value="">{t("inventory.noProject")}</option>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Harekete Dair Açıklamalar</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.movementNotes")}</label>'],
    ['<p className="text-[11px] text-slate-400 font-bold">Platform düzeyinde malzeme kartı tanımlayın</p>', '<p className="text-[11px] text-slate-400 font-bold">{t("inventory.defineMaterialCard")}</p>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">SKU / Katalog Kodu</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.skuCatalogCode")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Takip Birimi</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.trackingUnit")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Malzeme Tanımı (Adı)</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.materialDescription")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Birim Maliyet (₺)</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.unitCostTL")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Min. Kritik Seviye</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.minCriticalLevel")}</label>'],
    ['<span className="text-[11px] font-bold text-slate-500">Bu malzeme kaydedilirken ilk envanter miktarını doğrudan tanımlayabilirsiniz.</span>', '<span className="text-[11px] font-bold text-slate-500">{t("inventory.initialStockDesc")}</span>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Giriş Yapılacak Depo</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.initialWarehouse")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Giriş Miktarı</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.initialQuantity")}</label>'],
    ['<p className="text-[11px] text-slate-400 font-bold">Merkez veya şantiye lojistik deposu oluşturun</p>', '<p className="text-[11px] text-slate-400 font-bold">{t("inventory.createWarehouseDesc")}</p>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Depo Tipi</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.warehouseType")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Depo Adı</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.warehouseName")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Depo Takip Kodu (Örn: DEP-01)</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.warehouseCodeExample")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Fiziksel Konum / Adres</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.physicalLocation")}</label>']
  ];

  let modified = false;
  for (const [target, rep] of replacements) {
    if (content.includes(target)) {
      content = content.replace(target, rep);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("inventory page refactored!");
  } else {
    console.log("inventory targets not found or already refactored.");
  }
}

function refactorProcurement() {
  console.log("Refactoring procurement/page.tsx...");
  const filePath = path.join(appDir, "procurement", "page.tsx");
  let content = fs.readFileSync(filePath, 'utf8');

  const replacements = [
    ['Satın alma verileri yükleniyor...', '{t("procurement.loading")}'],
    ['<option value="pending_approval">Onay Bekliyor</option>', '<option value="pending_approval">{t("procurement.status.pendingApproval")}</option>'],
    ['<option value="approved">Onaylandı</option>', '<option value="approved">{t("procurement.status.approved")}</option>'],
    ['<option value="rejected">Reddedildi</option>', '<option value="rejected">{t("procurement.status.rejected")}</option>'],
    ['<option value="ordered">Sipariş Verildi</option>', '<option value="ordered">{t("procurement.status.ordered")}</option>'],
    ['<option value="received">Teslim Alındı</option>', '<option value="received">{t("procurement.status.received")}</option>'],
    ['Beklenen ', '{t("procurement.expected")}'],
    ['<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Malzeme Talebi Oluştur</h3>', '<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{t("procurement.createRequest")}</h3>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Malzeme *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.materialRequired")}</label>'],
    ['<option value="">Proje Seçin (Opsiyonel)</option>', '<option value="">{t("procurement.selectProjectOptional")}</option>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Miktar *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.quantityRequired")}</label>'],
    ['<option value="normal">Normal</option>', '<option value="normal">{t("procurement.priority.normal")}</option>'],
    ['<option value="urgent">Acil</option>', '<option value="urgent">{t("procurement.priority.urgent")}</option>'],
    ['<option value="critical">Kritik</option>', '<option value="critical">{t("procurement.priority.critical")}</option>'],
    ['<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Siparişi Teslim Al</h3>', '<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{t("procurement.receiveOrder")}</h3>'],
    ['PO No:', '{t("procurement.poNo")}'],
    ['Tedarikçi:', '{t("procurement.supplierColon")}'],
    ['Toplam Tutar:', '{t("procurement.totalAmountColon")}'],
    ['Kalem Sayısı:', '{t("procurement.itemCountColon")}'],
    ['<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Satın Alma Siparişi (PO) Oluştur</h3>', '<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{t("procurement.createPO")}</h3>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">PO Numarası *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.poNumberRequired")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Tedarikçi</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.supplier")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Hedef Depo *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.targetWarehouseRequired")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Beklenen Teslim Tarihi</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.expectedDeliveryDate")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Sipariş Kalemleri *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.orderItemsRequired")}</label>'],
    ['<option value="">Malzeme Seçin...</option>', '<option value="">{t("procurement.selectMaterialEllipsis")}</option>'],
    ['<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Tedarikçi Ekle</h3>', '<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{t("procurement.addSupplier")}</h3>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Firma Adı *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.companyNameRequired")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Yetkili Kişi</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.authorizedPerson")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Telefon</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.phone")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Vergi Numarası</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.taxNumber")}</label>'],
    ['<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Adres</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.address")}</label>']
  ];

  let modified = false;
  for (const [target, rep] of replacements) {
    if (content.includes(target)) {
      content = content.replace(target, rep);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("procurement page refactored!");
  } else {
    console.log("procurement targets not found or already refactored.");
  }
}

function refactorDocuments() {
  console.log("Refactoring documents/page.tsx...");
  const filePath = path.join(appDir, "documents", "page.tsx");
  let content = fs.readFileSync(filePath, 'utf8');

  const replacements = [
    ['<option value="drawing_hvac">HVAC Çizimleri</option>', '<option value="drawing_hvac">{t("documents.types.drawing_hvac")}</option>'],
    ['<option value="drawing_fire">Yangın Çizimleri</option>', '<option value="drawing_fire">{t("documents.types.drawing_fire")}</option>'],
    ['<option value="drawing_seismic">Sismik Çizimler</option>', '<option value="drawing_seismic">{t("documents.types.drawing_seismic")}</option>'],
    ['<option value="drawing_mep">MEP Çizimleri</option>', '<option value="drawing_mep">{t("documents.types.drawing_mep")}</option>'],
    ['<option value="invoice_doc">Hakediş Dosyaları</option>', '<option value="invoice_doc">{t("documents.types.invoice_doc")}</option>'],
    ['<option value="field_report">Saha Raporları</option>', '<option value="field_report">{t("documents.types.field_report")}</option>'],
    ['<option value="expense_receipt">Gider Belgeleri (Fatura/Fiş)</option>', '<option value="expense_receipt">{t("documents.types.expense_receipt")}</option>'],
    ['<p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5 font-bold">AutoCAD Vector Live View (Simüle Edilmiş)</p>', '<p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5 font-bold">{t("documents.autocadLiveView")}</p>'],
    [' Yeni Dosya Yükle', ' {t("documents.uploadNewFile")}']
  ];

  let modified = false;
  for (const [target, rep] of replacements) {
    if (content.includes(target)) {
      content = content.replace(target, rep);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("documents page refactored!");
  } else {
    console.log("documents targets not found or already refactored.");
  }
}

function refactorOverview() {
  console.log("Refactoring components/dashboard/overview.tsx...");
  const filePath = path.join(componentsDir, "dashboard", "overview.tsx");
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Imports addition
  const importTarget = 'import { useEffect, useState } from "react";';
  const importRep = 'import { useEffect, useState } from "react";\nimport { useTranslation } from "@/lib/i18n";';
  if (content.includes(importTarget) && !content.includes('useTranslation')) {
    content = content.replace(importTarget, importRep);
  }

  // 2. Hook addition
  const hookTarget = 'export function DashboardOverview() {';
  const hookRep = 'export function DashboardOverview() {\n  const { t } = useTranslation();';
  if (content.includes(hookTarget) && !content.includes('const { t } = useTranslation();')) {
    content = content.replace(hookTarget, hookRep);
  }

  // 3. Define static secure helpers
  const helpers = `
// ── Secure Type-Safe Helpers ──────────────────────────────────────────────────
function getPriorityLabel(priority: string): string {
  switch (priority?.toLowerCase()) {
    case "normal": return "Normal";
    case "urgent": return "Acil";
    case "critical": return "Kritik";
    default: return priority || "";
  }
}

function getPriorityBadgeClass(priority: string): string {
  switch (priority?.toLowerCase()) {
    case "normal": return "corp-badge-secondary";
    case "urgent": return "corp-badge-warning";
    case "critical": return "corp-badge-danger";
    default: return "corp-badge-secondary";
  }
}

function getStatusLabel(status: string): string {
  switch (status?.toLowerCase()) {
    case "pending_approval": return "Onay Bekliyor";
    case "approved": return "Onaylandı";
    case "rejected": return "Reddedildi";
    case "draft": return "Taslak";
    case "ordered": return "Sipariş Verildi";
    case "received": return "Teslim Alındı";
    case "cancelled": return "İptal";
    default: return status || "";
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status?.toLowerCase()) {
    case "pending_approval": return "corp-badge-warning";
    case "approved": return "corp-badge-success";
    case "rejected": return "corp-badge-danger";
    case "draft": return "corp-badge-secondary";
    case "ordered": return "corp-badge-info";
    case "received": return "corp-badge-success";
    case "cancelled": return "corp-badge-danger";
    default: return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function getScopeBadgeInfo(sc: string): { label: string; class: string } {
  switch (sc?.toLowerCase()) {
    case "seismic": return { label: "SİSMİK KORUMA", class: "bg-amber-50 text-amber-700 border-amber-200/50" };
    case "hvac": return { label: "HVAC HAVALANDIRMA", class: "bg-blue-50 text-blue-700 border-blue-200/50" };
    case "fire": return { label: "YANGIN SÖNDÜRME", class: "bg-rose-50 text-rose-700 border-rose-200/50" };
    case "mep": return { label: "MEP KOORDİNASYON", class: "bg-indigo-50 text-indigo-700 border-indigo-200/50" };
    default: return { label: "GENEL MEKANİK", class: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

function getExpenseLabel(category: string): string {
  switch (category?.toLowerCase()) {
    case "material": return "Malzeme Tedarik";
    case "labour": return "Şantiye İşçilik & Taşeron";
    case "transport": return "Lojistik & Nakliye";
    case "equipment": return "Makine & Ekipman Kira";
    case "miscellaneous": return "Genel Giderler";
    default: return category || "";
  }
}

function getExpenseColorClass(category: string): string {
  switch (category?.toLowerCase()) {
    case "material": return "bg-amber-600";
    case "labour": return "bg-blue-600";
    case "transport": return "bg-indigo-600";
    case "equipment": return "bg-rose-600";
    default: return "bg-slate-500";
  }
}

function getProjectStatusLabel(status: string): string {
  switch (status?.toLowerCase()) {
    case "inquiry": return "Keşif Aşaması";
    case "approved": return "Onaylı Plan";
    case "in_progress": return "Sahada Devam";
    case "invoice_pend": return "Hakediş Bekliyor";
    case "completed": return "Tamamlandı";
    case "cancelled": return "İptal";
    default: return status || "";
  }
}

function getProjectStatusBadgeClass(status: string): string {
  switch (status?.toLowerCase()) {
    case "inquiry": return "bg-purple-50 text-purple-700 border-purple-200";
    case "approved": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "in_progress": return "bg-blue-50 text-blue-700 border-blue-200";
    case "invoice_pend": return "bg-amber-50 text-amber-700 border-amber-200";
    case "completed": return "bg-slate-100 text-slate-600 border-slate-200";
    case "cancelled": return "bg-rose-50 text-rose-700 border-rose-200";
    default: return "bg-slate-100 text-slate-600 border-slate-200";
  }
}
`;

  if (!content.includes("getPriorityLabel")) {
    content = content.replace("export function DashboardOverview()", helpers + "\nexport function DashboardOverview()");
  }

  // 4. Refactor expandedReports state from Record to Set
  const targetState = "const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({});";
  const repState = "const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());";
  content = content.replace(targetState, repState);

  const targetToggle = `  const toggleReportExpanded = (reportId: string) => {
    setExpandedReports(prev => ({
      ...prev,
      [reportId]: !prev[reportId]
    }));
  };`;
  const repToggle = `  const toggleReportExpanded = (reportId: string) => {
    setExpandedReports(prev => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  };`;
  content = content.replace(targetToggle, repToggle);

  const targetIsExpanded = "const isExpanded = !!expandedReports[report.id];";
  const repIsExpanded = "const isExpanded = expandedReports.has(report.id);";
  content = content.replace(targetIsExpanded, repIsExpanded);

  // 5. Copy-paste fix on line 576
  const targetCopypaste = '(pendingRequests.length + pendingReports.length) > 0 ? "border-slate-200" : "border-slate-200"';
  const repCopypaste = '(pendingRequests.length + pendingReports.length) > 0 ? "border-amber-200 bg-amber-50/10" : "border-slate-200"';
  content = content.replace(targetCopypaste, repCopypaste);

  // 6. Secure bracket notations in loops/renders
  content = content.replace(/PRIORITY_COLORS\[req\.priority\]/g, "getPriorityBadgeClass(req.priority)");
  content = content.replace(/PRIORITY_LABELS\[req\.priority\]/g, "getPriorityLabel(req.priority)");
  
  content = content.replace(/STATUS_COLORS\[po\.status\]/g, "getStatusBadgeClass(po.status)");
  content = content.replace(/STATUS_LABELS\[po\.status\]/g, "getStatusLabel(po.status)");
  
  content = content.replace("const badge = SCOPE_BADGES[sc] || SCOPE_BADGES.other;", "const badge = getScopeBadgeInfo(sc);");
  
  content = content.replace("EXPENSE_LABELS[category] || category", "getExpenseLabel(category)");
  content = content.replace('EXPENSE_COLORS[category] || "bg-indigo-600"', "getExpenseColorClass(category)");
  
  const oldExpAssignment = `    if (cat in expenseSummary) {
      expenseSummary[cat as keyof typeof expenseSummary] += amount;
    } else {
      expenseSummary.miscellaneous += amount;
    }`;
  const newExpAssignment = `    switch (cat) {
      case "material": expenseSummary.material += amount; break;
      case "labour": expenseSummary.labour += amount; break;
      case "transport": expenseSummary.transport += amount; break;
      case "equipment": expenseSummary.equipment += amount; break;
      default: expenseSummary.miscellaneous += amount; break;
    }`;
  if (content.includes(oldExpAssignment)) {
    content = content.replace(oldExpAssignment, newExpAssignment);
  }

  // Remove local statusMaps in project mapping
  const oldProjStatusMaps = `                    const statusMap: Record<string, string> = {
                      inquiry: "Keşif Aşaması",
                      approved: "Onaylı Plan",
                      in_progress: "Sahada Devam",
                      invoice_pend: "Hakediş Bekliyor",
                      completed: "Tamamlandı",
                      cancelled: "İptal",
                    };
                    const statusColors: Record<string, string> = {
                      inquiry: "bg-purple-50 text-purple-700 border-purple-200",
                      approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
                      in_progress: "bg-blue-50 text-blue-700 border-blue-200",
                      invoice_pend: "bg-amber-50 text-amber-700 border-amber-200",
                      completed: "bg-slate-100 text-slate-600 border-slate-200",
                      cancelled: "bg-rose-50 text-rose-700 border-rose-200",
                    };`;
  if (content.includes(oldProjStatusMaps)) {
    content = content.replace(oldProjStatusMaps, "");
  }
  content = content.replace('statusColors[p.status] || "bg-slate-100 text-slate-600"', "getProjectStatusBadgeClass(p.status)");
  content = content.replace('statusMap[p.status] || p.status', "getProjectStatusLabel(p.status)");

  // 7. JSX String Replacements with {t("...")}
  const jsxReplacements = [
    ["Mekanik ERP Operasyon Panosu yükleniyor...", "{t(\"dashboard.loading\")}"],
    ['<h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-2.5">Operasyon Panosu</h2>', '<h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-2.5">{t("dashboard.title")}</h2>'],
    ['<p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Projeler & Şantiye</p>', '<p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t("dashboard.projects")}</p>'],
    ['sahada devam ediyor', '{t("projects.inFieldContinuing")}'],
    ['<p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Onay Sırası (Aksiyon)</p>', '<p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t("dashboard.actionQueue")}</p>'],
    ['talep /', '{t("projects.request")} /'],
    ['rapor bekliyor', '{t("projects.reportPending")}'],
    ['Tüm onaylar tamamlandı', '{t("projects.allApprovalsCompleted")}'],
    ['<p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Depo & Stok Alarmları</p>', '<p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t("dashboard.warehouses")}</p>'],
    ['ürün kritik sınırda!', '{t("projects.productCriticalLimit")}'],
    ['Stok seviyeleri ideal', '{t("dashboard.stockIdeal")}'],
    ['<p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Finansal Sağlık & Kâr Marjı</p>', '<p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t("dashboard.financialHealth")}</p>'],
    ['Net Kâr:', '{t("finance.netProfit")}:'],
    ['<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Acil Aksiyon & Onay Merkezi</h3>', '<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{t("dashboard.urgentAction")}</h3>'],
    ['Saha Raporları Güncel', '{t("dashboard.fieldReportsUpToDate")}'],
    ['Onay bekleyen günlük saha raporu bulunmuyor.', '{t("dashboard.noPendingReports")}'],
    ['Faaliyet kaydı eklenmemiş.', '{t("dashboard.noActivities")}'],
    ['Onay sırasını bekleyen malzeme talebi bulunmuyor.', '{t("dashboard.noPendingRequests")}'],
    ['Miktar:', '{t("dashboard.quantityColon")}'],
    ['Depo Stokları Güvende', '{t("dashboard.warehouseStocksSafe")}'],
    ['Kritik seviyenin altına düşen malzeme bulunmuyor.', '{t("dashboard.noLowStockAlerts")}'],
    ['Stok Hareketi', '{t("dashboard.stockMovement")}'],
    ['Giriş / Çıkış Gir', '{t("dashboard.enterMovement")}'],
    ['Saha Raporu', '{t("dashboard.fieldReport")}'],
    ['Faaliyet Kaydet', '{t("dashboard.recordActivity")}'],
    ['Yeni Malzeme', '{t("dashboard.newMaterial")}'],
    ['Tedarik Talebi Aç', '{t("dashboard.openRequest")}'],
    ['Finans Analiz', '{t("dashboard.financeAnalysis")}'],
    ['Ciro', '{t("dashboard.revenue")}'],
    ['Aktif Projeler', '{t("dashboard.activeProjects")}'],
    ['Proje Kodu', '{t("dashboard.projectCode")}'],
    ['Mekanik Disiplinler', '{t("dashboard.mechanicalDisciplines")}'],
    ['Zaman İlerlemesi', '{t("dashboard.timeProgress")}'],
    ['Durum', '{t("dashboard.status")}'],
    ['Kayıtlı proje bulunmamaktadır.', '{t("dashboard.noProjectsRegistered")}'],
    ['Toplam Şantiye Masrafı', '{t("dashboard.totalSiteExpenses")}'],
    ['Depo Kapasiteleri', '{t("dashboard.warehouseCapacities")}'],
    ['Aktif depo havuzu boş.', '{t("dashboard.activeWarehousesEmpty")}'],
    ['KOD:', '{t("dashboard.codeColon")}'],
    ['Aktif PO Bulunmuyor', '{t("dashboard.noActivePOs")}'],
    ['Yolda veya bekleyen satın alma siparişi bulunmuyor.', '{t("dashboard.noPendingPOs")}'],
    ['Teslim:', '{t("dashboard.expectedDeliveryColon")}'],
    ['Kritik Stok Tedarik Talebi', '{t("dashboard.criticalStockRequest")}'],
    ['Malzeme:', '{t("dashboard.materialColon")}'],
    ['Mevcut Durum:', '{t("dashboard.currentStatusColon")}'],
    ['Talep Miktarı (Adet) *', '{t("dashboard.requestQuantityRequired")}'],
    ['Sipariş No:', '{t("dashboard.orderNoColon")}'],
    ['Tedarikçi:', '{t("dashboard.supplierColon")}'],
    ['Proje:', '{t("dashboard.projectColon")}'],
    ['Toplam Hacim:', '{t("dashboard.totalVolumeColon")}'],
    ['Teslimat Notu', '{t("dashboard.deliveryNotes")}']
  ];

  for (const [target, rep] of jsxReplacements) {
    content = content.replace(target, rep);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log("overview component refactored!");
}

// Execute
updateLocales();
refactorTenants();
refactorFieldReports();
refactorFinance();
refactorInventory();
refactorProcurement();
refactorDocuments();
refactorOverview();
console.log("All refactoring tasks completed successfully!");
