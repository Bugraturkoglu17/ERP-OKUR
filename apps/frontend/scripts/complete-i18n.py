import os

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

REPLACEMENTS_USERS = {
    '{isSelf && <span className="rounded-full bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 text-[9px] font-bold">Ben</span>}':
    '{isSelf && <span className="rounded-full bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 text-[9px] font-bold">{t("adminUsers.me")}</span>}',

    '<span>Disiplin Kısıtı: {user.discipline_only ? "Sadece Uzmanlık Alanı" : "Genel Yetki"}</span>':
    '<span>{t("adminUsers.disciplineConstraint")} {user.discipline_only ? t("adminUsers.onlySpecialty") : t("adminUsers.generalAuthority")}</span>',

    '<h3 className="text-base font-bold text-slate-800">Sisteme Personel Ekle</h3>':
    '<h3 className="text-base font-bold text-slate-800">{t("adminUsers.addPersonelToSystem")}</h3>',

    '<p className="text-xs text-slate-500 mt-0.5">FastAPI RBAC & yetkilendirmeli yeni hesap</p>':
    '<p className="text-xs text-slate-500 mt-0.5">{t("adminUsers.fastApiRbacDesc")}</p>',

    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Ad Soyad *</label>':
    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{t("adminUsers.fullNameRequired")}</label>',

    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">E-posta *</label>':
    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{t("adminUsers.emailRequired")}</label>',

    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Şifre *</label>':
    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{t("adminUsers.passwordRequired")}</label>',

    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Telefon</label>':
    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{t("adminUsers.phone")}</label>',

    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Varsayılan Rol *</label>':
    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{t("adminUsers.defaultRoleRequired")}</label>',

    '<option value="saha_muhendisi">Saha Mühendisi</option>':
    '<option value="saha_muhendisi">{t("adminUsers.fieldEngineer")}</option>',

    '<option value="depo_sorumlusu">Depo Sorumlusu</option>':
    '<option value="depo_sorumlusu">{t("adminUsers.warehouseKeeper")}</option>',

    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Uzmanlık / Disiplin Kısıtı</label>':
    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{t("adminUsers.specialtyDisciplineConstraint")}</label>',

    '<option value="none">Genel / Tüm Disiplinler</option>':
    '<option value="none">{t("adminUsers.generalAllDisciplines")}</option>',

    '<option value="seismic">Sismik Koruma & Askılama</option>':
    '<option value="seismic">{t("adminUsers.seismicProtectionShort")}</option>',

    '<option value="hvac">HVAC Havalandırma</option>':
    '<option value="hvac">{t("adminUsers.hvacVentilation")}</option>',

    '<option value="fire">Yangın Söndürme Tesisatı</option>':
    '<option value="fire">{t("adminUsers.fireExtinguishing")}</option>',

    '<option value="mep">MEP Koordinasyonu</option>':
    '<option value="mep">{t("adminUsers.mepCoordination")}</option>',

    '<option value="musteri_kullanici">Müşteri Temsilcisi</option>':
    '<option value="musteri_kullanici">{t("adminUsers.clientRepresentative")}</option>',

    '<option value="admin">Yönetici (Admin)</option>':
    '<option value="admin">{t("adminUsers.adminRole")}</option>',

    '<h3 className="text-base font-bold text-slate-800">Personel Bilgilerini Düzenle</h3>':
    '<h3 className="text-base font-bold text-slate-800">{t("adminUsers.editPersonelInfo")}</h3>',

    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Default Yetki Rolü *</label>':
    '<label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{t("adminUsers.defaultAuthorityRoleRequired")}</label>',

    '<h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Atanmış Sistem Rolleri</h4>':
    '<h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{t("adminUsers.assignedSystemRoles")}</h4>',

    '<h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">İletişim & Güvenlik Bilgileri</h4>':
    '<h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{t("adminUsers.contactSecurityInfo")}</h4>',

    '<span>{selectedUserForDrawer.phone || "Telefon belirtilmemiş"}</span>':
    '<span>{selectedUserForDrawer.phone || t("adminUsers.phoneNotProvided")}</span>',

    '<span>MFA / İki Faktörlü</span>':
    '<span>{t("adminUsers.mfaTwoFactor")}</span>',

    '<span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-250/60 uppercase tracking-wide">Aktif (Zorunlu)</span>':
    '<span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-250/60 uppercase tracking-wide">{t("adminUsers.activeMandatory")}</span>',

    '<span>Hesap Durumu</span>':
    '<span>{t("adminUsers.accountStatus")}</span>',

    '{selectedUserForDrawer.is_active ? "Aktif" : "Pasif / Dondurulmuş"}':
    '{selectedUserForDrawer.is_active ? t("adminUsers.activeState") : t("adminUsers.passiveState")}',

    '<span className="font-bold text-slate-500">{"Çalışma Disiplini"}</span>':
    '<span className="font-bold text-slate-500">{t("adminUsers.workDiscipline")}</span>',

    '{getDisciplineLabel(selectedUserForDrawer.discipline) || "Genel (Tümü)"}':
    '{getDisciplineLabel(selectedUserForDrawer.discipline) || t("adminUsers.generalAll")}',

    '{selectedUserForDrawer.discipline_only \n                        ? "Sadece kendi atandığı uzmanlık alanındaki döküman, proje ve çizimleri görebilir." \n                        : "Sistem genelindeki tüm disiplin belgelerine ve projelere tam erişime sahiptir."}':
    '{selectedUserForDrawer.discipline_only \n                        ? t("adminUsers.disciplineFilterHelpActive") \n                        : t("adminUsers.disciplineFilterHelpPassive")}',

    '<h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Kullanıcının Atandığı Projeler</h4>':
    '<h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{t("adminUsers.userAssignedProjects")}</h4>',

    '<span>Bu kullanıcıya atanmış aktif proje bulunmamaktadır.</span>':
    '<span>{t("adminUsers.noActiveProjectAssigned")}</span>',

    '<p className="text-[10px] text-slate-400 font-medium">Projeler sayfasından yeni atamalar yapabilirsiniz.</p>':
    '<p className="text-[10px] text-slate-400 font-medium">{t("adminUsers.assignProjectsInfo")}</p>',

    '<Edit3 className="h-3.5 w-3.5 shrink-0" /> Profili Düzenle':
    '<Edit3 className="h-3.5 w-3.5 shrink-0" /> {t("adminUsers.editProfile")}',

    '<Trash2 className="h-3.5 w-3.5 text-white shrink-0" /> Sil (Arşivle)':
    '<Trash2 className="h-3.5 w-3.5 text-white shrink-0" /> {t("adminUsers.deleteArchive")}',

    'placeholder="Ad, e-posta veya telefon ara..."':
    'placeholder={t("adminUsers.searchPlaceholder")}',

    'Arama kriterlerine veya filtreye uygun personel bulunamadı.':
    '{t("adminUsers.noUserFound")}'
}

REPLACEMENTS_FIELD_REPORTS = {
    '<p className="text-slate-500 font-semibold text-sm">Saha raporları yükleniyor...</p>':
    '<p className="text-slate-500 font-semibold text-sm">{t("fieldReports.loading")}</p>',

    'Saha Günlük Raporları':
    '{t("fieldReports.title")}',

    '{pendingApprovalCount} onay bekliyor':
    '{pendingApprovalCount} {t("fieldReports.pendingApprovals")}',

    'Şantiye günlük faaliyetlerini kaydedin, ekip saatlerini takip edin ve onay süreçlerini yönetin.':
    '{t("fieldReports.description")}',

    'Yeni Günlük Rapor':
    '{t("fieldReports.newReport")}',

    '{ label: "Toplam Rapor",':
    '{ label: t("fieldReports.totalReports"),',

    '{ label: "Taslak",':
    '{ label: t("fieldReports.draft"),',

    '{ label: "Onay Bekliyor",':
    '{ label: t("fieldReports.pendingApproval"),',

    '{ label: "Onaylandı",':
    '{ label: t("fieldReports.approved"),',

    'placeholder="Proje, özet veya yazar ara..."':
    'placeholder={t("fieldReports.searchPlaceholder")}',

    '<option value="">Tüm Projeler</option>':
    '<option value="">{t("fieldReports.allProjects")}</option>',

    '<option value="all">Tüm Durumlar</option>':
    '<option value="all">{t("fieldReports.allStatuses")}</option>',

    '<option value="pending">Onay Bekliyor</option>':
    '<option value="pending">{t("fieldReports.pendingApproval")}</option>',

    '<option value="approved">Onaylandı</option>':
    '<option value="approved">{t("fieldReports.approved")}</option>',

    '<th className="corp-th">Rapor Tarihi</th>':
    '<th className="corp-th">{t("fieldReports.reportDate")}</th>',

    '<th className="corp-th">Proje</th>':
    '<th className="corp-th">{t("fieldReports.project")}</th>',

    '<th className="corp-th">Yazar</th>':
    '<th className="corp-th">{t("fieldReports.author")}</th>',

    '<th className="corp-th">Ekip / Saat</th>':
    '<th className="corp-th">{t("fieldReports.teamHours")}</th>',

    '<th className="corp-th">Aktiviteler</th>':
    '<th className="corp-th">{t("fieldReports.activities")}</th>',

    '<th className="corp-th">Durum</th>':
    '<th className="corp-th">{t("fieldReports.status")}</th>',

    '<th className="corp-th">İşlemler</th>':
    '<th className="corp-th">{t("fieldReports.operations")}</th>',

    'Rapor bulunamadı.':
    '{t("fieldReports.noReportsFound")}',

    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Hava Durumu</label>':
    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("fieldReports.weather")}</label>',

    '<option value="">Seçin (Opsiyonel)</option>':
    '<option value="">{t("fieldReports.weatherSelectOptional")}</option>',

    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ekip (Kişi)</label>':
    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("fieldReports.teamSizePerson")}</label>',

    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Toplam Saat</label>':
    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("fieldReports.totalHours")}</label>',

    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gün Özeti</label>':
    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("fieldReports.daySummary")}</label>',

    'placeholder="Bugün sahada genel olarak neler yapıldı?"':
    'placeholder={t("fieldReports.daySummaryPlaceholder")}',

    '<p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Aktiviteler (Yapılan İşler)</p>':
    '<p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">{t("fieldReports.activitiesTitle")}</p>',

    '<Plus className="h-3 w-3" /> Aktivite Ekle':
    '<Plus className="h-3 w-3" /> {t("fieldReports.addActivity")}',

    'placeholder="Yapılan iş detayı (ör: 3. Kat koridoru sismik askı montajı tamamlandı)"':
    'placeholder={t("fieldReports.activityDetailPlaceholder")}',

    'placeholder="Konum / Kat"':
    'placeholder={t("fieldReports.locationFloor")}',

    'placeholder="Süre (saat)"':
    'placeholder={t("fieldReports.durationHours")}',

    'placeholder="Çalışan (kişi)"':
    'placeholder={t("fieldReports.workerCount")}',

    'className="corp-btn-secondary px-5 py-2.5">İptal</button>':
    'className="corp-btn-secondary px-5 py-2.5">{t("fieldReports.cancel")}</button>',

    'Raporu Kaydet':
    '{t("fieldReports.saveReport")}',

    'Kaydediliyor...':
    't("fieldReports.saving")',

    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Proje *</label>':
    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("fieldReports.projectSelect")}</label>',

    '<option value="">Proje Seçin...</option>':
    '<option value="">{t("fieldReports.projectSelectPlaceholder")}</option>',

    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Rapor Tarihi *</label>':
    '<label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("fieldReports.reportDateRequired")}</label>'
}

REPLACEMENTS_FINANCE = {
    '<p className="text-slate-500 font-medium">Finansal veriler yükleniyor...</p>':
    '<p className="text-slate-500 font-medium">{t("finance.loading")}</p>',

    '<h2 className="text-2xl font-bold tracking-tight">Finansal Akış & İcmal Yönetimi</h2>':
    '<h2 className="text-2xl font-bold tracking-tight">{t("finance.title")}</h2>',

    'Projelerinin hakediş (icmal) süreçlerini, şantiye giderlerini ve nakit akışını anlık takip edin.':
    '{t("finance.description")}',

    '<Plus className="w-4 h-4" /> Yeni Hakediş (İcmal) Ekle':
    '<Plus className="w-4 h-4" /> {t("finance.newInvoice")}',

    '<Coins className="w-4 h-4 text-orange-400" /> Masraf Girişi Yap':
    '<Coins className="w-4 h-4 text-orange-400" /> {t("finance.enterExpense")}',

    '<p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Hakediş Cirosu (Gelir)</p>':
    '<p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">{t("finance.revenue")}</p>',

    '<ArrowUpRight className="w-3 h-3" /> Fatura Edilmiş':
    '<ArrowUpRight className="w-3 h-3" /> {t("finance.invoiced")}',

    '<p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Şantiye Giderleri (Maliyet)</p>':
    '<p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">{t("finance.expenses")}</p>',

    '<ArrowDownRight className="w-3 h-3" /> Malzeme & İşçilik':
    '<ArrowDownRight className="w-3 h-3" /> {t("finance.materialLabour")}',

    '<p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Net Kâr</p>':
    '<p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">{t("finance.netProfit")}</p>',

    'Tesisat Karlılığı':
    '{t("finance.pipingProfitability")}',

    '<p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Ortalama Brüt Marj</p>':
    '<p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">{t("finance.grossMargin")}</p>',

    '<Receipt className="w-4 h-4" /> Hakedişler & Faturalar':
    '<Receipt className="w-4 h-4" /> {t("finance.invoicesFaturalar")}',

    '<Coins className="w-4 h-4" /> Şantiye Giderleri':
    '<Coins className="w-4 h-4" /> {t("finance.siteExpenses")}',

    '<CircleDollarSign className="w-4 h-4" /> Tahsilat & Ödeme Planı':
    '<CircleDollarSign className="w-4 h-4" /> {t("finance.paymentPlan")}',

    '<TrendingUp className="w-4 h-4" /> Proje Karlılık (İcmal)':
    '<TrendingUp className="w-4 h-4" /> {t("finance.projectProfitability")}',

    '<span className="font-black text-[10px] uppercase tracking-wider text-amber-800">Vade & Finansal Akış Uyarısı</span>':
    '<span className="font-black text-[10px] uppercase tracking-wider text-amber-800">{t("finance.cashFlowWarning")}</span>',

    'Gelecek 30 gün içerisinde tahsil edilecek 2 onaylı hakediş icmali bulunmaktadır. Taşeron ödemeleri ile eşleştirme yapılması önerilir.':
    '{t("finance.cashFlowWarningDesc")}',

    '<h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Hakediş Faturaları Listesi</h3>':
    '<h3 className="text-xs font-black uppercase tracking-wider text-slate-700">{t("finance.invoiceList")}</h3>',

    '<span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Toplam {invoices.length} fatura</span>':
    '<span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{t("finance.totalInvoices")} {invoices.length} {t("finance.invoiceList").toLowerCase()}</span>',

    '<th className="corp-th">Fatura No</th>':
    '<th className="corp-th">{t("finance.invoiceNo")}</th>',

    '<th className="corp-th">Fatura Başlığı</th>':
    '<th className="corp-th">{t("finance.invoiceTitle")}</th>',

    '<th className="corp-th">KDV Dahil Toplam</th>':
    '<th className="corp-th">{t("finance.grandTotalWithTax")}</th>',

    '<th className="corp-th">Kesim Tarihi</th>':
    '<th className="corp-th">{t("finance.invoiceDate")}</th>',

    '<th className="corp-th">Durum</th>':
    '<th className="corp-th">{t("finance.status")}</th>',

    '<th className="corp-th text-right">Tahsilat Ekle</th>':
    '<th className="corp-th text-right">{t("finance.addCollection")}</th>',

    'Tahsil Et':
    '{t("finance.collect")}',

    '<CheckCircle2 className="w-3.5 h-3.5" /> Kapandı':
    '<CheckCircle2 className="w-3.5 h-3.5" /> {t("finance.closed")}',

    'Kayıtlı hakediş faturası bulunmamaktadır. Sağ üst köşeden ilk icmali oluşturun.':
    '{t("finance.noInvoicesFound")}',

    '<h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Şantiye Gider Fişleri</h3>':
    '<h3 className="text-xs font-black uppercase tracking-wider text-slate-700">{t("finance.expenseSlips")}</h3>',

    '<span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Toplam {expenses.length} harcama kaydı</span>':
    '<span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{t("finance.totalExpensesCount")} {expenses.length}</span>',

    '<th className="corp-th">Açıklama</th>':
    '<th className="corp-th">{t("finance.descriptionLabel")}</th>',

    '<th className="corp-th">Harcama Grubu</th>':
    '<th className="corp-th">{t("finance.expenseGroup")}</th>',

    '<th className="corp-th">Tutar</th>':
    '<th className="corp-th">{t("finance.amount")}</th>',

    '<th className="corp-th">Harcama Tarihi</th>':
    '<th className="corp-th">{t("finance.expenseDate")}</th>',

    'Henüz hiçbir şantiye gider kaydı yapılmamış.':
    '{t("finance.noExpensesFound")}',

    '<h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Tahsilatlar & Ödemeler (Nakit Akışı)</h3>':
    '<h3 className="text-xs font-black uppercase tracking-wider text-slate-700">{t("finance.cashFlowTable")}</h3>',

    '<span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Toplam {payments.length} hareket</span>':
    '<span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{t("finance.totalTransactions")} {payments.length}</span>',

    '<th className="corp-th">Referans No</th>':
    '<th className="corp-th">{t("finance.referenceNo")}</th>',

    '<th className="corp-th">Hareket Yönü</th>':
    '<th className="corp-th">{t("finance.flowDirection")}</th>',

    '<th className="corp-th">Miktar</th>':
    '<th className="corp-th">{t("finance.quantityAmount")}</th>',

    '<th className="corp-th">Ödeme Yöntemi</th>':
    '<th className="corp-th">{t("finance.paymentMethod")}</th>',

    '<th className="corp-th">Tarih</th>':
    '<th className="corp-th">{t("finance.dateLabel")}</th>',

    '"Müşteri Tahsilatı (+)"':
    't("finance.customerCollection")',

    '"Tedarikçi Ödemesi (-)"':
    't("finance.supplierPayment")',

    'Nakit akış tablosunda işlem kaydı bulunmuyor.':
    '{t("finance.noPaymentsFound")}',

    '<h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Proje Bazlı Karlılık Analizi</h3>':
    '<h3 className="text-xs font-black uppercase tracking-wider text-slate-700">{t("finance.projectProfitabilityAnalysis")}</h3>',

    '<p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Kesilen Hakediş</p>':
    '<p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t("finance.billedRevenue")}</p>',

    '<p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Harcanan Gider</p>':
    '<p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t("finance.spentCost")}</p>',

    '<p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Net Kâr Miktarı</p>':
    '<p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t("finance.netProfitAmount")}</p>',

    '<span>Proje Maliyet & Kar Oranı</span>':
    '<span>{t("finance.projectCostMarginRate")}</span>',

    '<span className="text-indigo-600">Karlılık: %{profitabilityData.margin_pct.toFixed(0)}</span>':
    '<span className="text-indigo-600">{t("finance.profitabilityRate")}{profitabilityData.margin_pct.toFixed(0)}</span>',

    '<div className="w-full text-slate-400 flex items-center justify-center italic">Bu projede henüz hakediş kaydı bulunmuyor.</div>':
    '<div className="w-full text-slate-400 flex items-center justify-center italic">{t("finance.noProjectInvoiceFound")}</div>',

    'Karlılık verileri yüklenemedi.':
    '{t("finance.profitabilityLoadError")}',

    '<h3 className="text-base font-bold text-slate-900">Dönem Hakediş İcmali Oluştur</h3>':
    '<h3 className="text-base font-bold text-slate-900">{t("finance.createPeriodInvoice")}</h3>',

    '<p className="text-[11px] text-slate-500 mt-0.5">Müşteri ve projelere ait fatura kesim aracı</p>':
    '<p className="text-[11px] text-slate-500 mt-0.5">{t("finance.invoiceToolDesc")}</p>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Müşteri Firma</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.customerFirm")}</label>',

    '<option value="">Seçiniz</option>':
    '<option value="">{t("finance.selectPlaceholder")}</option>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">İlgili Şantiye / Proje</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.relatedProject")}</label>',

    '<option value="">Bağımsız (Projesiz)</option>':
    '<option value="">{t("finance.independentNoProject")}</option>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Fatura / İcmal No</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.invoiceNoLabel")}</label>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Fatura Başlığı (Açıklama)</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.invoiceTitleDescription")}</label>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Düzenleme Tarihi</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.issueDate")}</label>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Son Ödeme Vadesi</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.dueDate")}</label>',

    '<span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Fatura Kalemleri</span>':
    '<span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.invoiceItems")}</span>',

    '<Plus className="w-3.5 h-3.5" /> Kalem Ekle':
    '<Plus className="w-3.5 h-3.5" /> {t("finance.addItem")}',

    '<span>Ara Toplam:</span>':
    '<span>{t("finance.subtotal")}</span>',

    '<span>KDV Oranı:</span>':
    '<span>{t("finance.taxRate")}</span>',

    '<span>Genel Toplam:</span>':
    '<span>{t("finance.grandTotal")}</span>',

    'Hakediş İcmalini Kaydet':
    '{t("finance.saveInvoice")}',

    '<h3 className="text-base font-bold text-slate-900">Masraf / Gider Girişi</h3>':
    '<h3 className="text-base font-bold text-slate-900">{t("finance.expenseEntry")}</h3>',

    '<p className="text-[11px] text-slate-500 mt-0.5">Şantiye malzeme, taşeron veya nakliye masrafları</p>':
    '<p className="text-[11px] text-slate-500 mt-0.5">{t("finance.expenseEntryDesc")}</p>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Masrafın Ait Olduğu Proje</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.expenseProject")}</label>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Harcama Grubu</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.expenseGroup")}</label>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Harcama Açıklaması</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.expenseDescription")}</label>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Tutar (TL)</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.amountTl")}</label>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Tarih</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.dateLabel")}</label>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Belge / Fiş / Fatura Yükle (İsteğe Bağlı)</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.uploadReceiptOptional")}</label>',

    '<h3 className="text-base font-bold text-slate-900">Tahsilat / Ödeme Girişi</h3>':
    '<h3 className="text-base font-bold text-slate-900">{t("finance.collectionPaymentEntry")}</h3>',

    '<p className="text-[11px] text-slate-500 mt-0.5">Hakediş tahsilatı veya tedarikçi cari ödemesi</p>':
    '<p className="text-[11px] text-slate-500 mt-0.5">{t("finance.collectionPaymentDesc")}</p>',

    '<option value="havale">Banka Havale</option>':
    '<option value="havale">{t("finance.bankTransfer")}</option>',

    '<option value="eft">EFT Transfer</option>':
    '<option value="eft">{t("finance.eftTransfer")}</option>',

    '<option value="kredi_karti">Kredi Kartı</option>':
    '<option value="kredi_karti">{t("finance.creditCard")}</option>',

    '<option value="cek">Ticari Çek</option>':
    '<option value="cek">{t("finance.commercialCheque")}</option>',

    '<option value="nakit">Nakit</option>':
    '<option value="nakit">{t("finance.cash")}</option>',

    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Dekont / Ref No</label>':
    '<label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{t("finance.receiptRefNo")}</label>',

    '<h3 className="text-base font-bold text-slate-900">Masraf / Gider Detayı</h3>':
    '<h3 className="text-base font-bold text-slate-900">{t("finance.expenseDetails")}</h3>',

    '<p className="text-[11px] text-slate-500 mt-0.5">Harcama kaydı ayrıntılı bilgileri</p>':
    '<p className="text-[11px] text-slate-500 mt-0.5">{t("finance.expenseDetailsDesc")}</p>',

    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">HARCAMA GRUBU</span>':
    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{t("finance.expenseGroupUppercase")}</span>',

    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">TUTAR</span>':
    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{t("finance.amountUppercase")}</span>',

    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">TARİH</span>':
    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{t("finance.dateUppercase")}</span>',

    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">PROJE</span>':
    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{t("finance.projectUppercase")}</span>',

    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">MALZEME / ÜRÜN</span>':
    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{t("finance.materialProductUppercase")}</span>',

    '<span className="font-extrabold text-slate-500 block">SKU: ':
    '<span className="font-extrabold text-slate-500 block">{t("finance.skuColon")} ',

    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">EK BELGE / FİŞ</span>':
    '<span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{t("finance.attachmentReceiptUppercase")}</span>'
}

REPLACEMENTS_INVENTORY = {
    '<p className="text-slate-500 font-medium">Envanter modülü verileri yükleniyor...</p>':
    '<p className="text-slate-500 font-medium">{t("inventory.loading")}</p>',

    '<h2 className="text-2xl lg:text-3xl font-black tracking-tight font-sans">SİSMİK Stok Yönetimi</h2>':
    '<h2 className="text-2xl lg:text-3xl font-black tracking-tight font-sans">{t("inventory.title")}</h2>',

    '<th className="corp-th">SKU (Kod)</th>':
    '<th className="corp-th">{t("inventory.skuCode")}</th>',

    '<th className="corp-th">Malzeme Tanımı</th>':
    '<th className="corp-th">{t("inventory.materialDescription")}</th>',

    '<th className="corp-th">Takip Birimi</th>':
    '<th className="corp-th">{t("inventory.trackingUnit")}</th>',

    '<th className="corp-th">Birim Maliyet</th>':
    '<th className="corp-th">{t("inventory.unitCost")}</th>',

    '<div className="text-[10px] text-slate-400 mt-0.5 font-semibold">Sistem ID: ':
    '<div className="text-[10px] text-slate-400 mt-0.5 font-semibold">{t("inventory.systemId")}',

    '<span className="text-xs font-semibold text-slate-400">Belirtilmemiş</span>':
    '<span className="text-xs font-semibold text-slate-400">{t("inventory.unspecified")}</span>',

    '<span className="text-[10px] text-slate-400 font-mono mt-1 block">Kod: ':
    '<span className="text-[10px] text-slate-400 font-mono mt-1 block">{t("inventory.codeColon")}',

    '<p className="text-[11px] text-slate-500 font-medium mt-1">Bu deponun anlık malzeme stok seviyeleri</p>':
    '<p className="text-[11px] text-slate-500 font-medium mt-1">{t("inventory.warehouseStockTitle")}</p>',

    '<th className="corp-th">SKU</th>':
    '<th className="corp-th">{t("inventory.sku")}</th>',

    '<th className="corp-th text-right">Mevcut Miktar</th>':
    '<th className="corp-th text-right">{t("inventory.currentQuantity")}</th>',

    '<th className="corp-th text-center">Stok Durumu</th>':
    '<th className="corp-th text-center">{t("inventory.stockStatus")}</th>',

    '<h4 className="font-bold text-slate-700 text-sm">Depo Seçimi Yapılmadı</h4>':
    '<h4 className="font-bold text-slate-700 text-sm">{t("inventory.warehouseNotSelected")}</h4>',

    '{ id: "materials", label: "Malzeme Kataloğu",':
    '{ id: "materials", label: t("inventory.materialsCatalog"),',

    '{ id: "warehouses", label: "Depolar & Stok Durumu",':
    '{ id: "warehouses", label: t("inventory.warehousesStock"),',

    '{ id: "transfers", label: "Stok Hareketi Geçmişi",':
    '{ id: "transfers", label: t("inventory.movementsHistory"),',

    'Katalog: <strong className="text-slate-900 font-extrabold">{materials.length}</strong> Malzeme':
    '{t("inventory.materialsCatalog").split(" ")[0]}: <strong className="text-slate-900 font-extrabold">{materials.length}</strong> {t("inventory.materialLabel")}',

    'Toplam: <strong className="text-slate-900 font-extrabold">{warehouses.length}</strong> Depo':
    '{t("finance.totalInvoices")}: <strong className="text-slate-900 font-extrabold">{warehouses.length}</strong> {t("inventory.warehouseLabel")}',

    'placeholder="SKU veya malzeme adı ara..."':
    'placeholder={t("inventory.searchPlaceholder")}',

    'placeholder="Depo adı veya şehir ara..."':
    'placeholder={t("inventory.searchWarehousePlaceholder")}',

    'placeholder="Mevcut stoklarda ara..."':
    'placeholder={t("inventory.searchStockPlaceholder")}',

    'Stok detaylarını, kritik limit uyarılarını ve depo ayrıntılarını incelemek için sol panelden bir depo seçiniz.':
    '{t("inventory.warehouseStocksDesc")}',

    'Depolar':
    '{t("inventory.warehousesHeading")}',

    "wh.type === 'main' ? 'Merkez' : 'Şantiye'":
    "wh.type === 'main' ? t('inventory.merkezDepo') : t('inventory.santiyeDepo')",

    "Proje: {projects.find(p => p.id === wh.project_id)?.name || \"Mekanik Projesi\"}":
    "{t('inventory.projeLabel')}{projects.find(p => p.id === wh.project_id)?.name || \"Mekanik Projesi\"}",

    'wh.location || "Konum bilgisi belirtilmemiş"':
    'wh.location || t("inventory.locationNotSpecified")',

    'Kayıtlı depo bulunamadı.':
    '{t("inventory.noWarehousesFound")}',

    'Kritik Limit':
    '{t("inventory.stockLevelKritik")}',

    'Güvenli Seviye':
    '{t("inventory.stockLevelSafe")}',

    'Bu depoda envanter kaydı veya aranan kriterlerde stok bulunmuyor.':
    '{t("inventory.noStockRecorded")}',

    'Stok Hareketi Ekle':
    '{t("inventory.addStockMovement")}',

    'Malzeme Tanımla':
    '{t("inventory.defineMaterial")}',

    'Depo Ekle':
    '{t("inventory.addWarehouse")}'
}

REPLACEMENTS_LOGIN = {
    'SİSMİK': '{t("login.title")}',
    'Lütfen hesabınıza giriş yapın': '{t("login.prompt")}',
    'E-posta': '{t("login.email")}',
    'Şifre': '{t("login.password")}',
    '{loading ? "Giriş yapılıyor..." : "Giriş Yap"}':
    '{loading ? t("login.loggingIn") : t("login.loginButton")}',
    'setError(errorMessage || "Giriş yapılamadı. Lütfen bilgilerinizi kontrol edin.");':
    'setError(errorMessage || t("login.loginFailed"));',
    '''          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
            G
          </div>''':
    '''          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
            {t("login.title")[0]}
          </div>'''
}

REPLACEMENTS_PASSWORD_RESET = {
    'Parola Yenileme': '{t("passwordReset.title")}',
    'İlk giriş öncesi yeni şifre belirleyin': '{t("passwordReset.prompt")}',
    'E-posta': '{t("passwordReset.email")}',
    'Geçici Şifre': '{t("passwordReset.tempPassword")}',
    'Yeni Şifre': '{t("passwordReset.newPassword")}',
    'Yeni Şifre (Tekrar)': '{t("passwordReset.confirmPassword")}',
    '{loading ? "Güncelleniyor..." : "Parolayı Güncelle"}':
    '{loading ? t("passwordReset.updating") : t("passwordReset.updateButton")}',
    'setError("Yeni parola en az 8 karakter olmalı.");':
    'setError(t("passwordReset.errorMinLength"));',
    'setError("Yeni parola ve tekrar parola aynı olmalı.");':
    'setError(t("passwordReset.errorMismatch"));',
    'setSuccess(response.data.message || "Parola güncellendi. Giriş yapabilirsiniz.");':
    'setSuccess(response.data.message || t("passwordReset.successMessage"));',
    'setError(err?.response?.data?.detail || "Parola güncellenemedi.");':
    'setError(err?.response?.data?.detail || t("passwordReset.errorMessage"));',
    '''          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
            S
          </div>''':
    '''          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
            {t("passwordReset.title")[0]}
          </div>'''
}

REPLACEMENTS_PLATFORM = {
    'Geliştirici Admin': '{t("platform.owner")}',
    'Platform Yönetim Dashboardu': '{t("platform.title")}',
    'Firma yaşam döngüsü, lisans sağlığı, yönetici güvenliği ve denetim görünürlüğü.': '{t("platform.description")}',
    'Firma Yönetimine Git': '{t("platform.goFirmManagement")}',
    'setError(err?.response?.data?.detail || "Platform dashboard yüklenemedi.");':
    'setError(err?.response?.data?.detail || t("platform.loadError"));',
    'Toplam Firma': '{t("platform.totalFirms")}',
    'Askıdaki Firma': '{t("platform.suspendedFirms")}',
    'Müdahale gereken firmalar': '{t("platform.needAction")}',
    'Aktif Plan': '{t("platform.activePlan")}',
    'Toplam plan ': '{t("platform.totalPlanCount")} ',
    'Audit Olayı': '{t("platform.auditEvent")}',
    'Platform denetim hacmi': '{t("platform.auditVolume")}',
    'Son Platform Olayları': '{t("platform.recentEvents")}',
    'Audit sekmesine git': '{t("platform.goToAuditTab")}',
    'Henüz audit kaydı bulunamadı.': '{t("platform.noAuditFound")}',
    'Yönetim Kısayolları': '{t("platform.adminShortcuts")}',
    'Firma oluştur / güncelle': '{t("platform.provisionHelp")}',
    'Yönetici provision ve reset': '{t("platform.managerHelp")}',
    'Plan ve lisans ataması': '{t("platform.planHelp")}',
    'Platform ayarları': '{t("platform.settingsHelp")}',
    'Bu panel platform_admin için varsayılan açılış sayfası olarak tanımlandı.': '{t("platform.defaultLandingPage")}',
    'Aktif: ': '{t("platformTenants.active")}: '
}

REPLACEMENTS_TENANTS = {
    'Geliştirici Admin': '{t("platformTenants.owner")}',
    'Super Admin Paneli': '{t("platformTenants.title")}',
    'Firma yaşam döngüsü, yönetici, lisans ve denetim.': '{t("platformTenants.description")}',
    'Firma: ': '{t("platformTenants.firmColon")}',
    'Aktif: ': '{t("platformTenants.activeColon")}',
    'Askıda: ': '{t("platformTenants.suspendedColon")}',
    'Firmalar': '{t("platformTenants.firms")}',
    'Lisans': '{t("platformTenants.license")}',
    'Audit': '{t("platformTenants.audit")}',
    'Firma Seçimi ve Filtre': '{t("platformTenants.firmSelectAndFilter")}',
    'Firma seçin': '{t("platformTenants.selectFirm")}',
    'Durum': '{t("platformTenants.status")}',
    'Kod: ': '{t("platformTenants.codeColon")}',
    'Ayar güncelleme: ': '{t("platformTenants.settingUpdate")}',
    'Kullanıcı limiti kullanımı': '{t("platformTenants.userLimitUsage")}',
    'Askıya Al': '{t("platformTenants.suspendButton")}',
    'Firma Bilgileri ve Ayarları': '{t("platformTenants.firmDetailsAndSettings")}',
    'Mail Gönderim Kimliği': '{t("platformTenants.mailSendingId")}',
    'Platform (önerilen başlangıç)': '{t("platformTenants.platformSuggested")}',
    'Firma domain (white-label)': '{t("platformTenants.firmDomainWhiteLabel")}',
    'Mail Branding': '{t("platformTenants.mailBranding")}',
    'Ad Soyad': '{t("platformTenants.fullName")}',
    'Firmaya Lisans Ata': '{t("platformTenants.assignLicense")}',
    'Plan seçin': '{t("platformTenants.selectPlan")}',
    'Planlar ve Geçmiş': '{t("platformTenants.plansAndHistory")}',
    'Kullanıcı: ': '{t("platformTenants.userCountColon")}',
    'Modüller: ': '{t("platformTenants.modulesColon")}',
    'Kayıt yok': '{t("platformTenants.noRecord")}',
    'Kayıt: ': '{t("platformTenants.recordColon")}',
    'Filtreye uygun kayıt yok.': '{t("platformTenants.noRecordMatchingFilter")}'
}

REPLACEMENTS_PROCUREMENT = {
    'Satın alma verileri yükleniyor...': '{t("procurement.loading")}',
    'Onay Bekliyor': '{t("procurement.pendingApproval")}',
    'Onaylandı': '{t("procurement.approved")}',
    'Reddedildi': '{t("procurement.rejected")}',
    'Sipariş Verildi': '{t("procurement.ordered")}',
    'Teslim Alındı': '{t("procurement.received")}',
    'Malzeme': '{t("procurement.material")}',
    'Proje': '{t("procurement.project")}',
    'Miktar': '{t("procurement.quantity")}',
    'Durum': '{t("procurement.status")}',
    'Tarih': '{t("procurement.date")}',
    'Talep bulunamadı.': '{t("procurement.noRequestsFound")}',
    'PO No': '{t("procurement.poNo")}',
    'Tedarikçi': '{t("procurement.supplier")}',
    'Tutar': '{t("procurement.amount")}',
    'Beklenen Tarih': '{t("procurement.expectedDate")}',
    'Sipariş bulunamadı.': '{t("procurement.noOrdersFound")}',
    'Malzeme Talebi Oluştur': '{t("procurement.createMaterialRequest")}',
    'Malzeme *': '{t("procurement.materialRequired")}',
    'Proje Seçin (Opsiyonel)': '{t("procurement.selectProjectOptional")}',
    'Miktar *': '{t("procurement.quantityRequired")}',
    'Normal': '{t("procurement.priorityNormal")}',
    'Acil': '{t("procurement.priorityAcil")}',
    'Kritik': '{t("procurement.priorityKritik")}',
    'Talebi İncele': '{t("procurement.reviewRequest")}',
    'Malzeme:': '{t("procurement.materialColon")}',
    'Miktar:': '{t("procurement.quantityColon")}',
    'Not:': '{t("procurement.notesColon")}',
    'Not (Opsiyonel)': '{t("procurement.notesOptional")}',
    'Vazgeç': '{t("procurement.cancel")}',
    'Siparişi Teslim Al': '{t("procurement.receiveOrder")}',
    'PO No:': '{t("procurement.poNoColon")}',
    'Tedarikçi:': '{t("procurement.supplierColon")}',
    'Toplam Tutar:': '{t("procurement.totalAmountColon")}',
    'Kalem Sayısı:': '{t("procurement.itemCountColon")}',
    'Satın Alma Siparişi (PO) Oluştur': '{t("procurement.createPurchaseOrder")}',
    'PO Numarası *': '{t("procurement.poNumberRequired")}',
    'Hedef Depo *': '{t("procurement.targetWarehouseRequired")}',
    'Beklenen Teslim Tarihi': '{t("procurement.expectedDeliveryDate")}'
}

TARGETS = [
    {
        "path": os.path.join(FRONTEND_DIR, "app", "admin", "users", "page.tsx"),
        "replacements": REPLACEMENTS_USERS
    },
    {
        "path": os.path.join(FRONTEND_DIR, "app", "field-reports", "page.tsx"),
        "replacements": REPLACEMENTS_FIELD_REPORTS
    },
    {
        "path": os.path.join(FRONTEND_DIR, "app", "finance", "page.tsx"),
        "replacements": REPLACEMENTS_FINANCE
    },
    {
        "path": os.path.join(FRONTEND_DIR, "app", "inventory", "page.tsx"),
        "replacements": REPLACEMENTS_INVENTORY
    },
    {
        "path": os.path.join(FRONTEND_DIR, "app", "login", "page.tsx"),
        "replacements": REPLACEMENTS_LOGIN
    },
    {
        "path": os.path.join(FRONTEND_DIR, "app", "password-reset", "page.tsx"),
        "replacements": REPLACEMENTS_PASSWORD_RESET
    },
    {
        "path": os.path.join(FRONTEND_DIR, "app", "platform", "page.tsx"),
        "replacements": REPLACEMENTS_PLATFORM
    },
    {
        "path": os.path.join(FRONTEND_DIR, "app", "platform", "tenants", "page.tsx"),
        "replacements": REPLACEMENTS_TENANTS
    },
    {
        "path": os.path.join(FRONTEND_DIR, "app", "procurement", "page.tsx"),
        "replacements": REPLACEMENTS_PROCUREMENT
    }
]

def main():
    print("Starting exact string replacements for i18n...")
    for target in TARGETS:
        filepath = target["path"]
        replacements = target["replacements"]
        
        if not os.path.exists(filepath):
            print(f"File not found: {filepath}, skipping.")
            continue
            
        print(f"\nProcessing {os.path.basename(filepath)}...")
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            
        # Ensure import is present
        if "useTranslation" not in content:
            print("Injecting useTranslation import...")
            if "'use client'" in content:
                content = content.replace("'use client';", "'use client';\nimport { useTranslation } from '@/lib/i18n';")
            elif '"use client"' in content:
                content = content.replace('"use client";', '"use client";\nimport { useTranslation } from "@/lib/i18n";')
            else:
                content = "import { useTranslation } from '@/lib/i18n';\n" + content
                
        # Ensure hook is declared
        if "const { t } = useTranslation()" not in content:
            print("Injecting hook declaration...")
            import re
            # Matches export default function PageName() { or export default function PageName(props) {
            func_match = re.search(r'export default function \w+\(.*?\)\s*\{', content)
            if func_match:
                matched_str = func_match.group(0)
                content = content.replace(matched_str, matched_str + "\n  const { t } = useTranslation();")
            else:
                # PasswordResetContent fallback
                func_match2 = re.search(r'function PasswordResetPageContent\(\)\s*\{', content)
                if func_match2:
                    matched_str = func_match2.group(0)
                    content = content.replace(matched_str, matched_str + "\n  const { t } = useTranslation();")
                else:
                    print("Warning: Could not find component signature to inject hook!")
                
        # Apply exact replacements
        replaced_count = 0
        for turkish, replacement in replacements.items():
            if turkish in content:
                content = content.replace(turkish, replacement)
                replaced_count += 1
            else:
                # Try with slightly different whitespaces/quotes if any
                pass
                
        print(f"Replaced {replaced_count} out of {len(replacements)} hardcoded Turkish strings.")
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
            
        print(f"Successfully processed {os.path.basename(filepath)}")

if __name__ == "__main__":
    main()
