/** @type {import('next').NextConfig} */
const fs = require("fs");
const path = require("path");

// next.config.js, tek bir `next build` sırasında birden fazla kez (client +
// server derlemesi için ayrı ayrı) evaluate edilir. Burada doğrudan Date.now()
// çağırmak her seferinde farklı bir değer üretir ve client/server'a gömülen
// versiyonlar hiçbir zaman eşleşmez. Bunun yerine, Dockerfile'ın build
// aşamasında TEK SEFERE yazılan BUILD_VERSION dosyasını okuyoruz — böylece
// aynı build içindeki her evaluate aynı, sabit değeri görür.
function readBuildVersion() {
  try {
    return fs.readFileSync(path.join(__dirname, "BUILD_VERSION"), "utf8").trim();
  } catch {
    return "dev";
  }
}
const buildVersion = readBuildVersion();

const nextConfig = {
  output: "standalone",
  // Yerel geliştirme süreci açıkken bağımsız doğrulama build'inin aynı
  // lock/cache dizinine çarpmasını önlemek için testlerde değiştirilebilir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
};

module.exports = nextConfig;
