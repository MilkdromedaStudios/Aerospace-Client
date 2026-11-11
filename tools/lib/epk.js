"use strict";
/**
 * Reader/writer for Eaglercraft "EPK v2.0" archives (assets.epk / sounds.epk).
 *
 * Layout:
 *   "EAGPKG$$"  u8 len + "ver2.0"  u8 len + file name  u16 len + comment
 *   i64 timestamp  i32 object count  u8 compression ('G' gzip, 'Z' zlib, '0' none)
 *   [compressed object stream]  ":::YEE:>"
 * Object stream:
 *   "HEAD" u8 len + key   i32 len + value            '>'
 *   "FILE" u8 len + path  i32 (len + 5)  u32 crc32  data  ':'  '>'
 *   "END$"
 */
const zlib = require("zlib");

const MAGIC = Buffer.from("EAGPKG$$", "latin1");
const TRAILER = Buffer.from(":::YEE:>", "latin1");

function readEPK(bytes) {
  if (!bytes.subarray(0, 8).equals(MAGIC)) throw new Error("not an EPK archive (bad magic)");
  let off = 8;
  const u8 = () => bytes[off++];
  const take = (n) => { const b = bytes.subarray(off, off + n); off += n; return b; };

  const version = take(u8()).toString("latin1");
  if (!version.startsWith("ver2.")) throw new Error("unsupported EPK version: " + version);
  const fileName = take(u8()).toString("utf8");
  const commentLength = bytes.readUInt16BE(off); off += 2;
  const comment = take(commentLength).toString("utf8");
  const timestamp = bytes.readBigInt64BE(off); off += 8;
  const objectCount = bytes.readUInt32BE(off); off += 4;
  const compression = String.fromCharCode(u8());
  if (!bytes.subarray(bytes.length - 8).equals(TRAILER)) throw new Error("EPK trailer missing");

  let stream = bytes.subarray(off, bytes.length - 8);
  if (compression === "G") stream = zlib.gunzipSync(stream);
  else if (compression === "Z") stream = zlib.inflateSync(stream);
  else if (compression !== "0") throw new Error("unsupported EPK compression '" + compression + "'");

  let p = 0;
  const headers = [];
  const files = new Map();
  for (let i = 0; i < objectCount; ++i) {
    const type = stream.subarray(p, p + 4).toString("latin1"); p += 4;
    const nameLength = stream[p++];
    const name = stream.subarray(p, p + nameLength).toString("utf8"); p += nameLength;
    const length = stream.readUInt32BE(p); p += 4;
    if (type === "FILE") {
      if (length < 5) throw new Error("invalid EPK entry '" + name + "'");
      const crc = stream.readUInt32BE(p);
      const data = stream.subarray(p + 4, p + length - 1);
      if (stream[p + length - 1] !== 0x3a) throw new Error("bad file terminator for '" + name + "'");
      if ((zlib.crc32(data) >>> 0) !== crc) throw new Error("CRC mismatch for '" + name + "'");
      files.set(name, Buffer.from(data));
    } else if (type === "HEAD") {
      headers.push([name, stream.subarray(p, p + length).toString("utf8")]);
    } else {
      throw new Error("unknown EPK object type '" + type + "'");
    }
    p += length;
    if (stream[p++] !== 0x3e) throw new Error("bad object terminator for '" + name + "'");
  }
  if (stream.subarray(p, p + 4).toString("latin1") !== "END$") throw new Error("EPK END$ marker missing");
  return { version, fileName, comment, timestamp, compression, headers, files };
}

function writeEPK(epk, { level = 9 } = {}) {
  const parts = [];
  const push = (b) => parts.push(Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1"));
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };

  let count = 0;
  for (const [key, value] of epk.headers) {
    const k = Buffer.from(key, "utf8");
    const v = Buffer.from(value, "utf8");
    push("HEAD"); push(Buffer.from([k.length])); push(k); push(u32(v.length)); push(v); push(">");
    ++count;
  }
  for (const [name, data] of epk.files) {
    const n = Buffer.from(name, "utf8");
    if (n.length > 255) throw new Error("EPK path too long: " + name);
    push("FILE"); push(Buffer.from([n.length])); push(n);
    push(u32(data.length + 5)); push(u32(zlib.crc32(data)));
    push(data); push(":>");
    ++count;
  }
  push("END$");
  let stream = Buffer.concat(parts);
  if (epk.compression === "G") stream = zlib.gzipSync(stream, { level });
  else if (epk.compression === "Z") stream = zlib.deflateSync(stream, { level });
  else if (epk.compression !== "0") throw new Error("unsupported EPK compression '" + epk.compression + "'");

  const fileName = Buffer.from(epk.fileName, "utf8");
  const comment = Buffer.from(epk.comment, "utf8");
  const head = Buffer.alloc(8 + 1 + epk.version.length + 1 + fileName.length + 2 + comment.length + 8 + 4 + 1);
  let off = 0;
  off += MAGIC.copy(head, off);
  head[off++] = epk.version.length;
  off += head.write(epk.version, off, "latin1");
  head[off++] = fileName.length;
  off += fileName.copy(head, off);
  off = head.writeUInt16BE(comment.length, off);
  off += comment.copy(head, off);
  off = head.writeBigInt64BE(BigInt(epk.timestamp), off);
  off = head.writeUInt32BE(count, off);
  head[off++] = epk.compression.charCodeAt(0);
  return Buffer.concat([head, stream, TRAILER]);
}

module.exports = { readEPK, writeEPK };
