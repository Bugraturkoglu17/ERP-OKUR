from __future__ import annotations

from dataclasses import dataclass

from app.db.models import Tenant


@dataclass
class MailContent:
    template: str
    subject: str
    text: str
    html: str


def _brand(title: str, body_html: str, accent_color: str = "#3b82f6") -> str:
    """Wraps body HTML in a premium, responsive corporate email layout."""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 30px 10px;">
    <tr>
      <td align="center">
        <!-- Card Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.025); border: 1px solid #e2e8f0; overflow: hidden; text-align: left;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 32px 40px; border-bottom: 3px solid {accent_color};">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: {accent_color}; display: block; margin-bottom: 4px;">SİSMİK Kurumsal Operasyon Sistemi</span>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">{title}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Body Content -->
          <tr>
            <td style="padding: 40px; background-color: #ffffff;">
              <div style="font-size: 15px; line-height: 1.6; color: #334155;">
                {body_html}
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 600; color: #64748b;">SİSMİK</p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.5;">Bu e-posta platform üzerinden otomatik olarak gönderilmiştir.<br/>Lütfen doğrudan bu e-postaya yanıt vermeyiniz.</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def tenant_admin_provisioned_mail(*, tenant: Tenant, full_name: str, temporary_password: str) -> MailContent:
    _ = temporary_password
    subject = f"{tenant.name} ERP - Yönetici Hesabınız Oluşturuldu"
    text = (
        f"Sayın {full_name},\n\n"
        f"{tenant.name} firması için SİSMİK Kurumsal Operasyon Sistemi üzerinde yetkili yönetici hesabınız başarıyla tanımlanmıştır.\n\n"
        "Erişim Bilgileriniz:\n"
        f"- Firma Adı: {tenant.name}\n"
        f"- Yönetici: {full_name}\n"
        "- Durum: Aktif / Hazır\n\n"
        "Güvenlik önlemleri gereği geçici parolanız e-posta ile gönderilmemiştir. "
        "Lütfen geçici parolanızı platform yöneticinizden güvenli bir kanal vasıtasıyla talep ediniz. "
        "Sisteme ilk giriş yaptığınızda geçici parolanızı değiştirmeniz istenecektir.\n\n"
        "İyi çalışmalar dileriz,\n"
        "SİSMİK Sistem Ekibi"
    )
    html = _brand(
        title="Yönetici Hesabınız Oluşturuldu",
        body_html=(
            f"<p>Sayın <strong>{full_name}</strong>,</p>"
            f"<p><strong>{tenant.name}</strong> firması için SİSMİK Kurumsal Operasyon Sistemi üzerinde yetkili yönetici hesabınız başarıyla tanımlanmıştır.</p>"
            f"<div style=\"background-color: #f1f5f9; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 20px; margin: 24px 0;\">"
            f"  <p style=\"margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; font-weight: 600;\">Hesap Detayları</p>"
            f"  <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"font-size: 14px; color: #334155;\">"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; width: 120px; font-weight: 600;\">Firma Adı:</td>"
            f"      <td style=\"padding: 4px 0; color: #0f172a;\">{tenant.name}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; font-weight: 600;\">Yönetici:</td>"
            f"      <td style=\"padding: 4px 0; color: #0f172a;\">{full_name}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; font-weight: 600;\">Hesap Durumu:</td>"
            f"      <td style=\"padding: 4px 0; color: #10b981; font-weight: 600;\">Aktif / Hazır</td>"
            f"    </tr>"
            f"  </table>"
            f"</div>"
            f"<p style=\"margin: 20px 0 0 0;\">Güvenlik önlemleri gereği geçici parola bilginiz e-posta içeriğinde <strong>paylaşılmamıştır</strong>.</p>"
            f"<p style=\"margin: 10px 0 0 0;\">Parolanızı almak için lütfen platform yöneticinizle <strong>güvenli bir iletişim kanalı</strong> üzerinden irtibata geçiniz.</p>"
            f"<p style=\"margin: 10px 0 0 0;\">Güvenlik kuralları gereği, sisteme ilk girişiniz esnasında geçici parolanızı kişisel şifrenizle güncellemeniz istenecektir.</p>"
        ),
        accent_color="#3b82f6"
    )
    return MailContent(template="tenant_admin_provisioned", subject=subject, text=text, html=html)


def tenant_admin_password_reset_mail(*, tenant: Tenant, full_name: str, temporary_password: str) -> MailContent:
    _ = temporary_password
    subject = f"{tenant.name} ERP - Yönetici Parolanız Sıfırlandı"
    text = (
        f"Sayın {full_name},\n\n"
        f"{tenant.name} ERP platformu üzerindeki yönetici hesabınızın parolası sıfırlanmıştır.\n\n"
        "Güvenlik önlemleri gereği yeni geçici parolanız e-posta ile gönderilmemiştir. "
        "Lütfen geçici parolanızı platform yöneticinizden güvenli bir kanal vasıtasıyla talep ediniz. "
        "İlk girişiniz esnasında sistem sizden yeni ve güvenli bir kişisel parola belirlemenizi isteyecektir.\n\n"
        "İyi çalışmalar dileriz,\n"
        "SİSMİK Sistem Ekibi"
    )
    html = _brand(
        title="Parolanız Sıfırlandı",
        body_html=(
            f"<p>Sayın <strong>{full_name}</strong>,</p>"
            f"<p><strong>{tenant.name}</strong> ERP platformu üzerindeki yönetici hesabınızın parolası sıfırlanmıştır.</p>"
            f"<div style=\"background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 24px 0;\">"
            f"  <p style=\"margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #78350f; font-weight: 600;\">Güvenlik Bilgilendirmesi</p>"
            f"  <p style=\"margin: 0; font-size: 14px; color: #92400e;\">Yeni geçici parolanız güvenlik tedbirleri nedeniyle bu e-postada yer almamaktadır. Lütfen geçici parolanızı güvenli bir kanal vasıtasıyla platform yöneticinizden talep ediniz.</p>"
            f"</div>"
            f"<p style=\"margin: 20px 0 0 0;\">Sisteme ilk girişiniz esnasında güvenlik kuralları uyarınca yeni ve güçlü bir kişisel parola belirlemeniz talep edilecektir.</p>"
        ),
        accent_color="#f59e0b"
    )
    return MailContent(template="tenant_admin_password_reset", subject=subject, text=text, html=html)


def tenant_status_changed_mail(*, tenant: Tenant, status: str, is_active: bool) -> MailContent:
    state = "Aktif" if is_active else "Pasif"
    subject = f"{tenant.name} ERP - Firma Durumu Güncellendi"
    text = (
        f"Merhaba,\n\n"
        f"{tenant.name} firması için platform durumu ve erişim yetkileri güncellenmiştir.\n\n"
        f"- Firma: {tenant.name}\n"
        f"- Güncel Durum: {status}\n"
        f"- Erişim Durumu: {state}\n\n"
        "Herhangi bir sorunuz olması durumunda lütfen sistem yöneticiniz ile iletişime geçiniz."
    )
    html = _brand(
        title="Firma Durumu Güncellendi",
        body_html=(
            f"<p>Merhaba,</p>"
            f"<p>Geliştirici admin tarafından <strong>{tenant.name}</strong> firmasının sistem erişim ve lisans durumu güncellenmiştir.</p>"
            f"<div style=\"background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;\">"
            f"  <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"font-size: 14px; color: #334155;\">"
            f"    <tr>"
            f"      <td style=\"padding: 6px 0; width: 140px; font-weight: 600;\">Firma Adı:</td>"
            f"      <td style=\"padding: 6px 0; color: #0f172a; font-weight: 600;\">{tenant.name}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 6px 0; font-weight: 600;\">Güncel Durum:</td>"
            f"      <td style=\"padding: 6px 0;\">"
            f"        <span style=\"background-color: #dbeafe; color: #1e40af; font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 4px; text-transform: uppercase;\">{status}</span>"
            f"      </td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 6px 0; font-weight: 600;\">Erişim Durumu:</td>"
            f"      <td style=\"padding: 6px 0; color: {'#10b981' if is_active else '#ef4444'}; font-weight: 700;\">{state.upper()}</td>"
            f"    </tr>"
            f"  </table>"
            f"</div>"
            f"<p style=\"margin: 20px 0 0 0;\">Firma lisans veya erişim durumuna dair sorularınız için lütfen sistem yöneticiniz ile iletişime geçiniz.</p>"
        ),
        accent_color="#3b82f6"
    )
    return MailContent(template="tenant_status_changed", subject=subject, text=text, html=html)


def project_assignment_mail(*, tenant: Tenant, project_name: str, assignee_name: str, assigned_by: str) -> MailContent:
    subject = f"{tenant.name} ERP - Proje Görevlendirmesi Yapıldı"
    text = (
        f"Merhaba {assignee_name},\n\n"
        f"{project_name} projesinde görevlendirildiniz.\n\n"
        f"- Proje Adı: {project_name}\n"
        f"- Görevlendiren: {assigned_by}\n\n"
        "Proje ile ilgili teknik detaylara, dökümanlara ve malzeme hareketlerine erişmek için ERP paneline giriş yapabilirsiniz."
    )
    html = _brand(
        title="Proje Ataması Yapıldı",
        body_html=(
            f"<p>Merhaba <strong>{assignee_name}</strong>,</p>"
            f"<p>SİSMİK Kurumsal Operasyon Sistemi üzerinden yeni bir projede görevlendirmeniz gerçekleştirilmiştir.</p>"
            f"<div style=\"background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 6px; padding: 20px; margin: 24px 0;\">"
            f"  <p style=\"margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #166534; font-weight: 600;\">Görevlendirme Detayları</p>"
            f"  <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"font-size: 14px; color: #334155;\">"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; width: 140px; font-weight: 600;\">Atanan Proje:</td>"
            f"      <td style=\"padding: 4px 0; color: #0f172a; font-weight: 600;\">{project_name}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; font-weight: 600;\">Görevlendiren:</td>"
            f"      <td style=\"padding: 4px 0; color: #0f172a;\">{assigned_by}</td>"
            f"    </tr>"
            f"  </table>"
            f"</div>"
            f"<p style=\"margin: 20px 0 0 0;\">Proje kapsamında paylaşılan son revizyon projelerine, teknik dökümanlara ve malzeme listelerine erişmek için ERP paneline giriş yapabilirsiniz.</p>"
        ),
        accent_color="#16a34a"
    )
    return MailContent(template="project_assignment", subject=subject, text=text, html=html)


def invoice_created_mail(*, tenant: Tenant, invoice_no: str, title: str, due_date: str | None, amount: str) -> MailContent:
    subject = f"{tenant.name} ERP - Yeni Fatura Oluşturuldu ({invoice_no})"
    due_text = due_date or "Belirtilmemiş"
    text = (
        "Merhaba,\n\n"
        f"Sistemde {tenant.name} adına yeni bir fatura kaydı oluşturulmuştur.\n\n"
        f"- Fatura No: {invoice_no}\n"
        f"- Başlık: {title}\n"
        f"- Son Ödeme Tarihi: {due_text}\n"
        f"- Toplam Tutar: {amount}\n\n"
        "Fatura finansal detaylarını ve ödeme aşamalarını ERP finans modülü üzerinden inceleyebilirsiniz."
    )
    html = _brand(
        title="Yeni Fatura Oluşturuldu",
        body_html=(
            f"<p>Sayın Yetkili,</p>"
            f"<p>Sistemde <strong>{tenant.name}</strong> firması adına yeni bir fatura kaydı oluşturulmuştur.</p>"
            f"<div style=\"background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;\">"
            f"  <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"font-size: 14px; color: #334155;\">"
            f"    <tr>"
            f"      <td style=\"padding: 6px 0; width: 140px; font-weight: 600;\">Fatura No:</td>"
            f"      <td style=\"padding: 6px 0; color: #0f172a; font-weight: 600; font-family: monospace;\">{invoice_no}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 6px 0; font-weight: 600;\">Fatura Başlığı:</td>"
            f"      <td style=\"padding: 6px 0; color: #0f172a;\">{title}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 6px 0; font-weight: 600;\">Vade Tarihi:</td>"
            f"      <td style=\"padding: 6px 0; color: #475569;\">{due_text}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 6px 0; font-weight: 600;\">Toplam Tutar:</td>"
            f"      <td style=\"padding: 6px 0; color: #2563eb; font-weight: 700; font-size: 16px;\">{amount}</td>"
            f"    </tr>"
            f"  </table>"
            f"</div>"
            f"<p style=\"margin: 20px 0 0 0;\">Faturanın detaylarını görüntülemek ve ödeme süreçlerini takip etmek için ERP finans modülünü kullanabilirsiniz.</p>"
        ),
        accent_color="#2563eb"
    )
    return MailContent(template="invoice_created", subject=subject, text=text, html=html)


def invoice_due_soon_mail(*, tenant: Tenant, invoice_no: str, due_date: str, days_left: int, amount: str) -> MailContent:
    subject = f"{tenant.name} ERP - Fatura Vadesi Yaklaşıyor ({invoice_no})"
    text = (
        "Merhaba,\n\n"
        f"Finans takibiniz uyarınca, {invoice_no} numaralı faturanın vadesine {days_left} gün kalmıştır.\n\n"
        f"- Fatura No: {invoice_no}\n"
        f"- Son Ödeme Tarihi: {due_date}\n"
        f"- Kalan Süre: {days_left} Gün\n"
        f"- Tutar: {amount}\n\n"
        "Ödemelerin zamanında yapılması süreçlerinizin kesintisiz devamı için önem arz etmektedir."
    )
    html = _brand(
        title="Fatura Vadesi Yaklaşıyor",
        body_html=(
            f"<p>Sayın Yetkili,</p>"
            f"<p>Finansal takipleriniz kapsamında, sistemde kayıtlı olan faturanın son ödeme tarihinin yaklaştığını bildirmek isteriz.</p>"
            f"<div style=\"background-color: #fff7ed; border-left: 4px solid #ea580c; border-radius: 6px; padding: 20px; margin: 24px 0;\">"
            f"  <p style=\"margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #c2410c; font-weight: 600;\">Vade Hatırlatması</p>"
            f"  <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"font-size: 14px; color: #334155;\">"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; width: 140px; font-weight: 600;\">Fatura No:</td>"
            f"      <td style=\"padding: 4px 0; color: #0f172a; font-weight: 600; font-family: monospace;\">{invoice_no}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; font-weight: 600;\">Vade Tarihi:</td>"
            f"      <td style=\"padding: 4px 0; color: #0f172a; font-weight: 600;\">{due_date}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; font-weight: 600;\">Kalan Süre:</td>"
            f"      <td style=\"padding: 4px 0; color: #ea580c; font-weight: 700;\">{days_left} Gün</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; font-weight: 600;\">Toplam Tutar:</td>"
            f"      <td style=\"padding: 4px 0; color: #0f172a; font-weight: 700;\">{amount}</td>"
            f"    </tr>"
            f"  </table>"
            f"</div>"
            f"<p style=\"margin: 20px 0 0 0;\">Gecikme faizlerinin veya hizmet kesintilerinin önlenmesi adına, vadesi gelen ödemelerin zamanında gerçekleştirilmesi önem arz etmektedir.</p>"
        ),
        accent_color="#ea580c"
    )
    return MailContent(template="invoice_due_soon", subject=subject, text=text, html=html)


def low_stock_alert_mail(*, tenant: Tenant, material_name: str, sku: str, current_stock: float, min_level: float) -> MailContent:
    subject = f"{tenant.name} ERP - Kritik Stok Seviyesi Uyarısı ({sku})"
    text = (
        "Merhaba,\n\n"
        f"Depo malzeme stok takiplerinde, {material_name} ({sku}) için kritik minimum eşik altına inildiği tespit edilmiştir.\n\n"
        f"- Malzeme: {material_name}\n"
        f"- Ürün Kodu (SKU): {sku}\n"
        f"- Mevcut Stok: {current_stock}\n"
        f"- Eşik Seviyesi: {min_level}\n\n"
        "Şantiye ve montaj süreçlerinin aksamaması adına ilgili malzemenin tedarik süreçlerini planlamanızı öneririz."
    )
    html = _brand(
        title="Kritik Stok Uyarısı",
        body_html=(
            f"<p>Sayın Yetkili,</p>"
            f"<p>Depolarınızda yer alan bir malzemenin stok seviyesinin kritik eşik değerin altına düştüğü tespit edilmiştir.</p>"
            f"<div style=\"background-color: #fef2f2; border-left: 4px solid #dc2626; border-radius: 6px; padding: 20px; margin: 24px 0;\">"
            f"  <p style=\"margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #991b1b; font-weight: 600;\">Stok Uyarı Detayları</p>"
            f"  <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"font-size: 14px; color: #334155;\">"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; width: 140px; font-weight: 600;\">Malzeme Adı:</td>"
            f"      <td style=\"padding: 4px 0; color: #0f172a; font-weight: 600;\">{material_name}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; font-weight: 600;\">SKU (Ürün Kodu):</td>"
            f"      <td style=\"padding: 4px 0; color: #0f172a; font-family: monospace;\">{sku}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; font-weight: 600;\">Mevcut Stok:</td>"
            f"      <td style=\"padding: 4px 0; color: #dc2626; font-weight: 700;\">{current_stock}</td>"
            f"    </tr>"
            f"    <tr>"
            f"      <td style=\"padding: 4px 0; font-weight: 600;\">Eşik Değer (Min):</td>"
            f"      <td style=\"padding: 4px 0; color: #475569;\">{min_level}</td>"
            f"    </tr>"
            f"  </table>"
            f"</div>"
            f"<p style=\"margin: 20px 0 0 0;\">Proje saha montaj ve uygulama operasyonlarında gecikme yaşanmaması adına, en kısa sürede ilgili malzeme için tedarik ve satın alma süreçlerinin başlatılması önerilmektedir.</p>"
        ),
        accent_color="#dc2626"
    )
    return MailContent(template="inventory_low_stock", subject=subject, text=text, html=html)

