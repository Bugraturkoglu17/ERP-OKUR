import { redirect } from "next/navigation";

/** Denetim kaydı modülü yayına alınana kadar geçici ekran gösterme. */
export default function AdminAuditLogsPage() {
  redirect("/admin/dashboard");
}
