// Valida o pin SRI usado pelo leitor e, opcionalmente, os bytes da biblioteca.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const url = html.match(/const HLS_LIBRARY_URL = "([^"]+)";/)?.[1];
const integrity = html.match(/const HLS_LIBRARY_INTEGRITY = "(sha384-[A-Za-z0-9+/=]+)";/)?.[1];
assert.equal(url, "https://cdn.jsdelivr.net/npm/hls.js@1.7.4/dist/hls.min.js",
  "URL da biblioteca diferente da versão aprovada");
assert.ok(integrity?.startsWith("sha384-"), "SRI SHA-384 não definido");
assert.match(html, /script\.integrity\s*=\s*HLS_LIBRARY_INTEGRITY/, "Elemento script não aplica SRI");
assert.match(html, /script\.crossOrigin\s*=\s*"anonymous"/, "SRI cross-origin requer CORS");
if (process.argv[2]) {
  const bytes = readFileSync(process.argv[2]);
  const digest = "sha384-" + createHash("sha384").update(bytes).digest("base64");
  assert.equal(digest, integrity, "O CDN forneceu bytes diferentes do hash SRI aprovado");
  console.log("✓ SHA-384 da biblioteca remota corresponde ao hash aprovado.");
} else {
  console.log("✓ A aplicação fixa URL, SRI SHA-384 e CORS para hls.js.");
}
