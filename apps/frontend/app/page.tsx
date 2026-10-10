import { RootRedirectFallback } from "@/components/auth/root-redirect-fallback";
import { buildRootRedirectScript } from "@/lib/root-redirect";

const ROOT_REDIRECT_SCRIPT = buildRootRedirectScript();

export default function Page() {
  // Kök (/) yalnızca bir geçiş noktası: oturum varsa panele, yoksa girişe.
  // Yönlendirme, JS bundle'larının inip React'in hydrate olmasını beklemeden
  // HTML içindeki inline script ile yapılır — önceden bu bekleme süresince
  // logosuz düz koyu bir ekran görünüyordu. Koyu katman, geçiş anında
  // görünen tek karedir (zemin rengi .erp-launch-screen ve <body> ile aynı);
  // açılış animasyonu yalnızca hedef rotanın RoleGuard'ında BİR KEZ oynar.
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-[60] bg-[#09111b]" />
      <script dangerouslySetInnerHTML={{ __html: ROOT_REDIRECT_SCRIPT }} />
      <RootRedirectFallback />
    </>
  );
}
