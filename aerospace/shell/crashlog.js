/*
 * Aerospace Client — crash log.
 *
 * Runs first on the page, before the game. It keeps the recent console output
 * of the page and of the game's workers, and watches for the game's crash
 * messages, which the client often only prints to the console. The integrated
 * server runs in a worker and logs the real cause there, so each worker the
 * game starts gets a small console hook that copies its output to this page
 * over a BroadcastChannel (separate from the game's own worker messages). When one appears it saves a crash report
 * and shows a panel with Copy and Download. The last report survives a reload
 * and is also in the command deck (Crash Log tab).
 *
 * It only reads console output and error events. Nothing is sent anywhere.
 */
(function () {
	"use strict";
	if (window.__aerospaceCrashLog) return;

	var VERSION = "{{CLIENT_VERSION}}";
	var GAME_VERSION = "{{GAME_VERSION}}";
	var STORE_KEY = "aerospace.crashlog.last";
	var MAX_ENTRIES = 4000, MAX_TEXT = 4000, REPORT_LINES = 600;

	// Lines that mean the game has failed (the rest is kept as context only).
	var CRASH_PATTERNS = [
		/Integrated server reported a crash/,
		/Failed to start integrated server core/,
		/Worker reported a launch failure/,
		/Exception Thrown:/,
		/Encountered an unexpected exception/,
		/This crash report has been saved/,
		/Game crashed!/,
		/could not continue/i
	];
	// Known harmless messages that look like errors, so the summary skips them.
	var NOISE = /wireframe|GL Driver Message|optional shader programs|Unable to play empty soundEvent|CORS policy|Could not download EPK file|Same-origin fetch/;

	var entries = [];
	var startedAt = Date.now();
	var listeners = [];
	var crash = null;        // { at, summary } for this page session

	function now() { return new Date(); }
	function stamp(d) { return d.toISOString().replace("T", " ").slice(0, 23); }
	function text(args) {
		var out = [];
		for (var i = 0; i < args.length; ++i) {
			var a = args[i];
			if (typeof a === "string") out.push(a);
			else if (a instanceof Error) out.push((a.stack || String(a)));
			else {
				try { out.push(JSON.stringify(a)); } catch (e) { out.push(String(a)); }
			}
		}
		var s = out.join(" ");
		return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + " …[cut]" : s;
	}
	// Secrets (the saved server password) are blanked out of every line.
	var secrets = [];
	function scrub(msg) {
		for (var i = 0; i < secrets.length; ++i) if (msg.indexOf(secrets[i]) >= 0) msg = msg.split(secrets[i]).join("••••••");
		return msg;
	}
	function redact(secret) {
		if (typeof secret !== "string" || secret.length < 3 || secrets.indexOf(secret) >= 0) return;
		secrets.push(secret);
		for (var i = 0; i < entries.length; ++i) entries[i].text = scrub(entries[i].text);
	}
	function record(level, msg) {
		if (secrets.length) msg = scrub(msg);
		var e = { t: now(), level: level, text: msg };
		entries.push(e);
		if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
		if ((level === "error" || level === "pageerror") && !crash) {
			for (var i = 0; i < CRASH_PATTERNS.length; ++i) {
				if (CRASH_PATTERNS[i].test(msg)) { onCrash(msg); break; }
			}
		}
		for (var n = 0; n < listeners.length; ++n) { try { listeners[n](); } catch (x) {} }
	}

	// ------------------------------------------------------------ capture
	["log", "info", "warn", "error", "debug"].forEach(function (level) {
		var orig = console[level];
		if (typeof orig !== "function") return;
		console[level] = function () {
			try { record(level === "info" || level === "debug" ? "log" : level, text(arguments)); } catch (e) {}
			return orig.apply(console, arguments);
		};
	});
	window.addEventListener("error", function (ev) {
		var msg = ev.error && ev.error.stack ? ev.error.stack : (ev.message + " (" + ev.filename + ":" + ev.lineno + ")");
		record("pageerror", "Uncaught " + msg);
	});
	window.addEventListener("unhandledrejection", function (ev) {
		var r = ev.reason;
		record("pageerror", "Unhandled promise rejection: " + (r && r.stack ? r.stack : String(r)));
	});

	// ------------------------------------------------------ worker output
	// Workers are wrapped only when they are classic scripts from blob: or data:
	// URLs (as the game's are): the wrapper installs the hook, then loads the
	// original script with importScripts, so the game's code runs unchanged.
	var CHANNEL = "aerospace-crashlog";
	var channel = null;
	try {
		channel = new BroadcastChannel(CHANNEL);
		channel.onmessage = function (ev) {
			var d = ev.data;
			if (d && d.__aerospaceLog) record(d.level, "[worker] " + d.text);
		};
	} catch (e) {}
	var WORKER_HOOK = "(function(){try{var c=new BroadcastChannel(" + JSON.stringify(CHANNEL) + ");"
		+ "['log','info','warn','error','debug'].forEach(function(l){var o=console[l];if(typeof o!=='function')return;"
		+ "console[l]=function(){try{var a=[];for(var i=0;i<arguments.length;i++){var x=arguments[i];"
		+ "a.push(typeof x==='string'?x:(x&&x.stack)?x.stack:String(x));}"
		+ "c.postMessage({__aerospaceLog:1,level:(l==='info'||l==='debug')?'log':l,text:a.join(' ').slice(0," + MAX_TEXT + ")});}catch(e){}"
		+ "return o.apply(console,arguments);};});"
		+ "self.addEventListener('error',function(e){try{c.postMessage({__aerospaceLog:1,level:'pageerror',"
		+ "text:'Uncaught in worker: '+((e.error&&e.error.stack)||e.message)});}catch(x){}});}catch(e){}})();\n";
	var NativeWorker = window.Worker;
	if (channel && typeof NativeWorker === "function") {
		var Wrapped = function Worker(url, options) {
			var u = String(url);
			if ((options && options.type === "module") || !/^(blob:|data:)/.test(u)) return new NativeWorker(url, options);
			var hooked = null;
			try {
				hooked = URL.createObjectURL(new Blob([WORKER_HOOK + "importScripts(" + JSON.stringify(u) + ");"], { type: "text/javascript" }));
			} catch (e) {}
			return hooked ? new NativeWorker(hooked, options) : new NativeWorker(url, options);
		};
		Wrapped.prototype = NativeWorker.prototype;
		try { Object.setPrototypeOf(Wrapped, NativeWorker); } catch (e) {}
		window.Worker = Wrapped;
	}

	// ------------------------------------------------------------- report
	function summaryOf() {
		// The root cause: the deepest entry of the game's cause chain
		// ("[2] java.lang...."), else the last "Caused By", else the exception.
		var chain = null, causedBy = null, thrown = null;
		for (var i = Math.max(0, entries.length - 600); i < entries.length; ++i) {
			var e = entries[i];
			if ((e.level !== "error" && e.level !== "pageerror") || NOISE.test(e.text)) continue;
			var re = /^\s*\[(\d+)\] ((?:java|net|org|com)\.[^\n]+)/gm, m;
			while ((m = re.exec(e.text))) chain = m[2].trim();
			if ((m = /Caused By: ([^\n]+)/i.exec(e.text))) causedBy = m[1].trim();
			if ((m = /Exception Thrown: ([^\n]+)/.exec(e.text))) thrown = m[1].trim();
		}
		if (chain || causedBy || thrown) return chain || causedBy || thrown;
		for (var j = entries.length - 1; j >= 0; --j) {
			if ((entries[j].level === "error" || entries[j].level === "pageerror") && !NOISE.test(entries[j].text)) return entries[j].text.split("\n")[0];
		}
		return "Unknown error";
	}
	function buildReport(reason) {
		var lines = [];
		lines.push("Aerospace Client crash log");
		lines.push("==========================");
		lines.push("Client:   Aerospace Client " + VERSION + " (Eaglercraft " + GAME_VERSION + ")");
		lines.push("Time:     " + stamp(now()) + " UTC");
		lines.push("Page:     " + location.href.split("#")[0].slice(0, 200));
		lines.push("Browser:  " + navigator.userAgent);
		lines.push("Uptime:   " + Math.round((Date.now() - startedAt) / 1000) + " s");
		if (reason) lines.push("Reason:   " + reason);
		lines.push("");
		var errors = entries.filter(function (e) { return (e.level === "error" || e.level === "pageerror") && !NOISE.test(e.text); });
		lines.push("--- Errors (" + errors.length + ") ---");
		errors.slice(-80).forEach(function (e) { lines.push("[" + stamp(e.t) + "] " + e.text); });
		lines.push("");
		var tail = entries.slice(-REPORT_LINES);
		lines.push("--- Last " + tail.length + " console lines ---");
		tail.forEach(function (e) { lines.push("[" + stamp(e.t) + "] " + e.level.toUpperCase() + " " + e.text); });
		return lines.join("\n") + "\n";
	}
	function saveLast(report, summary) {
		try { localStorage.setItem(STORE_KEY, JSON.stringify({ at: Date.now(), summary: summary, report: report.slice(-400000) })); } catch (e) {}
	}
	function lastCrash() {
		try { var v = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); return v && v.report ? v : null; } catch (e) { return null; }
	}
	function clearLast() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} }

	var saveTimer = null;
	function onCrash(msg) {
		crash = { at: Date.now(), summary: null };
		// the cause chain arrives over the next few lines: wait for it before saving
		setTimeout(function () {
			crash.summary = summaryOf();
			saveLast(buildReport(crash.summary), crash.summary);
			showPanel();
		}, 1500);
		// keep the saved report current while more output follows
		if (!saveTimer) saveTimer = setInterval(function () {
			if (crash && crash.summary) saveLast(buildReport(crash.summary), crash.summary);
		}, 5000);
	}

	// ---------------------------------------------------- copy / download
	function copyText(s) {
		function fallback() {
			var ta = document.createElement("textarea");
			ta.value = s; ta.setAttribute("readonly", "");
			ta.style.cssText = "position:fixed;left:-9999px;top:0";
			document.body.appendChild(ta); ta.select();
			var ok = false;
			try { ok = document.execCommand("copy"); } catch (e) {}
			document.body.removeChild(ta);
			return ok ? Promise.resolve() : Promise.reject(new Error("copy failed"));
		}
		try {
			if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s).catch(fallback);
		} catch (e) {}
		return fallback();
	}
	function fileName() {
		var d = now(), p = function (n) { return (n < 10 ? "0" : "") + n; };
		return "aerospace-crash-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + ".txt";
	}
	function download(s, name) {
		var a = document.createElement("a");
		var url = null;
		try { url = URL.createObjectURL(new Blob([s], { type: "text/plain;charset=utf-8" })); } catch (e) {}
		a.href = url || "data:text/plain;charset=utf-8," + encodeURIComponent(s);
		a.download = name || fileName();
		a.style.display = "none";
		document.body.appendChild(a);
		a.click();
		setTimeout(function () { document.body.removeChild(a); if (url) URL.revokeObjectURL(url); }, 2000);
	}

	// --------------------------------------------------------------- panel
	var panel = null;
	function showPanel() {
		if (!document.body) { document.addEventListener("DOMContentLoaded", showPanel); return; }
		try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
		if (!panel) {
			panel = document.createElement("div");
			panel.id = "aero_crash_panel";
			panel.setAttribute("role", "alertdialog");
			panel.setAttribute("aria-label", "Crash log");
			panel.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483646;"
				+ "width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;"
				+ "padding:20px 22px;border-radius:12px;border:1px solid #ff6f6f;background:rgba(10,12,24,.97);color:#e8f0ff;"
				+ "font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.6)";
			panel.innerHTML = "<div style='font-weight:700;font-size:17px;color:#ff9a9a;margin-bottom:6px'>The game hit an error</div>"
				+ "<div style='opacity:.85;margin-bottom:10px'>A crash log with the details has been saved. Copy it or download it to share it when you report the problem.</div>"
				+ "<pre data-k='summary' style='white-space:pre-wrap;word-break:break-word;background:#05060d;border:1px solid #2a3350;border-radius:8px;padding:10px;margin:0 0 14px;font:12px/1.4 ui-monospace,Consolas,monospace;color:#ffd0d0;max-height:160px;overflow:auto'></pre>"
				+ "<div style='display:flex;gap:8px;flex-wrap:wrap'>"
				+ "<button data-k='copy' type='button'>Copy crash log</button>"
				+ "<button data-k='download' type='button'>Download crash log</button>"
				+ "<button data-k='reload' type='button'>Reload</button>"
				+ "<button data-k='close' type='button'>Dismiss</button></div>"
				+ "<div data-k='status' style='margin-top:10px;min-height:1.2em;opacity:.85'></div>";
			var btns = panel.querySelectorAll("button");
			for (var i = 0; i < btns.length; ++i) {
				btns[i].style.cssText = "cursor:pointer;padding:8px 14px;border-radius:8px;border:1px solid #3a6ea8;background:#12203a;color:#e8f0ff;font:inherit";
			}
			var q = function (k) { return panel.querySelector("[data-k='" + k + "']"); };
			var status = function (s) { q("status").textContent = s; };
			q("copy").onclick = function () {
				copyText(buildReport(crash && crash.summary)).then(function () { status("Copied to the clipboard."); },
					function () { status("Copying was blocked by the browser: use Download instead."); });
			};
			q("download").onclick = function () { download(buildReport(crash && crash.summary)); status("Saved to your downloads."); };
			q("reload").onclick = function () { location.reload(); };
			q("close").onclick = function () { panel.style.display = "none"; };
			document.body.appendChild(panel);
		}
		panel.querySelector("[data-k='summary']").textContent = (crash && crash.summary) || summaryOf();
		panel.style.display = "block";
	}

	// The stock crash screen also means a crash, even without a console line.
	var watch = setInterval(function () {
		if (!crash && document.querySelector && document.querySelector("._eaglercraftX_crash_element")) {
			record("pageerror", "Game crashed! (the game showed its crash screen)");
		}
	}, 2000);

	window.__aerospaceCrashLog = {
		entries: function () { return entries.slice(); },
		report: function () { return buildReport(crash && crash.summary); },
		crashed: function () { return !!crash; },
		lastCrash: lastCrash,
		clearLast: clearLast,
		copy: copyText,
		download: download,
		fileName: fileName,
		showPanel: showPanel,
		onChange: function (fn) { listeners.push(fn); },
		redact: redact,
		_stop: function () { clearInterval(watch); }
	};
})();
