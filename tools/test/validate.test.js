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

// 2.0.0 crashed every world because of data-pack functions (see the validator);
// 2.0.1 removed them, so the expansion is back on by default, with a switch off.
const EXPANSION_FILES = [
  "data/minecraft/dimension/moon.json",
  "data/minecraft/dimension_type/moon.json",
  "data/minecraft/worldgen/noise_settings/mars.json",
  "data/minecraft/structure/aerospace/landing_pad.nbt",
  "assets/minecraft/items/aerospace_rocket.json",
  "data/minecraft/advancement/aerospace/root.json",
];

test("the default build includes the Space Expansion, with no functions", { skip }, () => {
  const { stock } = load();
  const files = new Map(stock);
  applyAerospace(files);
  for (const path of EXPANSION_FILES) assert.equal(files.has(path), true, "default build is missing " + path);
  const fns = [...files.keys()].filter((f) => /^data\/[^/]+\/function\//.test(f) || /^data\/[^/]+\/tags\/function\//.test(f));
  assert.deepStrictEqual(fns, [], "data-pack functions crash Eaglercraft 26.3");
});

test("the Space Expansion can be left out", { skip }, () => {
  const { stock } = load();
  const files = new Map(stock);
  const { ours } = applyAerospace(files, { spaceExpansion: false });
  for (const path of EXPANSION_FILES) assert.equal(files.has(path), false, "build without the expansion includes " + path);
  assert.equal(ours.has("data/minecraft/dimension/moon.json"), false);
});

const D = "data/minecraft/";
const jsonEdit = (fn) => (buf) => { const o = JSON.parse(buf.toString("utf8")); fn(o); return Buffer.from(JSON.stringify(o)); };
const textEdit = (from, to) => (buf) => {
  const text = buf.toString("utf8");
  if (!text.includes(from)) throw new Error("mutation anchor not found: " + from);
  return Buffer.from(text.replace(from, to));
};
// a test-only dialog: the shipped pack has none, but the validator still checks dialogs and their commands
const DIALOG = D + "dialog/aerospace/test.json";
const dialog = (fn) => () => {
  const d = {
    type: "minecraft:multi_action", title: { translate: "item.minecraft.aerospace_rocket" },
    actions: [{ label: { translate: "item.minecraft.aerospace_fuel" }, width: 150,
      action: { type: "minecraft:run_command", command: "/execute in minecraft:moon run spreadplayers ~ ~ 0 24 false @s" } }],
  };
  fn(d);
  return Buffer.from(JSON.stringify(d));
};

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
  ["loot item typo", D + "loot_table/chests/aerospace/ice_vault.json",
    textEdit('"minecraft:trident"', '"minecraft:tridentt"'), "unknown asset:items minecraft:tridentt"],
  ["advancement trigger typo", D + "advancement/aerospace/suit_up.json",
    textEdit("minecraft:inventory_changed", "minecraft:inventory_change"), "unknown trigger minecraft:inventory_change"],
  ["block tag typo", D + "tags/block/animals_spawnable_on.json",
    textEdit('"minecraft:red_sand"', '"minecraft:red_sandd"'), "unknown asset:blockstates minecraft:red_sandd"],
  ["variant texture missing", D + "cow_variant/moon.json", textEdit('cow_moon"', 'cow_mooon"'), "missing texture"],
  ["function file", D + "function/probe.mcfunction", () => Buffer.from("say hi\n"), "data-pack functions crash Eaglercraft 26.3"],
  ["function tag", D + "tags/function/tick.json", () => Buffer.from('{"values":[]}'), "data-pack functions crash Eaglercraft 26.3"],
  ["advancement reward function", D + "advancement/aerospace/suit_up.json",
    jsonEdit((o) => { o.rewards = { function: "minecraft:x" }; }), "data-pack functions crash Eaglercraft 26.3"],
  ["unknown dialog field", DIALOG, dialog((d) => { d.colour = 1; }), "unknown dialog field"],
  ["unknown command in a dialog button", DIALOG, dialog((d) => { d.actions[0].action.command = "/fly @s"; }), "unknown command fly"],
  ["impossible block state in a dialog button", DIALOG,
    dialog((d) => { d.actions[0].action.command = "/setblock ~ ~ ~ minecraft:chest[facing=up]"; }), "property facing has no value up"],
  ["unknown dimension in a dialog button", DIALOG,
    dialog((d) => { d.actions[0].action.command = "/execute in minecraft:mooon run say hi"; }), "unknown dimension minecraft:mooon"],
  ["unbalanced command in a dialog button", DIALOG,
    dialog((d) => { d.actions[0].action.command = "/tellraw @s {text:\"hi\""; }), "unbalanced brackets or quotes"],
  ["missing translation in a dialog", DIALOG, dialog((d) => { d.title.translate = "aerospace.nope"; }), "missing translation aerospace.nope"],
  ["item model with a missing texture", D.replace("data/", "assets/") + "models/item/aerospace_fuel_3d.json",
    jsonEdit((o) => { o.textures.can = "minecraft:block/orange_concretee"; }), "unknown ID minecraft:block/orange_concretee"],
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
    const copy = new Map(files);
    copy.set(file, mutate(files.get(file)));
    const { errors } = validate({ stock, files: copy, ours: new Set([...ours, file]) });
    assert.ok(errors.some((e) => e.includes(expected)), `expected an error containing "${expected}", got:\n${errors.join("\n")}`);
  });
}
