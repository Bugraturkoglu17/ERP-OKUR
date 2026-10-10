import { redirect } from "next/navigation";

export default function AdminNewUserRedirect() {
  redirect("/admin/users");
}
