// Testes de isolamento de CacheStorage por origem e âmbito da PWA.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const scope = "https://rjsoft.github.io/Radios-Portuguesas/";
const prefix = `radiospt:${encodeURIComponent(new URL(scope).pathname)}:`;
const handlers = new Map();
const deleted = [];
const keys = [
  prefix + "v4", prefix + "v5", prefix + "v6",
  "radiospt-v4", "radiospt-v5", // caches legadas: preservar por segurança
  `radiospt:${encodeURIComponent("/Portuguese-Radios/")}:v3`, // outra instalação
  "outra-aplicacao-v1", "esfb-stocks-cache",
];
const self = {
  registration: { scope },
  location: { origin: "https://rjsoft.github.io" },
  addEventListener(type, callback) { handlers.set(type, callback); },
  skipWaiting() { return Promise.resolve(); },
  clients: { claim() { return Promise.resolve(); } },
};
const caches = {
  keys: async () => keys,
  delete: async name => { deleted.push(name); return true; },
};
vm.runInNewContext(source, { self, caches, URL, Request, console }, { timeout: 1500 });
assert.equal(typeof handlers.get("activate"), "function");
let done;
handlers.get("activate")({ waitUntil(p) { done = p; } });
await done;
assert.deepEqual(deleted.sort(), [prefix + "v4", prefix + "v5"].sort());
console.log("✓ Apenas caches obsoletas da PWA neste âmbito são eliminadas.");
console.log("✓ As caches legadas, outras instalações e aplicações da mesma origem são preservadas.");
