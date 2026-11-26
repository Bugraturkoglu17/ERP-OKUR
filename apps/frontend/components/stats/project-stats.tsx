"use client";

import { InfoHint } from "@/components/ui/info-hint";
import Link from "next/link";
import { FolderKanban, HandCoins, Layers, ListChecks, PieChart, Receipt, Target, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { CountUp, Reveal, delay } from "@/components/stats/motion";
import type { ProjectStats } from "@/services/installationProjects";

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const fmt = (value: number) => value.toLocaleString("tr-TR");
/** Kutularda kısa yazım: ₺10,4 Mn, ₺963,7 bin. */
function moneyShort(value: number): string {
  const short = (amount: number) => amount.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  if (Math.abs(value) >= 1_000_000) return `₺${short(value / 1_000_000)} Mn`;
  if (Math.abs(value) >= 1_000) return `₺${short(value / 1_000)} bin`;
  return `₺${Math.round(value).toLocaleString("tr-TR")}`;
}
/** Tabloda tam yazım: ₺1.850.000. */
const moneyFull = (value: number) => `₺${Math.round(value).toLocaleString("tr-TR")}`;

const TYPE_COLOR: Record<string, string> = { market: "bg-sky-500", soguk_oda: "bg-indigo-500", sogutma: "bg-teal-500" };

function Card({ title, description, icon: Icon, index, children }: {
  title: string; description: string; icon: LucideIcon; index: number; children: React.ReactNode;
}) {
  return (
    <Reveal as="section" index={index} className="erp-section-card stat-lift flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}<InfoHint text={description} /></h3>
        <Icon className="h-4 w-4 shrink-0 text-slate-300" />
      </div>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </Reveal>
  );
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={`stat-grow-x h-full rounded-full ${className}`} style={{ width: `${max ? Math.max((value / max) * 100, value ? 2 : 0) : 0}%` }} />
    </div>
  );
}

/** İstatistik sayfasının "Projeler ve maliyetler" bölümü. Sayılar ve çubuklar sayfanın tek saatini (StatClock) kullanır. */
export function ProjectStatsBlock({ stats }: { stats: ProjectStats }) {
  const { counts, money } = stats;
  const live = counts.total - counts.cancelled;
  const busiest = stats.by_stage.reduce((top, stage) => (stage.count > top.count ? stage : top), stats.by_stage[0]);
  const categoryMax = Math.max(1, ...stats.by_category.flatMap((row) => [row.target, row.actual]));

  const tiles: { label: string; value: number; format?: (value: number) => string; sub: string; icon: LucideIcon; tone: string }[] = [
    { label: "Devam eden proje", value: counts.active, sub: `${fmt(counts.completed)} tamamlandı · ${fmt(counts.overdue)} gecikmiş`, icon: FolderKanban, tone: "bg-blue-50 text-blue-700" },
    { label: "Toplam bütçe / teklif", value: money.budget_total, format: moneyShort, sub: `${fmt(live)} proje`, icon: Wallet, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Hedeflenen maliyet", value: money.target_total, format: moneyShort, sub: money.budget_total ? `Bütçenin %${pct(money.target_total, money.budget_total)} kadarı` : "Bütçe girilmemiş", icon: Target, tone: "bg-indigo-50 text-indigo-700" },
    { label: "Gerçekleşen maliyet", value: money.actual_total, format: moneyShort, sub: money.target_total ? `Hedefin %${pct(money.actual_total, money.target_total)} kadarı harcandı` : "Hedef girilmemiş", icon: Receipt, tone: "bg-amber-50 text-amber-700" },
    { label: "Onaylanan satış (KDV hariç)", value: money.sale_total, format: moneyShort, sub: money.sale_count ? `${fmt(money.sale_count)} projede girildi` : "Satış fiyatı girilmemiş", icon: HandCoins, tone: "bg-sky-50 text-sky-700" },
    { label: "Gerçek kâr", value: money.realized_profit, format: moneyShort, sub: money.realized_count ? `${fmt(money.realized_count)} tamamlanan proje · marj %${pct(money.realized_profit, money.realized_revenue)}` : "Tamamlanan proje yok", icon: TrendingUp, tone: money.realized_profit < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700" },
  ];

  return (
    <>
      <div className="stat-reveal flex flex-wrap items-baseline justify-between gap-2 pt-3" style={delay(240)}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-base font-bold tracking-tight text-slate-950">Projeler ve maliyetler<InfoHint text="Kurulum projelerinin ilerleyişi, teklif, satış, maliyet ve kâr durumu. Satış ve kâr KDV hariçtir. Gerçek kâr tamamlanan projelerde fatura tutarından (yoksa satış fiyatından) gerçekleşen maliyet düşülerek hesaplanır. İptal edilen projeler tutarlara katılmaz." /></h2>
        </div>
        <Link href="/manager/projeler" className="text-xs font-semibold text-blue-700 hover:text-blue-800">Projeleri aç</Link>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6" aria-label="Proje özeti">
        {tiles.map(({ label, value, format, sub, icon: Icon, tone }, i) => (
          <div key={label} className="stat-reveal stat-lift flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3" style={delay(260 + i * 60)}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-medium text-slate-500">{label}</span>
              <span className="block text-xl font-bold leading-7 tabular-nums text-slate-950"><CountUp value={value} format={format} /></span>
              <span className="block truncate text-[10px] text-slate-400">{sub}</span>
            </span>
          </div>
        ))}
      </section>

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <Card index={5} title="Projeler hangi aşamada" description="Devam eden projelerin şu an bulunduğu aşama." icon={Layers}>
          {counts.active === 0
            ? <p className="py-8 text-center text-sm text-slate-500">Devam eden proje yok.</p>
            : <div className="space-y-2.5">{stats.by_stage.map((stage) => (
              <div key={stage.order}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="truncate font-medium text-slate-700">{stage.order}. {stage.name}</span>
                  <span className="tabular-nums text-slate-500"><strong className="text-slate-900"><CountUp value={stage.count} /></strong> proje</span>
                </div>
                <div className="mt-1"><Bar value={stage.count} max={Math.max(busiest?.count ?? 1, 1)} className={stage.count && stage.count === busiest?.count ? "bg-amber-500" : "bg-blue-600"} /></div>
              </div>
            ))}</div>}
        </Card>

        <Card index={6} title="Proje türüne göre" description="Tür başına proje sayısı, bütçe ve maliyet." icon={PieChart}>
          <div className="space-y-4">
            {stats.by_type.map((row) => (
              <div key={row.type}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-slate-700">{row.label}</span>
                  <span className="tabular-nums text-slate-500"><strong className="text-slate-900"><CountUp value={row.count} /></strong> proje · <CountUp value={row.active} /> devam ediyor</span>
                </div>
                <div className="mt-1.5"><Bar value={row.count} max={Math.max(counts.total, 1)} className={TYPE_COLOR[row.type] ?? "bg-slate-400"} /></div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  {([["Teklif", row.budget], ["Hedef", row.target], ["Gerçekleşen", row.actual]] as const).map(([name, amount]) => (
                    <div key={name} className="rounded-lg bg-slate-50 px-2 py-1.5">
                      <dt className="text-slate-400">{name}</dt>
                      <dd className="font-semibold tabular-nums text-slate-900"><CountUp value={amount} format={moneyShort} /></dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Card>

        <Card index={7} title="Maliyet kalemleri" description="Tüm projelerde kalem bazında hedeflenen ve gerçekleşen tutar." icon={ListChecks}>
          <div className="space-y-3.5">
            {stats.by_category.map((row) => (
              <div key={row.category}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-slate-700">{row.label}</span>
                  <span className="whitespace-nowrap tabular-nums text-slate-500">
                    <strong className={row.actual > row.target && row.target > 0 ? "text-red-600" : "text-slate-900"}><CountUp value={row.actual} format={moneyShort} /></strong> / <CountUp value={row.target} format={moneyShort} />
                  </span>
                </div>
                <div className="mt-1.5 space-y-1">
                  <Bar value={row.target} max={categoryMax} className="bg-slate-300" />
                  <Bar value={row.actual} max={categoryMax} className={row.actual > row.target && row.target > 0 ? "bg-red-500" : "bg-blue-600"} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-auto flex gap-4 pt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-slate-300" />Hedeflenen</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-600" />Gerçekleşen</span>
          </div>
        </Card>
      </div>

      <Reveal as="section" index={8} className="erp-section-card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Proje bazında teklif, satış ve maliyet<InfoHint text="Satış ve gerçek kâr KDV hariçtir; gerçek kâr yalnızca tamamlanan projelerde gösterilir. Hedefe oran, gerçekleşen maliyetin hedeflenen maliyete bölümüdür; %100&apos;ü geçen projeler kırmızı gösterilir." /></h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead><tr className="whitespace-nowrap border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5">Proje</th><th className="px-3 py-2.5">Aşama</th><th className="px-3 py-2.5 text-right">Teklif</th><th className="px-3 py-2.5 text-right">Satış</th>
              <th className="px-3 py-2.5 text-right">Hedef</th><th className="px-3 py-2.5 text-right">Gerçekleşen</th><th className="px-3 py-2.5 text-right">Gerçek kâr</th><th className="px-4 py-2.5">Hedefe oran</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {stats.projects.map((project, i) => {
                const over = project.usage_pct !== null && project.usage_pct > 100;
                const amount = (value: number | null) => (value === null ? <span className="text-slate-300">—</span> : <CountUp value={value} format={moneyFull} />);
                return (
                  <tr key={project.id} className="stat-row-in whitespace-nowrap transition-colors hover:bg-slate-50" style={delay(250 + Math.min(i, 10) * 30)}>
                    <td className="px-4 py-2">
                      <Link href={`/manager/projeler/${project.id}`} className="block max-w-[18rem] truncate font-medium text-slate-900 hover:text-blue-700">{project.name}</Link>
                      <p className="text-xs text-slate-400">{project.project_type_label}{project.overdue ? <span className="font-semibold text-red-600"> · gecikmiş</span> : null}</p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="stat-grow-x h-full rounded-full bg-blue-600" style={{ width: `${pct(project.stages_done, project.stages_total)}%` }} /></div>
                        <span className="text-xs tabular-nums text-slate-600"><CountUp value={project.stages_done} />/{project.stages_total}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">{project.status === "completed" ? "Tamamlandı" : project.current_stage ?? "—"}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{amount(project.budget)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{amount(project.sale)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{amount(project.target)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${over ? "font-semibold text-red-600" : "text-slate-900"}`}>{amount(project.actual)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${project.profit !== null && project.profit < 0 ? "text-red-600" : "text-emerald-700"}`}>{amount(project.profit)}</td>
                    <td className="px-4 py-2">
                      {project.usage_pct === null ? <span className="text-xs text-slate-400">{project.target === null ? "Hedef girilmedi" : "Harcama girilmedi"}</span> : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className={`stat-grow-x h-full rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(project.usage_pct, 100)}%` }} /></div>
                          <span className={`text-xs tabular-nums ${over ? "font-semibold text-red-600" : "text-slate-600"}`}>%<CountUp value={project.usage_pct} /></span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Reveal>
    </>
  );
}
