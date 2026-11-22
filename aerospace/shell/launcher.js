/*
 * Aerospace Client — launcher.
 *
 * The page shows this menu while the browser is still reading the game file,
 * and the game prepares itself in the background (decoding and compiling its
 * WebAssembly). Only the final start of the game waits for LAUNCH, through the
 * promise window.__aerospaceLaunchGate, so launching is quick.
 *
 * On LAUNCH the menu is torn down completely (animation frame cancelled, every
 * listener removed through one AbortController, timers cleared, audio closed,
 * canvas released, nodes removed), and a small loading screen reports the
 * game's real milestones until its first frame is on screen; then that is
 * removed too.
 *
 * Progress is never estimated with a timer. It comes from: the game data
 * blocks arriving in the page (their sizes are known at build time), the
 * loader's own log lines (compiled, instantiated), the game's start-up stages
 * (window.__eaglerBoot) and its first rendered frame.
 */
(function () {
	"use strict";
	var VERSION = "{{CLIENT_VERSION}}";
	var GAME_VERSION = "{{GAME_VERSION}}";
	var PAYLOADS = {{PAYLOAD_MARKS}};
	var root = document.getElementById("aero_launcher");
	var loadingEl = document.getElementById("aero_loading");
	if (!root || !loadingEl) return;

	var NS = "Aerospace:";
	function load(key, fallback) {
		try { var v = localStorage.getItem(NS + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
	}
	function save(key, value) { try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch (e) {} }
	function q(sel, base) { return (base || root).querySelector(sel); }
	function k(name, base) { return (base || root).querySelector('[data-k="' + name + '"]'); }
	function el(tag, attrs, kids) {
		var n = document.createElement(tag);
		if (attrs) for (var a in attrs) {
			if (a === "text") n.textContent = attrs[a];
			else if (a === "class") n.className = attrs[a];
			else n.setAttribute(a, attrs[a]);
		}
		(kids || []).forEach(function (c) { if (c) n.appendChild(c); });
		return n;
	}

	var DEFAULTS = { sound: true, drone: false, density: "med", motion: "auto", skipBoot: false, fps: true };
	var settings = {};
	var stored = load("settings", {});
	for (var dk in DEFAULTS) settings[dk] = (stored && dk in stored) ? stored[dk] : DEFAULTS[dk];
	function saveSettings() { save("settings", settings); }

	var prefersReduced = false;
	try { prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
	function reduced() { return settings.motion === "on" || (settings.motion === "auto" && prefersReduced); }

	// one switch to remove every launcher listener at launch
	var ac = new AbortController();
	var on = function (target, type, fn, opts) {
		var o = { signal: ac.signal };
		if (opts) for (var x in opts) o[x] = opts[x];
		target.addEventListener(type, fn, o);
	};
	var timeouts = [], intervals = [];
	function later(fn, ms) { var id = setTimeout(fn, ms); timeouts.push(id); return id; }
	function every(fn, ms) { var id = setInterval(fn, ms); intervals.push(id); return id; }

	var devLines = [];
	function dev(line) {
		var t = ((performance.now()) / 1000).toFixed(1);
		devLines.push("[" + t + "s] " + line);
		if (devLines.length > 60) devLines.shift();
		var pre = k("dev");
		if (pre) pre.textContent = devLines.join("\n");
	}

	// ------------------------------------------------------- launch gate
	var releaseGate = null;
	window.__aerospaceLaunchGate = new Promise(function (resolve) { releaseGate = resolve; });

	// ------------------------------------------------------------- progress
	// Real milestones only.
	var MB = 1048576;
	var totalBytes = 0;
	PAYLOADS.forEach(function (p) { totalBytes += p.bytes; });
	var P = { seen: {}, received: 0, parsed: false, compiled: false, workers: false, instantiated: false,
		javaPct: null, javaText: "", started: false, ready: false, error: null, logIndex: 0 };
	function scanPayloads() {
		if (P.parsed) return;
		var bytes = 0, lastSeen = -1;
		for (var i = 0; i < PAYLOADS.length; ++i) {
			if (!P.seen[PAYLOADS[i].id] && document.getElementById(PAYLOADS[i].id)) P.seen[PAYLOADS[i].id] = true;
			if (P.seen[PAYLOADS[i].id]) lastSeen = i;
		}
		// a block counts as fully received once the next one has started
		for (var j = 0; j < lastSeen; ++j) bytes += PAYLOADS[j].bytes;
		P.received = bytes;
	}
	function scanLog() {
		var log = window.__log;
		if (!log || !log.length) return;
		for (; P.logIndex < log.length; ++P.logIndex) {
			var line = String(log[P.logIndex]);
			if (/compileStreaming path OK|fetched classes\.wasm/.test(line)) P.compiled = true;
			if (/dedicated mesh/.test(line)) P.workers = true;
			if (/wasm compiled \+ instantiated/.test(line)) P.instantiated = true;
			if (/main\(\[\]\) returned/.test(line)) P.started = true;
			// only the loader's own start-up errors are fatal; the game logs and retries others
			if (/^E:\[shell\]/.test(line) && !P.error) P.error = line.slice(2);
		}
	}
	var wrappedBoot = null;
	function hookJavaStages() {
		var fn = window.__eaglerBoot;
		if (typeof fn !== "function" || fn === wrappedBoot) return;
		wrappedBoot = function (pct, text) {
			try { if (typeof pct === "number") P.javaPct = pct; if (text) P.javaText = String(text); } catch (e) {}
			return fn.apply(this, arguments);
		};
		window.__eaglerBoot = wrappedBoot;
	}
	function scanErrors() {
		if (P.error) return;
		if (window.__err) P.error = String(window.__err);
		else if (document.querySelector("._eaglercraftX_crash_element")) P.error = "The game stopped while starting. Its crash screen has the details.";
	}
	function poll() {
		scanPayloads();
		scanLog();
		hookJavaStages();
		scanErrors();
		if (window.__loaded) P.instantiated = true;
	}
	function onParsed() { P.parsed = true; P.received = totalBytes; dev("page fully read: " + (totalBytes / MB).toFixed(1) + " MB of game data"); }
	if (document.readyState !== "loading") onParsed();
	else document.addEventListener("DOMContentLoaded", onParsed, { once: true });

	// one number for the bar, from the stage the game is really at
	function stage() {
		if (P.error) return { label: "LAUNCH FAILED", pct: null };
		if (P.ready) return { label: "READY", pct: 100 };
		if (P.javaPct !== null) {
			var t = P.javaText ? P.javaText.toUpperCase() : "STARTING ENGINE";
			return { label: t, pct: 55 + Math.min(40, Math.round(P.javaPct * 0.4)) };
		}
		if (P.started) return { label: "STARTING ENGINE", pct: 55 };
		if (P.instantiated) return { label: "ENGINE READY", pct: 55 };
		if (P.compiled) return { label: P.workers ? "INSTANTIATING ENGINE" : "COMPILING WORKERS", pct: P.workers ? 52 : 48 };
		if (P.parsed) return { label: "DECOMPRESSING AND COMPILING", pct: 36 };
		return { label: "RECEIVING GAME DATA " + (P.received / MB).toFixed(0) + " / " + (totalBytes / MB).toFixed(0) + " MB",
			pct: Math.round(35 * P.received / Math.max(1, totalBytes)) };
	}

	// ----------------------------------------------------------------- sound
	var audio = null, drone = null;
	function audioCtx() {
		if (!settings.sound) return null;
		if (!audio) {
			var C = window.AudioContext || window.webkitAudioContext;
			if (!C) return null;
			try { audio = new C(); } catch (e) { return null; }
		}
		if (audio.state === "suspended") audio.resume();
		return audio;
	}
	function tone(freq, dur, type, vol, slideTo, delay) {
		var a = audio;
		if (!a || !settings.sound || a.state !== "running") return;
		var t0 = a.currentTime + (delay || 0);
		var o = a.createOscillator(), g = a.createGain();
		o.type = type; o.frequency.setValueAtTime(freq, t0);
		if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
		g.gain.setValueAtTime(0.0001, t0);
		g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
		g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
		o.connect(g); g.connect(a.destination);
		o.start(t0); o.stop(t0 + dur + 0.02);
	}
	function blip() { tone(1320, 0.07, "sine", 0.035, 1760); }
	function confirmTone() { tone(196, 0.28, "triangle", 0.09, 147); tone(294, 0.3, "sine", 0.05, 220, 0.04); }
	function startDrone() {
		var a = audioCtx();
		if (!a || drone || !settings.drone) return;
		var g = a.createGain(), lp = a.createBiquadFilter(), o1 = a.createOscillator(), o2 = a.createOscillator();
		lp.type = "lowpass"; lp.frequency.value = 300; lp.Q.value = 0.7;
		o1.type = "sawtooth"; o1.frequency.value = 55; o2.type = "sawtooth"; o2.frequency.value = 55.35;
		g.gain.setValueAtTime(0.0001, a.currentTime);
		g.gain.exponentialRampToValueAtTime(0.03, a.currentTime + 4);
		o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(a.destination);
		o1.start(); o2.start();
		drone = { g: g, o: [o1, o2] };
	}
	function stopDrone() {
		if (!drone || !audio) return;
		var d = drone; drone = null;
		d.g.gain.cancelScheduledValues(audio.currentTime);
		d.g.gain.setValueAtTime(Math.max(0.0001, d.g.gain.value), audio.currentTime);
		d.g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.6);
		d.o.forEach(function (o) { o.stop(audio.currentTime + 0.65); });
	}
	function unlockAudio() {
		if (!settings.sound) return;
		audioCtx();
		if (settings.drone) startDrone();
	}
	on(root, "pointerdown", unlockAudio);
	on(root, "keydown", unlockAudio);
	on(root, "pointerenter", function (e) {
		var t = e.target;
		if (t && t.closest && t.closest("button, .aero-l-switch")) blip();
	}, { capture: true });

	// ------------------------------------------------------------- starfield
	var canvas = q(".aero-l-sky");
	var ctx2d = canvas.getContext("2d", { alpha: false });
	var stars = [], nebula = null, dpr = 1, W = 0, H = 0;
	var COUNTS = { low: 40, med: 80, high: 120 };
	var LAYERS = [{ speed: 3, size: 0.7, alpha: 0.45, share: 0.5 }, { speed: 7, size: 1.1, alpha: 0.7, share: 0.33 }, { speed: 14, size: 1.6, alpha: 1, share: 0.17 }];
	var starLimit = COUNTS[settings.density] || 80;
	function makeStars() {
		stars = [];
		for (var l = 0; l < LAYERS.length; ++l) {
			var n = Math.round(starLimit * LAYERS[l].share);
			for (var i = 0; i < n; ++i) stars.push({ x: Math.random() * W, y: Math.random() * H, l: l, tw: Math.random() * 6.28 });
		}
	}
	function makeNebula() {
		// drawn once, then only composited
		var size = 640;
		var c = document.createElement("canvas");
		c.width = size; c.height = size;
		var g = c.getContext("2d");
		var blobs = [[0.5, 0.5, 0.5, "26,26,62", 0.9], [0.38, 0.42, 0.32, "61,52,140", 0.45], [0.64, 0.58, 0.3, "36,80,160", 0.4],
			[0.55, 0.36, 0.22, "255,77,216", 0.1], [0.42, 0.66, 0.2, "77,216,255", 0.12], [0.7, 0.44, 0.16, "120,90,220", 0.25]];
		blobs.forEach(function (b) {
			var gr = g.createRadialGradient(b[0] * size, b[1] * size, 0, b[0] * size, b[1] * size, b[2] * size);
			gr.addColorStop(0, "rgba(" + b[3] + "," + b[4] + ")");
			gr.addColorStop(1, "rgba(" + b[3] + ",0)");
			g.fillStyle = gr;
			g.fillRect(0, 0, size, size);
		});
		nebula = c;
	}
	function resize() {
		dpr = Math.min(window.devicePixelRatio || 1, 1.5);
		W = Math.max(1, Math.floor(window.innerWidth * dpr));
		H = Math.max(1, Math.floor(window.innerHeight * dpr));
		canvas.width = W; canvas.height = H;
		makeStars();
		draw(performance.now(), 0);
	}
	var shooting = null, nextShoot = performance.now() + 8000 + Math.random() * 6000;
	function draw(now, dt) {
		var c = ctx2d;
		c.fillStyle = "#050510";
		c.fillRect(0, 0, W, H);
		if (nebula) {
			var s = Math.max(W, H) * 1.25;
			c.save();
			c.translate(W * 0.38, H * 0.42);
			c.rotate(reduced() ? 0.3 : now * 0.000012);
			c.globalAlpha = 0.95;
			c.drawImage(nebula, -s / 2, -s / 2, s, s);
			c.restore();
		}
		for (var i = 0; i < stars.length; ++i) {
			var st = stars[i], L = LAYERS[st.l];
			if (dt) { st.x -= L.speed * dpr * dt; if (st.x < -2) { st.x = W + 2; st.y = Math.random() * H; } }
			var a = L.alpha * (reduced() ? 1 : 0.75 + 0.25 * Math.sin(now * 0.0015 + st.tw));
			c.globalAlpha = a;
			c.fillStyle = st.l === 2 ? "#e8ecff" : "#bcd8ff";
			var sz = L.size * dpr;
			c.fillRect(st.x, st.y, sz, sz);
		}
		c.globalAlpha = 1;
		if (!reduced()) {
			if (!shooting && now > nextShoot) {
				shooting = { x: Math.random() * W * 0.6 + W * 0.3, y: Math.random() * H * 0.35, t0: now };
				nextShoot = now + 8000 + Math.random() * 6000;
			}
			if (shooting) {
				var p = (now - shooting.t0) / 650;
				if (p >= 1) shooting = null;
				else {
					var len = 140 * dpr, x = shooting.x - p * 360 * dpr, y = shooting.y + p * 150 * dpr;
					var gr = c.createLinearGradient(x, y, x + len, y - len * 0.42);
					gr.addColorStop(0, "rgba(232,236,255," + (0.9 * (1 - p)) + ")");
					gr.addColorStop(1, "rgba(77,216,255,0)");
					c.strokeStyle = gr; c.lineWidth = 1.6 * dpr;
					c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y - len * 0.42); c.stroke();
				}
			}
		}
	}

	// ------------------------------------------------- frame loop and meters
	var raf = 0, running = false, lastFrame = 0, lastDraw = 0;
	var fpsFrames = 0, fpsDraws = 0, fpsDrawMs = 0, fpsSince = 0, slowSeconds = 0;
	var fpsEl = q(".aero-l-fps");
	function frame(now) {
		raf = 0;
		if (!running) return;
		raf = requestAnimationFrame(frame);
		fpsFrames++;
		if (!fpsSince) fpsSince = now;
		if (!reduced() && now - lastDraw >= 33.2) {           // 30 fps cap
			var t0 = performance.now();
			draw(now, lastDraw ? Math.min(0.1, (now - lastDraw) / 1000) : 0);
			var ms = performance.now() - t0;
			fpsDraws++; fpsDrawMs += ms;
			lastDraw = now;
		}
		if (now - fpsSince >= 1000) {
			var secs = (now - fpsSince) / 1000;
			var fps = fpsFrames / secs, drawMs = fpsDraws ? fpsDrawMs / fpsDraws : 0;
			if (settings.fps && fpsEl) fpsEl.textContent = "FPS " + Math.round(fps) + " · " + drawMs.toFixed(1) + " MS";
			// degrade: twice in a row over 20 ms a frame, halve the stars
			if (drawMs > 20) {
				slowSeconds++;
				if (slowSeconds >= 2 && stars.length > 10) {
					var before = stars.length;
					stars = stars.filter(function (_, i) { return i % 2 === 0; });
					starLimit = stars.length;
					dev("starfield: draw " + drawMs.toFixed(1) + " ms for 2 s, stars " + before + " -> " + stars.length);
					slowSeconds = 0;
				}
			} else slowSeconds = 0;
			fpsFrames = 0; fpsDraws = 0; fpsDrawMs = 0; fpsSince = now;
			lastFrame = drawMs;
		}
	}
	function startLoop() {
		if (running || document.hidden) return;
		running = true; fpsSince = 0; lastDraw = 0;
		raf = requestAnimationFrame(frame);
	}
	function stopLoop() {
		running = false;
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	}
	on(document, "visibilitychange", function () { if (document.hidden) stopLoop(); else startLoop(); });
	on(window, "blur", stopLoop);
	on(window, "focus", startLoop);
	on(window, "resize", function () { resize(); });
	function applyMeters() { if (fpsEl) fpsEl.hidden = !settings.fps; }

	// --------------------------------------------------------------- splash
	var SPLASHES = [
		"Now in orbit", "Zero gravity, zero lag", "Handwritten among the stars", "The quiet side of the moon",
		"Powered by spite and starlight", "Fuel up, look up", "Mind the airlock", "Built for Chromebooks",
		"Five worlds and counting", "Gravity is optional", "Stars load first", "T-minus whenever you like",
		"Houston, we have blocks", "Rated for low orbit", "One small step, one big build", "Smells like rocket fuel",
		"Pack a Space Helmet", "Landing pads included", "Lithium-cooled, Sodium-fast", "Now with more moon",
		"No pixels were harmed", "Ringed planets, square stars", "Ground control approved", "Stay hydrated, astronaut"
	];
	var splashEl = q(".aero-l-splash"), splashIndex = Math.floor(Math.random() * SPLASHES.length);
	function showSplash() { splashEl.textContent = SPLASHES[splashIndex % SPLASHES.length]; splashIndex++; }
	function cycleSplash() {
		splashEl.classList.add("is-swapping");
		later(function () { showSplash(); splashEl.classList.remove("is-swapping"); }, reduced() ? 0 : 200);
	}

	// ------------------------------------------------------------------ tabs
	var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
	var current = "launch";
	function select(id, focusTab) {
		current = id;
		tabs.forEach(function (t) {
			var onTab = t.getAttribute("data-panel") === id;
			t.setAttribute("aria-selected", onTab ? "true" : "false");
			t.tabIndex = onTab ? 0 : -1;
			if (onTab && focusTab) t.focus();
		});
		Array.prototype.forEach.call(root.querySelectorAll(".aero-l-panel"), function (p) {
			p.classList.toggle("is-on", p.id === "aero_l_" + id);
		});
	}
	tabs.forEach(function (t) {
		on(t, "click", function () { select(t.getAttribute("data-panel"), true); });
	});
	var nav = q(".aero-l-nav");
	on(nav, "keydown", function (e) {
		var i = tabs.indexOf(document.activeElement);
		if (i < 0) return;
		var next = -1;
		if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % tabs.length;
		else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i + tabs.length - 1) % tabs.length;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = tabs.length - 1;
		else if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			var panel = document.getElementById(tabs[i].getAttribute("aria-controls"));
			var first = panel && panel.querySelector("button, input, [tabindex='0']");
			if (first) first.focus();
			return;
		}
		if (next >= 0) { e.preventDefault(); select(tabs[next].getAttribute("data-panel"), true); blip(); }
	});
	on(q(".aero-l-panels"), "keydown", function (e) {
		if (e.key !== "Escape") return;
		e.preventDefault();
		var t = root.querySelector('[role="tab"][aria-selected="true"]');
		if (t) t.focus();
	});

	// ---------------------------------------------------------- systems check
	var checks = k("checks");
	var checkRows = {};
	function checkRow(id, label) {
		var dt = el("dt", { text: label }), dd = el("dd", { text: "…" });
		checks.appendChild(dt); checks.appendChild(dd);
		checkRows[id] = dd;
	}
	function setCheck(id, text, tone) { var d = checkRows[id]; if (!d) return; d.textContent = text; d.className = tone || ""; }
	checkRow("webgl", "WEBGL");
	checkRow("memory", "MEMORY");
	checkRow("screen", "SCREEN");
	checkRow("cpu", "CPU THREADS");
	checkRow("net", "CONNECTION");
	checkRow("storage", "STORAGE");
	checkRow("data", "GAME DATA");
	var webglOK = null;
	function probeWebGL() {
		var c = document.createElement("canvas");
		c.width = 1; c.height = 1;
		var gl = null;
		try { gl = c.getContext("webgl2"); } catch (e) {}
		if (!gl) { webglOK = false; setCheck("webgl", "WebGL 2 not available: the game cannot run here", "bad"); return; }
		webglOK = true;
		var name = "";
		try {
			var info = gl.getExtension("WEBGL_debug_renderer_info");
			name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
		} catch (e) {}
		setCheck("webgl", "WebGL 2 ready" + (name ? " · " + String(name).slice(0, 80) : ""), "good");
		try { var lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext(); } catch (e) {}
		c.width = 0; c.height = 0;
	}
	function staticChecks() {
		var mem = navigator.deviceMemory;
		setCheck("memory", mem ? "about " + mem + " GB (browser hint)" + (mem <= 4 ? " · lower render distance if it stutters" : "") : "not reported by this browser",
			mem && mem <= 2 ? "warn" : "");
		var s = window.screen || {};
		setCheck("screen", (s.width || "?") + " × " + (s.height || "?") + " · window " + window.innerWidth + " × " + window.innerHeight + " · " +
			(window.devicePixelRatio || 1) + "× pixels");
		setCheck("cpu", navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) : "not reported by this browser");
		netCheck();
		try {
			if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (est) {
				if (!checkRows.storage) return;
				setCheck("storage", (est.usage / MB).toFixed(0) + " MB used of " + (est.quota / MB / 1024).toFixed(1) + " GB available to this site");
			}, function () { setCheck("storage", "not reported by this browser"); });
			else setCheck("storage", "not reported by this browser");
		} catch (e) { setCheck("storage", "not reported by this browser"); }
	}
	function netCheck() {
		var c = navigator.connection;
		setCheck("net", (navigator.onLine ? "online" : "offline (singleplayer works offline)") + (c && c.effectiveType ? " · " + c.effectiveType : ""),
			navigator.onLine ? "good" : "warn");
	}
	on(window, "online", netCheck);
	on(window, "offline", netCheck);
	var launchState = k("launch-state");
	function updateDataCheck() {
		var s = stage();
		var text = P.error ? "error: " + P.error : P.instantiated ? "prepared · launches instantly" : s.label.toLowerCase();
		setCheck("data", text, P.error ? "bad" : P.instantiated ? "good" : "");
		launchState.textContent = P.error ? "SEE ERROR BELOW" : P.instantiated ? "READY FOR LIFTOFF" : (P.parsed ? "PREPARING ENGINE" : "GAME DATA ARRIVING");
	}

	// ------------------------------------------------------------- username
	var userInput = k("username"), userHint = k("userhint");
	var USER_RE = /^[A-Za-z0-9_]{3,16}$/;
	userInput.value = load("username", "") || "";
	on(userInput, "input", function () {
		save("username", userInput.value.trim());
		var v = userInput.value.trim();
		userHint.textContent = !v || USER_RE.test(v) ? "3 to 16 letters, numbers or underscores. Used as your name in the game."
			: "Use 3 to 16 letters, numbers or underscores.";
		userHint.style.color = !v || USER_RE.test(v) ? "" : "#ff8a8a";
	});

	// -------------------------------------------------------------- servers
	var servers = load("servers", []);
	if (!Array.isArray(servers)) servers = [];
	var list = k("servers");
	function saveServers() { save("servers", servers); }
	function renderServers() {
		list.textContent = "";
		if (!servers.length) { list.appendChild(el("li", { class: "aero-l-empty", text: "No servers yet. Add one below." })); return; }
		servers.forEach(function (s, i) {
			var name = el("input", { class: "aero-l-input", type: "text", maxlength: "40", "aria-label": "Server name" });
			name.value = s.name;
			var addr = el("input", { class: "aero-l-input", type: "text", maxlength: "200", spellcheck: "false", "aria-label": "Server address" });
			addr.value = s.address;
			var copy = el("button", { type: "button", class: "aero-l-btn", text: "Copy", "aria-label": "Copy address of " + s.name });
			var del = el("button", { type: "button", class: "aero-l-btn is-danger", text: "Remove", "aria-label": "Remove " + s.name });
			on(name, "change", function () { servers[i].name = name.value.trim() || "Server"; saveServers(); });
			on(addr, "change", function () { servers[i].address = addr.value.trim(); saveServers(); });
			on(copy, "click", function () {
				copyText(servers[i].address).then(function () { copy.textContent = "Copied"; later(function () { copy.textContent = "Copy"; }, 1400); },
					function () { copy.textContent = "Copy failed"; later(function () { copy.textContent = "Copy"; }, 1600); });
			});
			on(del, "click", function () { servers.splice(i, 1); saveServers(); renderServers(); confirmTone(); });
			list.appendChild(el("li", null, [name, addr, copy, del]));
		});
	}
	function copyText(s) {
		try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s); } catch (e) {}
		return new Promise(function (resolve, reject) {
			var ta = el("textarea"); ta.value = s; ta.style.cssText = "position:fixed;left:-9999px";
			root.appendChild(ta); ta.select();
			var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
			root.removeChild(ta);
			if (ok) resolve(); else reject(new Error("copy failed"));
		});
	}
	var newName = k("new-name"), newAddr = k("new-address");
	function addServer() {
		var a = newAddr.value.trim();
		if (!a) { newAddr.focus(); return; }
		servers.push({ name: newName.value.trim() || a.replace(/^wss?:\/\//, ""), address: a });
		saveServers(); renderServers(); confirmTone();
		newName.value = ""; newAddr.value = "";
	}
	on(q('[data-action="add-server"]'), "click", addServer);
	on(newAddr, "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addServer(); } });

	// ------------------------------------------------------------- settings
	var settingsBox = k("settings");
	function toggle(key, label, hint, onChange) {
		var id = "aero_l_set_" + key;
		var input = el("input", { type: "checkbox", class: "aero-l-switch", id: id, role: "switch" });
		input.checked = !!settings[key];
		on(input, "change", function () { settings[key] = input.checked; saveSettings(); if (onChange) onChange(input.checked); });
		var lab = el("label", { for: id }, [document.createTextNode(label), el("small", { text: hint })]);
		settingsBox.appendChild(el("div", { class: "aero-l-toggle" }, [lab, input]));
		return input;
	}
	function segmented(key, label, hint, options, onChange) {
		var group = el("div", { class: "aero-l-seg", role: "group", "aria-label": label });
		options.forEach(function (o) {
			var b = el("button", { type: "button", text: o[1], "aria-pressed": settings[key] === o[0] ? "true" : "false" });
			on(b, "click", function () {
				settings[key] = o[0]; saveSettings();
				Array.prototype.forEach.call(group.children, function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); });
				if (onChange) onChange(o[0]);
			});
			group.appendChild(b);
		});
		settingsBox.appendChild(el("div", { class: "aero-l-toggle" }, [el("label", null, [document.createTextNode(label), el("small", { text: hint })]), group]));
	}
	var soundSwitch = toggle("sound", "Sound effects", "Soft blips and tones in the launcher.", function (v) {
		applyMute();
		if (!v) stopDrone(); else unlockAudio();
	});
	toggle("drone", "Ambient drone", "A quiet low hum while the menu is open.", function (v) { if (v) { unlockAudio(); startDrone(); } else stopDrone(); });
	segmented("density", "Starfield density", "Fewer stars use less power.", [["low", "LOW"], ["med", "MED"], ["high", "HIGH"]], function (v) {
		starLimit = COUNTS[v]; makeStars(); draw(performance.now(), 0); dev("starfield density: " + v + " (" + stars.length + " stars)");
	});
	segmented("motion", "Reduced motion", "Static starfield, no transitions. Auto follows your system setting.",
		[["auto", "AUTO"], ["on", "ON"], ["off", "OFF"]], function () { applyMotion(); });
	toggle("skipBoot", "Skip boot animation", "Go straight to the menu.");
	toggle("fps", "FPS counter", "Launcher frame rate and starfield draw time.", applyMeters);

	var muteBtn = q(".aero-l-mute");
	function applyMute() {
		muteBtn.setAttribute("aria-pressed", settings.sound ? "false" : "true");
		muteBtn.textContent = settings.sound ? "SND" : "MUTE";
		muteBtn.setAttribute("aria-label", settings.sound ? "Mute launcher sounds" : "Unmute launcher sounds");
		soundSwitch.checked = settings.sound;
	}
	on(muteBtn, "click", function () {
		settings.sound = !settings.sound; saveSettings(); applyMute();
		if (settings.sound) unlockAudio(); else stopDrone();
	});
	function applyMotion() {
		var r = reduced();
		root.classList.toggle("is-reduced", r);
		loadingEl.classList.toggle("is-reduced", r);
		draw(performance.now(), 0);
	}

	// --------------------------------------------------------- boot sequence
	var bootEl = q(".aero-l-boot");
	var bootDone = true;
	function runBoot() {
		var seen = false;
		try { seen = sessionStorage.getItem(NS + "booted") === "1"; } catch (e) {}
		if (seen || settings.skipBoot) return;
		bootDone = false;
		bootEl.hidden = false;
		try { root.focus({ preventScroll: true }); } catch (e) { root.focus(); }   // so "any key" reaches the launcher
		var word = q(".aero-l-boot-word"), lines = q(".aero-l-boot-lines");
		"AEROSPACE".split("").forEach(function (ch, i) {
			var s = el("span", { text: ch });
			s.style.animationDelay = (i * 70) + "ms";
			word.appendChild(s);
		});
		function line(text, result, at) {
			later(function () {
				if (bootDone) return;
				var row = el("div", { text: text + " " });
				var r = el("span", { class: "ok", text: result() });
				row.appendChild(r);
				lines.appendChild(row);
			}, at);
		}
		line("CALIBRATING STARFIELD…", function () { return stars.length ? "OK (" + stars.length + " STARS)" : "OK"; }, 450);
		line("CHECKING WEBGL…", function () { return webglOK === null ? "PENDING" : webglOK ? "OK" : "UNAVAILABLE"; }, 950);
		line("DOCKING PAYLOAD…", function () {
			return P.instantiated ? "OK" : P.parsed ? "DOCKED, PREPARING" : "RECEIVING " + (P.received / MB).toFixed(0) + " / " + (totalBytes / MB).toFixed(0) + " MB";
		}, 1450);
		later(endBoot, 2000);
		later(endBoot, 2500);            // hard cap even if the 2 s timer was delayed
		on(bootEl, "click", endBoot);
	}
	function endBoot() {
		if (bootDone) return;
		bootDone = true;
		try { sessionStorage.setItem(NS + "booted", "1"); } catch (e) {}
		bootEl.classList.add("is-done");
		later(function () { bootEl.hidden = true; }, 280);
		var t = root.querySelector('[role="tab"][aria-selected="true"]');
		if (t) t.focus();
	}
	on(root, "keydown", function () { if (!bootDone) endBoot(); }, { capture: true });

	// --------------------------------------------------------------- launch
	var launched = false;
	on(q('[data-action="launch"]'), "click", function () {
		var v = userInput.value.trim();
		if (v && !USER_RE.test(v)) { select("launch"); userInput.focus(); return; }
		launch(v);
	});
	function launch(username) {
		if (launched) return;
		launched = true;
		confirmTone();
		if (username) applyUsername(username);
		dev("launch");
		var keepAudio = audio;
		teardown();
		if (keepAudio) setTimeout(function () { try { keepAudio.close(); } catch (e) {} }, 400);  // let the confirm tone finish
		startLoading();
		releaseGate();
	}

	// The game keeps its player name base64-encoded in localStorage
	// "_eaglercraftX.username" (the name is checked to be plain ASCII above).
	function applyUsername(name) {
		try {
			var key = "_eaglercraftX.username";
			var encoded = btoa(name);
			if (localStorage.getItem(key) !== encoded) localStorage.setItem(key, encoded);
		} catch (e) {}
	}

	function teardown() {
		stopLoop();
		stopDrone();
		ac.abort();
		timeouts.forEach(clearTimeout); timeouts = [];
		intervals.forEach(clearInterval); intervals = [];
		canvas.width = 0; canvas.height = 0;
		ctx2d = null; nebula = null; stars = [];
		audio = null;
		if (root.parentNode) root.parentNode.removeChild(root);
		root = null;
	}

	// ---------------------------------------------------------------- loading
	function startLoading() {
		var lac = new AbortController();
		var t0 = performance.now();
		var stageEl = q(".aero-ld-stage", loadingEl), fill = q(".aero-ld-bar i", loadingEl);
		var pctEl = k("pct", loadingEl), elapsedEl = k("elapsed", loadingEl), slowEl = q(".aero-ld-slow", loadingEl);
		loadingEl.hidden = false;
		var timer = setInterval(update, 200);
		var holdRaf = 0, holding = false;
		function update() {
			poll();
			var secs = (performance.now() - t0) / 1000;
			elapsedEl.textContent = secs.toFixed(1) + " s";
			if (P.error) return fail(P.error);
			var s = stage();
			stageEl.textContent = s.label;
			if (s.pct !== null) { fill.style.transform = "scaleX(" + (s.pct / 100) + ")"; pctEl.textContent = s.pct + "%"; }
			slowEl.textContent = secs > 20 ? "Still working… " + Math.floor(secs) + " s. Slower devices take longer the first time." : "";
			if (window.__eaglerGameReady === true && !holding) holdForTitle();
		}
		function fail(message) {
			clearInterval(timer);
			if (holdRaf) cancelAnimationFrame(holdRaf);
			loadingEl.classList.add("is-error");
			stageEl.textContent = "LAUNCH FAILED";
			k("error", loadingEl).textContent = message;
			var retry = q('[data-action="retry"]', loadingEl);
			retry.addEventListener("click", function () { location.reload(); }, { signal: lac.signal });
			var picker = k("file", loadingEl);
			q('[data-action="pick"]', loadingEl).addEventListener("click", function () { picker.click(); }, { signal: lac.signal });
			picker.addEventListener("change", function () {
				var f = picker.files && picker.files[0];
				if (!f) return;
				var url = URL.createObjectURL(f);
				try { location.assign(url); } catch (e) { window.open(url, "_blank"); }
			}, { signal: lac.signal });
			retry.focus();
		}
		// The game's first frames are its own red resource-loading screen; wait for
		// it to clear (sampled from four canvas corners), then reveal the game.
		function holdForTitle() {
			holding = true;
			stageEl.textContent = "LOADING RESOURCES";
			var probe = document.createElement("canvas");
			probe.width = 8; probe.height = 8;
			var pc = probe.getContext("2d", { willReadFrequently: true });
			var heldSince = performance.now(), clear = 0, sawRed = false;
			function sample(gc) {
				try {
					pc.clearRect(0, 0, 8, 8);
					pc.drawImage(gc, 0, 0, 8, 8);
					var d = pc.getImageData(0, 0, 8, 8).data, red = 0, blank = 0;
					[0, 7, 56, 63].forEach(function (i) {
						var o = i * 4, r = d[o], g = d[o + 1], b = d[o + 2], a = d[o + 3];
						if (a < 8 || r + g + b < 12) blank++;
						else if (r > 150 && g < 120 && b < 120 && r > g * 1.8) red++;
					});
					return red >= 3 ? "red" : blank === 4 ? "blank" : "other";
				} catch (e) { return "blank"; }
			}
			function tick() {
				holdRaf = 0;
				if (P.error) return;
				var held = performance.now() - heldSince;
				var gc = document.querySelector("#game_frame canvas");
				var st = gc ? sample(gc) : "blank";
				if (st === "red") { sawRed = true; clear = 0; } else if (st === "other") clear++;
				if (held > 30000 || (clear >= 4 && (sawRed || held > 900)) || (st === "blank" && !sawRed && held > 1500)) { done(); return; }
				holdRaf = requestAnimationFrame(tick);
			}
			holdRaf = requestAnimationFrame(tick);
			function done() {
				P.ready = true;
				clearInterval(timer);
				lac.abort();
				probe.width = 0; probe.height = 0;
				fill.style.transform = "scaleX(1)"; pctEl.textContent = "100%";
				loadingEl.style.transition = "opacity 300ms";
				loadingEl.style.opacity = "0";
				setTimeout(function () { if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl); }, 320);
				window.__aerospaceBootDone = true;
				try { window.dispatchEvent(new Event("aerospace:ready")); } catch (e) {}
			}
		}
		update();
	}

	// ---------------------------------------------------------------- start
	every(function () {
		poll();
		updateDataCheck();
	}, 250);
	every(cycleSplash, 6000);
	showSplash();
	staticChecks();
	applyMute();
	applyMeters();
	applyMotion();
	makeNebula();
	resize();
	startLoop();
	probeWebGL();
	renderServers();
	updateDataCheck();
	runBoot();
	if (bootDone) {
		var firstTab = root.querySelector('[role="tab"][aria-selected="true"]');
		if (firstTab) firstTab.focus();
	}
	dev("launcher ready: " + stars.length + " stars, " + (totalBytes / MB).toFixed(1) + " MB of game data expected");

	window.Aerospace = {
		version: VERSION,
		gameVersion: GAME_VERSION,
		settings: settings,
		progress: function () { poll(); var s = stage(); return { stage: s.label, percent: s.pct, received: P.received, total: totalBytes, prepared: P.instantiated, error: P.error }; },
		launch: function (name) { launch(name || (userInput ? userInput.value.trim() : "")); },
		devLog: function () { return devLines.slice(); }
	};
})();
