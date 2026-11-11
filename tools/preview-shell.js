#!/usr/bin/env node
"use strict";
/**
 * Builds a tiny stand-alone page for working on the Aerospace shell (boot
 * screen, HUD, command deck) without loading the 80 MB game.
 *
 *   node tools/preview-shell.js [--out .cache/shell-preview.html]
 *
 * The page contains the real aerospace/shell files plus a mock "game": a WebGL
 * canvas that reports boot progress, shows a red loading frame for a moment and
 * then renders a moving scene, taking pointer lock on click like the real one.
 * Query flags: ?fast (short boot), ?nored (skip the red frame), ?crash.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SHELL = path.join(ROOT, "aerospace", "shell");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

let out = path.join(ROOT, ".cache", "shell-preview.html");
for (let i = 2; i < process.argv.length; ++i) if (process.argv[i] === "--out") out = path.resolve(process.argv[++i]);

const dataURI = (file) => "data:image/png;base64," + fs.readFileSync(path.join(SHELL, file)).toString("base64");
const tokens = { "{{EMBLEM_DATA_URI}}": dataURI("emblem.png"), "{{GAME_VERSION}}": "26.3", "{{CLIENT_VERSION}}": pkg.version };
function template(file) {
  let text = fs.readFileSync(path.join(SHELL, file), "utf8");
  for (const [k, v] of Object.entries(tokens)) text = text.split(k).join(v);
  return text;
}

const MOCK_GAME = `
(function () {
	var q = new URLSearchParams(location.search);
	var fast = q.has("fast"), noRed = q.has("nored");
	var frame = document.getElementById("game_frame");
	var canvas = document.createElement("canvas");
	canvas.tabIndex = 0;
	canvas.style.cssText = "width:100%;height:100%;display:block;outline:none";
	frame.appendChild(canvas);
	var gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
	window.__mock = { keys: [], wheels: 0, clicks: 0, phase: "boot" };
	window.addEventListener("keydown", function (e) { window.__mock.keys.push("down:" + e.code); e.preventDefault(); e.stopPropagation(); });
	window.addEventListener("keyup", function (e) { window.__mock.keys.push("up:" + e.code); });
	canvas.addEventListener("wheel", function () { window.__mock.wheels++; });
	canvas.addEventListener("mousedown", function () { window.__mock.clicks++; if (window.__mock.phase === "title") canvas.requestPointerLock(); });
	var steps = [[30, "Downloading assets… 12.0 MB / 32.2 MB"], [55, "Loading Eaglercraft 26.3 runtime…"], [80, "Starting Minecraft…"], [95, "Almost there…"]];
	var delay = fast ? 120 : 900, i = 0;
	function next() {
		if (q.has("crash") && i === 2) {
			var p = document.createElement("div");
			p.className = "_eaglercraftX_crash_element";
			p.style.cssText = "position:fixed;inset:0;z-index:2147483647;padding:32px;font:14px monospace";
			p.textContent = "Aerospace Client could not continue.\\n\\nmock crash";
			frame.appendChild(p);
			return;
		}
		if (i < steps.length) { window.__eaglerBoot(steps[i][0], steps[i][1]); i++; setTimeout(next, delay); return; }
		window.__mock.phase = noRed ? "title" : "red";
		window.__eaglerGameReady = true;
		if (!noRed) setTimeout(function () { window.__mock.phase = "title"; }, fast ? 700 : 2600);
	}
	setTimeout(next, fast ? 200 : 1500);
	function draw(t) {
		var w = frame.clientWidth, h = frame.clientHeight;
		if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
		gl.viewport(0, 0, w, h);
		gl.disable(gl.SCISSOR_TEST);
		if (window.__mock.phase === "red") gl.clearColor(239 / 255, 50 / 255, 61 / 255, 1);
		else if (window.__mock.phase === "title") gl.clearColor(0.05, 0.09, 0.2, 1);
		else gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		if (window.__mock.phase === "title") {      // moving blocks so zoom and filters are visible
			gl.enable(gl.SCISSOR_TEST);
			for (var k = 0; k < 14; ++k) {
				var x = (Math.sin(t / 1500 + k) * 0.4 + 0.5) * w, y = ((k + 0.5) / 14) * h;
				gl.scissor(x - 30, y - 12, 60, 24);
				gl.clearColor(0.2 + 0.05 * k, 0.7 - 0.03 * k, 0.3 + 0.04 * k, 1);
				gl.clear(gl.COLOR_BUFFER_BIT);
			}
			gl.scissor(w / 2 - 4, h / 2 - 4, 8, 8);
			gl.clearColor(1, 1, 1, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}
		window.requestAnimationFrame(draw);       // looked up each frame, like the real game
	}
	window.requestAnimationFrame(draw);
})();
`;

const html = `<!DOCTYPE html>
<html style="width:100%;height:100%;background-color:black;">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Aerospace Client shell preview</title>
<script>
// same contract as the real loader
window.__log = [];
window.__eaglerBoot = function (pct, text) { window.__log.push("BOOTSTAGE:" + pct + ":" + text); };
</script>
<style>
${template("aerospace.css")}
</style>
</head>
<body style="position:fixed;inset:0;margin:0;width:100%;height:100%;overflow:hidden;background-color:black;">
<div id="loading_screen"><div id="boot_status"></div></div>
<div id="game_frame" style="position:fixed;inset:0;margin:0;width:100%;height:100%;overflow:hidden;background-color:black;"></div>
${template("boot.html").trimEnd()}
<script id="aerospace-boot">
${template("boot.js")}</script>
<script id="aerospace-client">
${template("client.js")}</script>
<script id="mock-game">${MOCK_GAME}</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log("[aerospace] wrote " + path.relative(ROOT, out) + " (open it in a browser)");
