// iOS "Add to Home Screen" PWA cold-launch beyaz kare sorunu: Safari,
// web app manifest'ten otomatik ürettiği splash ekranını tutarsız/gecikmeli
// uyguluyor (bilinen iOS davranışı). Kesin çözüm: her cihaz çözünürlüğü için
// apple-touch-startup-image PNG üretip <link rel="apple-touch-startup-image">
// ile bildirmek — bu, JS/CSS yüklenmeden ÖNCE iOS'un gösterdiği native launch
// image'ı olduğu için beyaz kare hiç oluşmuyor.
//
// Çalıştırma: node scripts/generate-apple-splash.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "splash");

const BG = "#09111b";
const FG = "#ff3131";

// BrandMark ile birebir aynı path (components/brand/brand-mark.tsx)
const ICON_PATH =
  "M 1284.949219 187.699219 L 1284.949219 1312.292969 L 911.484375 985.53125 C 854.46875 935.667969 854.46875 846.976562 911.484375 797.113281 L 1143.132812 999.835938 L 1143.132812 500.15625 L 215.039062 1312.292969 L 215.039062 187.699219 L 696.167969 608.695312 L 670.921875 630.777344 C 623.703125 672.089844 553.257812 672.089844 506.039062 630.777344 L 356.859375 500.15625 L 356.859375 999.785156 Z M 1284.949219 187.699219 ";

// [width, height, devicePixelRatio, dosya adı] — portrait, en yaygın
// iPhone model aralığı (SE 1. nesil → 16 Pro Max).
const DEVICES = [
  [320, 568, 2, "iphone-se1"],
  [375, 667, 2, "iphone-8"],
  [414, 736, 3, "iphone-8-plus"],
  [375, 812, 3, "iphone-x-11pro-12mini-13mini"],
  [414, 896, 2, "iphone-11-xr"],
  [414, 896, 3, "iphone-11pro-max-xsmax"],
  [390, 844, 3, "iphone-12-13-14-15-16"],
  [428, 926, 3, "iphone-12-13-14-pro-max"],
  [393, 852, 3, "iphone-14-15-16-pro"],
  [430, 932, 3, "iphone-14-15-16-plus"],
  [402, 874, 3, "iphone-15-16-pro"],
  [440, 956, 3, "iphone-16-pro-max"],
];

function splashSvg(w, h) {
  const s = Math.round(Math.min(w, h) * 0.22);
  const scale = s / 1500;
  const cx = (w - s) / 2;
  const cy = (h - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${BG}"/>
    <g transform="translate(${cx}, ${cy}) scale(${scale})">
      <path d="${ICON_PATH}" fill="${FG}"/>
    </g>
  </svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [w, h, dpr, name] of DEVICES) {
    const pw = w * dpr;
    const ph = h * dpr;
    const svg = splashSvg(pw, ph);
    const file = path.join(OUT_DIR, `${name}.png`);
    await sharp(Buffer.from(svg)).png().toFile(file);
    console.log(`generated ${name}.png (${pw}x${ph})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
