import json
import os

# Define file paths
workspace_dir = r"c:\Users\murat\sismik-web"
locales_dir = os.path.join(workspace_dir, "apps", "frontend", "locales")
app_dir = os.path.join(workspace_dir, "apps", "frontend", "app")
components_dir = os.path.join(workspace_dir, "apps", "frontend", "components")

tr_json_path = os.path.join(locales_dir, "tr.json")
en_json_path = os.path.join(locales_dir, "en.json")

# Load and update translation dictionaries
def update_locales():
    print("Updating translation dictionaries...")
    with open(tr_json_path, 'r', encoding='utf-8') as f:
        tr_data = json.load(f)
    
    with open(en_json_path, 'r', encoding='utf-8') as f:
        en_data = json.load(f)

    # 1. Finance additions
    if "finance" not in tr_data:
        tr_data["finance"] = {}
    if "finance" not in en_data:
        en_data["finance"] = {}
        
    tr_data["finance"]["categories"] = {
        "material": "Malzeme Tedariği",
        "transport": "Nakliye & Lojistik",
        "equipment": "Ekipman Kiralama"
    }
    en_data["finance"]["categories"] = {
        "material": "Material Supply",
        "transport": "Shipping & Logistics",
        "equipment": "Equipment Rental"
    }
    tr_data["finance"]["skuColon"] = "SKU:"
    en_data["finance"]["skuColon"] = "SKU:"
    tr_data["finance"]["additionalDocument"] = "EK BELGE / FİŞ"
    en_data["finance"]["additionalDocument"] = "ADDITIONAL DOCUMENT / RECEIPT"

    # 2. Inventory additions
    if "inventory" not in tr_data:
        tr_data["inventory"] = {}
    if "inventory" not in en_data:
        en_data["inventory"] = {}
        
    inventory_tr = {
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
    }
    
    inventory_en = {
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
    }
    
    tr_data["inventory"].update(inventory_tr)
    en_data["inventory"].update(inventory_en)

    # 3. Procurement additions
    if "procurement" not in tr_data:
        tr_data["procurement"] = {}
    if "procurement" not in en_data:
        en_data["procurement"] = {}
        
    procurement_tr = {
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
    }
    
    procurement_en = {
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
    }
    
    tr_data["procurement"].update(procurement_tr)
    en_data["procurement"].update(procurement_en)

    # 4. Documents additions
    if "documents" not in tr_data:
        tr_data["documents"] = {}
    if "documents" not in en_data:
        en_data["documents"] = {}
        
    documents_tr = {
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
    }
    
    documents_en = {
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
    }
    
    tr_data["documents"].update(documents_tr)
    en_data["documents"].update(documents_en)

    # 5. Dashboard additions
    dashboard_tr = {
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
    }

    dashboard_en = {
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
    }
    
    tr_data["dashboard"] = dashboard_tr
    en_data["dashboard"] = dashboard_en

    # Save files back
    with open(tr_json_path, 'w', encoding='utf-8') as f:
        json.dump(tr_data, f, ensure_ascii=False, indent=2)
        
    with open(en_json_path, 'w', encoding='utf-8') as f:
        json.dump(en_data, f, ensure_ascii=False, indent=2)
        
    print("Translation dictionaries updated successfully!")

# Refactor platform/tenants/page.tsx
def refactor_tenants():
    print("Refactoring platform/tenants/page.tsx...")
    path = os.path.join(app_dir, "platform", "tenants", "page.tsx")
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Security fix on line 131
    target = "out += chars[Math.floor(Math.random() * chars.length)];"
    replacement = "out += chars.charAt(Math.floor(Math.random() * chars.length));"
    
    if target in content:
        content = content.replace(target, replacement)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("tenants page refactored!")
    else:
        print("tenants page target not found or already refactored.")

# Refactor field-reports/page.tsx
def refactor_field_reports():
    print("Refactoring field-reports/page.tsx...")
    path = os.path.join(app_dir, "field-reports", "page.tsx")
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Replace Taslak with draft translation key
    replacements = [
        ('<span className="corp-badge-secondary">Taslak</span>', '<span className="corp-badge-secondary">{t("fieldReports.draft")}</span>'),
        ('<span className="corp-badge-success"><CheckCircle2 className="h-3 w-3" /> Onaylandı</span>', '<span className="corp-badge-success"><CheckCircle2 className="h-3 w-3" /> {t("fieldReports.approved")}</span>'),
        ('<span className="corp-badge-warning"><Clock className="h-3 w-3" /> Onay Bekliyor</span>', '<span className="corp-badge-warning"><Clock className="h-3 w-3" /> {t("fieldReports.pendingApproval")}</span>')
    ]
    
    modified = False
    for target, rep in replacements:
        if target in content:
            content = content.replace(target, rep)
            modified = True
            
    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("field-reports page refactored!")
    else:
        print("field-reports targets not found or already refactored.")

# Refactor finance/page.tsx
def refactor_finance():
    print("Refactoring finance/page.tsx...")
    path = os.path.join(app_dir, "finance", "page.tsx")
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    replacements = [
        ('<option value="material">Malzeme Tedariği</option>', '<option value="material">{t("finance.categories.material")}</option>'),
        ('<option value="transport">Nakliye & Lojistik</option>', '<option value="transport">{t("finance.categories.transport")}</option>'),
        ('<option value="equipment">Ekipman Kiralama</option>', '<option value="equipment">{t("finance.categories.equipment")}</option>'),
        ('SKU: {stockMovementDetails.material_sku}', '{t("finance.skuColon")} {stockMovementDetails.material_sku}'),
        ('EK BELGE / FİŞ', '{t("finance.additionalDocument")}')
    ]
    
    modified = False
    for target, rep in replacements:
        if target in content:
            content = content.replace(target, rep)
            modified = True
            
    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("finance page refactored!")
    else:
        print("finance targets not found or already refactored.")

# Refactor inventory/page.tsx
def refactor_inventory():
    print("Refactoring inventory/page.tsx...")
    path = os.path.join(app_dir, "inventory", "page.tsx")
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    replacements = [
        ('<label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Malzeme Kataloğu</label>', '<label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("inventory.catalog")}</label>'),
        ('<label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Depo Odaklı</label>', '<label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("inventory.warehouseFocused")}</label>'),
        ('<option value="IN">Giriş (IN) - Satın Alma/Tedarik</option>', '<option value="IN">{t("inventory.inboundPurchase")}</option>'),
        ('<option value="ADJUSTMENT">Sayım Düzeltmesi (ADJUSTMENT)</option>', '<option value="ADJUSTMENT">{t("inventory.adjustment")}</option>'),
        ('<th className="corp-th">Tarih / Saat</th>', '<th className="corp-th">{t("inventory.dateTime")}</th>'),
        ('<th className="corp-th">Malzeme</th>', '<th className="corp-th">{t("inventory.material")}</th>'),
        ('<th className="corp-th text-right">Miktar</th>', '<th className="corp-th text-right">{t("inventory.quantity")}</th>'),
        ('<th className="corp-th text-right">Maliyet (Birim/Top)</th>', '<th className="corp-th text-right">{t("inventory.costUnitTotal")}</th>'),
        ('<th className="corp-th">Ref / İrsaliye</th>', '<th className="corp-th">{t("inventory.refWaybill")}</th>'),
        ('Top: ₺', '{t("inventory.totalTL")}'),
        ('<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Yeni Stok Hareketi Sihirbazı</h3>', '<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{t("inventory.newStockMovement")}</h3>'),
        ('<p className="text-[11px] text-slate-400 font-bold">Birim maliyet, irsaliye ve proje entegrasyonu ile stok yönetimi</p>', '<p className="text-[11px] text-slate-400 font-bold">{t("inventory.newStockMovementDesc")}</p>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Harekete Konu Malzeme</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.movementMaterial")}</label>'),
        ('<option value="">Malzeme seçiniz...</option>', '<option value="">{t("inventory.selectMaterial")}</option>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Kaynak Depo</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.sourceWarehouse")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Hedef Depo</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.targetWarehouse")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Birim Maliyet (₺ - Opsiyonel)</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.unitCostOptional")}</label>'),
        ('<option value="">Proje yok (Genel Gider)</option>', '<option value="">{t("inventory.noProject")}</option>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Harekete Dair Açıklamalar</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.movementNotes")}</label>'),
        ('<p className="text-[11px] text-slate-400 font-bold">Platform düzeyinde malzeme kartı tanımlayın</p>', '<p className="text-[11px] text-slate-400 font-bold">{t("inventory.defineMaterialCard")}</p>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">SKU / Katalog Kodu</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.skuCatalogCode")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Takip Birimi</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.trackingUnit")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Malzeme Tanımı (Adı)</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.materialDescription")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Birim Maliyet (₺)</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.unitCostTL")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Min. Kritik Seviye</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.minCriticalLevel")}</label>'),
        ('<span className="text-[11px] font-bold text-slate-500">Bu malzeme kaydedilirken ilk envanter miktarını doğrudan tanımlayabilirsiniz.</span>', '<span className="text-[11px] font-bold text-slate-500">{t("inventory.initialStockDesc")}</span>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Giriş Yapılacak Depo</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.initialWarehouse")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Giriş Miktarı</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.initialQuantity")}</label>'),
        ('<p className="text-[11px] text-slate-400 font-bold">Merkez veya şantiye lojistik deposu oluşturun</p>', '<p className="text-[11px] text-slate-400 font-bold">{t("inventory.createWarehouseDesc")}</p>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Depo Tipi</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.warehouseType")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Depo Adı</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.warehouseName")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Depo Takip Kodu (Örn: DEP-01)</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.warehouseCodeExample")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Fiziksel Konum / Adres</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("inventory.physicalLocation")}</label>')
    ]
    
    modified = False
    for target, rep in replacements:
        if target in content:
            content = content.replace(target, rep)
            modified = True
            
    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("inventory page refactored!")
    else:
        print("inventory targets not found or already refactored.")

# Refactor procurement/page.tsx
def refactor_procurement():
    print("Refactoring procurement/page.tsx...")
    path = os.path.join(app_dir, "procurement", "page.tsx")
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    replacements = [
        ('Satın alma verileri yükleniyor...', '{t("procurement.loading")}'),
        ('<option value="pending_approval">Onay Bekliyor</option>', '<option value="pending_approval">{t("procurement.status.pendingApproval")}</option>'),
        ('<option value="approved">Onaylandı</option>', '<option value="approved">{t("procurement.status.approved")}</option>'),
        ('<option value="rejected">Reddedildi</option>', '<option value="rejected">{t("procurement.status.rejected")}</option>'),
        ('<option value="ordered">Sipariş Verildi</option>', '<option value="ordered">{t("procurement.status.ordered")}</option>'),
        ('<option value="received">Teslim Alındı</option>', '<option value="received">{t("procurement.status.received")}</option>'),
        ('Beklenen ', '{t("procurement.expected")}'),
        ('<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Malzeme Talebi Oluştur</h3>', '<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{t("procurement.createRequest")}</h3>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Malzeme *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.materialRequired")}</label>'),
        ('<option value="">Proje Seçin (Opsiyonel)</option>', '<option value="">{t("procurement.selectProjectOptional")}</option>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Miktar *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.quantityRequired")}</label>'),
        ('<option value="normal">Normal</option>', '<option value="normal">{t("procurement.priority.normal")}</option>'),
        ('<option value="urgent">Acil</option>', '<option value="urgent">{t("procurement.priority.urgent")}</option>'),
        ('<option value="critical">Kritik</option>', '<option value="critical">{t("procurement.priority.critical")}</option>'),
        ('<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Siparişi Teslim Al</h3>', '<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{t("procurement.receiveOrder")}</h3>'),
        ('PO No:', '{t("procurement.poNo")}'),
        ('Tedarikçi:', '{t("procurement.supplierColon")}'),
        ('Toplam Tutar:', '{t("procurement.totalAmountColon")}'),
        ('Kalem Sayısı:', '{t("procurement.itemCountColon")}'),
        ('<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Satın Alma Siparişi (PO) Oluştur</h3>', '<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{t("procurement.createPO")}</h3>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">PO Numarası *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.poNumberRequired")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Tedarikçi</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.supplier")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Hedef Depo *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.targetWarehouseRequired")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Beklenen Teslim Tarihi</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.expectedDeliveryDate")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Sipariş Kalemleri *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.orderItemsRequired")}</label>'),
        ('<option value="">Malzeme Seçin...</option>', '<option value="">{t("procurement.selectMaterialEllipsis")}</option>'),
        ('<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Tedarikçi Ekle</h3>', '<h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{t("procurement.addSupplier")}</h3>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Firma Adı *</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.companyNameRequired")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Yetkili Kişi</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.authorizedPerson")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Telefon</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.phone")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Vergi Numarası</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.taxNumber")}</label>'),
        ('<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Adres</label>', '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("procurement.address")}</label>')
    ]
    
    modified = False
    for target, rep in replacements:
        if target in content:
            content = content.replace(target, rep)
            modified = True
            
    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("procurement page refactored!")
    else:
        print("procurement targets not found or already refactored.")

# Refactor documents/page.tsx
def refactor_documents():
    print("Refactoring documents/page.tsx...")
    path = os.path.join(app_dir, "documents", "page.tsx")
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    replacements = [
        ('<option value="drawing_hvac">HVAC Çizimleri</option>', '<option value="drawing_hvac">{t("documents.types.drawing_hvac")}</option>'),
        ('<option value="drawing_fire">Yangın Çizimleri</option>', '<option value="drawing_fire">{t("documents.types.drawing_fire")}</option>'),
        ('<option value="drawing_seismic">Sismik Çizimler</option>', '<option value="drawing_seismic">{t("documents.types.drawing_seismic")}</option>'),
        ('<option value="drawing_mep">MEP Çizimleri</option>', '<option value="drawing_mep">{t("documents.types.drawing_mep")}</option>'),
        ('<option value="invoice_doc">Hakediş Dosyaları</option>', '<option value="invoice_doc">{t("documents.types.invoice_doc")}</option>'),
        ('<option value="field_report">Saha Raporları</option>', '<option value="field_report">{t("documents.types.field_report")}</option>'),
        ('<option value="expense_receipt">Gider Belgeleri (Fatura/Fiş)</option>', '<option value="expense_receipt">{t("documents.types.expense_receipt")}</option>'),
        ('<p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5 font-bold">AutoCAD Vector Live View (Simüle Edilmiş)</p>', '<p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5 font-bold">{t("documents.autocadLiveView")}</p>'),
        (' Yeni Dosya Yükle', ' {t("documents.uploadNewFile")}')
    ]
    
    modified = False
    for target, rep in replacements:
        if target in content:
            content = content.replace(target, rep)
            modified = True
            
    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("documents page refactored!")
    else:
        print("documents targets not found or already refactored.")

# Refactor components/dashboard/overview.tsx
def refactor_overview():
    print("Refactoring components/dashboard/overview.tsx...")
    path = os.path.join(components_dir, "dashboard", "overview.tsx")
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # 1. Imports addition
    import_target = 'import { useEffect, useState } from "react";'
    import_rep = 'import { useEffect, useState } from "react";\nimport { useTranslation } from "@/lib/i18n";'
    if import_target in content and 'useTranslation' not in content:
        content = content.replace(import_target, import_rep)

    # 2. Hook addition
    hook_target = 'export function DashboardOverview() {'
    hook_rep = 'export function DashboardOverview() {\n  const { t } = useTranslation();'
    if hook_target in content and 'const { t } = useTranslation();' not in content:
        content = content.replace(hook_target, hook_rep)

    # 3. Security Refactoring of bracket notations: define static helpers
    helpers = """
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
"""

    # We insert helpers right before export function DashboardOverview()
    if "getPriorityLabel" not in content:
        content = content.replace("export function DashboardOverview()", helpers + "\nexport function DashboardOverview()")

    # 4. Refactor expandedReports state from Record to Set
    target_state = "const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({});"
    rep_state = "const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());"
    content = content.replace(target_state, rep_state)

    target_toggle = """  const toggleReportExpanded = (reportId: string) => {
    setExpandedReports(prev => ({
      ...prev,
      [reportId]: !prev[reportId]
    }));
  };"""
    rep_toggle = """  const toggleReportExpanded = (reportId: string) => {
    setExpandedReports(prev => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  };"""
    content = content.replace(target_toggle, rep_toggle)

    target_is_expanded = "const isExpanded = !!expandedReports[report.id];"
    rep_is_expanded = "const isExpanded = expandedReports.has(report.id);"
    content = content.replace(target_is_expanded, rep_is_expanded)

    # 5. Copy-paste fix on line 576
    target_copypaste = '(pendingRequests.length + pendingReports.length) > 0 ? "border-slate-200" : "border-slate-200"'
    rep_copypaste = '(pendingRequests.length + pendingReports.length) > 0 ? "border-amber-200 bg-amber-50/10" : "border-slate-200"'
    content = content.replace(target_copypaste, rep_copypaste)

    # 6. Secure bracket notations in loops/renders
    # Replace PRIORITY_COLORS[req.priority]
    content = content.replace("PRIORITY_COLORS[req.priority]", "getPriorityBadgeClass(req.priority)")
    content = content.replace("PRIORITY_LABELS[req.priority]", "getPriorityLabel(req.priority)")
    
    # Replace STATUS_COLORS[po.status]
    content = content.replace("STATUS_COLORS[po.status]", "getStatusBadgeClass(po.status)")
    content = content.replace("STATUS_LABELS[po.status]", "getStatusLabel(po.status)")
    
    # Replace SCOPE_BADGES[sc]
    content = content.replace("const badge = SCOPE_BADGES[sc] || SCOPE_BADGES.other;", "const badge = getScopeBadgeInfo(sc);")
    
    # Replace expenseSummary category lookups
    content = content.replace("EXPENSE_LABELS[category] || category", "getExpenseLabel(category)")
    content = content.replace("EXPENSE_COLORS[category] || \"bg-indigo-600\"", "getExpenseColorClass(category)")
    
    # Replace expenseSummary assignment: expenseSummary[cat as keyof typeof expenseSummary] += amount;
    old_exp_assignment = """    if (cat in expenseSummary) {
      expenseSummary[cat as keyof typeof expenseSummary] += amount;
    } else {
      expenseSummary.miscellaneous += amount;
    }"""
    new_exp_assignment = """    switch (cat) {
      case "material": expenseSummary.material += amount; break;
      case "labour": expenseSummary.labour += amount; break;
      case "transport": expenseSummary.transport += amount; break;
      case "equipment": expenseSummary.equipment += amount; break;
      default: expenseSummary.miscellaneous += amount; break;
    }"""
    content = content.replace(old_exp_assignment, new_exp_assignment)

    # Replace local statusMap / statusColors lookups in projects mapping
    old_proj_status_maps = """                    const statusMap: Record<string, string> = {
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
                    };"""
    content = content.replace(old_proj_status_maps, "")
    content = content.replace("statusColors[p.status] || \"bg-slate-100 text-slate-600\"", "getProjectStatusBadgeClass(p.status)")
    content = content.replace("statusMap[p.status] || p.status", "getProjectStatusLabel(p.status)")

    # 7. JSX String Replacements with {t("...")}
    jsx_replacements = [
      ("Mekanik ERP Operasyon Panosu yükleniyor...", "{t(\"dashboard.loading\")}"),
      ("<h2 className=\"text-2xl sm:text-3xl font-extrabold tracking-tight mt-2.5\">Operasyon Panosu</h2>", "<h2 className=\"text-2xl sm:text-3xl font-extrabold tracking-tight mt-2.5\">{t(\"dashboard.title\")}</h2>"),
      ("<p className=\"text-[10px] text-slate-500 font-bold uppercase tracking-wider\">Projeler & Şantiye</p>", "<p className=\"text-[10px] text-slate-500 font-bold uppercase tracking-wider\">{t(\"dashboard.projects\")}</p>"),
      ("sahada devam ediyor", "{t(\"projects.inFieldContinuing\")}"),
      ("<p className=\"text-[10px] text-slate-500 font-bold uppercase tracking-wider\">Onay Sırası (Aksiyon)</p>", "<p className=\"text-[10px] text-slate-500 font-bold uppercase tracking-wider\">{t(\"dashboard.actionQueue\")}</p>"),
      ("talep /", "{t(\"projects.request\")} /"),
      ("rapor bekliyor", "{t(\"projects.reportPending\")}"),
      ("Tüm onaylar tamamlandı", "{t(\"projects.allApprovalsCompleted\")}"),
      ("<p className=\"text-[10px] text-slate-500 font-bold uppercase tracking-wider\">Depo & Stok Alarmları</p>", "<p className=\"text-[10px] text-slate-500 font-bold uppercase tracking-wider\">{t(\"dashboard.warehouses\")}</p>"),
      ("ürün kritik sınırda!", "{t(\"projects.productCriticalLimit\")}"),
      ("Stok seviyeleri ideal", "{t(\"dashboard.stockIdeal\")}"),
      ("<p className=\"text-[10px] text-slate-500 font-bold uppercase tracking-wider\">Finansal Sağlık & Kâr Marjı</p>", "<p className=\"text-[10px] text-slate-500 font-bold uppercase tracking-wider\">{t(\"dashboard.financialHealth\")}</p>"),
      ("Net Kâr:", "{t(\"finance.netProfit\")}:"),
      ("<h3 className=\"text-sm font-black text-slate-800 uppercase tracking-wider\">Acil Aksiyon & Onay Merkezi</h3>", "<h3 className=\"text-sm font-black text-slate-800 uppercase tracking-wider\">{t(\"dashboard.urgentAction\")}</h3>"),
      ("Saha Raporları Güncel", "{t(\"dashboard.fieldReportsUpToDate\")}"),
      ("Onay bekleyen günlük saha raporu bulunmuyor.", "{t(\"dashboard.noPendingReports\")}"),
      ("Faaliyet kaydı eklenmemiş.", "{t(\"dashboard.noActivities\")}"),
      ("Onay sırasını bekleyen malzeme talebi bulunmuyor.", "{t(\"dashboard.noPendingRequests\")}"),
      ("Miktar:", "{t(\"dashboard.quantityColon\")}"),
      ("Depo Stokları Güvende", "{t(\"dashboard.warehouseStocksSafe\")}"),
      ("Kritik seviyenin altına düşen malzeme bulunmuyor.", "{t(\"dashboard.noLowStockAlerts\")}"),
      ("Stok Hareketi", "{t(\"dashboard.stockMovement\")}"),
      ("Giriş / Çıkış Gir", "{t(\"dashboard.enterMovement\")}"),
      ("Saha Raporu", "{t(\"dashboard.fieldReport\")}"),
      ("Faaliyet Kaydet", "{t(\"dashboard.recordActivity\")}"),
      ("Yeni Malzeme", "{t(\"dashboard.newMaterial\")}"),
      ("Tedarik Talebi Aç", "{t(\"dashboard.openRequest\")}"),
      ("Finans Analiz", "{t(\"dashboard.financeAnalysis\")}"),
      ("Ciro", "{t(\"dashboard.revenue\")}"),
      ("Aktif Projeler", "{t(\"dashboard.activeProjects\")}"),
      ("Proje Kodu", "{t(\"dashboard.projectCode\")}"),
      ("Mekanik Disiplinler", "{t(\"dashboard.mechanicalDisciplines\")}"),
      ("Zaman İlerlemesi", "{t(\"dashboard.timeProgress\")}"),
      ("Durum", "{t(\"dashboard.status\")}"),
      ("Kayıtlı proje bulunmamaktadır.", "{t(\"dashboard.noProjectsRegistered\")}"),
      ("Toplam Şantiye Masrafı", "{t(\"dashboard.totalSiteExpenses\")}"),
      ("Depo Kapasiteleri", "{t(\"dashboard.warehouseCapacities\")}"),
      ("Aktif depo havuzu boş.", "{t(\"dashboard.activeWarehousesEmpty\")}"),
      ("KOD:", "{t(\"dashboard.codeColon\")}"),
      ("Aktif PO Bulunmuyor", "{t(\"dashboard.noActivePOs\")}"),
      ("Yolda veya bekleyen satın alma siparişi bulunmuyor.", "{t(\"dashboard.noPendingPOs\")}"),
      ("Teslim:", "{t(\"dashboard.expectedDeliveryColon\")}"),
      ("Kritik Stok Tedarik Talebi", "{t(\"dashboard.criticalStockRequest\")}"),
      ("Malzeme:", "{t(\"dashboard.materialColon\")}"),
      ("Mevcut Durum:", "{t(\"dashboard.currentStatusColon\")}"),
      ("Talep Miktarı (Adet) *", "{t(\"dashboard.requestQuantityRequired\")}"),
      ("Sipariş No:", "{t(\"dashboard.orderNoColon\")}"),
      ("Tedarikçi:", "{t(\"dashboard.supplierColon\")}"),
      ("Proje:", "{t(\"dashboard.projectColon\")}"),
      ("Toplam Hacim:", "{t(\"dashboard.totalVolumeColon\")}"),
      ("Teslimat Notu", "{t(\"dashboard.deliveryNotes\")}")
    ]

    for target, rep in jsx_replacements:
        content = content.replace(target, rep)
        
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("overview component refactored!")

# Main execution
if __name__ == "__main__":
    update_locales()
    refactor_tenants()
    refactor_field_reports()
    refactor_finance()
    refactor_inventory()
    refactor_procurement()
    refactor_documents()
    refactor_overview()
    print("All tasks completed successfully!")
