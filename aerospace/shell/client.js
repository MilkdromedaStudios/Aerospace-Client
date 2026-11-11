/*
 * Aerospace Client — in-page client layer.
 *
 * A DOM overlay that sits above the game canvas: HUD instruments (FPS, CPS,
 * keystrokes, clock, mission timer, memory, frame graph), optical zoom, visor
 * colour filters and the "command deck" settings menu.
 *
 * It never touches game memory or network traffic. Everything here is built
 * from browser events and CSS applied to the canvas container, so it gives no
 * gameplay advantage on servers and cannot desync the game.
 */
(function () {
	"use strict";
	if (window.__aerospaceClient) return;

	var VERSION = "{{CLIENT_VERSION}}";
	var GAME_VERSION = "{{GAME_VERSION}}";
	var EMBLEM = "{{EMBLEM_DATA_URI}}";
	var STORE_KEY = "aerospace.client.v1";
	var nativeRAF = window.requestAnimationFrame.bind(window);

	// ------------------------------------------------------------- settings
	var ACCENTS = {
		cyan: ["#3fd0ff", "#96ecff"], violet: ["#9d7bff", "#cdbcff"], amber: ["#ffb84d", "#ffe0a8"],
		lime: ["#7dff9b", "#c8ffd4"], rose: ["#ff6f9f", "#ffc0d4"], white: ["#e8f4ff", "#ffffff"]
	};
	var FILTERS = {
		off: { label: "Off", css: "" },
		night: { label: "Night Vision", css: "sepia(1) hue-rotate(62deg) saturate(2.6) contrast(1.08)" },
		solar: { label: "Solar Shield", css: "sepia(.42) saturate(1.25) hue-rotate(-12deg)" },
		deep: { label: "Deep Space", css: "saturate(1.2) hue-rotate(14deg) contrast(1.06)" },
		thermal: { label: "Thermal", css: "contrast(1.35) saturate(2.2) hue-rotate(-38deg)" },
		mono: { label: "Lunar Mono", css: "grayscale(1) contrast(1.12)" }
	};
	var DEFAULTS = {
		modules: {
			brand: true, fps: true, cps: false, keys: false, clock: false, timer: false,
			memory: false, graph: false, zoom: true, visor: false
		},
		pos: {},                       // widget id -> { x, y } as viewport fractions
		menuKey: "ShiftRight",
		zoomKey: "KeyC",
		zoomLevel: 4,
		brightness: 100,
		saturation: 100,
		filter: "off",
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
					if (k === "modules" || k === "pos") {
						for (var m in raw[k]) cfg[k][m] = raw[k][m];
					} else if (typeof raw[k] === typeof DEFAULTS[k]) {
						cfg[k] = raw[k];
					}
				}
			}
		} catch (e) {}
		if (!FILTERS[cfg.filter]) cfg.filter = "off";
		if (!ACCENTS[cfg.accent]) cfg.accent = "cyan";
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
	function inGame() { return !!document.pointerLockElement; }
	function frame() { return document.getElementById("game_frame"); }

	// ------------------------------------------------------------ fps probe
	// The game presents exactly one frame per requestAnimationFrame callback, so
	// counting the callbacks it schedules gives its real frame rate.
	var frameTimes = [], lastFrameAt = 0, frameDeltas = [];
	window.requestAnimationFrame = function (cb) {
		return nativeRAF(function (t) {
			var now = performance.now();
			frameTimes.push(now);
			if (lastFrameAt) { frameDeltas.push(now - lastFrameAt); if (frameDeltas.length > 120) frameDeltas.shift(); }
			lastFrameAt = now;
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
	var EFFECTS = [
		{ id: "zoom", name: "Optical zoom", desc: "Hold the zoom key to magnify; scroll to adjust." },
		{ id: "visor", name: "Helmet visor", desc: "Cosmetic helmet frame with soft scanlines." }
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
		hud.appendChild(el("button", { id: "aero_edit_done", class: "aero-btn", text: "Done editing layout", onclick: function () { setEditing(false); openDeck(); } }));
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

	// ------------------------------------------------------ visual effects
	var zoomHeld = false, zoomFactor = 1;
	function applyFrameStyle() {
		var f = frame();
		if (!f) return;
		var parts = [];
		if (cfg.brightness !== 100) parts.push("brightness(" + (cfg.brightness / 100) + ")");
		if (cfg.saturation !== 100) parts.push("saturate(" + (cfg.saturation / 100) + ")");
		if (FILTERS[cfg.filter].css) parts.push(FILTERS[cfg.filter].css);
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

	// ----------------------------------------------------------- input state
	var clicks = { 0: [], 2: [] };
	var deckOpen = false, editing = false, listeningFor = null;
	var menuTap = null;      // tracks a clean tap of the menu key

	function setKeyVisual(code, on) {
		var n = widgets.keys && widgets.keys._nodes[code];
		if (n) n.classList.toggle("on", on);
	}
	function swallow(e) { e.stopImmediatePropagation(); }

	function onKeyDown(e) {
		if (listeningFor) {
			swallow(e); e.preventDefault();
			if (e.code !== "Escape") { cfg[listeningFor.setting] = e.code; save(); }
			listeningFor.done();
			listeningFor = null;
			return;
		}
		if (deckOpen || editing) {
			swallow(e);                       // the game must not see typing meant for the deck
			if (e.code === "Escape" || (e.code === cfg.menuKey && !e.repeat)) {
				e.preventDefault();
				if (editing) { setEditing(false); openDeck(); } else closeDeck();
			}
			return;
		}
		if (e.code === cfg.menuKey) {
			if (!e.repeat) menuTap = { at: performance.now(), clean: true };
		} else if (menuTap) {
			menuTap.clean = false;            // menu key is being used as a modifier (e.g. typing)
		}
		if (e.code === cfg.zoomKey && cfg.modules.zoom && inGame() && !e.repeat) setZoom(true);
		setKeyVisual(e.code, true);
	}
	function onKeyUp(e) {
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

	// ---------------------------------------------------------------- deck
	var backdrop = null, deckParts = {};
	function card(def, group) {
		var c = el("button", { class: "aero-card", type: "button" }, [
			el("i"),
			el("div", null, [el("strong", { text: def.name }), el("span", { text: def.desc })])
		]);
		function sync() { c.classList.toggle("on", !!cfg.modules[def.id]); }
		c.addEventListener("click", function () {
			cfg.modules[def.id] = !cfg.modules[def.id];
			save(); sync(); layout();
			if (def.id === "zoom" && !cfg.modules.zoom) setZoom(false);
		});
		sync();
		return c;
	}
	function slider(label, hint, setting, min, max, step, suffix, onChange) {
		var out = el("output", { text: cfg[setting] + suffix });
		var input = el("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(cfg[setting]) });
		input.addEventListener("input", function () {
			cfg[setting] = Number(input.value);
			out.textContent = cfg[setting] + suffix;
			save(); onChange();
		});
		var lab = el("label", null, [document.createTextNode(label), el("small", { text: hint })]);
		return el("div", { class: "aero-row" }, [lab, input, out]);
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
		var lab = el("label", null, [document.createTextNode(label), el("small", { text: hint })]);
		return el("div", { class: "aero-row" }, [lab, btn]);
	}
	function refreshFooter() {
		if (deckParts.footer) deckParts.footer.innerHTML = "Tap <kbd>" + esc(keyLabel(cfg.menuKey)) + "</kbd> or <kbd>Esc</kbd> to close";
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
			for (var k in panes) {
				panes[k].tab.classList.toggle("on", k === id);
				panes[k].pane.classList.toggle("on", k === id);
			}
		}

		// instruments
		var grid = el("div", { class: "aero-grid" });
		for (var i = 0; i < WIDGETS.length; ++i) grid.appendChild(card(WIDGETS[i]));
		for (var j = 0; j < EFFECTS.length; ++j) grid.appendChild(card(EFFECTS[j]));
		var instruments = el("div", { class: "aero-pane" }, [grid]);

		// visor
		var select = el("select");
		for (var f in FILTERS) select.appendChild(el("option", { value: f, text: FILTERS[f].label }));
		select.value = cfg.filter;
		select.addEventListener("change", function () { cfg.filter = select.value; save(); applyFrameStyle(); });
		var visorPane = el("div", { class: "aero-pane" }, [
			el("div", { class: "aero-row" }, [
				el("label", null, [document.createTextNode("Visor filter"), el("small", { text: "Colour grade applied to the whole view." })]),
				select
			]),
			slider("Brightness boost", "Raise it for caves and night flights.", "brightness", 60, 260, 5, "%", applyFrameStyle),
			slider("Saturation", "Colour intensity of the world.", "saturation", 0, 200, 5, "%", applyFrameStyle),
			slider("Zoom strength", "Magnification when the zoom key is held.", "zoomLevel", 1.5, 12, 0.5, "×", function () {}),
			el("div", { class: "aero-row" }, [
				el("label", null, [document.createTextNode("Reset visor"), el("small", { text: "Back to an unfiltered view." })]),
				el("button", { class: "aero-btn", type: "button", text: "Reset", onclick: function () {
					cfg.filter = "off"; cfg.brightness = 100; cfg.saturation = 100; save(); applyFrameStyle(); closeDeck(); openDeck("visor");
				} })
			])
		]);

		// settings
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
		var settingsPane = el("div", { class: "aero-pane" }, [
			el("div", { class: "aero-row" }, [
				el("label", null, [document.createTextNode("Accent colour"), el("small", { text: "Tint for the HUD and command deck." })]),
				swatches
			]),
			slider("HUD scale", "Size of the on-screen instruments.", "hudScale", 70, 180, 5, "%", layout),
			slider("HUD opacity", "How solid the instruments look.", "hudOpacity", 20, 100, 5, "%", layout),
			keyRow("Command deck key", "Tap it on its own to open this menu. Pick a key you do not type with.", "menuKey"),
			keyRow("Zoom key", "Hold in a world to zoom.", "zoomKey"),
			el("div", { class: "aero-row" }, [
				el("label", null, [document.createTextNode("HUD layout"), el("small", { text: "Drag instruments to where you want them." })]),
				el("button", { class: "aero-btn", type: "button", text: "Edit HUD layout", onclick: function () { closeDeck(); setEditing(true); } }),
				el("button", { class: "aero-btn", type: "button", text: "Reset positions", onclick: function () { cfg.pos = {}; save(); layout(); toast("HUD layout reset."); } })
			]),
			el("div", { class: "aero-row" }, [
				el("label", null, [document.createTextNode("Fullscreen"), el("small", { text: "Fill the whole display." })]),
				el("button", { class: "aero-btn", type: "button", text: "Toggle fullscreen", onclick: function () {
					try {
						if (document.fullscreenElement) document.exitFullscreen();
						else document.documentElement.requestFullscreen();
					} catch (x) {}
				} })
			]),
			el("div", { class: "aero-row" }, [
				el("label", null, [document.createTextNode("Restore defaults"), el("small", { text: "Resets every Aerospace setting. Worlds and game options are untouched." })]),
				el("button", { class: "aero-btn", type: "button", text: "Reset client", onclick: function () {
					cfg = clone(DEFAULTS); cfg.seenIntro = true; save(); applyAccent(); applyFrameStyle(); layout(); closeDeck(); openDeck("settings");
				} })
			])
		]);

		// about
		var about = el("div", { class: "aero-pane" }, [el("div", { class: "aero-about", html:
			"<h2>Aerospace Client " + VERSION + "</h2>"
			+ "<p>A space-themed browser client built on Eaglercraft " + GAME_VERSION + ".</p>"
			+ "<h2>Controls</h2><ul>"
			+ "<li>Tap <kbd>" + keyLabel(DEFAULTS.menuKey) + "</kbd> (rebindable): open this command deck</li>"
			+ "<li>Hold <kbd>" + keyLabel(DEFAULTS.zoomKey) + "</kbd> (rebindable): optical zoom, scroll to adjust</li></ul>"
			+ "<h2>Fair play</h2><p>The client layer only reads your own keyboard and mouse and restyles the picture. "
			+ "It does not read game memory or change what is sent to servers.</p>"
			+ "<h2>Credits</h2><ul>"
			+ "<li>Minecraft is © Mojang AB. Aerospace Client is an unofficial fan project and is not affiliated with or endorsed by Mojang or Microsoft.</li>"
			+ "<li>Browser port: the Eaglercraft project (lax1dude, ayunami2000 and the 26.x port contributors).</li>"
			+ "<li>Aerospace shell, HUD, art and added content: Aerospace Client contributors.</li></ul>"
		})]);

		addTab("instruments", "Instruments", instruments);
		addTab("visor", "Visor", visorPane);
		addTab("settings", "Settings", settingsPane);
		addTab("about", "About", about);

		deckParts.footer = el("span");
		var deck = el("div", { class: "aero-deck", role: "dialog", "aria-modal": "true", "aria-label": "Aerospace command deck" }, [
			el("header", null, [
				el("img", { src: EMBLEM, alt: "" }),
				el("div", null, [el("h1", { text: "COMMAND DECK" }), el("p", { text: "AEROSPACE CLIENT " + VERSION + " · " + GAME_VERSION })]),
				el("button", { class: "aero-btn aero-x", type: "button", text: "Close", onclick: function () { closeDeck(); } })
			]),
			tabs, instruments, visorPane, settingsPane, about,
			el("footer", null, [deckParts.footer])
		]);
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
		deckParts.showTab(tab || "instruments");
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
		applyFrameStyle();
		layout();
		hud.classList.add("is-hidden");          // revealed once the boot screen is gone

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

		function reveal() {
			hud.classList.remove("is-hidden");
			layout();
			if (!cfg.seenIntro) {
				cfg.seenIntro = true; save();
				toast("Welcome aboard. Tap <kbd>" + esc(keyLabel(cfg.menuKey)) + "</kbd> for the command deck, hold <kbd>"
					+ esc(keyLabel(cfg.zoomKey)) + "</kbd> to zoom.", 9000);
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
		get config() { return clone(cfg); }
	};

	if (document.body) init();
	else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
