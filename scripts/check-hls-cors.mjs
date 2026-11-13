// Diagnóstico HLS/CORS para browser — executado em GitHub Actions.
// Apenas lê manifestos e até um fragmento de um segmento; não modifica estações.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("const STATIONS = [");
const end = html.indexOf("\n];", start);
if (start < 0 || end < 0) throw new Error("Catálogo não encontrado.");
const stations = vm.runInNewContext(html.slice(start + "const STATIONS = ".length, end + 2), {}, { timeout: 1000 });
const hlsStations = stations.filter(s => s.enabled && s.streamType === "hls");
const origin = "https://rjsoft.github.io";
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_SEGMENT_BYTES = 48 * 1024;
const TIMEOUT_MS = 12000;
let failures = 0;

function corsAllowed(response) {
  const allow = response.headers.get("access-control-allow-origin");
  return allow === "*" || allow === origin;
}
async function getSmall(url, limit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Origin: origin, Range: `bytes=0-${limit-1}` },
      signal: controller.signal,
      redirect: "follow",
    });
    const chunks = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (size < limit) {
        const { value, done } = await reader.read();
        if (done) break;
        const count = Math.min(value.length, limit - size);
        chunks.push(value.subarray(0, count));
        size += count;
        if (size >= limit) break;
      }
      await reader.cancel().catch(() => {});
    }
    const bytes = Buffer.concat(chunks.map(x => Buffer.from(x)));
    return { status: response.status, ok: response.ok, cors: corsAllowed(response),
      allowOrigin: response.headers.get("access-control-allow-origin") || "(ausente)",
      type: response.headers.get("content-type") || "(ausente)",
      url: response.url, bytes };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
function uris(text) {
  return text.split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith("#"));
}
function mapUri(text) {
  const match = text.match(/^#EXT-X-MAP:.*?URI="([^"]+)"/m);
  return match?.[1] || null;
}
for (const station of hlsStations) {
  console.log(`\n## ${station.name}`);
  try {
    let manifestUrl = station.streamUrl;
    let manifest;
    for (let level = 0; level < 3; level++) {
      manifest = await getSmall(manifestUrl, MAX_MANIFEST_BYTES);
      console.log(`Manifesto ${level + 1}: HTTP ${manifest.status}; CORS ${manifest.cors ? "OK" : "NÃO CONFIRMADO"}; ACAO ${manifest.allowOrigin}; tipo ${manifest.type}`);
      if (!manifest.ok || !manifest.cors) { failures++; break; }
      const text = manifest.bytes.toString("utf8").replace(/^\uFEFF/, "");
      if (!text.startsWith("#EXTM3U")) { console.log("ERRO: não começa por #EXTM3U"); failures++; break; }
      const entries = uris(text);
      if (!entries.length) { console.log("AVISO: manifesto sem entradas"); failures++; break; }
      if (text.includes("#EXT-X-STREAM-INF")) {
        manifestUrl = new URL(entries[0], manifest.url).href;
        continue;
      }
      // Num stream live, o primeiro segmento listado pode expirar rapidamente.
      const segment = new URL(mapUri(text) || entries.at(-1), manifest.url).href;
      const part = await getSmall(segment, MAX_SEGMENT_BYTES);
      console.log(`Segmento: HTTP ${part.status}; CORS ${part.cors ? "OK" : "NÃO CONFIRMADO"}; ACAO ${part.allowOrigin}; tipo ${part.type}; bytes lidos ${part.bytes.length}`);
      if (!part.ok || !part.cors || part.bytes.length === 0) failures++;
      break;
    }
  } catch (err) {
    failures++;
    console.log(`ERRO: ${err.cause?.code || err.message}`);
  }
}
console.log(`\nDiagnóstico HLS: ${hlsStations.length} estação(ões); ${failures} problema(s) de acessibilidade/validação.`);
console.log("Este teste verifica headers CORS e fragmentos HLS; não confirma áudio audível nem descodificação.");
if (failures) process.exitCode = 1;
