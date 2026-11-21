#!/usr/bin/env node
"use strict";
/**
 * End-to-end check of the Aerospace shell against the mock game in
 * .cache/shell-preview.html (see tools/preview-shell.js). The mock presents
 * frames exactly like Eaglercraft 26.3, so this exercises the shader engine the
 * way the real client does.
 *
 *   node tools/check-shell.js
 *
 * Needs Playwright with Chromium (it is not a dependency of this repo):
 *   npm install --no-save playwright && npx playwright install chromium
 *
 * Checks, for every shader look and the client mods that touch the frame:
 *   - the engine attaches and every present goes through it
 *   - no WebGL errors, and the texture unit it borrows is restored after each draw
 *   - "Stock" is an exact passthrough, other looks change the picture, Noir is grey
 *   - motion blur, the screenshot key, and the CSS fallback when the engine is off
 */
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  console.error("[aerospace] check:shell needs Playwright with Chromium:\n"
    + "  npm install --no-save playwright && npx playwright install chromium");
  process.exit(2);
}

const failures = [];
function check(ok, what, detail) {
  console.log((ok ? "  ok   " : "  FAIL ") + what + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures.push(what);
}

async function frameStats(page) {
  // mean colour + channel spread of the next presented frame, via the engine's capture()
  return page.evaluate(async () => {
    const blob = await window.__aerospaceShaders.capture();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = 96; c.height = 54;
    const g = c.getContext("2d");
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let r = 0, gg = 0, b = 0, spread = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; gg += d[i + 1]; b += d[i + 2];
      spread = Math.max(spread, Math.abs(d[i] - d[i + 1]), Math.abs(d[i + 1] - d[i + 2]));
    }
    const n = d.length / 4;
    return { r: r / n, g: gg / n, b: b / n, spread, sig: Array.from(d.slice(0, 4000)).join(",") };
  });
}
function gl(page) {
  return page.evaluate(() => ({
    active: window.__aerospaceShaders.active, failed: window.__aerospaceShaders.failed,
    errors: window.__mock.glErrors, unit15: window.__mock.unit15Restored, unit0: window.__mock.activeRestored
  }));
}

(async () => {
  execFileSync(process.execPath, [path.join(__dirname, "preview-shell.js")], { stdio: "inherit" });
  const url = "file://" + path.join(ROOT, ".cache", "shell-preview.html");
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, acceptDownloads: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto(url + "?fast&nored");
    await page.waitForFunction(() => window.__aerospaceBootDone && window.__mock.phase === "title", null, { timeout: 30000 });
    await page.waitForTimeout(800);

    console.log("shader engine");
    let s = await gl(page);
    check(s.active, "engine attached to the present pass", s.failed || "");
    const stock = await frameStats(page);

    const looks = await page.evaluate(() => {
      window.__aerospaceClient.open("shaders");
      return Array.from(document.querySelectorAll(".aero-look strong")).map((n) => n.textContent).filter((t) => t !== "Custom");
    });
    for (const name of looks) {
      await page.click('.aero-look:has-text("' + name + '")');
      await page.waitForTimeout(250);
      const f = await frameStats(page);
      s = await gl(page);
      check(s.errors === 0 && s.unit15 && s.unit0, "look " + name + ": GL state clean", JSON.stringify(s));
      if (name === "Stock") check(f.sig === stock.sig, "Stock is an exact passthrough");
      else check(f.sig !== stock.sig, "look " + name + " changes the picture");
      if (name === "Noir") check(f.spread <= 2, "Noir is greyscale", "max channel spread " + f.spread);
    }

    console.log("client mods");
    await page.click('.aero-tab:has-text("Client Mods")');
    await page.click('.aero-pane.on .aero-card:has-text("Motion blur")');
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    s = await gl(page);
    check(s.errors === 0 && s.unit15 && s.unit0, "motion blur: GL state clean", JSON.stringify(s));
    const download = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await page.keyboard.press("F9");
    const file = await download;
    const toasts = await page.$$eval(".aero-toast", (t) => t.map((x) => x.textContent).join(" | "));
    check(!!file || /copied/.test(toasts), "screenshot key produces a PNG", file ? file.suggestedFilename() : toasts);

    console.log("fallback without the engine");
    const page2 = await context.newPage();
    await page2.addInitScript(() => {
      Object.defineProperty(window, "__aerospaceShaders", { configurable: true, set(v) { v.disabled = true; this.__s = v; }, get() { return this.__s; } });
    });
    await page2.goto(url + "?fast&nored");
    await page2.waitForFunction(() => window.__aerospaceBootDone && window.__mock.phase === "title", null, { timeout: 30000 });
    await page2.evaluate(() => {
      window.__aerospaceClient.open("shaders");
      const sel = document.querySelector('.aero-pane.on .aero-row select');
      sel.value = "night";
      sel.dispatchEvent(new Event("change"));
    });
    const s2 = await page2.evaluate(() => ({ active: window.__aerospaceShaders.active, css: document.getElementById("game_frame").style.filter, errors: window.__mock.glErrors }));
    check(!s2.active && /sepia/.test(s2.css) && s2.errors === 0, "visor filter falls back to CSS", JSON.stringify(s2));

    check(pageErrors.length === 0, "no page errors", pageErrors.join(" | "));
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error("[aerospace] check:shell failed: " + failures.length + " check(s)");
    process.exit(1);
  }
  console.log("[aerospace] check:shell passed");
})().catch((e) => { console.error(e); process.exit(1); });
