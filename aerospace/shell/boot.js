/*
 * Aerospace Client — boot screen.
 *
 * Replaces the stock splash with a starfield + progress bar, driven by the
 * loader's own window.__eaglerBoot(pct, text) callbacks. It stays up through the
 * game's first-frame resource reload (the stock red logo screen) and fades out
 * once the title screen is actually visible.
 */
(function () {
	"use strict";
	var root = document.getElementById("aero_boot");
	if (!root) return;
	var fill = document.getElementById("aero_boot_fill");
	var status = document.getElementById("aero_boot_status");
	var tip = document.getElementById("aero_boot_tip");
	var canvas = document.getElementById("aero_boot_stars");
	var raf = window.requestAnimationFrame.bind(window);
	var reduceMotion = false;
	try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

	var TIPS = [
		"Tap Right Shift at any time to open the Aerospace command deck.",
		"Hold C in a world to zoom. Scroll while zooming to change magnification.",
		"The Visor tab can boost brightness for caves and night flights.",
		"Drag HUD instruments anywhere with “Edit HUD layout” in the command deck.",
		"Look up at night: the Moon is now a ringed ice world.",
		"New advancements await under the Aerospace tab. Try reaching the build limit.",
		"Four new space paintings are in the painting pool. Keep placing until one appears.",
		"Worlds are saved in this browser. Back them up from the world list before clearing site data."
	];

	// ---------------------------------------------------------------- stars
	var ctx = null, stars = [], dpr = 1, running = true, lastT = 0;
	function resize() {
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
		canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
	}
	function seedStars() {
		stars = [];
		var count = Math.round(Math.min(420, (window.innerWidth * window.innerHeight) / 4200));
		for (var i = 0; i < count; ++i) {
			stars.push({
				x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75,
				tw: Math.random() * Math.PI * 2, hue: Math.random()
			});
		}
	}
	function draw(t) {
		if (!running) return;
		var dt = Math.min(64, t - lastT || 16) / 1000;
		lastT = t;
		var w = canvas.width, h = canvas.height;
		ctx.clearRect(0, 0, w, h);
		for (var i = 0; i < stars.length; ++i) {
			var s = stars[i];
			if (!reduceMotion) {
				s.y -= dt * 0.012 * s.z * s.z;       // slow upward drift: we are climbing
				if (s.y < -0.01) { s.y = 1.01; s.x = Math.random(); }
				s.tw += dt * (0.8 + s.z * 1.6);
			}
			var a = (0.35 + 0.65 * s.z) * (0.72 + 0.28 * Math.sin(s.tw));
			var r = (0.5 + s.z * 1.1) * dpr;
			ctx.globalAlpha = a;
			ctx.fillStyle = s.hue < 0.16 ? "#ffd9a8" : s.hue > 0.78 ? "#b4d2ff" : "#ffffff";
			ctx.beginPath();
			ctx.arc(s.x * w, s.y * h, r, 0, 6.2832);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
		if (!reduceMotion) raf(draw);
	}
	try {
		ctx = canvas.getContext("2d");
		resize();
		seedStars();
		window.addEventListener("resize", function () { if (running) { resize(); if (reduceMotion) draw(0); } });
		raf(draw);
	} catch (e) { ctx = null; }

	// ------------------------------------------------------------- progress
	var shown = 0, target = 0, sawBootSignal = false, startedAt = Date.now();
	function setProgress(pct) {
		target = Math.max(target, Math.min(100, pct));
		if (target > shown) { shown = target; fill.style.width = shown.toFixed(1) + "%"; }
	}
	function setStatus(text) {
		if (!text) return;
		status.textContent = String(text).replace(/Eaglercraft(X)?/g, "Aerospace Client");
	}
	// Before Java starts reporting, the page is decoding + compiling ~26 MB of
	// WebAssembly with no progress events; creep toward 26% so it never looks stuck.
	var creep = setInterval(function () {
		if (sawBootSignal) { clearInterval(creep); return; }
		var elapsed = (Date.now() - startedAt) / 1000;
		setProgress(26 * (1 - Math.exp(-elapsed / 9)));
		if (elapsed > 2 && elapsed < 2.3) setStatus("Unpacking flight computer…");
		if (elapsed > 9 && elapsed < 9.3) setStatus("Compiling engines (first launch takes longest)…");
	}, 250);

	var upstreamBoot = window.__eaglerBoot;
	window.__eaglerBoot = function (pct, text) {
		try { if (typeof upstreamBoot === "function") upstreamBoot.apply(this, arguments); } catch (e) {}
		try {
			sawBootSignal = true;
			if (typeof pct === "number") setProgress(pct);
			setStatus(text);
		} catch (e) {}
	};

	var tipIndex = Math.floor(Math.random() * TIPS.length);
	function nextTip() {
		tip.style.opacity = "0";
		setTimeout(function () {
			tip.textContent = TIPS[tipIndex % TIPS.length];
			tipIndex++;
			tip.style.opacity = "1";
		}, 280);
	}
	nextTip();
	var tipTimer = setInterval(nextTip, 6500);

	// -------------------------------------------------------------- dismiss
	var dismissed = false;
	function dismiss(immediate) {
		if (dismissed) return;
		dismissed = true;
		clearInterval(tipTimer);
		clearInterval(creep);
		window.__aerospaceBootDone = true;
		try { window.dispatchEvent(new Event("aerospace:ready")); } catch (e) {}
		if (immediate) { running = false; if (root.parentNode) root.parentNode.removeChild(root); return; }
		setProgress(100);
		root.classList.add("is-leaving");
		setTimeout(function () { running = false; if (root.parentNode) root.parentNode.removeChild(root); }, 600);
	}
	window.__aerospaceDismissBoot = dismiss;

	// The game's first frames are its own resource-loading overlay (solid red
	// behind the logo). Sample the canvas corners and wait for that to clear.
	var probe = null, probeCtx = null;
	function sampleOverlay(gameCanvas) {
		// returns "red" | "other" | "blank"
		try {
			if (!probe) {
				probe = document.createElement("canvas");
				probe.width = 8; probe.height = 8;
				probeCtx = probe.getContext("2d", { willReadFrequently: true });
			}
			probeCtx.clearRect(0, 0, 8, 8);
			probeCtx.drawImage(gameCanvas, 0, 0, 8, 8);
			var d = probeCtx.getImageData(0, 0, 8, 8).data;
			var corners = [0, 7, 56, 63], red = 0, blank = 0;
			for (var i = 0; i < 4; ++i) {
				var o = corners[i] * 4, r = d[o], g = d[o + 1], b = d[o + 2], a = d[o + 3];
				if (a < 8 || r + g + b < 12) blank++;
				else if (r > 150 && g < 120 && b < 120 && r > g * 1.8) red++;
			}
			if (red >= 3) return "red";
			if (blank === 4) return "blank";
			return "other";
		} catch (e) { return "blank"; }
	}

	var HOLD_LIMIT_MS = 30000;      // never hide the game for longer than this
	var BLANK_GRACE_MS = 1500;      // unreadable canvas: just reveal the game
	function holdForTitle() {
		root.classList.add("is-holding");
		setProgress(100);
		setStatus("Final approach: loading resources…");
		var readyAt = Date.now(), clear = 0, sawRed = false;
		function tick() {
			if (dismissed) return;
			var held = Date.now() - readyAt;
			if (document.querySelector("._eaglercraftX_crash_element") || window.__err) { dismiss(true); return; }
			var gameCanvas = document.querySelector("#game_frame canvas");
			var state = gameCanvas ? sampleOverlay(gameCanvas) : "blank";
			if (state === "red") { sawRed = true; clear = 0; }
			else if (state === "other") { clear++; }
			if (held > HOLD_LIMIT_MS) { dismiss(false); return; }
			if (clear >= 4 && (sawRed || held > 900)) { dismiss(false); return; }
			if (state === "blank" && !sawRed && held > BLANK_GRACE_MS) { dismiss(false); return; }
			raf(tick);
		}
		raf(tick);
	}

	var pollStarted = Date.now();
	(function poll() {
		if (dismissed) return;
		if (document.querySelector("._eaglercraftX_crash_element") || window.__err) { dismiss(true); return; }
		if (window.__eaglerGameReady === true) { holdForTitle(); return; }
		if (Date.now() - pollStarted > 300000) { dismiss(true); return; }
		setTimeout(poll, 120);
	})();
})();
