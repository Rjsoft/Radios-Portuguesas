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
