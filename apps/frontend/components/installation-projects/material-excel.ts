/**
 * Proje malzeme listesi için Excel şablonu ve içe aktarma.
 * Şablon sütunları sırasıyla: Malzeme kodu | Malzeme adı | Adet. Eşleştirme yalnız malzeme koduyla yapılır;
 * "Malzeme adı" okunmaz, kullanıcı kendi rahatı için doldurur.
 * xlsx kütüphanesi yalnız gerektiğinde yüklenir (sayfa ilk açılışta ağırlaşmasın).
 */

export const MATERIAL_TEMPLATE_HEADERS = ["Malzeme kodu", "Malzeme adı", "Adet"] as const;

export type ImportedMaterialLine = { materialId: string; quantity: string };
export type MaterialImportResult = {
  lines: ImportedMaterialLine[];
  /** Katalogda bulunamayan kodlar (alınmadı). */
  unknownCodes: string[];
  /** Adedi boş, sıfır ya da sayı olmayan satırlar ("satır no: kod"). */
  invalidRows: string[];
};

export async function downloadMaterialTemplate(fileName = "malzeme_listesi_sablonu.xlsx") {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([[...MATERIAL_TEMPLATE_HEADERS]]);
  sheet["!cols"] = [{ wch: 18 }, { wch: 48 }, { wch: 10 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Malzeme listesi");
  XLSX.writeFile(book, fileName);
}

const normalizeCode = (value: unknown) => String(value ?? "").trim().toLocaleUpperCase("tr-TR");

/** "12", "2,5", "1.250,75", 3 gibi değerleri sayıya çevirir; geçersizse null. */
function parseQuantity(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Ekrandaki "Adet" alanının kabul ettiği biçim: en çok 3 ondalık, virgülle. */
const formatQuantity = (value: number) => String(Math.round(value * 1000) / 1000).replace(".", ",");

export async function parseMaterialExcel(file: File, catalog: { id: string; sku: string }[]): Promise<MaterialImportResult> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return { lines: [], unknownCodes: [], invalidRows: [] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });

  const bySku = new Map(catalog.map((item) => [normalizeCode(item.sku), item.id]));
  const totals = new Map<string, number>();
  const unknown = new Set<string>();
  const invalid: string[] = [];

  rows.forEach((row, index) => {
    const code = normalizeCode(row[0]);
    if (!code) return;
    // Başlık satırı (şablondaki ya da kullanıcının yazdığı) atlanır.
    if (index === 0 && code.includes("KOD")) return;
    const materialId = bySku.get(code);
    if (!materialId) { unknown.add(String(row[0]).trim()); return; }
    const quantity = parseQuantity(row[2]);
    if (quantity === null || quantity <= 0) { invalid.push(`${index + 1}. satır: ${String(row[0]).trim()}`); return; }
    // Aynı kod birden çok satırda yazılmışsa adetler toplanır.
    totals.set(materialId, (totals.get(materialId) ?? 0) + quantity);
  });

  return {
    lines: Array.from(totals, ([materialId, quantity]) => ({ materialId, quantity: formatQuantity(quantity) })),
    unknownCodes: Array.from(unknown),
    invalidRows: invalid,
  };
}
