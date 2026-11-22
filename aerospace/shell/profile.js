/*
 * Aerospace Client — pilot profile and auto sign-in.
 *
 * The profile is the player's username plus a server password. On the very
 * first start the loading screen asks for it before the game starts (it can be
 * skipped); afterwards it is edited on the Profile tab of the command deck.
 *
 * Username: the game keeps it in two places, its profile save
 * (localStorage "_eaglercraftX.p", an NBT compound with a "username" string,
 * which is what servers see) and "_eaglercraftX.username" (base64). Both are
 * written. The game reads them when it starts, so a new name needs a restart.
 *
 * Password: kept in this browser's localStorage, in plain text, because it has
 * to be typed for the player. It never leaves the page except as the sign-in
 * command typed into a server's chat, and it is blanked out of the crash log.
 *
 * Auto sign-in: after the game connects to a server ("Connecting to ..." in
 * the game log), the server's chat (read from the game log's "[CHAT]" lines) is
 * watched for a sign-in prompt such as "/register" or "/login". When one comes,
 * the client opens chat and types the sign-up command (/signup by default). If
 * the server does not confirm it, the log-in command (/login) is typed instead.
 * A prompt that only asks to log in goes straight to /login. Singleplayer worlds
 * are never touched, and nothing is typed on servers that do not ask.
 *
 * Typing uses ordinary key events on the game canvas, the way the game's own
 * input self-test does; the text arrives exactly as a player would type it.
 */
(function () {
	"use strict";
	var KEY = "aerospace.profile.v1";
	var GAME_PROFILE = "_eaglercraftX.p";
	var GAME_USERNAME = "_eaglercraftX.username";
	var NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
	var PASSWORD_RE = /^[\x21-\x7e]{4,64}$/;    // printable ASCII without spaces: commands split on spaces
	var DEFAULTS = {
		password: "",
		autoLogin: true,
		signup: "/signup {password} {password}",
		login: "/login {password}",
		created: 0,      // when the first-run setup was completed
		skipped: false   // first-run setup was skipped
	};

	function clone(o) { return JSON.parse(JSON.stringify(o)); }
	function load() {
		var p = clone(DEFAULTS);
		try {
			var s = JSON.parse(localStorage.getItem(KEY) || "null");
			if (s && typeof s === "object") for (var k in DEFAULTS) if (typeof s[k] === typeof DEFAULTS[k]) p[k] = s[k];
		} catch (e) {}
		return p;
	}
	var profile = load();
	var listeners = [];
	function save() {
		try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) {}
		redactPassword();
		for (var i = 0; i < listeners.length; ++i) { try { listeners[i](); } catch (e) {} }
	}
	function redactPassword() {
		try { if (profile.password && window.__aerospaceCrashLog) window.__aerospaceCrashLog.redact(profile.password); } catch (e) {}
	}
	redactPassword();

	// ------------------------------------------------------------------ NBT
	// Just enough NBT to change one string in the game's profile save and keep
	// everything else byte-for-byte.
	function nbtRead(bytes) {
		var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), pos = 0;
		function u8() { return view.getUint8(pos++); }
		function str() { var n = view.getUint16(pos); pos += 2; var s = new TextDecoder().decode(bytes.subarray(pos, pos + n)); pos += n; return s; }
		function payload(t) {
			var n, i, out;
			switch (t) {
				case 1: return { t: 1, v: view.getInt8(pos++) };
				case 2: pos += 2; return { t: 2, v: view.getInt16(pos - 2) };
				case 3: pos += 4; return { t: 3, v: view.getInt32(pos - 4) };
				case 4: pos += 8; return { t: 4, raw: bytes.slice(pos - 8, pos) };
				case 5: pos += 4; return { t: 5, v: view.getFloat32(pos - 4) };
				case 6: pos += 8; return { t: 6, v: view.getFloat64(pos - 8) };
				case 7: n = view.getInt32(pos); pos += 4; out = bytes.slice(pos, pos + n); pos += n; return { t: 7, raw: out };
				case 8: return { t: 8, v: str() };
				case 9: {
					var et = u8(); n = view.getInt32(pos); pos += 4; out = [];
					for (i = 0; i < n; ++i) out.push(payload(et));
					return { t: 9, et: et, v: out };
				}
				case 10: {
					out = [];
					for (;;) { var tt = u8(); if (tt === 0) break; var name = str(); out.push([name, payload(tt)]); }
					return { t: 10, v: out };
				}
				case 11: n = view.getInt32(pos); pos += 4; out = bytes.slice(pos, pos + n * 4); pos += n * 4; return { t: 11, raw: out, n: n };
				case 12: n = view.getInt32(pos); pos += 4; out = bytes.slice(pos, pos + n * 8); pos += n * 8; return { t: 12, raw: out, n: n };
			}
			throw new Error("unknown NBT tag " + t);
		}
		var rootType = u8();
		if (rootType !== 10) throw new Error("profile is not an NBT compound");
		var rootName = str();
		var root = payload(10);
		return { name: rootName, root: root };
	}
	function nbtWrite(doc) {
		var parts = [], size = 0;
		function push(arr) { parts.push(arr); size += arr.length; }
		function u8(v) { push(Uint8Array.of(v & 255)); }
		function num(bytes, fn, v) { var b = new Uint8Array(bytes); fn.call(new DataView(b.buffer), 0, v); push(b); }
		function str(s) { var b = new TextEncoder().encode(s); num(2, DataView.prototype.setUint16, b.length); push(b); }
		function payload(n) {
			switch (n.t) {
				case 1: u8(n.v); break;
				case 2: num(2, DataView.prototype.setInt16, n.v); break;
				case 3: num(4, DataView.prototype.setInt32, n.v); break;
				case 4: push(n.raw); break;
				case 5: num(4, DataView.prototype.setFloat32, n.v); break;
				case 6: num(8, DataView.prototype.setFloat64, n.v); break;
				case 7: num(4, DataView.prototype.setInt32, n.raw.length); push(n.raw); break;
				case 8: str(n.v); break;
				case 9: u8(n.et); num(4, DataView.prototype.setInt32, n.v.length); n.v.forEach(payload); break;
				case 10: n.v.forEach(function (e) { u8(e[1].t); str(e[0]); payload(e[1]); }); u8(0); break;
				case 11: case 12: num(4, DataView.prototype.setInt32, n.n); push(n.raw); break;
			}
		}
		u8(10); str(doc.name); payload(doc.root);
		var out = new Uint8Array(size), o = 0;
		parts.forEach(function (p) { out.set(p, o); o += p.length; });
		return out;
	}
	function b64ToBytes(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; ++i) out[i] = bin.charCodeAt(i); return out; }
	function bytesToB64(b) { var s = ""; for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }

	// -------------------------------------------------------------- username
	function gameName() {
		try {
			var p = localStorage.getItem(GAME_PROFILE);
			if (p) {
				var doc = nbtRead(b64ToBytes(p));
				for (var i = 0; i < doc.root.v.length; ++i) if (doc.root.v[i][0] === "username" && doc.root.v[i][1].t === 8) return doc.root.v[i][1].v;
			}
		} catch (e) {}
		try { var u = localStorage.getItem(GAME_USERNAME); if (u) return atob(u); } catch (e) {}
		return "";
	}
	function setGameName(name) {
		if (!NAME_RE.test(name)) throw new Error("invalid username");
		var doc = null;
		try { var p = localStorage.getItem(GAME_PROFILE); if (p) doc = nbtRead(b64ToBytes(p)); } catch (e) { doc = null; }
		if (!doc) doc = { name: "", root: { t: 10, v: [] } };
		var found = false;
		doc.root.v.forEach(function (e) { if (e[0] === "username") { e[1] = { t: 8, v: name }; found = true; } });
		if (!found) doc.root.v.push(["username", { t: 8, v: name }]);
		localStorage.setItem(GAME_PROFILE, bytesToB64(nbtWrite(doc)));
		localStorage.setItem(GAME_USERNAME, btoa(name));
	}
	function isDefaultName(name) { return !name || /^Guest_\d+$/.test(name); }

	// ------------------------------------------------------------ first run
	// The game's start waits on this promise (see the launch gate in
	// tools/build.js) only while the first-run setup is open.
	var needsSetup = !profile.created && !profile.skipped;
	var releaseGate = null;
	if (needsSetup) {
		window.__aerospaceLaunchGate = new Promise(function (resolve) { releaseGate = resolve; });
		window.__aerospaceSetupPending = true;
	}
	function finishSetup() {
		window.__aerospaceSetupPending = false;
		if (releaseGate) { var r = releaseGate; releaseGate = null; r(); }
	}

	function mountSetup() {
		if (!needsSetup || document.getElementById("aero_setup")) return;
		var core = document.querySelector("#aero_boot .aero-boot-core");
		if (!core) { finishSetup(); return; }     // no loading screen: never hold the game
		var current = gameName();
		var form = document.createElement("form");
		form.id = "aero_setup";
		form.setAttribute("autocomplete", "off");
		form.innerHTML =
			'<h2>Create your pilot profile</h2>'
			+ '<p class="aero-setup-lead">Pick the name you fly under. Add a password and Aerospace signs you in on servers that ask (<code>/signup</code>, then <code>/login</code>).</p>'
			+ '<label>Username<input name="name" maxlength="16" spellcheck="false" autocapitalize="off" placeholder="3 to 16 letters, numbers or _" /></label>'
			+ '<label>Server password<span class="aero-setup-pw"><input name="password" type="password" maxlength="64" spellcheck="false" autocapitalize="off" placeholder="Optional, no spaces" />'
			+ '<button type="button" class="aero-setup-show" aria-label="Show password">Show</button></span></label>'
			+ '<label class="aero-setup-check"><input name="auto" type="checkbox" checked /> Sign in automatically on servers</label>'
			+ '<p class="aero-setup-note">The password is saved in this browser only, without encryption. Use one you do not use anywhere else. Change it any time: Right Shift → Profile.</p>'
			+ '<p class="aero-setup-error" role="alert"></p>'
			+ '<div class="aero-setup-actions"><button type="submit" class="aero-setup-go">Launch</button><button type="button" class="aero-setup-skip">Skip for now</button></div>';
		core.appendChild(form);
		document.getElementById("aero_boot").classList.add("is-setup");
		var nameIn = form.elements.name, pwIn = form.elements.password, autoIn = form.elements.auto;
		var errEl = form.querySelector(".aero-setup-error");
		if (!isDefaultName(current)) nameIn.value = current;
		form.querySelector(".aero-setup-show").addEventListener("click", function () {
			var show = pwIn.type === "password";
			pwIn.type = show ? "text" : "password";
			this.textContent = show ? "Hide" : "Show";
		});
		form.addEventListener("submit", function (e) {
			e.preventDefault();
			var name = nameIn.value.trim(), pw = pwIn.value;
			if (!NAME_RE.test(name)) { errEl.textContent = "Usernames are 3 to 16 letters, numbers or _ (no spaces)."; nameIn.focus(); return; }
			if (pw && !PASSWORD_RE.test(pw)) { errEl.textContent = "Passwords are 4 to 64 characters, without spaces."; pwIn.focus(); return; }
			try { setGameName(name); } catch (x) { errEl.textContent = "Could not save the username: " + x.message; return; }
			profile.password = pw;
			profile.autoLogin = !!(pw && autoIn.checked);
			profile.created = Date.now();
			save();
			close();
		});
		form.querySelector(".aero-setup-skip").addEventListener("click", function () {
			profile.skipped = true;
			save();
			close();
		});
		function close() {
			document.getElementById("aero_boot").classList.remove("is-setup");
			if (form.parentNode) form.parentNode.removeChild(form);
			finishSetup();
		}
		setTimeout(function () { try { (nameIn.value ? pwIn : nameIn).focus(); } catch (e) {} }, 50);
	}
	if (needsSetup) {
		if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountSetup, { once: true });
		else mountSetup();
	}

	// ------------------------------------------------------------- typing
	var SYM = { " ": [32, "Space"], ";": [186, "Semicolon"], "=": [187, "Equal"], ",": [188, "Comma"], "-": [189, "Minus"],
		".": [190, "Period"], "/": [191, "Slash"], "[": [219, "BracketLeft"], "\\": [220, "Backslash"], "]": [221, "BracketRight"], "'": [222, "Quote"] };
	var SHIFTED = { "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", "_": "-",
		"+": "=", "{": "[", "}": "]", ":": ";", "\"": "'", "<": ",", ">": ".", "?": "/", "~": "`", "|": "\\" };
	function keySpec(ch) {
		if (ch === "Enter") return { key: "Enter", code: "Enter", kc: 13, shift: false };
		var base = SHIFTED[ch] || ch, shift = !!SHIFTED[ch] || /^[A-Z]$/.test(ch);
		if (/^[a-z]$/i.test(base)) return { key: ch, code: "Key" + base.toUpperCase(), kc: base.toUpperCase().charCodeAt(0), shift: shift };
		if (/^[0-9]$/.test(base)) return { key: ch, code: "Digit" + base, kc: base.charCodeAt(0), shift: shift };
		// The backquote key is bound in the game (it closes chat), so ` and ~ are sent as plain characters.
		var s = base === "`" ? null : SYM[base];
		return { key: ch, code: s ? s[1] : "", kc: s ? s[0] : 0, shift: shift };
	}
	function canvas() { return document.querySelector("#game_frame canvas") || document.querySelector("canvas"); }
	function fire(target, type, s) {
		target.dispatchEvent(new KeyboardEvent(type, { key: s.key, code: s.code, keyCode: s.kc, which: s.kc, shiftKey: s.shift, bubbles: true, cancelable: true }));
	}
	function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
	function press(ch) {
		var c = canvas(), s = keySpec(ch);
		if (!c) return Promise.resolve();
		fire(c, "keydown", s);
		return sleep(18).then(function () { fire(c, "keyup", s); return sleep(18); });
	}
	function chatOpen() {
		var a = document.activeElement;
		return !!(a && a.hasAttribute && a.hasAttribute("data-eagler-text-input"));
	}
	function deckOpen() { var b = document.getElementById("aero_deck_backdrop"); return !!(b && b.classList.contains("on")); }

	var typing = false;
	// Opens chat and types one command. Resolves true once it was sent, false if
	// chat could not be opened in time (a menu or the loading screen was up).
	function typeCommand(text, timeoutMs) {
		var deadline = Date.now() + (timeoutMs || 45000);
		function attempt() {
			if (Date.now() > deadline) return Promise.resolve(false);
			if (typing || chatOpen() || deckOpen() || document.hidden) return sleep(1500).then(attempt);   // the player is typing, or the deck is up
			typing = true;
			window.__aerospaceAutoTyping = true;
			return press("t").then(function () { return sleep(450); }).then(function () {
				if (!chatOpen()) { typing = false; window.__aerospaceAutoTyping = false; return sleep(1500).then(attempt); }
				var chain = Promise.resolve();
				text.split("").forEach(function (ch) { chain = chain.then(function () { return press(ch); }); });
				return chain.then(function () { return sleep(120); }).then(function () { return press("Enter"); }).then(function () {
					typing = false; window.__aerospaceAutoTyping = false; return true;
				});
			}, function () { typing = false; window.__aerospaceAutoTyping = false; return false; });
		}
		return attempt();
	}

	// ----------------------------------------------------------- sign-in
	var PROMPT = /\/(register|reg|signup|login|log|l)\b|\b(register|sign ?up|log ?in|authenticat\w*|password)\b/i;
	var ASKS_SIGNUP = /\/(register|reg|signup)\b|\b(register|sign ?up)\b/i;
	var ASKS_LOGIN = /\/(login|log|l)\b|\blog ?in\b/i;
	var SUCCESS = /\b(success\w*|registered|logged ?in|authenticated|welcome)\b/i;
	var FAILURE = /\b(unknown|already|not|incorrect|wrong|invalid|usage|error|fail\w*|taken|exists|denied)\b/i;
	var PLAYER_CHAT = /^<[^>]{1,40}> /;
	var WRONG_PASSWORD = /\b(wrong|incorrect|invalid) password\b|\bpassword (is )?(wrong|incorrect|invalid)\b/i;

	var session = null;   // one per server connection
	function say(html) { try { if (window.__aerospaceClient) window.__aerospaceClient.toast(html, 4500); } catch (e) {} }
	// Only ever a command: a template that does not start with "/" would put the
	// password into public chat, so it is never typed.
	function isCommand(template) { return /^\/\S/.test(template || ""); }
	function fill(template) { return template.split("{password}").join(profile.password); }
	function ready() { return profile.autoLogin && PASSWORD_RE.test(profile.password) && isCommand(profile.signup) && isCommand(profile.login); }

	function onConnect(target) {
		session = { target: target, at: Date.now(), state: "waiting", lines: [] };
		// A server that has not asked within a minute is not going to.
		var s = session;
		setTimeout(function () { if (session === s && s.state === "waiting") session = null; }, 60000);
	}

	function onChat(text) {
		var s = session;
		if (!s) return;
		if (text.indexOf(profile.password) >= 0 && profile.password) return;   // our own command echoed back
		if (s.state === "waiting") {
			if (PLAYER_CHAT.test(text)) return;     // what other players say is not a prompt
			if (!ready() || !PROMPT.test(text)) return;
			var loginOnly = ASKS_LOGIN.test(text) && !ASKS_SIGNUP.test(text);
			if (loginOnly) login(s); else signup(s);
		} else if (s.state === "signup") {
			if (SUCCESS.test(text) && !FAILURE.test(text)) { s.state = "done"; say("Signed up on this server as <b>" + escapeHtml(gameName()) + "</b>."); }
			else if (FAILURE.test(text)) login(s);
		} else if (s.state === "login") {
			if (WRONG_PASSWORD.test(text)) { s.state = "done"; say("The server did not accept your saved password. Change it under Right Shift → Profile."); }
			else if (SUCCESS.test(text) && !FAILURE.test(text)) { s.state = "done"; say("Logged in."); }
		}
	}
	function signup(s) {
		s.state = "sending";
		say("Signing in to the server…");
		typeCommand(fill(profile.signup)).then(function (sent) {
			if (session !== s) return;
			if (!sent) { s.state = "done"; say("Could not open chat to sign in. Type <code>/login</code> yourself."); return; }
			s.state = "signup";
			// No clear answer: fall back to logging in.
			setTimeout(function () { if (session === s && s.state === "signup") login(s); }, 4000);
		});
	}
	function login(s) {
		s.state = "sending";
		typeCommand(fill(profile.login)).then(function (sent) {
			if (session !== s) return;
			s.state = sent ? "login" : "done";
			if (!sent) say("Could not open chat to sign in. Type <code>/login</code> yourself.");
			setTimeout(function () { if (session === s && s.state === "login") s.state = "done"; }, 8000);
		});
	}
	function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }

	// --------------------------------------------------------- game log
	// The game prints server connections and every chat line to the console.
	var CONNECT = /\bConnecting to (.+)$/;
	var SINGLEPLAYER = /Worker received StartServer for world|Starting integrated minecraft server/;
	var CONNECT_FAILED = /Couldn't connect to server/;
	var CHAT = /\[CHAT\] (.*)$/;
	function onLine(line) {
		if (line.indexOf("[CHAT]") >= 0) {
			var m = CHAT.exec(line);
			if (m) onChat(m[1]);
			return;
		}
		if (line.indexOf("Connecting to") >= 0) {
			var c = CONNECT.exec(line);
			if (c && !/^Failed/.test(line.slice(line.indexOf("]: ") + 3))) onConnect(c[1].trim());
			return;
		}
		if (SINGLEPLAYER.test(line) || CONNECT_FAILED.test(line)) session = null;
	}
	["log", "info", "warn", "error"].forEach(function (level) {
		var orig = console[level];
		if (typeof orig !== "function") return;
		console[level] = function () {
			try { if (typeof arguments[0] === "string") onLine(arguments[0]); } catch (e) {}
			return orig.apply(console, arguments);
		};
	});

	// ------------------------------------------------------------------ API
	window.__aerospaceProfile = {
		NAME_RE: NAME_RE,
		PASSWORD_RE: PASSWORD_RE,
		DEFAULTS: clone(DEFAULTS),
		get: function () { return clone(profile); },
		set: function (patch) {
			for (var k in patch) if (k in DEFAULTS && typeof patch[k] === typeof DEFAULTS[k]) profile[k] = patch[k];
			save();
		},
		isCommand: isCommand,
		gameName: gameName,
		setGameName: setGameName,
		isDefaultName: isDefaultName,
		onChange: function (fn) { listeners.push(fn); },
		typeCommand: typeCommand,
		status: function () { return session ? { target: session.target, state: session.state } : null; },
		// for debugging from the console: pretend the game printed a line
		_line: onLine
	};
})();
