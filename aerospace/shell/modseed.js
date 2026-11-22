/*
 * Aerospace Client — bundled mod installer.
 *
 * Installs the mods that ship with the client (Aerospace, Sodium, Lithium) into
 * the game's own mod store, enabled, before the game starts. The store is the
 * game's IndexedDB filesystem: zeus/mods.json lists installed mods and
 * zeus/mods/<id>.zip holds each one, exactly as the Mods screen writes them.
 *
 * It respects the player: a bundled mod is installed once and updated when a
 * newer version ships, but if the player disabled it, it stays disabled, and
 * if they deleted it, it is not put back. A mod with the same id that the
 * player installed themselves is left alone.
 *
 * window.__aerospaceModSeed is a promise the launcher waits for before
 * starting the game.
 */
(function () {
	"use strict";
	var MODS = {{BUNDLED_MODS}};
	var DB_NAME = "_net_lax1dude_eaglercraft_v1_8_internal_PlatformFilesystem_1_8_8_worlds";
	var STATE_KEY = "Aerospace:bundledMods";
	var log = [];

	function bytes(b64) {
		var s = atob(b64), out = new Uint8Array(s.length);
		for (var i = 0; i < s.length; ++i) out[i] = s.charCodeAt(i);
		return out.buffer;
	}
	function text(buf) { return new TextDecoder().decode(new Uint8Array(buf)); }
	function encode(str) { return new TextEncoder().encode(str).buffer; }
	function loadState() {
		try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}") || {}; } catch (e) { return {}; }
	}
	function saveState(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) {} }

	function seed() {
		return new Promise(function (resolve) {
			if (typeof indexedDB === "undefined" || !MODS.length) { resolve("skipped"); return; }
			var req;
			try { req = indexedDB.open(DB_NAME, 1); } catch (e) { resolve("unavailable"); return; }
			req.onupgradeneeded = function () {
				// first run ever: create the store the way the game does
				var db = req.result;
				if (!db.objectStoreNames.contains("filesystem")) db.createObjectStore("filesystem", { keyPath: ["path"] });
			};
			req.onerror = function () { resolve("error: " + (req.error && req.error.message)); };
			req.onblocked = function () { resolve("blocked"); };
			req.onsuccess = function () {
				var db = req.result;
				if (!db.objectStoreNames.contains("filesystem")) { db.close(); resolve("no store"); return; }
				var tx = db.transaction("filesystem", "readwrite");
				var store = tx.objectStore("filesystem");
				var state = loadState();
				var put = function (path, data) { store.put({ path: path, data: data }); };
				var getReq = store.get(["zeus/mods.json"]);
				getReq.onsuccess = function () {
					var list = { format: 1, mods: [] };
					try { if (getReq.result) list = JSON.parse(text(getReq.result.data)); } catch (e) { log.push("mods.json unreadable, left alone"); return; }
					if (!list.mods) list.mods = [];
					var changed = false;
					MODS.forEach(function (m) {
						var entry = null;
						for (var i = 0; i < list.mods.length; ++i) if (list.mods[i].id === m.id) entry = list.mods[i];
						var mine = state[m.id];
						if (!mine) {
							if (entry) { state[m.id] = { version: null, owner: "player" }; log.push(m.id + ": player's own copy kept"); return; }
							put("zeus/mods/" + m.id + ".zip", bytes(m.zip));
							list.mods.push({ enabled: true, id: m.id });
							changed = true;
							state[m.id] = { version: m.version, owner: "aerospace" };
							log.push(m.id + " " + m.version + ": installed");
						} else if (mine.owner === "aerospace" && entry && mine.version !== m.version) {
							put("zeus/mods/" + m.id + ".zip", bytes(m.zip));
							state[m.id].version = m.version;
							log.push(m.id + ": updated to " + m.version + (entry.enabled ? "" : " (still disabled)"));
						} else if (mine.owner === "aerospace" && !entry) {
							log.push(m.id + ": removed by the player, not reinstalled");
						}
					});
					if (changed) {
						put("zeus/.eaglerfsdir", new ArrayBuffer(0));
						put("zeus/mods/.eaglerfsdir", new ArrayBuffer(0));
						put("zeus/data/.eaglerfsdir", new ArrayBuffer(0));
						put("zeus/mods.json", encode(JSON.stringify(list, null, 2)));
					}
				};
				tx.oncomplete = function () { db.close(); saveState(state); resolve(log.join("; ") || "up to date"); };
				tx.onerror = tx.onabort = function () { db.close(); resolve("write failed: " + (tx.error && tx.error.message)); };
			};
		});
	}

	var started = Date.now();
	window.__aerospaceModSeed = seed().then(function (result) {
		try { console.log("[Aerospace] bundled mods: " + result + " (" + (Date.now() - started) + " ms)"); } catch (e) {}
		return result;
	}, function (e) {
		try { console.warn("[Aerospace] bundled mods: " + e); } catch (x) {}
		return "failed";
	});
})();
