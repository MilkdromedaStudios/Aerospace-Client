"use strict";
/**
 * Bundled Lua mods: packs each mod the way the game's Mods screen stores an
 * installed mod (a zip with metadata.json, main.lua and an optional icon.png)
 * and produces the data the shell's mod seeder installs into the game's mod
 * store before the game starts.
 *
 *   aerospace/mods/aerospace/   metadata.json, items.lua (generated), main.lua, icon.png
 *   aerospace/mods/vendor/<id>/ a single .lua mod with a "-- name: ..." header, and its LICENSE
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---------------------------------------------------------------- zip (store)
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // UTF-8 names
    local.writeUInt16LE(0, 8);             // stored
    local.writeUInt32LE(0, 10);            // time/date (deterministic)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// "-- key: value" header lines of a single-file mod
function luaHeader(text) {
  const meta = {};
  for (const line of text.split("\n").slice(0, 20)) {
    const m = /^--\s*(name|id|version|author|description):\s*(.*?)\s*$/.exec(line);
    if (m) meta[m[1]] = m[2];
  }
  return meta;
}

function metadata(meta) {
  for (const k of ["id", "name", "version"]) if (!meta[k]) throw new Error(`mod metadata is missing "${k}"`);
  if (!/^[a-z0-9_]+$/.test(meta.id)) throw new Error("bad mod id " + meta.id);
  return {
    api: 1,
    authors: meta.authors || (meta.author ? [meta.author] : []),
    description: meta.description || "",
    icon: "icon.png",
    id: meta.id,
    main: "main.lua",
    name: meta.name,
    version: meta.version,
  };
}

/** The bundled mods as [{ id, name, version, zip: Buffer }], Aerospace first. */
function buildMods(aeroDir) {
  const mods = [];
  const own = path.join(aeroDir, "mods", "aerospace");
  const meta = metadata(JSON.parse(fs.readFileSync(path.join(own, "metadata.json"), "utf8")));
  // items.lua (generated item definitions) goes in front of main.lua: one file, no require()
  const main = Buffer.concat([fs.readFileSync(path.join(own, "items.lua")), Buffer.from("\n"), fs.readFileSync(path.join(own, "main.lua"))]);
  const entries = [["metadata.json", Buffer.from(JSON.stringify(meta, null, 2) + "\n")], ["main.lua", main]];
  if (fs.existsSync(path.join(own, "icon.png"))) entries.push(["icon.png", fs.readFileSync(path.join(own, "icon.png"))]);
  mods.push({ id: meta.id, name: meta.name, version: meta.version, zip: zip(entries) });

  const vendor = path.join(aeroDir, "mods", "vendor");
  for (const dir of fs.readdirSync(vendor).sort()) {
    const full = path.join(vendor, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    const lua = fs.readdirSync(full).filter((f) => f.endsWith(".lua"));
    if (lua.length !== 1) throw new Error(`mods/vendor/${dir} must hold exactly one .lua file`);
    if (!fs.existsSync(path.join(full, "LICENSE"))) throw new Error(`mods/vendor/${dir} has no LICENSE`);
    const text = fs.readFileSync(path.join(full, lua[0]));
    const m = metadata(luaHeader(text.toString("utf8")));
    if (mods.some((x) => x.id === m.id)) throw new Error("two bundled mods use the id " + m.id);
    mods.push({ id: m.id, name: m.name, version: m.version, zip: zip([["metadata.json", Buffer.from(JSON.stringify(m, null, 2) + "\n")], ["main.lua", text]]) });
  }
  return mods;
}

module.exports = { buildMods, zip, luaHeader };
