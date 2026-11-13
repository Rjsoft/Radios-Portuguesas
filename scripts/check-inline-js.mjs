// Verifica sintaxe de todos os scripts inline do HTML sem executar a aplicação.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) throw new Error("Nenhum script inline encontrado no index.html");
for (const [index, match] of scripts.entries()) {
  new vm.Script(match[1], { filename: `index.html:inline-script-${index + 1}` });
}
console.log(`Sintaxe dos ${scripts.length} scripts inline: OK.`);
