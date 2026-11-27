"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Eye, EyeOff, Info, KeyRound, Mail, MoreHorizontal, Phone, Plus, Search, ShieldCheck, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/shadcn/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Separator } from "@/components/shadcn/separator";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";

type UserRow = { id: string; full_name: string; email: string; phone?: string; is_active: boolean; default_role?: string; force_password_change: boolean; onboarding_complete: boolean };
type FormState = { first_name: string; last_name: string; email: string; phone: string; password: string; role: "user" | "manager"; is_active: boolean };
type Confirm = { kind: "delete" | "reset"; user: UserRow };
type BadgeVariant = "success" | "muted" | "warning" | "info" | "secondary";

const emptyForm: FormState = { first_name: "", last_name: "", email: "", phone: "", password: "", role: "user", is_active: true };

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return { first_name: parts.shift() ?? "", last_name: parts.join(" ") };
}

function uiRole(user: UserRow) {
  if ((user.default_role ?? "").includes("platform_admin")) return "ADMIN";
  if (["admin", "manager"].includes(user.default_role ?? "")) return "MANAGER";
  return "USER";
}

function displayName(user: UserRow) {
  return uiRole(user) === "ADMIN" ? "Geliştirici Admin" : user.full_name;
}

const initialsOf = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("").toLocaleUpperCase("tr-TR");
const roleLabelOf = (role: string) => role === "ADMIN" ? "Geliştirici Admin" : role === "MANAGER" ? "Yönetici" : "Kullanıcı";
const statusOf = (user: UserRow) => !user.is_active ? "Pasif" : user.force_password_change || !user.onboarding_complete ? "İlk giriş bekliyor" : "Aktif";
const STATUS_BADGE: Record<string, BadgeVariant> = { "Aktif": "success", "Pasif": "muted", "İlk giriş bekliyor": "warning" };
const ROLE_BADGE: Record<string, BadgeVariant> = { ADMIN: "secondary", MANAGER: "info", USER: "muted" };

function errorMessage(cause: unknown) {
  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : cause instanceof Error ? cause.message : "İşlem tamamlanamadı.";
}

type Action = { key: string; label: string; icon: typeof Info; onClick: () => void; danger?: boolean };

function RowActions({ actions, label }: { actions: Action[]; label: string }) {
  const main = actions.filter((a) => !a.danger);
  const danger = actions.filter((a) => a.danger);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`${label} işlemleri`}><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          {main.map(({ key, label: text, icon: Icon, onClick }) => <DropdownMenuItem key={key} onSelect={onClick}><Icon />{text}</DropdownMenuItem>)}
        </DropdownMenuGroup>
        {danger.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {danger.map(({ key, label: text, icon: Icon, onClick }) => (
                <DropdownMenuItem key={key} onSelect={onClick} className="text-destructive focus:text-destructive"><Icon />{text}</DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProtectedMark({ title }: { title: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="text-muted-foreground" aria-label={title}><ShieldCheck className="size-4" /></span></TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

export default function ManagerUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [infoUser, setInfoUser] = useState<UserRow | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [issuedPassword, setIssuedPassword] = useState<{ name: string; password: string } | null>(null);

  const load = async () => {
    try {
      const data = await apiGet<UserRow[]>("/auth/users");
      setUsers(Array.isArray(data) ? data : []);
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return users.filter((user) => `${user.full_name} ${user.email} ${user.phone ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [query, users]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormError(""); setModalOpen(true); };
  const openEdit = (user: UserRow) => {
    const name = splitName(user.full_name);
    setEditing(user);
    setForm({ ...emptyForm, ...name, email: /^hesap-[^@]+@[^@]+\.local$/.test(user.email) ? "" : user.email, phone: user.phone ?? "", role: uiRole(user) === "MANAGER" ? "manager" : "user", is_active: user.is_active });
    setFormError("");
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return setFormError("Ad ve soyad zorunludur.");
    if (!form.phone.trim()) return setFormError("Telefon numarası zorunludur.");
    if (!editing && form.password.length < 8) return setFormError("Geçici şifre en az 8 karakter olmalıdır.");
    setSaving(true);
    setFormError("");
    try {
      const payload = { full_name: `${form.first_name.trim()} ${form.last_name.trim()}`, phone: form.phone.trim(), roles: [form.role], is_active: form.is_active };
      if (editing) await apiPatch(`/auth/users/${editing.id}`, currentUser?.role === "ADMIN" ? payload : { full_name: payload.full_name, phone: payload.phone, is_active: payload.is_active });
      else await apiPost("/auth/users", { ...payload, email: form.email.trim() || null, password: form.password, discipline: null, discipline_only: false });
      setModalOpen(false);
      await load();
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: UserRow) => {
    try { await apiPatch(`/auth/users/${user.id}`, { is_active: !user.is_active }); await load(); }
    catch (cause) { setError(errorMessage(cause)); }
  };

  const remove = async (user: UserRow) => {
    setError("");
    setNotice("");
    try {
      const res = await apiDelete(`/auth/users/${user.id}`) as { message?: string; hard_deleted?: boolean } | undefined;
      await load();
      // Kalıcı silinemeyip pasifleştirildiyse kullanıcıyı bilgilendir.
      if (res && res.hard_deleted === false && res.message) setNotice(res.message);
    }
    catch (cause) { setError(errorMessage(cause)); }
  };

  const resetPassword = async (user: UserRow) => {
    setError("");
    try {
      const result = await apiPost<{ temporary_password: string }>(`/auth/users/${user.id}/temporary-password`);
      setIssuedPassword({ name: user.full_name, password: result.temporary_password });
      await load();
    } catch (cause) { setError(errorMessage(cause)); }
  };

  // Her satırın verisi BİR kez hesaplanır; telefon listesi ve masaüstü tablosu aynı veriyi kullanır.
  const rows = filtered.map((user) => {
    const role = uiRole(user);
    const protectedAdmin = role === "ADMIN";
    const protectedManager = role === "MANAGER" && currentUser?.role !== "ADMIN";
    const isProtected = protectedAdmin || protectedManager;
    const isSelf = user.id === currentUser?.id;
    const visibleName = displayName(user);
    const status = statusOf(user);
    const actions: Action[] = [
      { key: "info", label: "Bilgiler", icon: Info, onClick: () => setInfoUser(user) },
      ...(isProtected ? [] : [
        { key: "edit", label: "Düzenle", icon: Edit3, onClick: () => openEdit(user) },
        ...(!isSelf ? [{ key: "reset-password", label: "Geçici şifre oluştur", icon: KeyRound, onClick: () => setConfirm({ kind: "reset", user }) }] : []),
      ]),
      ...(!isProtected && !isSelf ? [
        { key: "toggle", label: user.is_active ? "Pasif yap" : "Aktif yap", icon: user.is_active ? UserX : UserCheck, onClick: () => void toggleActive(user) },
        { key: "delete", label: "Hesabı sil", icon: Trash2, danger: true, onClick: () => setConfirm({ kind: "delete", user }) },
      ] : []),
    ];
    return {
      user, role, visibleName, status, isProtected, actions,
      roleLabel: roleLabelOf(role), initials: initialsOf(visibleName),
      protectedTitle: protectedAdmin ? "Admin hesabı korunur" : "Yönetici hesabını yalnızca geliştirici admin düzenleyebilir/silebilir",
    };
  });

  const isAdmin = currentUser?.role === "ADMIN";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Ekip yönetimi</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Kullanıcılar<InfoHint text="Kullanıcı ve yönetici hesaplarını, ilk girişlerini ve durumlarını yönetin." /></h1>
        </div>
        <Button onClick={openCreate}><Plus data-icon="inline-start" />Yeni Hesap</Button>
      </header>

      <InputGroup className="w-full sm:w-80">
        <InputGroupAddon><Search /></InputGroupAddon>
        <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, e-posta veya telefon ara" aria-label="Kullanıcı ara" />
      </InputGroup>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {notice && <Alert className="border-amber-200 bg-amber-50 text-amber-900"><AlertDescription>{notice}</AlertDescription></Alert>}

      {loading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Users /></EmptyMedia>
            <EmptyTitle>Eşleşen kullanıcı bulunamadı</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="overflow-hidden">
          {/* Telefon: tablo yerine sade liste (dört sütun dar ekrana sığmıyor). */}
          <ul className="divide-y sm:hidden">
            {rows.map(({ user, initials, visibleName, roleLabel, status, isProtected, protectedTitle, actions }) => (
              <li key={user.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar className="size-9"><AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{visibleName}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{roleLabel}</span><span aria-hidden>·</span><span className="shrink-0">{status}</span>
                  </p>
                </div>
                {isProtected && <ProtectedMark title={protectedTitle} />}
                <RowActions actions={actions} label={visibleName} />
              </li>
            ))}
          </ul>

          {/* Masaüstü: tablo. */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Ad Soyad</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="pr-4 text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ user, initials, visibleName, roleLabel, role, status, isProtected, protectedTitle, actions }) => (
                  <TableRow key={user.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8"><AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback></Avatar>
                        <span className="font-medium">{visibleName}</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={ROLE_BADGE[role]}>{roleLabel}</Badge></TableCell>
                    <TableCell><Badge variant={STATUS_BADGE[status]}>{status}</Badge></TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end gap-1">
                        {isProtected && <ProtectedMark title={protectedTitle} />}
                        <RowActions actions={actions} label={visibleName} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Silme / geçici şifre onayı */}
      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "delete" ? "Hesap kalıcı olarak silinsin mi?" : "Geçici şifre oluşturulsun mu?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? `${confirm.user.full_name} hesabı kalıcı olarak silinecek. Bu işlem geri alınamaz.`
                : `${confirm?.user.full_name} için yeni bir geçici şifre oluşturulacak. Eski şifre ve açık oturumlar geçersiz olur; kullanıcı verileri korunur.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.kind === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={() => { if (!confirm) return; void (confirm.kind === "delete" ? remove(confirm.user) : resetPassword(confirm.user)); setConfirm(null); }}>
              {confirm?.kind === "delete" ? "Kalıcı Olarak Sil" : "Şifre Oluştur"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Oluşturulan geçici şifre (yalnız bir kez gösterilir) */}
      <Dialog open={issuedPassword !== null} onOpenChange={(open) => { if (!open) setIssuedPassword(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Geçici şifre hazır</DialogTitle>
            <DialogDescription>{issuedPassword?.name} bu şifreyle giriş yapınca yeni şifre oluşturmalıdır. Şifre yalnızca burada bir kez gösterilir.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded-md bg-muted px-3 py-2 text-sm">{issuedPassword?.password}</code>
            <Button variant="outline" onClick={() => issuedPassword && void navigator.clipboard.writeText(issuedPassword.password)}>Kopyala</Button>
          </div>
          <DialogFooter><Button className="w-full" onClick={() => setIssuedPassword(null)}>Kapat</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kullanıcı bilgileri */}
      <Dialog open={infoUser !== null} onOpenChange={(open) => { if (!open) setInfoUser(null); }}>
        <DialogContent className="gap-0 p-0 sm:max-w-sm">
          {infoUser && (
            <>
              <DialogHeader className="flex-row items-center gap-3 space-y-0 px-5 py-4 text-left">
                <Avatar className="size-10"><AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">{initialsOf(displayName(infoUser))}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate text-base">{displayName(infoUser)}</DialogTitle>
                  <DialogDescription className="text-xs">{roleLabelOf(uiRole(infoUser))} · {statusOf(infoUser)}</DialogDescription>
                </div>
              </DialogHeader>
              <Separator />
              <dl className="flex flex-col divide-y px-5 py-1 text-sm">
                <div className="flex items-center gap-3 py-3">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 break-words">{/^hesap-[^@]+@[^@]+\.local$/.test(infoUser.email) ? "E-posta tanımlı değil" : infoUser.email}</span>
                </div>
                <div className="flex items-center gap-3 py-3">
                  <Phone className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">{infoUser.phone || "Telefon tanımlı değil"}</span>
                </div>
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Yeni hesap / düzenle */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Hesabı Düzenle" : "Yeni Hesap"}</DialogTitle>
            <DialogDescription>Admin rolü bu ekrandan atanamaz.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="k-ad">Ad *</FieldLabel>
              <Input id="k-ad" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="k-soyad">Soyad *</FieldLabel>
              <Input id="k-soyad" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="k-tel">Telefon *</FieldLabel>
              <Input id="k-tel" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
            <Field data-disabled={Boolean(editing) || undefined}>
              <FieldLabel htmlFor="k-eposta">E-posta (isteğe bağlı)</FieldLabel>
              <Input id="k-eposta" type="email" disabled={Boolean(editing)} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
            <Field data-disabled={!isAdmin || undefined}>
              <FieldLabel htmlFor="k-rol">Rol *</FieldLabel>
              <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value as FormState["role"] })} disabled={!isAdmin}>
                <SelectTrigger id="k-rol"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="user">Kullanıcı</SelectItem>
                    {isAdmin && <SelectItem value="manager">Yönetici</SelectItem>}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="k-durum">Hesap durumu *</FieldLabel>
              <Select value={form.is_active ? "active" : "passive"} onValueChange={(value) => setForm({ ...form, is_active: value === "active" })}>
                <SelectTrigger id="k-durum"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="passive">Pasif</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {!editing && (
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="k-sifre">Geçici şifre *</FieldLabel>
                <InputGroup>
                  <InputGroupInput id="k-sifre" type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton size="icon-xs" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>
                      {showPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>Kullanıcı ilk girişte otomatik olarak yeni şifre ekranına yönlendirilir.</FieldDescription>
              </Field>
            )}
            {formError && <Alert variant="destructive" className="sm:col-span-2"><AlertDescription>{formError}</AlertDescription></Alert>}
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Vazgeç</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
