#!/usr/bin/env node
"use strict";
/**
 * Builds a tiny stand-alone page for working on the Aerospace shell (boot
 * screen, HUD, command deck) without loading the 80 MB game.
 *
 *   node tools/preview-shell.js [--out .cache/shell-preview.html]
 *
 * The page contains the real aerospace/shell files plus a mock "game": a WebGL2
 * canvas that reports boot progress, shows a red loading frame for a moment and
 * then renders a moving scene, taking pointer lock on click like the real one.
 * Frames reach the screen through a copy of the game's own present pass (same
 * shaders, same GL calls), so the Aerospace shader engine hooks in as it would
 * in the real client.
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
	"use strict";
	var q = new URLSearchParams(location.search);
	var fast = q.has("fast"), noRed = q.has("nored");
	var frame = document.getElementById("game_frame");
	var canvas = document.createElement("canvas");
	canvas.tabIndex = 0;
	canvas.style.cssText = "width:100%;height:100%;display:block;outline:none";
	frame.appendChild(canvas);
	// Same context attributes as the real game (PlatformRuntime.getWebGL2Context0).
	var gl = canvas.getContext("webgl2", { antialias: false, depth: true, alpha: false, powerPreference: "high-performance",
		premultipliedAlpha: false, preserveDrawingBuffer: false, stencil: false });
	var M = window.__mock = { keys: [], wheels: 0, clicks: 0, phase: "boot", presents: 0, glErrors: 0, unit15Restored: true, activeRestored: true };
	window.addEventListener("keydown", function (e) { M.keys.push("down:" + e.code); e.preventDefault(); e.stopPropagation(); });
	window.addEventListener("keyup", function (e) { M.keys.push("up:" + e.code); });
	canvas.addEventListener("wheel", function () { M.wheels++; });
	canvas.addEventListener("mousedown", function () { M.clicks++; if (M.phase === "title") canvas.requestPointerLock(); });

	// ---- the game's offscreen colour target ------------------------------------
	var target = null, targetFbo = gl.createFramebuffer(), tw = 0, th = 0;
	function ensureTarget(w, h) {
		if (target && tw === w && th === h) return;
		if (target) gl.deleteTexture(target);
		target = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, target);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
		tw = w; th = h;
	}
	// A hostile texture parked on unit 15, like an integer lookup table the game
	// might leave there. Sampling it as sampler2D would fail the present draw.
	var decoy = gl.createTexture();
	gl.activeTexture(gl.TEXTURE15);
	gl.bindTexture(gl.TEXTURE_2D, decoy);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, 1, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, new Uint32Array([7]));
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.activeTexture(gl.TEXTURE3);

	function rect(x, y, w, h, r, g, b) {
		gl.scissor(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
		gl.clearColor(r, g, b, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}
	function drawScene(t, w, h) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
		gl.viewport(0, 0, w, h);
		gl.enable(gl.SCISSOR_TEST);
		if (M.phase === "red") { rect(0, 0, w, h, 239 / 255, 50 / 255, 61 / 255); return; }
		if (M.phase !== "title") { rect(0, 0, w, h, 0, 0, 0); return; }
		for (var i = 0; i < 12; ++i) {           // sky gradient
			var f = i / 11;
			rect(0, h * f, w, h / 12 + 1, 0.25 + 0.3 * f, 0.45 + 0.3 * f, 0.85);
		}
		rect(0, 0, w, h * 0.32, 0.28, 0.55, 0.22);  // grass
		rect(0, 0, w, h * 0.12, 0.45, 0.32, 0.2);   // dirt
		for (var k = 0; k < 10; ++k) {              // moving blocks
			var x = (Math.sin(t / 1400 + k) * 0.42 + 0.5) * w, y = h * (0.35 + 0.05 * (k % 6));
			rect(x - 26, y - 26, 52, 52, 0.55 + 0.04 * k, 0.4, 0.25 + 0.05 * k);
		}
		rect(w * 0.78 - 30, h * 0.8 - 30, 60, 60, 1, 0.98, 0.85);    // sun (for glow)
		rect(w / 2 - 182, 6, 364, 44, 0.12, 0.12, 0.14);              // hotbar
		for (var s = 0; s < 9; ++s) rect(w / 2 - 178 + s * 40, 10, 36, 36, 0.3, 0.3, 0.34);
		rect(w / 2 - 1, h / 2 - 10, 2, 20, 1, 1, 1);                  // crosshair
		rect(w / 2 - 10, h / 2 - 1, 20, 2, 1, 1, 1);
	}

	// ---- the present pass, call for call as in WebGL2CommandEncoder ------------
	var VSH = "#version 300 es\\nprecision highp float;\\nout vec2 v_uv;\\nvoid main() {\\n"
		+ "  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));\\n"
		+ "  v_uv = p;\\n  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\\n}\\n";
	var FSH = "#version 300 es\\nprecision highp float;\\nuniform sampler2D u_tex;\\nin vec2 v_uv;\\n"
		+ "out vec4 fragColor;\\nvoid main() {\\n  fragColor = texture(u_tex, v_uv);\\n}\\n";
	var presentProgram = null, presentTexLoc = null, presentVao = null, presentFailed = false;
	function ensurePresentPipeline() {
		if (presentProgram || presentFailed) return;
		var vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, VSH); gl.compileShader(vs);
		var fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, FSH); gl.compileShader(fs);
		if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
			presentFailed = true; M.presentError = "compile: " + gl.getShaderInfoLog(fs); return;
		}
		var prog = gl.createProgram();
		gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { presentFailed = true; M.presentError = "link: " + gl.getProgramInfoLog(prog); return; }
		gl.deleteShader(vs); gl.deleteShader(fs);
		presentTexLoc = gl.getUniformLocation(prog, "u_tex");
		presentVao = gl.createVertexArray();
		presentProgram = prog;
	}
	function presentTexture(w, h) {
		ensurePresentPipeline();
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, w, h);
		gl.disable(gl.SCISSOR_TEST); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
		gl.disable(gl.CULL_FACE); gl.disable(gl.STENCIL_TEST);
		gl.depthMask(true); gl.colorMask(true, true, true, true);
		if (presentProgram) {
			gl.useProgram(presentProgram);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindSampler(0, null);
			gl.bindTexture(gl.TEXTURE_2D, target);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.uniform1i(presentTexLoc, 0);
			gl.bindVertexArray(presentVao);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.bindVertexArray(null);
		}
		// what the rest of the game relies on after a present
		var err = gl.getError();
		if (err !== gl.NO_ERROR) { M.glErrors++; M.lastGlError = err; }
		if (gl.getParameter(gl.ACTIVE_TEXTURE) !== gl.TEXTURE0) M.activeRestored = false;
		gl.activeTexture(gl.TEXTURE15);
		if (gl.getParameter(gl.TEXTURE_BINDING_2D) !== decoy) M.unit15Restored = false;
		gl.activeTexture(gl.TEXTURE3);
		M.presents++;
	}

	var steps = [[30, "Downloading assets… 12.0 MB / 32.2 MB"], [55, "Loading Eaglercraft 26.3 runtime…"], [80, "Starting Minecraft…"], [95, "Almost there…"]];
	var delay = fast ? 120 : 900, si = 0;
	function next() {
		if (q.has("crash") && si === 2) {
			var p = document.createElement("div");
			p.className = "_eaglercraftX_crash_element";
			p.style.cssText = "position:fixed;inset:0;z-index:2147483647;padding:32px;font:14px monospace";
			p.textContent = "Aerospace Client could not continue.\\n\\nmock crash";
			frame.appendChild(p);
			return;
		}
		if (si < steps.length) { window.__eaglerBoot(steps[si][0], steps[si][1]); si++; setTimeout(next, delay); return; }
		M.phase = noRed ? "title" : "red";
		window.__eaglerGameReady = true;
		if (!noRed) setTimeout(function () { M.phase = "title"; }, fast ? 700 : 2600);
	}
	setTimeout(next, fast ? 200 : 1500);
	function loop(t) {
		var w = frame.clientWidth, h = frame.clientHeight;
		if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
		var bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
		ensureTarget(bw, bh);
		drawScene(t, bw, bh);
		presentTexture(bw, bh);
		window.requestAnimationFrame(loop);       // looked up each frame, like the real game
	}
	window.requestAnimationFrame(loop);
})();
`;

const html = `<!DOCTYPE html>
<html style="width:100%;height:100%;background-color:black;">
<head>
<script type="text/javascript" id="aerospace-crashlog">
${template("crashlog.js")}</script>
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
<script id="aerospace-shaders">
${template("shaders.js")}</script>
<script id="aerospace-client">
${template("client.js")}</script>
<script id="mock-game">${MOCK_GAME}</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log("[aerospace] wrote " + path.relative(ROOT, out) + " (open it in a browser)");
