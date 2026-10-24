import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

// Small code-generated app icon: golden grain/ball on ChunBall Remix's black background.
function icon(size) {
  const crc = (data) => {
    let value = 0xffffffff;
    for (const byte of data) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, data) => {
    const type = Buffer.from(name);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([length, type, data, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = y * (size * 3 + 1) + 1 + x * 3;
    const inside = Math.hypot(x - size / 2, y - size / 2) < size * 0.29;
    if (inside) pixels.set([230, 180, 34], offset);
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

export function chunballPwa() {
  return {
    name: "chunball-remix-pwa",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const size of [180, 192, 512]) this.emitFile({ type: "asset", fileName: `icons/icon-${size}.png`, source: icon(size) });
      const manifest = {
        id: "/", name: "ChunBall Remix", short_name: "ChunBall Remix", lang: "ja",
        start_url: "/", scope: "/", display: "standalone",
        background_color: "#000000", theme_color: "#000000",
        icons: [192, 512].map((size) => ({ src: `/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png" })),
      };
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: JSON.stringify(manifest, null, 2) });
      const files = Object.keys(bundle).filter((name) => !name.endsWith(".map"));
      const version = createHash("sha256").update(files.map((name) => name + (bundle[name].code ?? bundle[name].source)).join("\n")).digest("hex").slice(0, 16);
      // Emitted assets may already be in bundle; Cache.addAll rejects duplicates.
      const urls = [...new Set(["/", ...files.map((name) => `/${name}`), "/manifest.webmanifest", ...[180,192,512].map((size) => `/icons/icon-${size}.png`)])];
      this.emitFile({ type: "asset", fileName: "sw.js", source: `
const CACHE = "chunball-remix-${version}";
const FILES = ${JSON.stringify(urls)};
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
// Updates wait until the old app closes, avoiding mixed game versions.
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("chunball-remix-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request, { cache: "no-store" }).then(response => {
      if (!response.ok) throw new Error("Navigation unavailable");
      return response;
    }).catch(() => caches.open(CACHE).then(cache => cache.match(url.pathname)).then(hit => hit || Response.error())));
    return;
  }
  event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(hit => hit || fetch(event.request)));
});
` });
    },
  };
}
