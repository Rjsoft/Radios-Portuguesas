// Teste de reprodução de rádio HLS REAL em Chromium. O áudio não é simulado.
// Este é um diagnóstico dependente da rede/CDN, não um teste de regressão determinístico.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const port = 18977;
const origin = `http://127.0.0.1:${port}/`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { stdio: "ignore" });
let browser;
const events = [];
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
    await sleep(100);
  }
  if (!ready) throw Error("Servidor local indisponível");
  browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  page.on("pageerror", e => events.push("JS: " + e.message));
  page.on("requestfailed", r => {
    if (r.url().startsWith("https://")) events.push("REDE: " + new URL(r.url()).host + " — " + (r.failure()?.errorText || "erro"));
  });
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.locator("#search").fill("CM Rádio");
  await page.locator("#grid > li:visible .play-btn").click();
  let status = "indeterminado";
  try {
    await page.waitForFunction(() => {
      const t = document.querySelector("#pStatus")?.textContent || "";
      return t.includes("Em direto") || t.includes("Não foi") || t.includes("falhou") ||
        t.includes("demorou") || t.includes("bloqueou") || t.includes("não suporta");
    }, { timeout: 22000 });
  } catch {}
  status = (await page.locator("#pStatus").innerText()).trim();
  const audio = await page.locator("#audio").evaluate(a => ({
    paused: a.paused,
    readyState: a.readyState,
    networkState: a.networkState,
    currentTime: a.currentTime,
    error: a.error?.code || null,
  }));
  console.log("Estação: CM Rádio (HLS)");
  console.log("Estado do leitor: " + status);
  console.log("HTMLMediaElement: " + JSON.stringify(audio));
  for (const message of events.slice(0, 12)) console.log(message);
  // Não basta o estado visual: exigir um elemento media a reproduzir.
  if (!status.includes("Em direto") || audio.paused || audio.readyState < 2) {
    console.error("INCONCLUSIVO/FALHA: não foi confirmada reprodução real no Chromium.");
    process.exitCode = 1;
  } else {
    console.log("OK: reprodução iniciada no Chromium (não confirma áudio audível em altifalantes).");
  }
} catch (error) {
  console.error("ERRO: " + error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
