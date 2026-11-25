/*
 * Aerospace Client — in-page client layer.
 *
 * A DOM overlay above the game canvas plus the "command deck" settings menu:
 *   - HUD instruments: FPS, CPS, keystrokes, clock, mission timer, memory, frame graph
 *   - client mods: optical zoom, motion blur, screenshot key, space radio,
 *     break reminder, helmet visor, cinematic bars
 *   - shaders: look presets and fine-tuning, run by shaders.js inside the game's
 *     final draw (with a CSS fallback for brightness/saturation/visor filters)
 *
 * It never touches game memory or network traffic. Everything here is built
 * from browser events and the finished picture, so it gives no gameplay
 * advantage on servers and cannot desync the game.
 */
(function () {
	"use strict";
	if (window.__aerospaceClient) return;

	var VERSION = "{{CLIENT_VERSION}}";
	var GAME_VERSION = "{{GAME_VERSION}}";
	var EMBLEM = "{{EMBLEM_DATA_URI}}";
	var STORE_KEY = "aerospace.client.v1";
	var nativeRAF = window.requestAnimationFrame.bind(window);
	var engine = window.__aerospaceShaders || {
		active: false, failed: "shaders.js is missing", setParams: function () {},
		capture: function () { return Promise.reject(new Error("no shader engine")); }, onChange: function () {}
	};

	// ------------------------------------------------------------- settings
	var ACCENTS = {
		cyan: ["#3fd0ff", "#96ecff"], violet: ["#9d7bff", "#cdbcff"], amber: ["#ffb84d", "#ffe0a8"],
		lime: ["#7dff9b", "#c8ffd4"], rose: ["#ff6f9f", "#ffc0d4"], white: ["#e8f4ff", "#ffffff"]
	};
	// id: shader filter number; css: fallback when the shader engine is unavailable
	var FILTERS = {
		off: { id: 0, label: "Off", css: "" },
		night: { id: 1, label: "Night Vision", css: "sepia(1) hue-rotate(62deg) saturate(2.6) contrast(1.08)" },
		solar: { id: 2, label: "Solar Shield", css: "sepia(.42) saturate(1.25) hue-rotate(-12deg)" },
		deep: { id: 3, label: "Deep Space", css: "saturate(1.2) hue-rotate(14deg) contrast(1.06)" },
		thermal: { id: 4, label: "Thermal", css: "contrast(1.35) saturate(2.2) hue-rotate(-38deg)" },
		mono: { id: 5, label: "Lunar Mono", css: "grayscale(1) contrast(1.12)" }
	};
	var N = [0.5, 0.5, 0.5];
	var NEUTRAL_FX = {
		bloom: 0, sharpen: 0, vignette: 0, grain: 0, fringe: 0, scanlines: 0,
		contrast: 100, warmth: 0, saturation: 100, filmic: 0, split: 0, shadow: N, high: N
	};
	var LOOKS = {
		off: { name: "Stock", desc: "Eaglercraft's own picture, untouched.", swatch: "linear-gradient(135deg,#5a6a7a,#9aa8b6)" },
		aerospace: {
			name: "Aerospace", desc: "Signature look: cool shadows, warm highlights, soft glow.",
			swatch: "linear-gradient(135deg,#1d3d7a,#3fd0ff 55%,#ffb84d)",
			fx: { bloom: 35, sharpen: 15, vignette: 35, grain: 15, fringe: 0, scanlines: 0, contrast: 106, warmth: 0,
				saturation: 108, filmic: 30, split: 35, shadow: [0.42, 0.5, 0.62], high: [0.6, 0.52, 0.42] }
		},
		cinematic: {
			name: "Cinematic", desc: "Film grade: deep contrast, teal shadows, amber highlights, grain.",
			swatch: "linear-gradient(135deg,#0f3b44,#3a6f78 45%,#e0a060)",
			fx: { bloom: 25, sharpen: 10, vignette: 50, grain: 30, fringe: 0, scanlines: 0, contrast: 112, warmth: 10,
				saturation: 95, filmic: 70, split: 55, shadow: [0.38, 0.52, 0.6], high: [0.66, 0.52, 0.38] }
		},
		vibrant: {
			name: "Vibrant", desc: "Punchy colour and crisp detail for bright builds.",
			swatch: "linear-gradient(135deg,#1fbf5a,#ffd23f 50%,#ff4f8b)",
			fx: { bloom: 10, sharpen: 45, vignette: 15, grain: 0, fringe: 0, scanlines: 0, contrast: 108, warmth: 0,
				saturation: 135, filmic: 0, split: 0, shadow: N, high: N }
		},
		nebula: {
			name: "Nebula", desc: "Dreamy glow with violet shadows and cyan highlights.",
			swatch: "linear-gradient(135deg,#3a1a6e,#9d7bff 50%,#6ff2ff)",
			fx: { bloom: 75, sharpen: 0, vignette: 45, grain: 10, fringe: 0, scanlines: 0, contrast: 98, warmth: -10,
				saturation: 115, filmic: 0, split: 50, shadow: [0.55, 0.42, 0.68], high: [0.42, 0.6, 0.66] }
		},
		retro: {
			name: "Retro CRT", desc: "Old monitor: scanlines, colour fringing and glow.",
			swatch: "repeating-linear-gradient(180deg,#203a28 0 3px,#3e7a4e 3px 6px)",
			fx: { bloom: 30, sharpen: 0, vignette: 55, grain: 20, fringe: 45, scanlines: 70, contrast: 110, warmth: 5,
				saturation: 110, filmic: 0, split: 0, shadow: N, high: N }
		},
		noir: {
			name: "Noir", desc: "Black and white with deep shadows and film grain.",
			swatch: "linear-gradient(135deg,#050505,#5a5a5a 50%,#f0f0f0)",
			fx: { bloom: 0, sharpen: 20, vignette: 55, grain: 35, fringe: 0, scanlines: 0, contrast: 130, warmth: 0,
				saturation: 0, filmic: 50, split: 0, shadow: N, high: N }
		}
	};
	var FX_SLIDERS = [
		{ key: "bloom", label: "Glow", hint: "Soft bloom around bright light.", min: 0, max: 100, unit: "%" },
		{ key: "sharpen", label: "Sharpen", hint: "Crisper block edges and text.", min: 0, max: 100, unit: "%" },
		{ key: "vignette", label: "Vignette", hint: "Darker screen corners.", min: 0, max: 100, unit: "%" },
		{ key: "grain", label: "Film grain", hint: "Moving film noise.", min: 0, max: 100, unit: "%" },
		{ key: "fringe", label: "Colour fringe", hint: "Lens-style red/blue split toward the edges.", min: 0, max: 100, unit: "%" },
		{ key: "scanlines", label: "Scanlines", hint: "CRT lines and phosphor mask.", min: 0, max: 100, unit: "%" },
		{ key: "contrast", label: "Contrast", hint: "Distance between darks and lights.", min: 50, max: 150, unit: "%" },
		{ key: "warmth", label: "Warmth", hint: "Cooler (left) or warmer (right) white balance.", min: -100, max: 100, unit: "" }
	];
	var DEFAULTS = {
		modules: {
			brand: true, fps: true, cps: false, keys: false, clock: false, timer: false,
			memory: false, graph: false,
			zoom: true, motionblur: false, screenshot: true, radio: false, breaks: false, visor: false, bars: false
		},
		pos: {},                       // widget id -> { x, y } as viewport fractions
		menuKey: "ShiftRight",
		zoomKey: "KeyC",
		shotKey: "F9",
		shotMode: "clipboard",
		zoomLevel: 4,
		motionBlur: 45,
		breakMinutes: 60,
		radioVolume: 40,
		brightness: 100,
		saturation: 100,
		filter: "off",
		look: "off",
		fx: NEUTRAL_FX,
		accent: "cyan",
		hudScale: 100,
		hudOpacity: 100,
		seenIntro: false
	};
	function clone(o) { return JSON.parse(JSON.stringify(o)); }
	function load() {
		var cfg = clone(DEFAULTS);
		try {
			var raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
			if (raw && typeof raw === "object") {
				for (var k in DEFAULTS) {
					if (!(k in raw)) continue;
					if (k === "modules" || k === "pos" || k === "fx") {
						for (var m in raw[k]) if (k === "pos" || m in cfg[k]) cfg[k][m] = raw[k][m];
					} else if (typeof raw[k] === typeof DEFAULTS[k]) {
						cfg[k] = raw[k];
					}
				}
			}
		} catch (e) {}
		if (!FILTERS[cfg.filter]) cfg.filter = "off";
		if (!ACCENTS[cfg.accent]) cfg.accent = "cyan";
		if (cfg.look !== "custom" && !LOOKS[cfg.look]) cfg.look = "off";
		if (cfg.shotMode !== "file") cfg.shotMode = "clipboard";
		return cfg;
	}
	var cfg = load();
	var saveTimer = 0;
	function save() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(function () {
			try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) {}
		}, 150);
	}

	// ----------------------------------------------------------------- utils
	function el(tag, attrs, children) {
		var node = document.createElement(tag);
		if (attrs) {
			for (var k in attrs) {
				if (k === "class") node.className = attrs[k];
				else if (k === "text") node.textContent = attrs[k];
				else if (k === "html") node.innerHTML = attrs[k];
				else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), attrs[k]);
				else node.setAttribute(k, attrs[k]);
			}
		}
		if (children) for (var i = 0; i < children.length; ++i) if (children[i]) node.appendChild(children[i]);
		return node;
	}
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
		});
	}
	function pad2(n) { return (n < 10 ? "0" : "") + n; }
	function keyLabel(code) {
		if (!code) return "None";
		return code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Shift(Left|Right)$/, "$1 Shift")
			.replace(/^Control(Left|Right)$/, "$1 Ctrl").replace(/^Alt(Left|Right)$/, "$1 Alt")
			.replace(/^Arrow/, "Arrow ").replace(/^Numpad/, "Num ");
	}
	function kbd(code) { return "<kbd>" + esc(keyLabel(code)) + "</kbd>"; }
	function inGame() { return !!document.pointerLockElement; }
	function frame() { return document.getElementById("game_frame"); }
	function row(label, hint, controls) {
		return el("div", { class: "aero-row" }, [el("label", null, [document.createTextNode(label), el("small", { text: hint })])].concat(controls));
	}

	// ------------------------------------------------------------ fps probe
	// Counts the frames the game actually puts on screen. The shader engine sees
	// the game's one present draw per frame and reports it here; the game does not
	// drive every frame through window.requestAnimationFrame, so counting those
	// callbacks (the fallback, used only while the engine is not running) can
	// read 0 in a world.
	var frameTimes = [], lastFrameAt = 0, frameDeltas = [];
	function recordFrame() {
		var now = performance.now();
		frameTimes.push(now);
		if (frameTimes.length > 1000) frameTimes.splice(0, frameTimes.length - 1000);
		if (lastFrameAt) { frameDeltas.push(now - lastFrameAt); if (frameDeltas.length > 120) frameDeltas.shift(); }
		lastFrameAt = now;
	}
	engine.onPresent = recordFrame;
	window.requestAnimationFrame = function (cb) {
		return nativeRAF(function (t) {
			if (!engine.active) recordFrame();
			cb(t);
		});
	};
	function currentFps() {
		var now = performance.now();
		while (frameTimes.length && frameTimes[0] < now - 1000) frameTimes.shift();
		return frameTimes.length;
	}

	// -------------------------------------------------------------- widgets
	var hud = el("div", { id: "aero_hud" });
	var visor = el("div", { id: "aero_visor" });
	var toasts = el("div", { id: "aero_toasts" });
	var widgets = {};
	var WIDGETS = [
		{ id: "brand", name: "Client badge", desc: "Small Aerospace Client tag in the corner.", x: .008, y: .012 },
		{ id: "fps", name: "FPS", desc: "Frames per second the game is actually presenting.", x: .008, y: .062 },
		{ id: "cps", name: "CPS", desc: "Left and right clicks per second.", x: .008, y: .112 },
		{ id: "keys", name: "Keystrokes", desc: "Live WASD, jump and mouse button display.", x: .008, y: .62 },
		{ id: "clock", name: "Clock", desc: "Your local time, so you know when to land.", x: .93, y: .012 },
		{ id: "timer", name: "Mission timer", desc: "Mission elapsed time since this session began.", x: .86, y: .062 },
		{ id: "memory", name: "Memory", desc: "JavaScript heap in use (Chromium browsers only).", x: .86, y: .112 },
		{ id: "graph", name: "Frame graph", desc: "Rolling frame-time trace to spot stutter.", x: .008, y: .162 }
	];
	var MODS = [
		{ id: "zoom", name: "Optical zoom", desc: "Hold the zoom key to magnify the view; scroll to change strength." },
		{ id: "motionblur", name: "Motion blur", desc: "Blends frames for smooth movement. Runs in the shader engine." },
		{ id: "screenshot", name: "Screenshot key", desc: "One key copies the current frame to your clipboard or saves it." },
		{ id: "radio", name: "Space radio", desc: "Calm, endlessly generated space ambience next to the game's sound." },
		{ id: "breaks", name: "Break reminder", desc: "A gentle nudge to rest your eyes after a long flight." },
		{ id: "visor", name: "Helmet visor", desc: "Cosmetic helmet frame with soft scanlines over the view." },
		{ id: "bars", name: "Cinematic bars", desc: "Letterbox bars for recording. They cover the hotbar." }
	];

	function buildWidgets() {
		widgets.brand = el("div", { class: "aero-w", id: "aero_w_brand", text: "AEROSPACE" });
		widgets.fps = el("div", { class: "aero-w", id: "aero_w_fps", html: "<small>FPS</small><b>--</b>" });
		widgets.cps = el("div", { class: "aero-w", id: "aero_w_cps", html: "<small>CPS</small><b>0</b> | <b>0</b>" });
		widgets.clock = el("div", { class: "aero-w", id: "aero_w_clock", html: "<small>TIME</small><b>--:--</b>" });
		widgets.timer = el("div", { class: "aero-w", id: "aero_w_timer", html: "<small>MET</small><b>00:00:00</b>" });
		widgets.memory = el("div", { class: "aero-w", id: "aero_w_memory", html: "<small>MEM</small><b>n/a</b>" });
		var graphCanvas = el("canvas", { width: "120", height: "34" });
		widgets.graph = el("div", { class: "aero-w", id: "aero_w_graph" }, [graphCanvas]);
		widgets.graph._canvas = graphCanvas;

		var keys = el("div", { class: "aero-w aero-keys", id: "aero_w_keys" });
		var keyNodes = {};
		function key(code, label, cls) {
			var n = el("div", { class: "aero-key " + (cls || ""), text: label });
			keyNodes[code] = n;
			return n;
		}
		keys.appendChild(key("KeyW", "W", "w"));
		keys.appendChild(key("KeyA", "A", "a"));
		keys.appendChild(key("KeyS", "S", "s"));
		keys.appendChild(key("KeyD", "D", "d"));
		var mouse = el("div", { class: "aero-mouse" }, [key("Mouse0", "LMB"), key("Mouse2", "RMB")]);
		keys.appendChild(mouse);
		keys.appendChild(key("Space", "␣", "wide"));
		keys._nodes = keyNodes;
		widgets.keys = keys;

		for (var i = 0; i < WIDGETS.length; ++i) hud.appendChild(widgets[WIDGETS[i].id]);
		hud.appendChild(el("button", { id: "aero_edit_done", class: "aero-btn", text: "Done editing layout", onclick: function () { setEditing(false); openDeck("hud"); } }));
	}

	function place(id) {
		var def = null;
		for (var i = 0; i < WIDGETS.length; ++i) if (WIDGETS[i].id === id) def = WIDGETS[i];
		var p = cfg.pos[id] || def;
		var node = widgets[id];
		var w = window.innerWidth, h = window.innerHeight;
		var scale = cfg.hudScale / 100;
		var bw = node.offsetWidth * scale, bh = node.offsetHeight * scale;
		node.style.left = clamp(p.x * w, 0, Math.max(0, w - bw)) + "px";
		node.style.top = clamp(p.y * h, 0, Math.max(0, h - bh)) + "px";
		node.style.transform = scale === 1 ? "" : "scale(" + scale + ")";
	}
	function layout() {
		for (var i = 0; i < WIDGETS.length; ++i) {
			var id = WIDGETS[i].id;
			widgets[id].hidden = !cfg.modules[id];
			if (cfg.modules[id]) place(id);
		}
		hud.style.opacity = String(cfg.hudOpacity / 100);
		visor.className = cfg.modules.visor ? "on" : "";
	}

	// --------------------------------------------------------------- shaders
	function shaderParams() {
		var fx = cfg.look === "off" ? null : cfg.fx;
		var p = {
			on: 0, curve: 1, saturation: 1, contrast: 1, warmth: 0, bloom: 0, vignette: 0, grain: 0, sharpen: 0,
			motionBlur: 0, fringe: 0, scanlines: 0, letterbox: 0, filmic: 0, split: 0, filter: 0, shadow: N, high: N
		};
		if (fx) {
			p.bloom = fx.bloom / 100; p.sharpen = fx.sharpen / 100; p.vignette = fx.vignette / 100;
			p.grain = fx.grain / 100; p.fringe = fx.fringe / 100; p.scanlines = fx.scanlines / 100;
			p.contrast = fx.contrast / 100; p.warmth = fx.warmth / 100; p.saturation = fx.saturation / 100;
			p.filmic = fx.filmic / 100; p.split = fx.split / 100; p.shadow = fx.shadow; p.high = fx.high;
		}
		p.saturation *= cfg.saturation / 100;
		p.curve = cfg.brightness / 100;
		p.filter = FILTERS[cfg.filter].id;
		p.letterbox = cfg.modules.bars ? 0.1 : 0;
		p.motionBlur = cfg.modules.motionblur ? clamp(cfg.motionBlur, 0, 90) / 100 : 0;
		p.on = fx || p.curve !== 1 || p.saturation !== 1 || p.filter || p.letterbox || p.motionBlur ? 1 : 0;
		return p;
	}
	function applyLook() {
		try { engine.setParams(shaderParams()); } catch (e) {}
		applyFrameStyle();
	}
	function engineStatus() {
		if (engine.active) return { ok: true, text: "Shader engine running inside the game's final draw." };
		if (engine.failed) return { ok: false, text: "Shader engine unavailable (" + engine.failed + "). Brightness, saturation and visor filters still work through a basic fallback; the other effects need the engine." };
		if (window.__eaglerGameReady) return { ok: false, text: "Shader engine not attached: this graphics backend is not supported. Brightness, saturation and visor filters use a basic fallback." };
		return { ok: false, text: "The shader engine starts with the game." };
	}

	// ------------------------------------------------------ visual effects
	var zoomHeld = false, zoomFactor = 1;
	function applyFrameStyle() {
		var f = frame();
		if (!f) return;
		var parts = [];
		if (!engine.active) {        // fallback for what the shader engine would do
			if (cfg.brightness !== 100) parts.push("brightness(" + (cfg.brightness / 100) + ")");
			if (cfg.saturation !== 100) parts.push("saturate(" + (cfg.saturation / 100) + ")");
			if (FILTERS[cfg.filter].css) parts.push(FILTERS[cfg.filter].css);
		}
		f.style.filter = parts.join(" ");
		f.style.transform = zoomHeld && zoomFactor > 1 ? "scale(" + zoomFactor + ")" : "";
	}
	function setZoom(on) {
		var f = frame();
		if (!f || zoomHeld === on) return;
		zoomHeld = on;
		if (on) zoomFactor = clamp(cfg.zoomLevel, 1.5, 12);
		f.classList.add("aero-zooming");
		applyFrameStyle();
	}
	function applyAccent() {
		var a = ACCENTS[cfg.accent];
		var rootStyle = document.documentElement.style;
		rootStyle.setProperty("--aero-accent", a[0]);
		rootStyle.setProperty("--aero-accent-hi", a[1]);
	}

	// ----------------------------------------------------------------- toast
	function toast(html, ms) {
		var t = el("div", { class: "aero-toast", html: html });
		toasts.appendChild(t);
		nativeRAF(function () { t.classList.add("on"); });
		setTimeout(function () {
			t.classList.remove("on");
			setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
		}, ms || 4200);
	}

	// ------------------------------------------------------------ screenshot
	function stamp() {
		var d = new Date();
		return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "-" + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
	}
	function downloadBlob(blob, name) {
		var url = URL.createObjectURL(blob);
		var a = el("a", { href: url, download: name });
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
	}
	function takeScreenshot() {
		if (!engine.active) {
			toast("This screenshot key needs the shader engine. Use " + kbd("F2") + ", the game's own screenshot key.");
			return;
		}
		engine.capture().then(function (blob) {
			var name = "aerospace-" + stamp() + ".png";
			function saveFile() { downloadBlob(blob, name); toast("Screenshot saved as " + esc(name) + "."); }
			if (cfg.shotMode === "clipboard" && navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
				navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]).then(function () {
					toast("Screenshot copied to the clipboard.");
				}, saveFile);
			} else {
				saveFile();
			}
		}, function (e) { toast("Screenshot failed: " + esc(e && e.message || e)); });
	}

	// ----------------------------------------------------------- space radio
	// Generated ambient music: slow detuned pads moving through four chords, with
	// sparse high "star" notes, all through a long synthetic reverb.
	var radio = null;
	function radioVolume() { return clamp(cfg.radioVolume, 0, 100) / 100 * 0.9; }
	function radioStart() {
		if (radio) return;
		var AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) { toast("Space radio needs Web Audio, which this browser does not provide."); return; }
		var ctx;
		try { ctx = new AC(); } catch (e) { toast("Space radio could not start audio."); return; }
		var master = ctx.createGain();
		master.gain.value = 0.0001;
		master.connect(ctx.destination);
		master.gain.setTargetAtTime(Math.max(radioVolume(), 0.0001), ctx.currentTime, 1.2);
		var bus = ctx.createGain();
		var dry = ctx.createGain(); dry.gain.value = 0.45;
		var wet = ctx.createGain(); wet.gain.value = 0.6;
		var verb = ctx.createConvolver();
		var len = Math.floor(ctx.sampleRate * 5), ir = ctx.createBuffer(2, len, ctx.sampleRate);
		for (var ch = 0; ch < 2; ++ch) {
			var d = ir.getChannelData(ch);
			for (var i = 0; i < len; ++i) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
		}
		verb.buffer = ir;
		bus.connect(dry); dry.connect(master);
		bus.connect(verb); verb.connect(wet); wet.connect(master);
		var CHORDS = [[38, 50, 57, 60, 64, 69], [41, 53, 57, 60, 65, 72], [36, 48, 55, 59, 62, 67], [43, 50, 55, 58, 62, 69]];
		var STARS = [74, 76, 79, 81, 84, 86, 88, 91];
		function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
		function pad(notes, at, dur) {
			notes.forEach(function (note, n) {
				var g = ctx.createGain(), peak = n === 0 ? 0.05 : 0.026;
				g.gain.setValueAtTime(0.0001, at);
				g.gain.exponentialRampToValueAtTime(peak, at + 3.5);
				g.gain.setValueAtTime(peak, at + dur - 4);
				g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
				var lp = ctx.createBiquadFilter();
				lp.type = "lowpass"; lp.frequency.value = 600 + n * 90; lp.Q.value = 0.7;
				var lfo = ctx.createOscillator(), depth = ctx.createGain();
				lfo.frequency.value = 0.05 + Math.random() * 0.08;
				depth.gain.value = 240;
				lfo.connect(depth); depth.connect(lp.frequency);
				[-6, 6].forEach(function (cents) {
					var o = ctx.createOscillator();
					o.type = n === 0 ? "triangle" : "sawtooth";
					o.frequency.value = hz(note);
					o.detune.value = cents;
					o.connect(lp);
					o.start(at); o.stop(at + dur + 0.1);
				});
				lp.connect(g); g.connect(bus);
				lfo.start(at); lfo.stop(at + dur + 0.1);
			});
		}
		function star(at) {
			var o = ctx.createOscillator(), g = ctx.createGain();
			o.type = "sine";
			o.frequency.value = hz(STARS[Math.floor(Math.random() * STARS.length)]);
			g.gain.setValueAtTime(0.0001, at);
			g.gain.exponentialRampToValueAtTime(0.03, at + 0.02);
			g.gain.exponentialRampToValueAtTime(0.0001, at + 2.8);
			o.connect(g);
			if (ctx.createStereoPanner) {
				var pan = ctx.createStereoPanner();
				pan.pan.value = Math.random() * 1.6 - 0.8;
				g.connect(pan); pan.connect(bus);
			} else {
				g.connect(bus);
			}
			o.start(at); o.stop(at + 3);
		}
		var r = radio = { ctx: ctx, master: master, chordTimer: 0, starTimer: 0, chord: 0 };
		function nextChord() {
			if (radio !== r) return;
			pad(CHORDS[r.chord++ % CHORDS.length], ctx.currentTime + 0.05, 14);
			r.chordTimer = setTimeout(nextChord, 10000);
		}
		function nextStar() {
			if (radio !== r) return;
			star(ctx.currentTime + 0.05);
			r.starTimer = setTimeout(nextStar, 1500 + Math.random() * 4500);
		}
		try { if (ctx.state === "suspended") ctx.resume(); } catch (e) {}
		nextChord();
		r.starTimer = setTimeout(nextStar, 3000);
	}
	function radioStop() {
		if (!radio) return;
		var r = radio;
		radio = null;
		clearTimeout(r.chordTimer);
		clearTimeout(r.starTimer);
		try { r.master.gain.setTargetAtTime(0.0001, r.ctx.currentTime, 0.4); } catch (e) {}
		setTimeout(function () { try { r.ctx.close(); } catch (e) {} }, 2000);
	}
	function radioSetVolume() {
		if (radio) { try { radio.master.gain.setTargetAtTime(Math.max(radioVolume(), 0.0001), radio.ctx.currentTime, 0.2); } catch (e) {} }
	}

	// -------------------------------------------------------- break reminder
	var playedSeconds = 0, lastBreakAt = 0;
	function breakTick() {
		if (document.hidden) return;
		playedSeconds += 15;
		if (cfg.modules.breaks && playedSeconds - lastBreakAt >= cfg.breakMinutes * 60) {
			lastBreakAt = playedSeconds;
			var mins = Math.round(playedSeconds / 60);
			toast("<b>Break time.</b> You have been flying for " + (mins >= 120 ? Math.floor(mins / 60) + " hours" : mins + " minutes")
				+ ". Stretch, blink and look at something far away for 20 seconds.", 14000);
		}
	}

	// ----------------------------------------------------------- input state
	var clicks = { 0: [], 2: [] };
	var deckOpen = false, editing = false, listeningFor = null;
	var menuTap = null;      // tracks a clean tap of the menu key

	function setKeyVisual(code, on) {
		var n = widgets.keys && widgets.keys._nodes[code];
		if (n) n.classList.toggle("on", on);
	}
	function swallow(e) { e.stopImmediatePropagation(); }

	// Text fields in the deck keep every key except Escape (capitals typed with
	// Right Shift must not close the deck).
	function inTextField(e) {
		var t = e.target;
		return !!(t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !/^(range|checkbox|button|radio)$/.test(t.type))));
	}
	function onKeyDown(e) {
		if (window.__aerospaceAutoTyping) return;   // the profile's auto sign-in is typing into chat
		if (listeningFor) {
			swallow(e); e.preventDefault();
			if (e.code !== "Escape") { cfg[listeningFor.setting] = e.code; save(); }
			listeningFor.done();
			listeningFor = null;
			return;
		}
		if (deckOpen || editing) {
			swallow(e);                       // the game must not see typing meant for the deck
			if (e.code === "Escape" || (e.code === cfg.menuKey && !e.repeat && !inTextField(e))) {
				e.preventDefault();
				if (editing) { setEditing(false); openDeck("hud"); } else closeDeck();
			}
			return;
		}
		if (e.code === cfg.menuKey) {
			if (!e.repeat) menuTap = { at: performance.now(), clean: true };
		} else if (menuTap) {
			menuTap.clean = false;            // menu key is being used as a modifier (e.g. typing)
		}
		if (e.code === cfg.zoomKey && cfg.modules.zoom && inGame() && !e.repeat) setZoom(true);
		if (e.code === cfg.shotKey && cfg.modules.screenshot && !e.repeat) takeScreenshot();
		setKeyVisual(e.code, true);
	}
	function onKeyUp(e) {
		if (window.__aerospaceAutoTyping) return;
		// Key releases always reach the game, even while the deck is open, so a key
		// that was held when the deck opened can never get stuck down.
		if (deckOpen || editing) return;
		if (e.code === cfg.menuKey && menuTap) {
			var tap = menuTap;
			menuTap = null;
			if (tap.clean && performance.now() - tap.at < 450) openDeck();
		}
		if (e.code === cfg.zoomKey) setZoom(false);
		setKeyVisual(e.code, false);
	}
	function onMouseDown(e) {
		if (deckOpen || editing) return;
		if (e.button === 0 || e.button === 2) {
			clicks[e.button].push(performance.now());
			setKeyVisual("Mouse" + e.button, true);
		}
	}
	function onMouseUp(e) { setKeyVisual("Mouse" + e.button, false); }
	function onWheel(e) {
		if (!zoomHeld) return;
		swallow(e); e.preventDefault();       // keep the hotbar from scrolling while zooming
		zoomFactor = clamp(zoomFactor * (e.deltaY < 0 ? 1.18 : 1 / 1.18), 1.5, 12);
		cfg.zoomLevel = Math.round(zoomFactor * 10) / 10;
		save();
		applyFrameStyle();
	}
	function releaseAll() {
		setZoom(false);
		menuTap = null;
		var nodes = widgets.keys ? widgets.keys._nodes : {};
		for (var k in nodes) nodes[k].classList.remove("on");
	}

	// --------------------------------------------------------- HUD editing
	var drag = null;
	function setEditing(on) {
		editing = on;
		hud.classList.toggle("is-editing", on);
		if (on) {
			for (var i = 0; i < WIDGETS.length; ++i) widgets[WIDGETS[i].id].hidden = !cfg.modules[WIDGETS[i].id];
		}
	}
	function onHudPointerDown(e) {
		if (!editing) return;
		var node = e.target.closest ? e.target.closest(".aero-w") : null;
		if (!node) return;
		var id = node.id.replace("aero_w_", "");
		var rect = node.getBoundingClientRect();
		drag = { id: id, node: node, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
		node.classList.add("is-dragging");
		try { node.setPointerCapture(e.pointerId); } catch (x) {}
		e.preventDefault();
	}
	function onHudPointerMove(e) {
		if (!drag) return;
		var w = window.innerWidth, h = window.innerHeight;
		cfg.pos[drag.id] = { x: clamp((e.clientX - drag.dx) / w, 0, 1), y: clamp((e.clientY - drag.dy) / h, 0, 1) };
		place(drag.id);
	}
	function onHudPointerUp() {
		if (!drag) return;
		drag.node.classList.remove("is-dragging");
		drag = null;
		save();
	}

	// --------------------------------------------------------- module toggles
	function setModule(id, on) {
		cfg.modules[id] = on;
		save();
		layout();
		if (id === "zoom" && !on) setZoom(false);
		if (id === "motionblur" || id === "bars") applyLook();
		if (id === "radio") { if (on) radioStart(); else radioStop(); }
		if (id === "breaks" && on) lastBreakAt = playedSeconds;
		if (id === "motionblur" && on && !engine.active) toast("Motion blur needs the shader engine, which is not running on this device.");
	}

	// ---------------------------------------------------------------- deck
	var backdrop = null, deckParts = {};
	function card(def) {
		var c = el("button", { class: "aero-card", type: "button" }, [
			el("i"),
			el("div", null, [el("strong", { text: def.name }), el("span", { text: def.desc })])
		]);
		function sync() { c.classList.toggle("on", !!cfg.modules[def.id]); }
		c.addEventListener("click", function () { setModule(def.id, !cfg.modules[def.id]); sync(); });
		sync();
		return c;
	}
	// A slider bound through get/set so it works for nested settings too.
	function range(label, hint, get, set, min, max, step, unit, onChange) {
		var fmt = function (v) { return (unit === "" && v > 0 ? "+" : "") + v + unit; };
		var out = el("output", { text: fmt(get()) });
		var input = el("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(get()) });
		input.addEventListener("input", function () {
			set(Number(input.value));
			out.textContent = fmt(get());
			save();
			if (onChange) onChange();
		});
		var r = row(label, hint, [input, out]);
		r._sync = function () { input.value = String(get()); out.textContent = fmt(get()); };
		return r;
	}
	function slider(label, hint, setting, min, max, step, unit, onChange) {
		return range(label, hint, function () { return cfg[setting]; }, function (v) { cfg[setting] = v; }, min, max, step, unit, onChange);
	}
	function select(options, get, set) {
		var s = el("select");
		for (var i = 0; i < options.length; ++i) s.appendChild(el("option", { value: String(options[i][0]), text: options[i][1] }));
		s.value = String(get());
		s.addEventListener("change", function () { set(s.value); save(); });
		return s;
	}
	function keyRow(label, hint, setting) {
		var btn = el("button", { class: "aero-btn", type: "button", text: keyLabel(cfg[setting]) });
		btn.addEventListener("click", function () {
			if (listeningFor) return;
			btn.classList.add("is-listening");
			btn.textContent = "Press a key…";
			listeningFor = {
				setting: setting,
				done: function () { btn.classList.remove("is-listening"); btn.textContent = keyLabel(cfg[setting]); refreshFooter(); }
			};
		});
		return row(label, hint, [btn]);
	}
	function button(text, fn) { return el("button", { class: "aero-btn", type: "button", text: text, onclick: fn }); }
	function refreshFooter() {
		if (deckParts.footer) deckParts.footer.innerHTML = "Tap " + kbd(cfg.menuKey) + " or <kbd>Esc</kbd> to close";
	}

	function buildModsPane() {
		var grid = el("div", { class: "aero-grid" });
		for (var i = 0; i < MODS.length; ++i) grid.appendChild(card(MODS[i]));
		var info = el("div", { class: "aero-info", html:
			"<strong>Looking for Eaglercraft mods (.zip / .lua)?</strong> Aerospace keeps 26.3's built-in mod loader. "
			+ "Open it from the title screen: <b>Mods</b> is the button to the right of <b>Options</b>. "
			+ "Those mods run in singleplayer only (the game pauses them on servers), and they are saved per website: "
			+ "mods installed on another Eaglercraft site will not show up here until you export them there "
			+ "(Mods → pick a mod → Export .zip) and import them in Aerospace." });
		return el("div", { class: "aero-pane" }, [
			info,
			grid,
			el("h3", { class: "aero-section", text: "Mod settings" }),
			slider("Zoom strength", "Magnification when the zoom key is held.", "zoomLevel", 1.5, 12, 0.5, "×"),
			keyRow("Zoom key", "Hold in a world to zoom.", "zoomKey"),
			slider("Motion blur strength", "How much of the previous frame stays on screen.", "motionBlur", 10, 90, 5, "%", applyLook),
			keyRow("Screenshot key", "Press it to take a screenshot (F2 still works too).", "shotKey"),
			row("Screenshot destination", "Clipboard works in most browsers; files go to your downloads.", [
				select([["clipboard", "Copy to clipboard"], ["file", "Save as file"]], function () { return cfg.shotMode; }, function (v) { cfg.shotMode = v; })
			]),
			slider("Radio volume", "Space radio loudness.", "radioVolume", 5, 100, 5, "%", radioSetVolume),
			row("Break reminder", "How often the break reminder appears.", [
				select([[30, "Every 30 minutes"], [45, "Every 45 minutes"], [60, "Every hour"], [90, "Every 90 minutes"]],
					function () { return cfg.breakMinutes; }, function (v) { cfg.breakMinutes = Number(v); })
			])
		]);
	}

	function buildShadersPane() {
		var status = el("div", { class: "aero-status" });
		function syncStatus() {
			var s = engineStatus();
			status.textContent = s.text;
			status.classList.toggle("ok", s.ok);
		}
		syncStatus();
		var looks = el("div", { class: "aero-grid aero-looks" });
		var lookCards = {};
		function lookCard(id, look) {
			var c = el("button", { class: "aero-card aero-look", type: "button" }, [
				el("b", { class: "aero-swatch-lg", style: "background:" + look.swatch }),
				el("div", null, [el("strong", { text: look.name }), el("span", { text: look.desc })])
			]);
			c.addEventListener("click", function () {
				cfg.look = id;
				if (look.fx) cfg.fx = clone(look.fx);
				save(); applyLook(); syncAll();
			});
			lookCards[id] = c;
			return c;
		}
		for (var id in LOOKS) looks.appendChild(lookCard(id, LOOKS[id]));
		lookCards.custom = el("div", { class: "aero-card aero-look aero-custom" }, [
			el("b", { class: "aero-swatch-lg", style: "background:conic-gradient(#3fd0ff,#9d7bff,#ff6f9f,#ffb84d,#7dff9b,#3fd0ff)" }),
			el("div", null, [el("strong", { text: "Custom" }), el("span", { text: "Your own tweaks. Move any slider below to make one." })])
		]);
		looks.appendChild(lookCards.custom);

		var fxRows = FX_SLIDERS.map(function (s) {
			return range(s.label, s.hint, function () { return cfg.look === "off" ? NEUTRAL_FX[s.key] : cfg.fx[s.key]; },
				function (v) {
					if (cfg.look === "off") cfg.fx = clone(NEUTRAL_FX);
					cfg.fx[s.key] = v;
					cfg.look = "custom";
				}, s.min, s.max, 1, s.unit, function () { applyLook(); syncCards(); });
		});
		function syncCards() {
			for (var k in lookCards) lookCards[k].classList.toggle("on", cfg.look === k);
			lookCards.custom.hidden = cfg.look !== "custom";
		}
		function syncAll() { syncCards(); fxRows.forEach(function (r) { r._sync(); }); syncStatus(); }
		syncCards();
		deckParts.syncStatus = syncStatus;

		var filter = select(Object.keys(FILTERS).map(function (k) { return [k, FILTERS[k].label]; }),
			function () { return cfg.filter; }, function (v) { cfg.filter = v; applyLook(); });
		return el("div", { class: "aero-pane" }, [
			status,
			looks,
			el("h3", { class: "aero-section", text: "Fine-tune" })
		].concat(fxRows, [
			el("h3", { class: "aero-section", text: "Visor" }),
			row("Visor filter", "Colour mode for the whole view.", [filter]),
			slider("Brightness", "Lifts dark areas for caves and night flights; lower it for a moodier picture.", "brightness", 60, 260, 5, "%", applyLook),
			slider("Saturation", "Colour intensity on top of the look.", "saturation", 0, 200, 5, "%", applyLook),
			row("Reset shaders", "Back to the stock picture with no filter.", [button("Reset", function () {
				cfg.look = "off"; cfg.fx = clone(NEUTRAL_FX); cfg.filter = "off"; cfg.brightness = 100; cfg.saturation = 100;
				save(); applyLook(); closeDeck(); openDeck("shaders");
			})])
		]));
	}

	function buildHudPane() {
		var grid = el("div", { class: "aero-grid" });
		for (var i = 0; i < WIDGETS.length; ++i) grid.appendChild(card(WIDGETS[i]));
		return el("div", { class: "aero-pane" }, [
			grid,
			el("h3", { class: "aero-section", text: "Layout" }),
			slider("HUD scale", "Size of the on-screen instruments.", "hudScale", 70, 180, 5, "%", layout),
			slider("HUD opacity", "How solid the instruments look.", "hudOpacity", 20, 100, 5, "%", layout),
			row("HUD layout", "Drag instruments to where you want them.", [
				button("Edit HUD layout", function () { closeDeck(); setEditing(true); }),
				button("Reset positions", function () { cfg.pos = {}; save(); layout(); toast("HUD layout reset."); })
			])
		]);
	}

	function buildSettingsPane() {
		var swatches = el("div", { class: "aero-swatches" });
		Object.keys(ACCENTS).forEach(function (name) {
			var s = el("button", { class: "aero-swatch" + (cfg.accent === name ? " on" : ""), type: "button", title: name, style: "background:" + ACCENTS[name][0] });
			s.addEventListener("click", function () {
				cfg.accent = name; save(); applyAccent();
				var all = swatches.children;
				for (var n = 0; n < all.length; ++n) all[n].classList.toggle("on", all[n] === s);
			});
			swatches.appendChild(s);
		});
		return el("div", { class: "aero-pane" }, [
			row("Accent colour", "Tint for the HUD and command deck.", [swatches]),
			keyRow("Command deck key", "Tap it on its own to open this menu. Pick a key you do not type with.", "menuKey"),
			row("Fullscreen", "Fill the whole display.", [button("Toggle fullscreen", function () {
				try {
					if (document.fullscreenElement) document.exitFullscreen();
					else document.documentElement.requestFullscreen();
				} catch (x) {}
			})]),
			row("Restore defaults", "Resets every Aerospace setting. Worlds, mods and game options are untouched.", [button("Reset client", function () {
				radioStop();
				cfg = clone(DEFAULTS); cfg.seenIntro = true; save(); applyAccent(); applyLook(); layout(); closeDeck(); openDeck("settings");
			})])
		]);
	}

	function buildCrashPane() {
		var log = window.__aerospaceCrashLog;
		if (!log) return el("div", { class: "aero-pane" }, [el("div", { class: "aero-info", text: "The crash log is not running." })]);
		var note = el("div", { class: "aero-info" });
		function done(msg) { toast(esc(msg)); }
		function copy(text) { log.copy(text).then(function () { done("Crash log copied to the clipboard."); },
			function () { done("The browser blocked copying: use Download instead."); }); }
		function render() {
			var last = log.lastCrash();
			var html = log.crashed()
				? "<strong>The game hit an error in this session.</strong> "
				: "<strong>No crash in this session.</strong> ";
			html += last
				? "The last saved crash is from " + esc(new Date(last.at).toLocaleString()) + ":<pre class=\"aero-crash-summary\">" + esc(last.summary || "") + "</pre>"
				: "No crash has been saved yet.";
			note.innerHTML = html;
		}
		render();
		return el("div", { class: "aero-pane" }, [
			note,
			row("Last crash", "The report saved when the game last failed. Share it when you report a problem.", [
				button("Copy", function () { var l = log.lastCrash(); if (l) copy(l.report); else done("No crash has been saved."); }),
				button("Download", function () { var l = log.lastCrash(); if (l) { log.download(l.report); done("Saved to your downloads."); } else done("No crash has been saved."); }),
				button("Clear", function () { log.clearLast(); render(); done("Saved crash cleared."); })
			]),
			row("This session", "Everything the game has logged since the page opened, including warnings.", [
				button("Copy", function () { copy(log.report()); }),
				button("Download", function () { log.download(log.report()); done("Saved to your downloads."); })
			]),
			el("div", { class: "aero-info", text: "The crash log only reads what the game prints to the browser console. Nothing is uploaded." })
		]);
	}

	function buildProfilePane() {
		var api = window.__aerospaceProfile;
		if (!api) return el("div", { class: "aero-pane" }, [el("div", { class: "aero-info", text: "The pilot profile is not running." })]);
		var p = api.get();
		var startName = api.gameName();
		function input(value, attrs) {
			var i = el("input", { class: "aero-input", value: value, spellcheck: "false", autocapitalize: "off", autocomplete: "off" });
			for (var k in attrs) i.setAttribute(k, attrs[k]);
			i.value = value;
			return i;
		}
		var nameIn = input(api.isDefaultName(startName) ? "" : startName, { maxlength: "16", placeholder: startName || "3 to 16 letters, numbers or _" });
		var pwIn = input(p.password, { type: "password", maxlength: "64", placeholder: "No spaces" });
		var autoIn = el("input", { type: "checkbox" });
		autoIn.checked = p.autoLogin;
		var signupIn = input(p.signup, { class: "aero-input is-wide" });
		var loginIn = input(p.login, { class: "aero-input is-wide" });
		var status = el("div", { class: "aero-info" });
		var restart = button("Restart now", function () {
			if (window.confirm("Restart Aerospace Client now? If you are in a world, choose Save and Quit first so nothing is lost.")) location.reload();
		});
		restart.hidden = true;
		function note(html, warn) { status.innerHTML = html; status.style.borderColor = warn ? "rgba(255,111,111,.55)" : ""; }
		function intro() {
			var cur = api.gameName();
			note("<strong>Flying as " + esc(cur || "(no name yet)") + ".</strong> "
				+ (api.get().autoLogin && api.get().password
					? "When a server asks you to register or log in, Aerospace opens chat and types the sign-up command; if the server does not accept it, it types the log-in command instead."
					: "Save a password and turn on auto sign-in to have Aerospace register and log you in on servers that ask."));
		}
		intro();
		function saveAll() {
			var name = nameIn.value.trim(), pw = pwIn.value;
			if (name && !api.NAME_RE.test(name)) { note("Usernames are 3 to 16 letters, numbers or _ (no spaces).", true); nameIn.focus(); return; }
			if (pw && !api.PASSWORD_RE.test(pw)) { note("Passwords are 4 to 64 characters, without spaces.", true); pwIn.focus(); return; }
			var su = signupIn.value.trim() || api.DEFAULTS.signup, li = loginIn.value.trim() || api.DEFAULTS.login;
			if (!api.isCommand(su) || !api.isCommand(li)) { note("Sign-in commands must start with / so your password never goes into public chat.", true); return; }
			if (su.indexOf("{password}") < 0 || li.indexOf("{password}") < 0) { note("Put {password} where the password goes in both commands.", true); return; }
			var renamed = false;
			if (name && name !== api.gameName()) {
				try { api.setGameName(name); renamed = true; } catch (x) { note("Could not save the username: " + esc(x.message), true); return; }
			}
			api.set({ password: pw, autoLogin: autoIn.checked && !!pw, signup: su, login: li, created: api.get().created || Date.now(), skipped: false });
			autoIn.checked = api.get().autoLogin;
			signupIn.value = su; loginIn.value = li;
			intro();
			if (renamed) {
				restart.hidden = false;
				note("<strong>Saved.</strong> The game uses the new name, <b>" + esc(name) + "</b>, after a restart. Restart now, or keep playing and it applies next time.");
			} else toast("Profile saved.");
		}
		var showBtn = button("Show", function () {
			var show = pwIn.type === "password";
			pwIn.type = show ? "text" : "password";
			showBtn.textContent = show ? "Hide" : "Show";
		});
		return el("div", { class: "aero-pane" }, [
			status,
			row("Username", "What servers and other players see. 3 to 16 letters, numbers or _. Applies after a restart.", [nameIn]),
			row("Server password", "Saved in this browser only, without encryption. Use one you do not use anywhere else.", [pwIn, showBtn]),
			row("Auto sign-in", "Sign up or log in automatically when a server asks.", [autoIn]),
			el("h3", { class: "aero-section", text: "Commands" }),
			row("Sign-up command", "Typed first. {password} is replaced by your password.", [signupIn]),
			row("Log-in command", "Typed when the sign-up command does not work.", [loginIn]),
			row("", "", [button("Save profile", saveAll), restart,
				button("Forget password", function () { pwIn.value = ""; autoIn.checked = false; api.set({ password: "", autoLogin: false }); intro(); toast("Password removed from this browser."); }),
				button("Defaults", function () { signupIn.value = api.DEFAULTS.signup; loginIn.value = api.DEFAULTS.login; })])
		]);
	}

	function buildAboutPane() {
		return el("div", { class: "aero-pane" }, [el("div", { class: "aero-about", html:
			"<h2>Aerospace Client " + VERSION + "</h2>"
			+ "<p>A space-themed browser client built on Eaglercraft " + GAME_VERSION + ".</p>"
			+ "<h2>Controls</h2><ul>"
			+ "<li>Tap " + kbd(cfg.menuKey) + ": open this command deck</li>"
			+ "<li>Hold " + kbd(cfg.zoomKey) + ": optical zoom, scroll to adjust</li>"
			+ "<li>" + kbd(cfg.shotKey) + ": screenshot to " + (cfg.shotMode === "file" ? "a file" : "the clipboard") + "</li></ul>"
			+ "<h2>Fair play</h2><p>Client mods only read your own keyboard and mouse, and shaders only restyle the finished picture. "
			+ "Nothing reads game memory or changes what is sent to servers. The one exception is auto sign-in (Profile tab), which types "
			+ "your sign-up or log-in command into chat when a server asks, exactly as you would.</p>"
			+ "<h2>Credits</h2><ul>"
			+ "<li>Minecraft is © Mojang AB. Aerospace Client is an unofficial fan project and is not affiliated with or endorsed by Mojang or Microsoft.</li>"
			+ "<li>Browser port: the Eaglercraft project (lax1dude, ayunami2000 and the 26.x port contributors).</li>"
			+ "<li>Aerospace shell, client mods, shaders, art and added content: Aerospace Client contributors.</li></ul>"
		})]);
	}

	function buildDeck() {
		var tabs = el("div", { class: "aero-tabs" });
		var panes = {};
		function addTab(id, title, pane) {
			var t = el("button", { class: "aero-tab", type: "button", text: title });
			t.addEventListener("click", function () { showTab(id); });
			tabs.appendChild(t);
			panes[id] = { tab: t, pane: pane };
		}
		function showTab(id) {
			if (!panes[id]) id = "mods";
			for (var k in panes) {
				panes[k].tab.classList.toggle("on", k === id);
				panes[k].pane.classList.toggle("on", k === id);
			}
		}
		addTab("mods", "Client Mods", buildModsPane());
		addTab("shaders", "Shaders", buildShadersPane());
		addTab("hud", "HUD", buildHudPane());
		addTab("settings", "Settings", buildSettingsPane());
		addTab("profile", "Profile", buildProfilePane());
		addTab("crash", "Crash Log", buildCrashPane());
		addTab("about", "About", buildAboutPane());

		deckParts.footer = el("span");
		var children = [
			el("header", null, [
				el("img", { src: EMBLEM, alt: "" }),
				el("div", null, [el("h1", { text: "COMMAND DECK" }), el("p", { text: "AEROSPACE CLIENT " + VERSION + " · " + GAME_VERSION })]),
				button("Close", function () { closeDeck(); })
			]),
			tabs
		];
		for (var k in panes) children.push(panes[k].pane);
		children.push(el("footer", null, [deckParts.footer]));
		children[0].lastChild.classList.add("aero-x");
		var deck = el("div", { class: "aero-deck", role: "dialog", "aria-modal": "true", "aria-label": "Aerospace command deck" }, children);
		backdrop = el("div", { id: "aero_deck_backdrop" }, [deck]);
		backdrop.addEventListener("mousedown", function (e) { if (e.target === backdrop) closeDeck(); });
		deckParts.showTab = showTab;
		refreshFooter();
		return backdrop;
	}
	function openDeck(tab) {
		if (deckOpen) return;
		if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
		document.body.appendChild(buildDeck());   // rebuilt each time so it always reflects cfg
		deckParts.showTab(tab || "mods");
		deckOpen = true;
		releaseAll();
		backdrop.classList.add("on");
		try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
	}
	function closeDeck() {
		if (!deckOpen) return;
		deckOpen = false;
		listeningFor = null;
		if (backdrop) backdrop.classList.remove("on");
		try { var c = document.querySelector("#game_frame canvas"); if (c) c.focus(); } catch (e) {}
	}

	// ------------------------------------------------------------- updates
	var startedAt = Date.now();
	function tick() {
		var now = performance.now();
		if (cfg.modules.fps) widgets.fps.lastChild.textContent = String(currentFps());
		if (cfg.modules.cps) {
			for (var b in clicks) while (clicks[b].length && clicks[b][0] < now - 1000) clicks[b].shift();
			var bs = widgets.cps.getElementsByTagName("b");
			bs[0].textContent = String(clicks[0].length);
			bs[1].textContent = String(clicks[2].length);
		}
		if (cfg.modules.clock) {
			var d = new Date();
			widgets.clock.lastChild.textContent = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
		}
		if (cfg.modules.timer) {
			var s = Math.floor((Date.now() - startedAt) / 1000);
			widgets.timer.lastChild.textContent = pad2(Math.floor(s / 3600)) + ":" + pad2(Math.floor(s / 60) % 60) + ":" + pad2(s % 60);
		}
		if (cfg.modules.memory) {
			var mem = performance.memory;
			widgets.memory.lastChild.textContent = mem ? Math.round(mem.usedJSHeapSize / 1048576) + " MB" : "n/a";
		}
		if (cfg.modules.graph) drawGraph();
	}
	function drawGraph() {
		var c = widgets.graph._canvas, g = c.getContext("2d");
		var w = c.width, h = c.height;
		g.clearRect(0, 0, w, h);
		g.strokeStyle = "rgba(139,163,199,.25)";
		g.beginPath(); g.moveTo(0, h - 16.7 * 0.5 - 0.5); g.lineTo(w, h - 16.7 * 0.5 - 0.5); g.stroke();   // 60 fps line
		g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--aero-accent") || "#3fd0ff";
		g.beginPath();
		var n = frameDeltas.length;
		for (var i = 0; i < n; ++i) {
			var x = (i / 119) * w, y = h - clamp(frameDeltas[i], 0, 66) * 0.5;
			if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
		}
		g.stroke();
	}

	// ----------------------------------------------------------------- init
	function init() {
		buildWidgets();
		document.body.appendChild(visor);
		document.body.appendChild(hud);
		document.body.appendChild(toasts);
		applyAccent();
		applyLook();
		layout();
		hud.classList.add("is-hidden");          // revealed once the boot screen is gone
		engine.onChange(function () {
			applyLook();
			if (deckOpen && deckParts.syncStatus) deckParts.syncStatus();
		});

		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("keyup", onKeyUp, true);
		window.addEventListener("mousedown", onMouseDown, true);
		window.addEventListener("mouseup", onMouseUp, true);
		window.addEventListener("wheel", onWheel, { capture: true, passive: false });
		window.addEventListener("blur", releaseAll);
		window.addEventListener("resize", layout);
		document.addEventListener("pointerlockchange", function () { if (!inGame()) setZoom(false); });
		hud.addEventListener("pointerdown", onHudPointerDown);
		window.addEventListener("pointermove", onHudPointerMove);
		window.addEventListener("pointerup", onHudPointerUp);
		setInterval(tick, 250);
		setInterval(breakTick, 15000);

		// Browsers only allow audio after a click or key press.
		if (cfg.modules.radio) {
			var resume = function () {
				window.removeEventListener("pointerdown", resume, true);
				window.removeEventListener("keydown", resume, true);
				if (cfg.modules.radio) radioStart();
			};
			window.addEventListener("pointerdown", resume, true);
			window.addEventListener("keydown", resume, true);
		}

		function reveal() {
			hud.classList.remove("is-hidden");
			layout();
			if (!cfg.seenIntro) {
				cfg.seenIntro = true; save();
				toast("Welcome aboard. Tap " + kbd(cfg.menuKey) + " for the command deck: client mods, shaders and HUD. Hold "
					+ kbd(cfg.zoomKey) + " to zoom.", 9000);
			}
		}
		if (window.__aerospaceBootDone) reveal();
		else window.addEventListener("aerospace:ready", reveal, { once: true });
	}

	window.__aerospaceClient = {
		version: VERSION,
		open: function (tab) { openDeck(tab); },
		close: closeDeck,
		toast: toast,
		screenshot: takeScreenshot,
		get config() { return clone(cfg); }
	};

	if (document.body) init();
	else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
