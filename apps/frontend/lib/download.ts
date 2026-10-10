/**
 * Dosyayı gerçekten cihaza indirir (sadece açmaz).
 *
 * `<a download>` özelliği SADECE aynı origin'deki linklerde çalışır — backend
 * (localhost:8001 / farklı bir domain) origin'inden gelen dosya URL'lerinde
 * tarayıcılar `download` özelliğini sessizce yok sayıp linki normal bir
 * navigasyon/yeni sekme gibi açar. Bunu önlemek için dosyayı blob olarak
 * fetch edip, sayfanın KENDİ origin'inde bir blob: URL oluşturuyoruz —
 * `download` özelliği blob: URL'lerde her zaman çalışır.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`İndirme başarısız (${res.status})`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Bellek sızıntısını önlemek için blob URL'yi tarayıcının indirmeyi
    // başlatmasına yetecek kısa bir gecikmeyle serbest bırak.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  } catch (err) {
    // Depolama (OCI) bucket'ı CORS izni vermiyorsa fetch() sessizce reddedilir
    // — bu durumda blob hilesi hiç çalışamaz. Düz navigasyona düş: URL zaten
    // sunucu tarafından (Content-Disposition: attachment) zorlanan bir
    // indirme URL'iyse yine native "kaydet" diyaloğu açılır; değilse en
    // azından dosya yeni sekmede açılır — sessiz, hiçbir şey olmayan bir
    // tıklamadan çok daha iyi.
    if (err instanceof TypeError) {
      window.location.href = url;
      return;
    }
    throw err;
  }
}

/** Telefon/tablet veya ana ekrana eklenmiş uygulama (PWA standalone) mı. */
export function isMobileOrInstalledApp(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

/**
 * Dosyayı yeni sekmede açar; `getUrl` imzalı dosya adresini sunucudan alır.
 *
 * Sekme, bu fonksiyon çağrıldığı anda — ilk await'ten ÖNCE — açılır:
 * mobil Safari/Chrome, API yanıtını bekledikten sonra çağrılan window.open'ı
 * pop-up sayıp sessizce engelliyor. Bu yüzden tıklama işleyicisinden,
 * araya başka bir await girmeden çağrılmalıdır.
 */
type UrlGetter = () => Promise<string | null | undefined>;

export async function openFileInNewTab(getUrl: UrlGetter): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const url = await getUrl();
    if (!url) throw new Error("Dosya bağlantısı alınamadı.");
    if (tab) {
      tab.opener = null;
      tab.location.replace(url);
    } else {
      window.location.assign(url);
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/**
 * Dosyayı indirir. Masaüstünde downloadFile ile; telefonda ve ana ekrana
 * eklenmiş uygulamada ise indirme bağlantısına uygulama penceresinde gitmek
 * hiçbir şey yapmadığı için dosya yeni sekmede açılır (indirmeyi tarayıcı
 * yapar). openFileInNewTab ile aynı kural: araya await girmeden çağrılmalı.
 */
export async function downloadFromUrl(getUrl: UrlGetter, filename: string): Promise<void> {
  if (isMobileOrInstalledApp()) {
    await openFileInNewTab(getUrl);
    return;
  }
  const url = await getUrl();
  if (!url) throw new Error("Dosya bağlantısı alınamadı.");
  await downloadFile(url, filename);
}
