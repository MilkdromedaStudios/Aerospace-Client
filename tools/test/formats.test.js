"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { readEPK, writeEPK } = require("../lib/epk");
const sf = require("../lib/singlefile");

const ROOT = path.resolve(__dirname, "..", "..");

test("EPK round-trips files, headers and metadata", () => {
  const epk = {
    version: "ver2.0", fileName: "assets.epk.epk", comment: "\n test \n", timestamp: 1792474357667n, compression: "G",
    headers: [["file-type", "epk/resources"], ["world-name", "assets.epk"]],
    files: new Map([
      ["assets/minecraft/lang/en_us.json", Buffer.from('{"a":"b"}')],
      ["pack.png", Buffer.from([0, 1, 2, 255, 254])],
      ["empty.txt", Buffer.alloc(0)],
    ]),
  };
  const back = readEPK(writeEPK(epk));
  assert.deepStrictEqual([...back.files.keys()], [...epk.files.keys()]);
  for (const [k, v] of epk.files) assert.ok(back.files.get(k).equals(v), k);
  assert.deepStrictEqual(back.headers, epk.headers);
  assert.strictEqual(back.timestamp, epk.timestamp);
  assert.strictEqual(back.comment, epk.comment);
});

test("EPK reader rejects corrupted data", () => {
  const bytes = writeEPK({
    version: "ver2.0", fileName: "x.epk", comment: "", timestamp: 0n, compression: "0",
    headers: [], files: new Map([["a.txt", Buffer.from("hello world")]]),
  });
  const bad = Buffer.from(bytes);
  bad[bad.indexOf("hello")] ^= 0xff;
  assert.throws(() => readEPK(bad), /CRC mismatch/);
  assert.throws(() => readEPK(Buffer.from("not an epk at all")), /bad magic/);
});

test("single-file split/join is lossless and payloads re-encode line-safe", () => {
  const payload = sf.encodePayload(Buffer.from("x".repeat(500000)));
  const html = '<html><head><script type="application/octet-stream" id="eag-inline-assets" data-size="'
    + payload.size + '">' + payload.text + "</script><title>t</title></head><body>é</body></html>";
  const { shellParts, payloads } = sf.splitSingleFile(html);
  assert.strictEqual(sf.joinSingleFile(shellParts, payloads), html);
  assert.strictEqual(sf.decodePayload(payloads.get("eag-inline-assets")).length, 500000);
  for (const line of payload.text.split("\n")) assert.strictEqual(line.length % 4, 0);  // loader decodes per line
  const text = sf.shellText(shellParts);
  assert.strictEqual(sf.joinSingleFile(sf.shellFromText(text), payloads), html);
});

test("overlay JSON parses and shell scripts are embeddable", () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const file of walk(path.join(ROOT, "aerospace"))) {
    if (file.endsWith(".json")) JSON.parse(fs.readFileSync(file, "utf8"));
    if (file.endsWith(".js")) assert.ok(!/<\/script/i.test(fs.readFileSync(file, "utf8")), file);
  }
});
