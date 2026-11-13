// Verifica os streams, sites e logos da lista de rádios do index.html.
// Só lê e reporta — NUNCA altera a lista. Requer Node 18+ (sem dependências).
//
// Uso:  node scripts/check-streams.mjs
// Código de saída: 0 se todos os streams ativos responderem, 1 se algum falhar.

import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);
const STREAM_TIMEOUT_MS = 8000;
const SITE_TIMEOUT_MS = 10000;
const CONCURRENCY = 8;
const HEADERS = { "user-agent": "Mozilla/5.0 (RadiosPortugalLive stream-check)", "icy-metadata": "0" };

// Lê o array STATIONS diretamente do index.html (fonte única dos dados).
function loadStations() {
  const html = readFileSync(new URL("index.html", ROOT), "utf8");
  const start = html.indexOf("const STATIONS = [");
  const end = html.indexOf("\n];", start);
  if (start < 0 || end < 0) throw new Error("Não encontrei 'const STATIONS = [' no index.html");
  return vm.runInNewContext(html.slice(start + "const STATIONS = ".length, end + 2), {}, { timeout: 1000 });
}

// Pede o URL, lê só o primeiro bloco de dados e cancela (nunca descarrega o stream).
async function probe(url, timeoutMs, readBody) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow", signal: controller.signal });
    const type = (res.headers.get("content-type") || "").toLowerCase();
    let firstBytes = "";
    if (readBody && res.ok && res.body) {
      const { value } = await res.body.getReader().read();
      firstBytes = value ? Buffer.from(value.slice(0, 64)).toString("latin1") : "";
    }
    return { status: res.status, ok: res.ok, type, firstBytes, finalUrl: res.url };
  } catch (err) {
    const cause = err.cause?.code || err.cause?.errors?.[0]?.code || err.cause?.message;
    return { error: controller.signal.aborted ? "timeout" : cause || err.message };
  } finally {
    clearTimeout(timer);
    controller.abort(); // fecha a ligação ao stream
  }
}

// Servidor que não envia o certificado intermédio: Chrome/Edge vão buscá-lo e tocam, o Node não.
const INCOMPLETE_TLS_CHAIN = new Set(["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"]);

async function checkStream(s) {
  const r = await probe(s.streamUrl, STREAM_TIMEOUT_MS, true);
  if (INCOMPLETE_TLS_CHAIN.has(r.error)) {
    return { ok: null, warn: "certificado TLS incompleto no servidor (compatibilidade não confirmada)" };
  }
  if (r.error) return { ok: false, reason: r.error };
  if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
  if (!r.finalUrl.startsWith("https://")) return { ok: false, reason: "redireciona para http (bloqueado em https)" };
  if (s.streamType === "hls") {
    return r.firstBytes.startsWith("#EXTM3U") ? { ok: true, info: "HLS" } : { ok: false, reason: `não parece HLS (${r.type || "sem tipo"})` };
  }
  const looksAudio = r.type.startsWith("audio/") || r.type.includes("octet-stream") || r.type.includes("ogg");
  if (!looksAudio) return { ok: false, reason: `tipo inesperado: ${r.type || "sem tipo"}` };
  if (!r.firstBytes) return { ok: false, reason: "sem dados de áudio" };
  return { ok: true, info: r.type };
}

async function checkSite(s) {
  if (!s.website) return { ok: true, info: "sem site" };
  const r = await probe(s.website, SITE_TIMEOUT_MS, false);
  if (r.error) return { ok: false, reason: r.error };
  return r.status < 400 ? { ok: true } : { ok: false, reason: `HTTP ${r.status}` };
}

function checkLogo(s) {
  if (!s.logo) return { ok: true, info: "sem logo (iniciais)" };
  return existsSync(new URL(s.logo, ROOT)) ? { ok: true } : { ok: false, reason: `ficheiro em falta: ${s.logo}` };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  }));
  return results;
}

const stations = loadStations();
console.log(`A verificar ${stations.length} rádios (timeout ${STREAM_TIMEOUT_MS / 1000} s)…\n`);

const rows = await mapLimit(stations, CONCURRENCY, async (s) => ({
  s, stream: await checkStream(s), site: await checkSite(s), logo: checkLogo(s),
}));

let streamFail = 0, streamWarn = 0, streamUncertain = 0, siteFail = 0, logoFail = 0;
for (const { s, stream, site, logo } of rows) {
  const tag = s.enabled ? "" : " [desativada]";
  const problems = [];
  if (stream.ok === false) { problems.push(`stream: ${stream.reason}`); if (s.enabled) streamFail++; }
  if (stream.ok === null && s.enabled) streamUncertain++;
  if (stream.warn) { problems.push(`stream: ${stream.warn}`); streamWarn++; }
  if (!site.ok) { problems.push(`site: ${site.reason}`); siteFail++; }
  if (!logo.ok) { problems.push(`logo: ${logo.reason}`); logoFail++; }
  const mark = stream.ok === false ? "✗" : problems.length ? "⚠" : "✓";
  console.log(`${mark} ${s.name}${tag}${problems.length ? " — " + problems.join("; ") : ""}`);
}

const active = stations.filter((s) => s.enabled).length;
console.log(`\n${active} streams ativos testados`);
console.log(`${active - streamFail - streamUncertain} OK confirmados`);
console.log(`${streamUncertain} por confirmar (TLS incompleto)`);
console.log(`${streamFail} falharam`);
console.log(`Avisos de stream: ${streamWarn} · Sites com problemas: ${siteFail} · Logos em falta: ${logoFail}`);
if (streamFail || streamWarn || siteFail || logoFail) {
  console.log("\nNada foi alterado. Reveja os casos acima antes de editar a lista (ex.: enabled: false).");
}
process.exit(streamFail || streamUncertain ? 1 : 0);
