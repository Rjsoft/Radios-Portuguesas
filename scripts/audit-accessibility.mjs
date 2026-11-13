// Auditoria de acessibilidade WCAG 2.2 A/AA em Chromium, sem streams externos.
// Execução no CI: npm install --no-save playwright@1.56.1 @axe-core/playwright@4.10.2
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const port = 18978;
const origin = `http://127.0.0.1:${port}/`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { stdio: "ignore" });
let browser;
let failures = 0;
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
    await sleep(100);
  }
  if (!ready) throw new Error("Servidor HTTP local indisponível");
  browser = await chromium.launch({ headless: true });
  for (const scenario of [
    { name: "desktop claro", width: 1280, height: 800, dark: false },
    { name: "desktop escuro", width: 1280, height: 800, dark: true },
    { name: "móvel claro", width: 375, height: 812, dark: false },
    { name: "móvel escuro", width: 375, height: 812, dark: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height },
      colorScheme: scenario.dark ? "dark" : "light" });
    const page = await context.newPage();
    try {
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      if (scenario.dark) {
        await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
      }
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      console.log(`\n${scenario.name}: ${results.violations.length} regras com infrações`);
      for (const violation of results.violations) {
        console.log(`- [${violation.impact}] ${violation.id}: ${violation.help}`);
        for (const node of violation.nodes.slice(0, 5)) console.log(`  ${node.target.join(" ")}: ${node.failureSummary?.slice(0, 240)}`);
      }
      failures += results.violations.length;
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        playerHeight: Math.round(document.querySelector(".player").getBoundingClientRect().height),
        width: window.innerWidth,
      }));
      console.log("Layout: " + JSON.stringify(metrics));
      if (metrics.overflow) { console.log("ERRO: overflow horizontal"); failures++; }
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  server.kill();
}
console.log(`\nAuditoria automática: ${failures} ocorrência(s). Verificação manual de WCAG continua necessária.`);
if (failures) process.exitCode = 1;
