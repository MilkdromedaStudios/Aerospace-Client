#!/usr/bin/env node
"use strict";
/**
 * Aerospace Client build.
 *
 *   node tools/build.js [--upstream <Eaglercraft-26.3.html>] [--out docs/index.html]
 *
 * Takes the stock single-file Eaglercraft 26.3 build and produces the Aerospace
 * Client single-file build:
 *
 *   1. split the HTML into its shell and base64 payloads
 *   2. unpack assets.epk, apply aerospace/overlay + lang + patches, repack
 *   3. patch the shell (branding, boot screen, client layer, payload sizes)
 *   4. write one self-contained HTML file
 *
 * The three WebAssembly images, the Brotli decoder and sounds.epk are copied
 * through byte-for-byte: no game code is modified.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { readEPK, writeEPK } = require("./lib/epk");
const sf = require("./lib/singlefile");
const { resolveUpstream } = require("./lib/upstream");

const ROOT = path.resolve(__dirname, "..");
const AERO = path.join(ROOT, "aerospace");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

function parseArgs(argv) {
  const args = { out: path.join(ROOT, "docs", "index.html"), upstream: null };
  for (let i = 2; i < argv.length; ++i) {
    if (argv[i] === "--upstream") args.upstream = path.resolve(argv[++i]);
    else if (argv[i] === "--out") args.out = path.resolve(argv[++i]);
    else if (argv[i] === "-h" || argv[i] === "--help") {
      console.log("usage: node tools/build.js [--upstream <file.html>] [--out <file.html>]");
      process.exit(0);
    } else throw new Error("unknown argument: " + argv[i]);
  }
  return args;
}

const log = (...a) => console.log("[aerospace]", ...a);
function fail(message) { throw new Error(message); }

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile() && entry.name !== ".DS_Store") out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

function pngSize(buf, name) {
  const sig = "89504e470d0a1a0a";
  if (buf.length < 24 || buf.subarray(0, 8).toString("hex") !== sig) fail("not a PNG: " + name);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function formatSpecifiers(text) {
  return (String(text).match(/%(?:\d+\$)?[sd]/g) || []).sort().join(",");
}

function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object") deepMerge(target[k], v);
    else target[k] = v;
  }
  return target;
}

const jsonText = (obj) => Buffer.from(JSON.stringify(obj, null, 2) + "\n", "utf8");
const parseJSON = (buf, name) => {
  try { return JSON.parse(buf.toString("utf8")); } catch (e) { fail("invalid JSON in " + name + ": " + e.message); }
};

// ------------------------------------------------------------------ assets --
const RESIZABLE = /^assets\/minecraft\/textures\/gui\/title\/background\/panorama_\d\.png$/;

function patchAssets(epk) {
  const files = epk.files;
  const stats = { replaced: 0, added: 0, langKeys: 0 };

  // 1. overlay
  const overlayDir = path.join(AERO, "overlay");
  for (const rel of walk(overlayDir)) {
    const data = fs.readFileSync(path.join(overlayDir, rel));
    if (rel.endsWith(".json") || rel.endsWith(".mcmeta")) parseJSON(data, "overlay/" + rel);
    if (rel.endsWith(".png")) {
      const size = pngSize(data, rel);
      const old = files.get(rel);
      if (old && !RESIZABLE.test(rel)) {
        const prev = pngSize(old, rel);
        if (prev.width !== size.width || prev.height !== size.height) {
          fail(`overlay/${rel} is ${size.width}x${size.height} but replaces a ${prev.width}x${prev.height} texture`);
        }
      }
    }
    if (files.has(rel)) stats.replaced++; else stats.added++;
    files.set(rel, data);
  }

  // 2. language keys: merged into the minecraft namespace, and overridden in any
  //    other namespace that already defines the same key
  const langDir = path.join(AERO, "lang");
  for (const rel of walk(langDir)) {
    const locale = rel.replace(/\.json$/, "");
    const patch = parseJSON(fs.readFileSync(path.join(langDir, rel)), "lang/" + rel);
    const mainPath = `assets/minecraft/lang/${locale}.json`;
    if (!files.has(mainPath)) fail("upstream has no language file " + mainPath);
    for (const [name, data] of [...files]) {
      const m = /^assets\/([^/]+)\/lang\/([^/]+)\.json$/.exec(name);
      if (!m || m[2] !== locale) continue;
      const lang = parseJSON(data, name);
      let touched = false;
      for (const [key, value] of Object.entries(patch)) {
        if (key in lang) {
          if (formatSpecifiers(lang[key]) !== formatSpecifiers(value)) {
            fail(`lang key ${key}: placeholders differ from upstream ("${lang[key]}" vs "${value}")`);
          }
        } else if (name !== mainPath) continue;
        if (lang[key] !== value) { lang[key] = value; touched = true; stats.langKeys++; }
      }
      if (touched) files.set(name, jsonText(lang));
    }
  }

  // 3. structural JSON patches
  const patches = parseJSON(fs.readFileSync(path.join(AERO, "patches.json")), "patches.json");
  for (const [name, patch] of Object.entries(patches.merge || {})) {
    if (!files.has(name)) fail("patches.json merge target missing: " + name);
    files.set(name, jsonText(deepMerge(parseJSON(files.get(name), name), patch)));
  }
  for (const [name, values] of Object.entries(patches.appendValues || {})) {
    if (!files.has(name)) fail("patches.json appendValues target missing: " + name);
    const tag = parseJSON(files.get(name), name);
    for (const v of values) if (!tag.values.includes(v)) tag.values.push(v);
    files.set(name, jsonText(tag));
  }

  // 4. cross-checks, so a typo fails the build instead of the world load
  const sizes = new Set();
  for (let i = 0; i < 6; ++i) {
    const s = pngSize(files.get(`assets/minecraft/textures/gui/title/background/panorama_${i}.png`), "panorama_" + i);
    if (s.width !== s.height) fail("panorama faces must be square");
    sizes.add(s.width);
  }
  if (sizes.size !== 1) fail("all six panorama faces must be the same size");
  const idPath = (id, prefix, ext) => {
    const [ns, p] = id.includes(":") ? id.split(":") : ["minecraft", id];
    return `${prefix[0]}/${ns}/${prefix[1]}/${p}${ext}`;
  };
  for (const [name, data] of files) {
    if (/^data\/minecraft\/painting_variant\/aerospace_/.test(name)) {
      const v = parseJSON(data, name);
      const tex = idPath(v.asset_id, ["assets", "textures/painting"], ".png");
      if (!files.has(tex)) fail(`${name}: missing texture ${tex}`);
      const s = pngSize(files.get(tex), tex);
      if (s.width * v.height !== s.height * v.width) fail(`${name}: texture aspect does not match ${v.width}x${v.height} blocks`);
    }
    if (/^data\/minecraft\/advancement\/aerospace\//.test(name)) {
      const a = parseJSON(data, name);
      if (a.parent && !files.has(idPath(a.parent, ["data", "advancement"], ".json"))) fail(`${name}: unknown parent ${a.parent}`);
      for (const group of a.requirements) for (const c of group) if (!(c in a.criteria)) fail(`${name}: requirement '${c}' has no criterion`);
      const bg = a.display && a.display.background;
      if (bg && !files.has(idPath(bg, ["assets", "textures"], ".png"))) fail(`${name}: missing background ${bg}`);
    }
  }
  const placeable = parseJSON(files.get("data/minecraft/tags/painting_variant/placeable.json"), "placeable.json");
  for (const id of placeable.values) {
    if (!files.has(idPath(id, ["data", "painting_variant"], ".json"))) fail("placeable painting tag references unknown variant " + id);
  }
  return stats;
}

// ------------------------------------------------------------------- shell --
function replaceOnce(text, find, replacement, what) {
  const first = typeof find === "string" ? text.indexOf(find) : text.search(find);
  if (first < 0) fail("shell patch failed, anchor not found: " + what);
  if (typeof find === "string") {
    if (text.indexOf(find, first + find.length) >= 0) fail("shell patch failed, anchor is not unique: " + what);
    return text.slice(0, first) + replacement + text.slice(first + find.length);
  }
  const matches = text.match(new RegExp(find.source, find.flags.includes("g") ? find.flags : find.flags + "g"));
  if (matches.length !== 1) fail("shell patch failed, anchor is not unique: " + what);
  return text.replace(find, () => replacement);
}

function patchShell(shell, ctx) {
  const titleMatch = /<title>([^<]*)<\/title>/.exec(shell);
  if (!titleMatch) fail("shell has no <title>");
  const version = (/Eaglercraft\s+([0-9][0-9.]*)/.exec(titleMatch[1]) || [])[1];
  if (!version) fail("could not read the game version from the upstream title: " + titleMatch[1]);
  ctx.gameVersion = version;

  const dataURI = (file) => "data:image/png;base64," + fs.readFileSync(path.join(AERO, "shell", file)).toString("base64");
  const tokens = {
    "{{EMBLEM_DATA_URI}}": dataURI("emblem.png"),
    "{{GAME_VERSION}}": version,
    "{{CLIENT_VERSION}}": pkg.version,
  };
  const template = (file) => {
    let text = fs.readFileSync(path.join(AERO, "shell", file), "utf8");
    for (const [token, value] of Object.entries(tokens)) text = text.split(token).join(value);
    if (/\{\{[A-Z_]+\}\}/.test(text)) fail("unresolved template token in shell/" + file);
    if (/<\/script/i.test(text) && file.endsWith(".js")) fail("shell/" + file + " must not contain a closing script tag");
    return text;
  };

  shell = replaceOnce(shell, /<title>[^<]*<\/title>/, `<title>Aerospace Client ${version}</title>`, "title");
  shell = replaceOnce(shell, /<link rel="icon" type="image\/png" href="data:image\/png;base64,[^"]*" \/>/,
    `<link rel="icon" type="image/png" href="${dataURI("favicon.png")}" />`, "favicon");
  shell = replaceOnce(shell, "Eaglercraft requires landscape mode on phones.",
    "Aerospace Client requires landscape mode on phones.", "rotate notice");
  shell = replaceOnce(shell, '"Eaglercraft could not continue.\\n\\n"',
    '"Aerospace Client could not continue.\\n\\n"', "crash panel text");
  shell = replaceOnce(shell, '"eaglercraft-recovered-crash.json"', '"aerospace-client-crash.json"', "crash report name");

  // payload sizes that the loader hard-codes
  shell = replaceOnce(shell, `var size = ${ctx.oldAssetsSize};`, `var size = ${ctx.newAssetsSize};`, "server worker asset size");
  shell = replaceOnce(shell, `Number("${ctx.oldAssetsSize + ctx.soundsSize}")`,
    `Number("${ctx.newAssetsSize + ctx.soundsSize}")`, "asset download total");

  const head = [
    '\t<meta name="theme-color" content="#04070f" />',
    '\t<meta name="description" content="Aerospace Client: a space-themed browser client built on Eaglercraft ' + version + '." />',
    '\t<meta name="generator" content="Aerospace Client ' + pkg.version + '" />',
    '\t<style id="aerospace-style">\n' + template("aerospace.css") + "\t</style>",
    "",
  ].join("\n");
  shell = replaceOnce(shell, "</head>", head + "</head>", "</head>");

  const body = [
    template("boot.html").trimEnd(),
    '<script type="text/javascript" id="aerospace-boot">\n' + template("boot.js") + "</script>",
    '<script type="text/javascript" id="aerospace-client">\n' + template("client.js") + "</script>",
    "",
  ].join("\n");
  shell = replaceOnce(shell, "</body>", body + "</body>", "</body>");
  return shell;
}

// -------------------------------------------------------------------- main --
async function main() {
  const args = parseArgs(process.argv);
  const upstreamPath = await resolveUpstream(args.upstream, log);
  const html = fs.readFileSync(upstreamPath, "latin1");   // payloads are ASCII; shell re-decoded below
  const { shellParts, payloads } = sf.splitSingleFile(html);
  for (const id of ["eag-inline-decoder", "eag-inline-wasm-br", "eag-inline-mesh-wasm-br",
    "eag-inline-server-wasm-br", "eag-inline-assets", "eag-inline-sounds"]) {
    if (!payloads.has(id)) fail("upstream file has no payload block '" + id + "'. Is this a single-file Eaglercraft 26.x build?");
  }
  // shell text is UTF-8; it was read as latin1 so offsets stay byte-accurate
  const shellUtf8 = Buffer.from(sf.shellText(shellParts), "latin1").toString("utf8");

  log("unpacking assets.epk…");
  const assetsBytes = sf.decodePayload(payloads.get("eag-inline-assets"));
  const epk = readEPK(assetsBytes);
  const before = epk.files.size;
  const stats = patchAssets(epk);
  log(`assets: ${before} upstream files, ${stats.replaced} replaced, ${stats.added} added, ${stats.langKeys} language strings changed`);

  epk.comment = "\n\n #  Aerospace Client " + pkg.version + " assets\n #  built on Eaglercraft (EPK v2.0)\n\n";
  const packed = writeEPK(epk);
  const check = readEPK(packed);                           // round-trip before shipping it
  if (check.files.size !== epk.files.size) fail("EPK round-trip lost files");
  payloads.set("eag-inline-assets", sf.encodePayload(packed));

  const ctx = {
    oldAssetsSize: assetsBytes.length,
    newAssetsSize: packed.length,
    soundsSize: payloads.get("eag-inline-sounds").size,
  };
  const shell = patchShell(shellUtf8, ctx);
  const out = sf.joinSingleFile(sf.shellFromText(Buffer.from(shell, "utf8").toString("latin1")), payloads);

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  const outBytes = Buffer.from(out, "latin1");
  fs.writeFileSync(args.out, outBytes);
  const sha = crypto.createHash("sha256").update(outBytes).digest("hex");
  log(`wrote ${path.relative(ROOT, args.out)}  (${(outBytes.length / 1048576).toFixed(1)} MB, game ${ctx.gameVersion}, client ${pkg.version})`);
  log("sha256 " + sha);
}

main().catch((e) => { console.error("[aerospace] build failed: " + e.message); process.exit(1); });
