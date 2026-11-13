// Auditoria estática do catálogo de rádios. Não faz pedidos de rede nem altera ficheiros.
// Executar: node scripts/validate-catalog.mjs
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const start = html.indexOf("const STATIONS = [");
const end = html.indexOf("\n];", start);
if (start === -1 || end === -1) throw Error("Lista STATIONS não encontrada.");

const stations = vm.runInNewContext(
  html.slice(start + "const STATIONS = ".length, end + 2),
  {},
  { timeout: 1000 },
);
const categories = new Set(["music", "news", "sports", "general", "regional", "thematic"]);
const types = new Set(["mp3", "aac", "hls"]);
const ids = new Set();
const errors = [];
for (const [index, station] of stations.entries()) {
  const tag = station.name || `posição ${index + 1}`;
  if (!station.id || !/^[a-z0-9-]+$/.test(station.id)) errors.push(`${tag}: id inválido`);
  if (ids.has(station.id)) errors.push(`${tag}: id duplicado (${station.id})`);
  ids.add(station.id);
  if (!station.name?.trim()) errors.push(`posição ${index + 1}: nome vazio`);
  if (!categories.has(station.category)) errors.push(`${tag}: categoria inválida`);
  if (!types.has(station.streamType)) errors.push(`${tag}: tipo de stream inválido`);
  if (typeof station.enabled !== "boolean") errors.push(`${tag}: enabled deve ser booleano`);
  for (const key of ["streamUrl", "website"]) {
    if (!station[key]) { if (key === "streamUrl") errors.push(`${tag}: streamUrl em falta`); continue; }
    try {
      const url = new URL(station[key]);
      if (url.protocol !== "https:") errors.push(`${tag}: ${key} não usa HTTPS`);
    } catch { errors.push(`${tag}: ${key} inválido`); }
  }
  if (station.logo) {
    if (!/^logos\/[a-z0-9-]+\.png$/.test(station.logo) || !existsSync(new URL(station.logo, root))) {
      errors.push(`${tag}: logótipo inválido ou inexistente (${station.logo})`);
    }
  }
}
console.log(`Catálogo: ${stations.length} rádios; ${stations.filter(s => s.enabled).length} ativas.`);
if (errors.length) {
  for (const error of errors) console.error("ERRO: " + error);
  process.exitCode = 1;
} else {
  console.log("Estrutura, identificadores, categorias, URLs e logótipos: OK.");
}
