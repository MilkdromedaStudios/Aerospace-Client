"use strict";
/**
 * Split / re-join the single-file Eaglercraft 26.x HTML.
 *
 * The file is a normal HTML shell with six
 *   <script type="application/octet-stream" id="eag-inline-…" data-size="N">
 * blocks holding base64 payloads (Brotli decoder, three Wasm images, assets.epk,
 * sounds.epk). The loader decodes them line by line, so every line must be a
 * self-contained base64 string.
 */
const PAYLOAD_RE = /<script type="application\/octet-stream" id="([a-z0-9-]+)" data-size="(\d+)">/g;
const LINE_CHARS = 262144; // must stay a multiple of 4

function splitSingleFile(html) {
  const shellParts = [];
  const payloads = new Map();
  let last = 0;
  let m;
  PAYLOAD_RE.lastIndex = 0;
  while ((m = PAYLOAD_RE.exec(html)) !== null) {
    const bodyStart = m.index + m[0].length;
    const bodyEnd = html.indexOf("</script>", bodyStart);
    if (bodyEnd < 0) throw new Error("unterminated payload block: " + m[1]);
    shellParts.push(html.slice(last, m.index), { id: m[1] });
    payloads.set(m[1], { size: Number(m[2]), text: html.slice(bodyStart, bodyEnd) });
    last = bodyEnd + "</script>".length;
    PAYLOAD_RE.lastIndex = last;
  }
  shellParts.push(html.slice(last));
  return { shellParts, payloads };
}

function decodePayload(payload) {
  const bytes = Buffer.from(payload.text.replace(/\s+/g, ""), "base64");
  if (bytes.length !== payload.size) {
    throw new Error("payload size mismatch: header says " + payload.size + ", decoded " + bytes.length);
  }
  return bytes;
}

function encodePayload(bytes) {
  const b64 = bytes.toString("base64");
  const lines = [""];
  for (let i = 0; i < b64.length; i += LINE_CHARS) lines.push(b64.slice(i, i + LINE_CHARS));
  lines.push("");
  return { size: bytes.length, text: lines.join("\n") };
}

function joinSingleFile(shellParts, payloads) {
  const out = [];
  for (const part of shellParts) {
    if (typeof part === "string") { out.push(part); continue; }
    const payload = payloads.get(part.id);
    if (!payload) throw new Error("missing payload: " + part.id);
    out.push('<script type="application/octet-stream" id="' + part.id + '" data-size="' + payload.size + '">',
      payload.text, "</script>");
  }
  return out.join("");
}

/** Shell text with payload blocks removed (handy for patching and diffing). */
function shellText(shellParts) {
  return shellParts.map((p) => (typeof p === "string" ? p : "\u0000PAYLOAD:" + p.id + "\u0000")).join("");
}

function shellFromText(text) {
  return text.split(/\u0000PAYLOAD:([a-z0-9-]+)\u0000/).map((p, i) => (i % 2 ? { id: p } : p));
}

module.exports = { splitSingleFile, joinSingleFile, decodePayload, encodePayload, shellText, shellFromText };
