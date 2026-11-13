// Testes em Chromium com áudio simulado: nenhum pedido real a streams externos.
// Executar: node scripts/browser-smoke.mjs (requer playwright instalado).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const port = 18976;
const origin = `http://127.0.0.1:${port}/`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  stdio: "ignore",
});
let browser;
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log("✓ " + name);
  } catch (error) {
    results.push({ name, ok: false });
    console.error("✗ " + name + ": " + (error.stack || error));
  }
}
async function launchPage() {
  const page = await browser.newPage();
  // Evita pedidos de áudio e controla a semântica de media.play() de forma determinística.
  await page.addInitScript(() => {
    window.__pendingPlays = [];
    HTMLMediaElement.prototype.play = function () {
      return new Promise((resolve, reject) => {
        window.__pendingPlays.push({ resolve, reject });
      });
    };
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.load = function () {};
  });
  await page.route("https://**/*", route => route.abort());
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  return page;
}
try {
  // Aguardar pelo servidor local antes de iniciar o Chromium.
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(origin);
      if (res.ok) { ready = true; break; }
    } catch {}
    await sleep(100);
  }
  assert.ok(ready, "Servidor HTTP local indisponível");
  browser = await chromium.launch({ headless: true });

  await test("catálogo de 43 estações e pesquisa", async () => {
    const page = await launchPage();
    try {
      assert.equal(await page.locator("#grid > li").count(), 43);
      await page.locator("#search").fill("Antena");
      assert.equal(await page.locator("#grid > li:visible").count(), 3);
    } finally { await page.close(); }
  });

  await test("favoritos e filtro sem perda de estado", async () => {
    const page = await launchPage();
    try {
      await page.locator("#grid > li").first().locator(".fav").click();
      await page.locator('#filters button[data-filter="fav"]').click();
      assert.equal(await page.locator("#grid > li:visible").count(), 1);
    } finally { await page.close(); }
  });

  await test("rejeição de uma reprodução anterior não afeta a nova rádio", async () => {
    const page = await launchPage();
    try {
      const buttons = page.locator("#grid > li .play-btn");
      await buttons.nth(0).click();
      await buttons.nth(1).click();
      await page.evaluate(() => {
        window.__pendingPlays[0].reject(Object.assign(new Error("Erro antigo"), { name: "NotSupportedError" }));
      });
      await page.waitForTimeout(100);
      assert.equal(await page.locator("#pStatus").innerText(), "A ligar…");
      await page.evaluate(() => {
        window.__pendingPlays[1].resolve();
        document.querySelector("#audio").dispatchEvent(new Event("playing"));
      });
      assert.match(await page.locator("#pStatus").innerText(), /Em direto/);
    } finally { await page.close(); }
  });

  await test("pausa invalida erro atrasado", async () => {
    const page = await launchPage();
    try {
      const button = page.locator("#grid > li .play-btn").first();
      await button.click();
      await button.click();
      await page.evaluate(() => {
        window.__pendingPlays[0].reject(Object.assign(new Error("Rejeição após pausa"), { name: "NotAllowedError" }));
      });
      await page.waitForTimeout(100);
      assert.equal(await page.locator("#pStatus").innerText(), "Em pausa");
    } finally { await page.close(); }
  });

  await test("HLS sem suporte nativo inicia via hls.js simulado", async () => {
    const page = await launchPage();
    try {
      await page.evaluate(() => {
        class FakeHls {
          static Events = { MANIFEST_PARSED: "manifest", ERROR: "error" };
          static isSupported() { return true; }
          handlers = {};
          on(name, fn) { this.handlers[name] = fn; }
          loadSource() {}
          attachMedia() { queueMicrotask(() => this.handlers.manifest?.()); }
          destroy() {}
        }
        window.Hls = FakeHls;
      });
      await page.locator("#search").fill("CM Rádio");
      await page.locator("#grid > li:visible .play-btn").click();
      await page.waitForFunction(() => window.__pendingPlays.length === 1);
      await page.evaluate(() => {
        window.__pendingPlays[0].resolve();
        document.querySelector("#audio").dispatchEvent(new Event("playing"));
      });
      assert.match(await page.locator("#pStatus").innerText(), /Em direto/);
    } finally { await page.close(); }
  });

  await test("falha fatal de HLS termina o stream e oferece nova tentativa", async () => {
    const page = await launchPage();
    try {
      await page.evaluate(() => {
        class FakeHls {
          static Events = { MANIFEST_PARSED: "manifest", ERROR: "error" };
          static isSupported() { return true; }
          constructor() { window.__fakeHls = this; }
          handlers = {};
          on(name, fn) { this.handlers[name] = fn; }
          loadSource() {}
          attachMedia() {}
          destroy() { this.destroyed = true; }
        }
        window.Hls = FakeHls;
      });
      await page.locator("#search").fill("CM Rádio");
      await page.locator("#grid > li:visible .play-btn").click();
      await page.waitForFunction(() => !!window.__fakeHls);
      await page.evaluate(() => window.__fakeHls.handlers.error(null, { fatal: true, type: "networkError" }));
      assert.match(await page.locator("#pStatus").innerText(), /ligação HLS falhou/);
      assert.equal(await page.locator("#retryBtn").isVisible(), true);
      assert.equal(await page.evaluate(() => window.__fakeHls.destroyed), true);
    } finally { await page.close(); }
  });

  await test("pausar durante carregamento HLS impede reprodução atrasada", async () => {
    const page = await launchPage();
    try {
      await page.evaluate(() => {
        class FakeHls {
          static Events = { MANIFEST_PARSED: "manifest", ERROR: "error" };
          static isSupported() { return true; }
          constructor() { window.__fakeHls = this; }
          handlers = {};
          on(name, fn) { this.handlers[name] = fn; }
          loadSource() {}
          attachMedia() {}
          destroy() {}
        }
        window.Hls = FakeHls;
      });
      await page.locator("#search").fill("CM Rádio");
      const button = page.locator("#grid > li:visible .play-btn");
      await button.click();
      await page.waitForFunction(() => !!window.__fakeHls);
      await button.click();
      await page.evaluate(() => window.__fakeHls.handlers.manifest());
      assert.equal(await page.locator("#pStatus").innerText(), "Em pausa");
      assert.equal(await page.evaluate(() => window.__pendingPlays.length), 0);
    } finally { await page.close(); }
  });

  await test("timeout de ligação mostra erro e permite repetir", async () => {
    const page = await launchPage();
    try {
      await page.clock.install();
      await page.locator("#grid > li .play-btn").first().click();
      await page.clock.fastForward(16000);
      assert.match(await page.locator("#pStatus").innerText(), /demorou demasiado tempo/);
      assert.equal(await page.locator("#retryBtn").isVisible(), true);
    } finally { await page.close(); }
  });

  await test("HLS externo exige SRI SHA-384 e CORS e reage à falha do CDN", async () => {
    const page = await launchPage();
    try {
      await page.locator("#search").fill("CM Rádio");
      await page.locator("#grid > li:visible .play-btn").click();
      const info = await page.locator('script[src*="hls.min.js"]').evaluate(s => ({
        src: s.src, integrity: s.integrity, crossOrigin: s.crossOrigin,
      }));
      assert.equal(info.src, "https://cdn.jsdelivr.net/npm/hls.js@1.7.4/dist/hls.min.js");
      assert.match(info.integrity, /^sha384-[A-Za-z0-9+/=]+$/);
      assert.equal(info.crossOrigin, "anonymous");
      await page.waitForFunction(() => document.querySelector("#pStatus")?.textContent.includes("Não foi possível carregar o suporte HLS"));
      assert.equal(await page.locator("#retryBtn").isVisible(), true);
    } finally { await page.close(); }
  });

  await test("bloqueio por autoplay produz mensagem específica", async () => {
    const page = await launchPage();
    try {
      await page.locator("#grid > li .play-btn").first().click();
      await page.evaluate(() => {
        window.__pendingPlays[0].reject(Object.assign(new Error("Bloqueado"), { name: "NotAllowedError" }));
      });
      await page.waitForTimeout(100);
      assert.match(await page.locator("#pStatus").innerText(), /bloqueou o início automático/);
      assert.equal(await page.locator("#retryBtn").isVisible(), true);
    } finally { await page.close(); }
  });
} finally {
  await browser?.close();
  server.kill();
}
const failed = results.filter(x => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} testes aprovados`);
if (failed.length) process.exitCode = 1;
