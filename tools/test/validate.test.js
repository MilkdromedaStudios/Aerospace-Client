"use strict";
// The validator against the real 26.3 assets: the shipped pack must pass, and
// each deliberate mistake below must be caught. Needs the upstream build in
// .cache/ (the build downloads it), otherwise the tests are skipped.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { readEPK } = require("../lib/epk");
const sf = require("../lib/singlefile");
const { validate } = require("../lib/validate");
const { applyAerospace } = require("../build");

const ROOT = path.resolve(__dirname, "..", "..");
const UPSTREAM = path.join(ROOT, ".cache", "eaglercraft-26.3.html");
const skip = !fs.existsSync(UPSTREAM) && "needs .cache/eaglercraft-26.3.html (run the build once)";

let base = null;
function load() {
  if (!base) {
    const { payloads } = sf.splitSingleFile(fs.readFileSync(UPSTREAM, "latin1"));
    const files = readEPK(sf.decodePayload(payloads.get("eag-inline-assets"))).files;
    const { stock, ours } = applyAerospace(files, { spaceExpansion: true });
    base = { stock, files, ours };
  }
  return base;
}

test("Space Expansion is excluded from the default build", () => {
  const { stock } = load();
  const files = new Map(stock);
  const { ours } = applyAerospace(files);
  for (const path of [
    "data/minecraft/dimension/moon.json",
    "data/minecraft/dimension_type/moon.json",
    "data/minecraft/worldgen/noise_settings/mars.json",
    "data/minecraft/function/aerospace/load.mcfunction",
    "assets/minecraft/items/aerospace_rocket.json",
  ]) {
    assert.equal(files.has(path), false, "default build unexpectedly includes " + path);
  }
  assert.equal(ours.has("data/minecraft/dimension/moon.json"), false);
});

test("Space Expansion remains available as an explicit opt-in", () => {
  const { stock } = load();
  const files = new Map(stock);
  applyAerospace(files, { spaceExpansion: true });
  for (const path of [
    "data/minecraft/dimension/moon.json",
    "data/minecraft/dimension_type/moon.json",
    "data/minecraft/worldgen/noise_settings/mars.json",
    "data/minecraft/function/aerospace/load.mcfunction",
    "assets/minecraft/items/aerospace_rocket.json",
  ]) {
    assert.equal(files.has(path), true, "opt-in build is missing " + path);
  }
});

const D = "data/minecraft/";
const jsonEdit = (fn) => (buf) => { const o = JSON.parse(buf.toString("utf8")); fn(o); return Buffer.from(JSON.stringify(o)); };
const textEdit = (from, to) => (buf) => {
  const text = buf.toString("utf8");
  if (!text.includes(from)) throw new Error("mutation anchor not found: " + from);
  return Buffer.from(text.replace(from, to));
};
const append = (line) => (buf) => Buffer.from(buf.toString("utf8") + line + "\n");

const MUTATIONS = [
  ["placed feature typo", D + "worldgen/biome/martian_desert.json",
    textEdit('"minecraft:ore_gold_extra"', '"minecraft:ore_gold_extr"'), "unknown worldgen/placed_feature minecraft:ore_gold_extr"],
  ["unknown environment attribute", D + "dimension_type/moon.json",
    jsonEdit((o) => { o.attributes["minecraft:visual/sky_colour"] = "#000000"; }), "unknown key in attributes"],
  ["wrong value kind", D + "dimension_type/mars.json", jsonEdit((o) => { o.height = "384"; }), "is a string"],
  ["missing required key", D + "worldgen/noise_settings/glacio.json",
    jsonEdit((o) => { delete o.noise_router; }), "noise_router: missing"],
  ["material condition key typo", D + "worldgen/material_rule/aerospace/glacio.json",
    textEdit('"offset": -1', '"offest": -1'), "offest: unknown key"],
  ["template pool points nowhere", D + "worldgen/template_pool/aerospace/ice_vault.json",
    textEdit("aerospace/ice_vault\"", "aerospace/ice_vaults\""), "unknown structure minecraft:aerospace/ice_vaults"],
  ["dimension with an unknown type", D + "dimension/vulcan.json",
    jsonEdit((o) => { o.type = "minecraft:vulcano"; }), "unknown dimension_type minecraft:vulcano"],
  ["unknown dialog field", D + "dialog/aerospace/mission_control.json", jsonEdit((o) => { o.colour = 1; }), "unknown dialog field"],
  ["loot item typo", D + "loot_table/chests/aerospace/ice_vault.json",
    textEdit('"minecraft:trident"', '"minecraft:tridentt"'), "unknown asset:items minecraft:tridentt"],
  ["advancement trigger typo", D + "advancement/aerospace/suit_up.json",
    textEdit("minecraft:inventory_changed", "minecraft:inventory_change"), "unknown trigger minecraft:inventory_change"],
  ["entity tag typo", D + "tags/entity_type/aerospace_crew.json",
    textEdit('"minecraft:husk"', '"minecraft:huskk"'), "unknown entity minecraft:huskk"],
  ["variant texture missing", D + "cow_variant/moon.json", textEdit('cow_moon"', 'cow_mooon"'), "missing texture"],
  ["objective never created", D + "function/aerospace/tick.mcfunction",
    append("scoreboard players set @s aero.nope 1"), "objective aero.nope is never created"],
  ["unknown command", D + "function/aerospace/tick.mcfunction", append("fly @s"), "unknown command fly"],
  ["impossible block state", D + "function/aerospace/tick.mcfunction",
    append("setblock ~ ~ ~ minecraft:chest[facing=up]"), "property facing has no value up"],
  ["sound typo", D + "function/aerospace/rocket/liftoff.mcfunction",
    textEdit("entity.firework_rocket.launch", "entity.firework_rocket.lunch"), "unknown sound minecraft:entity.firework_rocket.lunch"],
  ["missing translation", D + "function/aerospace/welcome.mcfunction",
    textEdit('translate:"aerospace.welcome"', 'translate:"aerospace.welcom"'), "missing translation aerospace.welcom"],
  ["function typo", D + "function/aerospace/second.mcfunction",
    textEdit("env/player", "env/players"), "unknown function minecraft:aerospace/env/players"],
  ["unbalanced SNBT", D + "function/aerospace/welcome.mcfunction",
    textEdit('color:"aqua"}', 'color:"aqua"'), "unbalanced brackets or quotes"],
  ["dialog button runs a missing trigger", D + "dialog/aerospace/mission_control.json",
    textEdit("trigger aero.launch set 3", "trigger aero.lunch set 3"), "objective aero.lunch is never created"],
  ["unknown item component", D + "recipe/aerospace_fuel.json",
    jsonEdit((o) => { o.result.components["minecraft:fuel_value"] = 3; }), "unknown component"],
];

test("the shipped pack passes validation", { skip }, () => {
  const { stock, files, ours } = load();
  const { errors } = validate({ stock, files, ours });
  assert.deepStrictEqual(errors, []);
});

for (const [what, file, mutate, expected] of MUTATIONS) {
  test("validator catches: " + what, { skip }, () => {
    const { stock, files, ours } = load();
    assert.ok(files.has(file), "missing " + file);
    const copy = new Map(files);
    copy.set(file, mutate(files.get(file)));
    const { errors } = validate({ stock, files: copy, ours });
    assert.ok(errors.some((e) => e.includes(expected)), `expected an error containing "${expected}", got:\n${errors.join("\n")}`);
  });
}
