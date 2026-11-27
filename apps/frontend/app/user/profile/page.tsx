"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Avatar, AvatarFallback } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Spinner } from "@/components/shadcn/spinner";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  default_role: string;
  discipline?: string;
  is_active: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  user: "Kullanıcı",
  saha_muhendisi: "Kullanıcı",
  manager: "Yönetici",
  admin: "Yönetici",
  platform_admin: "Geliştirici Admin",
};

export default function UserProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<UserProfile>("/auth/me")
      .then((p) => {
        setProfile(p);
        setPhone(p.phone ?? "");
        setFullName(p.full_name);
        setEmail(/^hesap-[^@]+@[^@]+\.local$/.test(p.email) ? "" : p.email);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    setError("");
    if (!fullName.trim() || !phone.trim()) { setError("Ad soyad ve telefon boş olamaz."); return; }
    setSaving(true);
    try {
      const updated = await apiPatch<UserProfile>("/auth/me", { full_name: fullName.trim(), phone: phone.trim(), ...(email.trim() ? { email: email.trim() } : {}) });
      setProfile(updated);
      setPhone(updated.phone ?? "");
      setFullName(updated.full_name);
      setEmail(/^hesap-[^@]+@[^@]+\.local$/.test(updated.email) ? "" : updated.email);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (cause) {
      const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "Profil güncellenemedi.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner className="size-6" /></div>;
  }

  if (!profile) {
    return <Alert variant="destructive" className="max-w-md"><AlertDescription>Profil yüklenemedi.</AlertDescription></Alert>;
  }

  return (
    <div className="flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Profilim<InfoHint text="Kişisel bilgileriniz" /></h1>

      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <Avatar className="size-14"><AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">{profile.full_name.slice(0, 2).toLocaleUpperCase("tr-TR")}</AvatarFallback></Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{profile.full_name}</p>
            <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
            <Badge variant="info" className="mt-1">{ROLE_LABEL[profile.default_role] ?? profile.default_role}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-5 pb-0 pt-5"><CardTitle className="text-sm">Bilgilerimi Düzenle</CardTitle></CardHeader>
        <CardContent className="p-5">
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="profil-ad">Ad Soyad</FieldLabel>
              <Input id="profil-ad" type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="profil-eposta">E-posta</FieldLabel>
              <Input id="profil-eposta" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-posta isteğe bağlı" />
            </Field>
            <Field>
              <FieldLabel htmlFor="profil-tel">Telefon</FieldLabel>
              <Input id="profil-tel" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+90 5xx xxx xx xx" />
              <FieldDescription>Telefonu değiştirdiğinizde yeni numaranızla giriş yapabilirsiniz.</FieldDescription>
            </Field>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Button onClick={() => void handleSave()} disabled={saving} className={cn("w-full", saved && "bg-emerald-600 hover:bg-emerald-600")}>
              {saving ? <Spinner data-icon="inline-start" /> : saved && <Check data-icon="inline-start" />}
              {saved ? "Kaydedildi" : "Kaydet"}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
