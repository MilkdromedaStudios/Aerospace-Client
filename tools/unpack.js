#!/usr/bin/env node
"use strict";
/**
 * Extracts the stock game's assets so you can see what there is to override.
 *
 *   node tools/unpack.js [--upstream <file.html>] [--out .cache/upstream-assets]
 *
 * Copy a file from the output into aerospace/overlay/ (same relative path),
 * edit it, and `npm run build` will ship your version instead.
 */
const fs = require("fs");
const path = require("path");
const { readEPK } = require("./lib/epk");
const sf = require("./lib/singlefile");
const { resolveUpstream } = require("./lib/upstream");

const ROOT = path.resolve(__dirname, "..");
let upstream = null;
let out = path.join(ROOT, ".cache", "upstream-assets");
for (let i = 2; i < process.argv.length; ++i) {
  if (process.argv[i] === "--upstream") upstream = path.resolve(process.argv[++i]);
  else if (process.argv[i] === "--out") out = path.resolve(process.argv[++i]);
}

(async () => {
  const file = await resolveUpstream(upstream, (...a) => console.log("[aerospace]", ...a));
  const { payloads } = sf.splitSingleFile(fs.readFileSync(file, "latin1"));
  const epk = readEPK(sf.decodePayload(payloads.get("eag-inline-assets")));
  let count = 0;
  for (const [name, data] of epk.files) {
    const dest = path.join(out, name);
    if (!dest.startsWith(out + path.sep)) throw new Error("refusing to write outside the output folder: " + name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    ++count;
  }
  console.log("[aerospace] extracted " + count + " files to " + path.relative(ROOT, out));
})().catch((e) => { console.error("[aerospace] unpack failed: " + e.message); process.exit(1); });
