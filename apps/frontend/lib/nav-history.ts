// Uygulama içi gezinme geçmişi (sekme başına, sessionStorage). "Geri" bağlantıları sabit bir listeye
// değil, kullanıcının geldiği sayfaya döner: projeden açılan iş emrinde geri → o proje.

const KEY = "nav:stack";
const MAX = 30;

// Kaydedilip bitmiş "yeni kayıt" formları geri dönüşte atlanır (geri → formdan önceki sayfa).
const FORM_PAGE = /\/yeni(?:[/?]|$)/;

function read(): string[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch { return []; }
}

function write(stack: string[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-MAX))); } catch { /* depolama kapalıysa geçmiş tutulmaz */ }
}

/**
 * Her sayfa değişiminde çağrılır. Sayfa geçmişte zaten varsa oraya geri dönülmüştür: geçmiş o noktaya
 * kısalır (böylece birkaç adım sonra da "geri" doğru sayfayı bulur); yoksa yeni sayfa eklenir.
 */
export function recordVisit(path: string) {
  const stack = read();
  const index = stack.lastIndexOf(path);
  if (index === stack.length - 1 && index >= 0) return;
  write(index >= 0 ? stack.slice(0, index + 1) : [...stack, path]);
}

/** Şu anki sayfa router.replace ile değiştirilecekse (ör. kaydedilmiş form → oluşan kayıt) geçmişten çıkarılır. */
export function forgetCurrent(current: string) {
  const stack = read();
  if (stack[stack.length - 1] === current) write(stack.slice(0, -1));
}

/**
 * Şu anki sayfadan önce ziyaret edilen uygulama sayfası. Sayfa henüz geçmişe yazılmadıysa (ilk çizimde)
 * geçmişin son kaydı bir önceki sayfadır. Giriş ekranı ve (şu anki sayfa değilse) "yeni kayıt" formları atlanır.
 * immediate: hedef, tarayıcı geçmişinde hemen bir önceki kayıt mı (öyleyse tarayıcı geri kullanılır).
 */
export function previousPath(current: string): { path: string; immediate: boolean } | null {
  const stack = read();
  const index = stack.lastIndexOf(current);
  const before = index >= 0 ? stack.slice(0, index) : stack.filter((item) => item !== current);
  for (let i = before.length - 1; i >= 0; i--) {
    const candidate = before[i];
    if (candidate.startsWith("/login") || (FORM_PAGE.test(candidate) && candidate !== current)) continue;
    return { path: candidate, immediate: i === before.length - 1 };
  }
  return null;
}

const LABELS: [RegExp, string][] = [
  [/^\/(manager|user)\/projeler\/yeni/, "Yeni Proje"],
  [/^\/(manager|user)\/projeler\/[^/]+/, "Proje"],
  [/^\/(manager|user)\/projeler/, "Projeler"],
  [/^\/user\/proje-gorevleri\/[^/]+/, "Proje görevi"],
  [/^\/user\/proje-gorevleri/, "Proje Görevlerim"],
  [/^\/manager\/is-emirleri\/yeni/, "Yeni İş Emri"],
  [/^\/(manager\/is-emirleri|is-emirleri|user\/islerim)\/[^/]+/, "İş emri"],
  [/^\/(manager\/is-emirleri|is-emirleri)/, "İş Emirleri"],
  [/^\/user\/islerim/, "İşlerim"],
  [/^\/(manager|user)\/magaza-karti\/[^/]+/, "Mağaza kartı"],
  [/^\/(manager|user)\/magaza-karti/, "Mağaza Kartı"],
  [/^\/(manager|user)\/depo-stok/, "Depo & Stok"],
  [/^\/(manager|user)\/taseron/, "Taşeron Kartları"],
  [/^\/(manager|admin)\/istatistik/, "İstatistikler"],
  [/^\/(manager|admin|user)\/dashboard/, "Genel Bakış"],
  [/^\/bakim\/magazalar\/[^/]+/, "Bakım mağazası"],
  [/^\/bakim\/magazalar/, "Bakım Mağazaları"],
];

/** Sayfa yolunun ekranda okunur adı ("← Proje" gibi). */
export function labelForPath(path: string): string {
  const pathname = path.split("?")[0];
  return LABELS.find(([pattern]) => pattern.test(pathname))?.[1] ?? "Geri";
}
