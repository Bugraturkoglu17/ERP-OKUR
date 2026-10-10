import { redirect } from "next/navigation";

/**
 * Kullanıcı işlemleri gerçek backend'e bağlı /admin/users ekranındaki
 * modal üzerinden yürütülür. Eski yerel/mock detay ekranını production
 * akışına sokmamak için tarihî detay URL'lerini güvenli listeye yönlendir.
 */
export default function AdminUserDetailRedirect() {
  redirect("/admin/users");
}
