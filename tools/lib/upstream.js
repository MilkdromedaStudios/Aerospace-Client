"use strict";
/**
 * Locates the stock Eaglercraft 26.3 single-file build that Aerospace Client is
 * built from. The game itself is not stored in this repository's sources; it is
 * read from a local file or downloaded once into .cache/.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const CACHE = path.join(ROOT, ".cache", "eaglercraft-26.3.html");

// "Eaglercraft 26.3 (zeus/master)", single self-contained HTML file.
const UPSTREAM = {
  url: "https://raw.githubusercontent.com/WestDakota13/Eaglercraft-26.3/18830e2f6fd3364fad220b30cf41db3a25602c9b/index.html",
  sha256: "6d3b6c3419f1da310e51edd8bc071813d17119d1b1e20db44fb5561fabb27866",
  bytes: 79422309,
};

function sha256(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.allocUnsafe(1 << 20);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return hash.digest("hex");
}

async function download(dest, log) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".part";
  // AEROSPACE_UPSTREAM_URL can point at another copy of the same file (a mirror
  // or your own storage). The SHA-256 check below still applies to it.
  const url = process.env.AEROSPACE_UPSTREAM_URL || UPSTREAM.url;
  log("downloading upstream Eaglercraft 26.3 (" + (UPSTREAM.bytes / 1048576).toFixed(0) + " MB)…");
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  } catch (e) {
    // fetch() ignores proxy settings on some Node versions; curl honours them
    log("fetch failed (" + e.message + "), retrying with curl…");
    execFileSync("curl", ["-fsSL", "--retry", "3", "-o", tmp, url], { stdio: "inherit" });
  }
  fs.renameSync(tmp, dest);
}

async function resolveUpstream(explicit, log) {
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error("upstream file not found: " + explicit);
    const digest = sha256(explicit);
    if (digest !== UPSTREAM.sha256) {
      log("note: " + path.basename(explicit) + " is not the pinned 26.3 build (sha256 " + digest.slice(0, 12)
        + "…). Continuing; the build stops if the file's layout differs.");
    }
    return explicit;
  }
  if (!fs.existsSync(CACHE)) await download(CACHE, log);
  const digest = sha256(CACHE);
  if (digest !== UPSTREAM.sha256) {
    throw new Error("cached upstream build has an unexpected sha256 (" + digest + "). Delete .cache/ and retry, "
      + "or pass a file you trust with --upstream.");
  }
  return CACHE;
}

module.exports = { resolveUpstream, UPSTREAM, CACHE };
