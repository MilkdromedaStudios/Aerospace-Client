"use strict";
/**
 * Static checks for the files Aerospace adds to the game's built-in packs.
 *
 * The game can't run in CI, and one bad entry in the built-in (vanilla) data
 * pack would stop every world from loading, so the build checks what it can:
 *
 *   shape       JSON keys and value kinds, learned per "type" from the stock 26.3
 *               files of the same registry (dialogs use a written schema, as the
 *               stock files don't cover multi_action dialogs)
 *   references  every namespaced ID must exist: items, blocks and their states,
 *               entities, sounds, particles, effects, attributes, worldgen
 *               entries, loot tables, functions, advancements, dialogs, models,
 *               textures and translation keys
 *   functions   none allowed: Eaglercraft 26.3 fails to load every world when the
 *               built-in pack contains a data-pack function, so .mcfunction files,
 *               function tags and advancement reward functions are errors. The
 *               commands behind dialog buttons are linted instead (known commands
 *               and arguments, objectives, balanced brackets and quotes)
 *   structures  NBT templates: palette and block states, block entities, entities
 *
 * validate({ stock, files, ours }) returns { errors, notes, checked }.
 *   stock: Map of the upstream files (learning examples)
 *   files: Map of the final files (stock + Aerospace)
 *   ours:  Set of file names Aerospace added or changed
 */
const zlib = require("zlib");

const NSID = /^#?[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const kindOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const norm = (id) => (id.startsWith("#") ? "#" + norm(id.slice(1)) : id.includes(":") ? id : "minecraft:" + id);
const json = (buf) => JSON.parse(buf.toString("utf8"));

// ------------------------------------------------------------------- NBT --
function readNBT(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  let p = 0;
  const str = () => { const n = buf.readUInt16BE(p); p += 2; const s = buf.toString("utf8", p, p + n); p += n; return s; };
  function payload(t) {
    let v, n;
    switch (t) {
      case 1: v = buf.readInt8(p); p += 1; return v;
      case 2: v = buf.readInt16BE(p); p += 2; return v;
      case 3: v = buf.readInt32BE(p); p += 4; return v;
      case 4: v = buf.readBigInt64BE(p); p += 8; return v;
      case 5: v = buf.readFloatBE(p); p += 4; return v;
      case 6: v = buf.readDoubleBE(p); p += 8; return v;
      case 7: n = buf.readInt32BE(p); p += 4; v = [...buf.subarray(p, p + n)]; p += n; return v;
      case 8: return str();
      case 9: {
        const et = buf.readUInt8(p); p += 1; n = buf.readInt32BE(p); p += 4;
        const list = [];
        for (let i = 0; i < n; ++i) list.push(payload(et));
        Object.defineProperty(list, "tagType", { value: et });
        return list;
      }
      case 10: {
        const o = {};
        const types = {};
        for (;;) {
          const ct = buf.readUInt8(p); p += 1;
          if (ct === 0) break;
          const k = str();
          types[k] = ct;
          o[k] = payload(ct);
        }
        Object.defineProperty(o, "tagTypes", { value: types });
        return o;
      }
      case 11: n = buf.readInt32BE(p); p += 4; v = []; for (let i = 0; i < n; ++i, p += 4) v.push(buf.readInt32BE(p)); return v;
      case 12: n = buf.readInt32BE(p); p += 4; v = []; for (let i = 0; i < n; ++i, p += 8) v.push(buf.readBigInt64BE(p)); return v;
      default: throw new Error("bad NBT tag " + t + " at " + p);
    }
  }
  if (buf.readUInt8(p) !== 10) throw new Error("NBT root is not a compound");
  p += 1; str();
  return payload(10);
}

// --------------------------------------------------------------- registries --
function registryOf(rest, ext) {
  if (ext === "mcfunction") return "function";
  if (ext === "nbt") return "structure";
  const s = rest.split("/");
  if (s[0] === "tags") return s[1] === "worldgen" ? s.slice(0, 3).join("/") : s.slice(0, 2).join("/");
  if (s[0] === "worldgen") return s.slice(0, 2).join("/");
  return s[0];
}

function splitData(name) {
  const m = /^data\/([^/]+)\/(.+)\.(json|mcfunction|nbt)$/.exec(name);
  if (!m) return null;
  const [, ns, rest, ext] = m;
  const reg = registryOf(rest, ext);
  if (rest.length <= reg.length) return null;
  return { reg, id: ns + ":" + rest.slice(reg.length + 1), ext };
}

function splitAsset(name) {
  let m = /^assets\/([^/]+)\/(items|equipment|blockstates|particles|models)\/(.+)\.json$/.exec(name);
  if (m) return { reg: "asset:" + m[2], id: m[1] + ":" + m[3] };
  m = /^assets\/([^/]+)\/textures\/(.+)\.png$/.exec(name);
  if (m) return { reg: "asset:textures", id: m[1] + ":" + m[2] };
  return null;
}

// learned from the stock files only, and reused while the same stock map is validated again
const learned = new WeakMap();
function learnedFrom(stock) {
  if (!learned.has(stock)) learned.set(stock, { blocks: null, structures: null, shapes: new Map() });
  return learned.get(stock);
}

class Index {
  constructor(files, stock) {
    this.sets = new Map();
    for (const name of files.keys()) {
      const d = splitData(name);
      if (d) this.add(d.reg, d.reg.startsWith("tags/") ? "#" + d.id : d.id);
      const a = splitAsset(name);
      if (a) this.add(a.reg, a.id);
    }
    this.lang = json(files.get("assets/minecraft/lang/en_us.json"));
    for (const key of Object.keys(this.lang)) {
      let m;
      if ((m = /^entity\.minecraft\.([a-z0-9_]+)$/.exec(key))) this.add("entity", "minecraft:" + m[1]);
      else if ((m = /^effect\.minecraft\.([a-z0-9_]+)$/.exec(key))) this.add("effect", "minecraft:" + m[1]);
      else if ((m = /^attribute\.name\.([a-z0-9_]+)$/.exec(key))) this.add("attribute", "minecraft:" + m[1]);
    }
    for (const s of Object.keys(json(files.get("assets/minecraft/sounds.json")))) this.add("sound", "minecraft:" + s);
    for (const d of ["overworld", "the_nether", "the_end"]) this.add("dimension", "minecraft:" + d);
    const memo = learnedFrom(stock);
    if (!memo.blocks) memo.blocks = blockProperties(stock);    // never from our own templates
    this.blocks = memo.blocks;
  }

  add(set, id) {
    if (!this.sets.has(set)) this.sets.set(set, new Set());
    this.sets.get(set).add(id);
  }

  has(set, id) {
    const s = this.sets.get(set);
    return !!s && s.has(norm(id));
  }

  /** every registry an ID can be found in */
  where(id) {
    const out = [];
    for (const [set, ids] of this.sets) if (ids.has(norm(id))) out.push(set);
    return out;
  }
}

/** Block -> property -> values, from blockstate definitions and stock structure palettes. */
function blockProperties(files) {
  const props = new Map();
  const complete = new Set();       // blocks whose full property list is known
  const add = (block, k, v) => {
    if (!props.has(block)) props.set(block, new Map());
    const m = props.get(block);
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(String(v));
  };
  for (const [name, data] of files) {
    let m = /^assets\/minecraft\/blockstates\/(.+)\.json$/.exec(name);
    if (m) {
      const block = "minecraft:" + m[1];
      if (!props.has(block)) props.set(block, new Map());
      const bs = json(data);
      for (const key of Object.keys(bs.variants || {})) {
        if (key) for (const part of key.split(",")) { const [k, v] = part.split("="); add(block, k, v); }
      }
      const when = (w) => {
        if (!w) return;
        if (w.OR || w.AND) { (w.OR || w.AND).forEach(when); return; }
        for (const [k, v] of Object.entries(w)) for (const one of String(v).split("|")) add(block, k, one);
      };
      for (const part of bs.multipart || []) when(part.when);
      continue;
    }
    if (/^data\/minecraft\/structure\/.+\.nbt$/.test(name)) {
      let t;
      try { t = readNBT(data); } catch { continue; }
      for (const palette of t.palettes || [t.palette || []]) {
        for (const e of palette) {
          const block = norm(e.Name || e.id);
          complete.add(block);
          for (const [k, v] of Object.entries(e.Properties || e.properties || {})) add(block, k, v);
        }
      }
    }
  }
  return { props, complete };
}

// ----------------------------------------------------------- shape learning --
const DISC = ["type", "condition", "function", "trigger", "element_type", "processor_type"];
const ID_MAPS = new Set(["attributes", "components", "predicates", "spawn_costs", "spawns_by_category", "effects",
  "properties", "dimensions", "textures"]);
const FREE_MAPS = new Set(["criteria", "key"]);
const NO_FUNCTIONS = "data-pack functions crash Eaglercraft 26.3: with any function in the built-in pack, " +
  "every world fails to load (\"CompletableFuture observed before completion\")";

// fields that are valid but never used by the stock files
// (recipe results take the same {id, count, components} stack as advancement icons)
const EXTRA_KEYS = { rewards: ["function", "loot"], result: ["components"] };
// registries whose entries can be written inline in each other
const RELATED = { "worldgen/material_rule": ["worldgen/material_condition"], "worldgen/material_condition": ["worldgen/material_rule"] };
// registries the game loads with the world: an error there stops every world
// from loading, so these also require every key the examples always have
const STRICT = /^(dimension_type|dimension|worldgen\/.+|[a-z]+_variant|damage_type|dialog)$/;

// item predicates ({items, count, components, predicates}) and the predicate
// types they may use
const ITEM_PREDICATE_KEYS = new Set(["items", "count", "components", "predicates"]);
const ITEM_PREDICATES = new Set(["custom_data", "enchantments", "stored_enchantments", "damage", "jukebox_playable",
  "potion_contents", "trim", "attribute_modifiers", "written_book_content", "writable_book_content",
  "firework_explosion", "fireworks", "bundle_contents", "container"].map((c) => "minecraft:" + c));
const isItemPredicate = (o) => "items" in o && Object.keys(o).every((k) => ITEM_PREDICATE_KEYS.has(k));

const lastField = (ctx) => ctx.slice(ctx.lastIndexOf(">") + 1).replace(/(\[\])+$/, "");

function discOf(o) {
  for (const k of DISC) if (typeof o[k] === "string") return `${k}=${norm(o[k])}`;
  return null;
}

class Shapes {
  constructor() {
    this.groups = new Map();
    this.maps = new Map();
    this.values = new Set();            // every namespaced string seen in the examples
    this.examples = 0;
  }

  group(key) {
    let g = this.groups.get(key);
    if (!g) this.groups.set(key, (g = { n: 0, keys: new Map() }));
    return g;
  }

  learn(node, ctx = "@") {
    if (Array.isArray(node)) { for (const v of node) this.learn(v, ctx + "[]"); return; }
    if (typeof node === "string") { if (NSID.test(node)) this.values.add(norm(node)); return; }
    if (!node || typeof node !== "object") return;
    const field = lastField(ctx);
    if (ID_MAPS.has(field) || FREE_MAPS.has(field)) {
      if (!this.maps.has(field)) this.maps.set(field, new Map());
      const m = this.maps.get(field);
      for (const [k, v] of Object.entries(node)) {
        if (!m.has(k)) m.set(k, new Set());
        m.get(k).add(kindOf(v));
        this.learn(v, ID_MAPS.has(field) ? `${field}{${k}}` : `${field}{}`);
      }
      return;
    }
    const disc = discOf(node);
    for (const g of disc ? [this.group(disc), this.group("@" + ctx)] : [this.group("@" + ctx)]) {
      g.n++;
      for (const [k, v] of Object.entries(node)) {
        let e = g.keys.get(k);
        if (!e) g.keys.set(k, (e = { n: 0, kinds: new Set() }));
        e.n++;
        e.kinds.add(kindOf(v));
      }
    }
    for (const [k, v] of Object.entries(node)) this.learn(v, `${disc || field}>${k}`);
  }

  /** report(path, message) for each difference from the examples */
  check(node, report, ix, ctx = "@", path = "", strict = false) {
    if (Array.isArray(node)) { node.forEach((v, i) => this.check(v, report, ix, ctx + "[]", `${path}[${i}]`, strict)); return; }
    if (!node || typeof node !== "object") return;
    const field = lastField(ctx);
    if (field === "components") { checkComponents(node, report, path, this.maps.get("components")); return; }
    if (isItemPredicate(node)) {
      for (const [k, v] of Object.entries(node.predicates || {})) {
        if (!ITEM_PREDICATES.has(norm(k))) report(`${path}.predicates.${k}`, "unknown item predicate");
        else if (norm(k) === "minecraft:custom_data" && !["string", "object"].includes(kindOf(v))) report(`${path}.predicates.${k}`, "must be SNBT text or a compound");
      }
      if (node.components) checkComponents(node.components, report, `${path}.components`, this.maps.get("components"));
      return;
    }
    if (ID_MAPS.has(field) || FREE_MAPS.has(field)) {
      const m = this.maps.get(field);
      for (const [k, v] of Object.entries(node)) {
        if (ID_MAPS.has(field)) {
          if (!m || !m.has(k)) {
            if (!(field === "components" && KNOWN_COMPONENTS.has(norm(k)))) report(`${path}.${k}`, `unknown key in ${field}`);
          } else if (!m.get(k).has(kindOf(v))) report(`${path}.${k}`, `is a ${kindOf(v)}, examples have ${[...m.get(k)].join("/")}`);
        }
        this.check(v, report, ix, ID_MAPS.has(field) ? `${field}{${k}}` : `${field}{}`, `${path}.${k}`, strict);
      }
      return;
    }
    const disc = discOf(node);
    const byCtx = this.groups.get("@" + ctx);
    let g = disc && this.groups.get(disc);
    if (!g) {
      g = byCtx;
      if (disc && g) {
        // an unseen "type": fine when it names something real (e.g. an entity
        // type in a spawn entry), otherwise a typo in a dispatch type
        const value = disc.slice(disc.indexOf("=") + 1);
        const seenDisc = [...g.keys.keys()].some((k) => DISC.includes(k));
        if (seenDisc && !ix.where(value).length && !this.values.has(value)) report(path, `unknown ${disc.split("=")[0]} ${value}`);
      }
    }
    if (!g) {
      if (strict) report(path || "(root)", `no stock example has an object at ${ctx}`);
    } else {
      const extra = EXTRA_KEYS[field] || [];
      for (const [k, v] of Object.entries(node)) {
        const e = g.keys.get(k);
        if (!e) { if (!extra.includes(k)) report(`${path}.${k}`, `unknown key (examples: ${[...g.keys.keys()].sort().join(", ")})`); }
        else if (!e.kinds.has(kindOf(v)) && !(byCtx && byCtx.keys.get(k) && byCtx.keys.get(k).kinds.has(kindOf(v)))) {
          report(`${path}.${k}`, `is a ${kindOf(v)}, examples have ${[...e.kinds].join("/")}`);
        }
      }
      if (strict && g.n >= 3) {
        for (const [k, e] of g.keys) if (e.n === g.n && !(k in node)) report(`${path}.${k}`, "missing (every example has it)");
      }
    }
    for (const [k, v] of Object.entries(node)) this.check(v, report, ix, `${disc || field}>${k}`, `${path}.${k}`, strict);
  }
}

// Data components used in item stacks; the stock data files only show a few of
// them, so the rest are listed here (all exist since 1.21.4).
const KNOWN_COMPONENTS = new Set([
  "custom_data", "max_stack_size", "max_damage", "damage", "unbreakable", "custom_name", "item_name", "item_model",
  "lore", "rarity", "enchantments", "consumable", "equippable", "written_book_content", "dyed_color", "food",
  "use_cooldown", "tooltip_display", "enchantment_glint_override", "attribute_modifiers", "potion_contents",
].map((c) => "minecraft:" + c));

const TEXT = (v) => ["string", "object", "array"].includes(kindOf(v));
const ENUM = (...values) => (v) => values.includes(v);
const record = (fields, required = []) => (v, report, path) => {
  if (kindOf(v) !== "object") { report(path, "must be an object"); return; }
  for (const [k, x] of Object.entries(v)) {
    if (!fields[k]) report(`${path}.${k}`, "unknown field");
    else if (fields[k](x, report, `${path}.${k}`) === false) report(`${path}.${k}`, "has an invalid value");
  }
  for (const k of required) if (!(k in v)) report(`${path}.${k}`, "missing");
};
const NUMBER = (v) => typeof v === "number";
const BOOL = (v) => typeof v === "boolean";
const ID = (v) => typeof v === "string" && NSID.test(norm(v));
const COMPONENT_SCHEMAS = {
  "minecraft:custom_data": (v) => ["object", "string"].includes(kindOf(v)),
  "minecraft:item_name": TEXT,
  "minecraft:custom_name": TEXT,
  "minecraft:item_model": ID,
  "minecraft:max_stack_size": (v) => Number.isInteger(v) && v >= 1 && v <= 99,
  "minecraft:rarity": ENUM("common", "uncommon", "rare", "epic"),
  "minecraft:lore": (v) => Array.isArray(v) && v.length <= 256 && v.every(TEXT),
  "minecraft:consumable": record({
    consume_seconds: NUMBER, has_consume_particles: BOOL, sound: (v) => ID(v) || kindOf(v) === "object",
    animation: ENUM("none", "eat", "drink", "block", "bow", "spear", "trident", "crossbow", "spyglass", "toot_horn", "brush", "bundle"),
    on_consume_effects: Array.isArray,
  }),
  "minecraft:equippable": record({
    slot: ENUM("head", "chest", "legs", "feet", "body", "mainhand", "offhand", "saddle"), equip_sound: (v) => ID(v) || kindOf(v) === "object",
    asset_id: ID, camera_overlay: ID, allowed_entities: (v) => typeof v === "string" || Array.isArray(v), dispensable: BOOL,
    swappable: BOOL, damage_on_hurt: BOOL, equip_on_interact: BOOL, can_be_sheared: BOOL, shearing_sound: (v) => ID(v) || kindOf(v) === "object",
  }, ["slot"]),
  "minecraft:written_book_content": record({
    title: (v) => typeof v === "string" ? v.length <= 32 : kindOf(v) === "object",
    author: (v) => typeof v === "string", generation: (v) => Number.isInteger(v) && v >= 0 && v <= 3,
    pages: (v) => Array.isArray(v) && v.length <= 100 && v.every(TEXT), resolved: BOOL,
  }, ["title", "author"]),
};

function checkComponents(comps, report, path, seen) {
  for (const [k, v] of Object.entries(comps)) {
    const id = norm(k.replace(/^!/, ""));
    const schema = COMPONENT_SCHEMAS[id];
    if (!schema && !KNOWN_COMPONENTS.has(id) && !(seen && seen.has(k))) { report(`${path}.${k}`, "unknown component"); continue; }
    if (schema && schema(v, report, `${path}.${k}`) === false) report(`${path}.${k}`, "has an invalid value");
  }
}

// ----------------------------------------------------------------- dialogs --
const COMPONENT = (v) => typeof v === "string" || (v && typeof v === "object");
const DIALOG_COMMON = {
  type: (v) => typeof v === "string", title: COMPONENT, external_title: COMPONENT,
  body: (v) => typeof v === "object", inputs: Array.isArray, can_close_with_escape: (v) => typeof v === "boolean",
  pause: (v) => typeof v === "boolean", after_action: (v) => ["close", "none", "wait_for_response"].includes(v),
};
const BUTTON = {
  label: COMPONENT, tooltip: COMPONENT, width: (v) => Number.isInteger(v) && v >= 1 && v <= 1024,
  action: (v) => v && typeof v === "object",
};
const DIALOG_TYPES = {
  "minecraft:multi_action": { actions: (v) => Array.isArray(v) && v.length > 0, columns: (v) => Number.isInteger(v) && v > 0, exit_action: (v) => v && typeof v === "object" },
  "minecraft:notice": { action: (v) => v && typeof v === "object" },
};
const DIALOG_ACTIONS = { "minecraft:run_command": ["command"], "minecraft:suggest_command": ["command"], "minecraft:open_url": ["url"], "minecraft:show_dialog": ["dialog"], "minecraft:copy_to_clipboard": ["value"] };

function checkDialog(d, report, ctx) {
  const t = norm(String(d.type));
  const own = DIALOG_TYPES[t];
  if (!own) { report("type", `dialog type ${t} is not one this validator knows`); return; }
  for (const [k, v] of Object.entries(d)) {
    const test = own[k] || DIALOG_COMMON[k];
    if (!test) report(k, "unknown dialog field");
    else if (!test(v)) report(k, "has an invalid value");
  }
  if (!("title" in d)) report("title", "missing");
  if (d.pause && d.after_action === "none") report("after_action", "a dialog that pauses the game can't use after_action none");
  for (const body of [].concat(d.body || [])) {
    if (norm(String(body.type)) !== "minecraft:plain_message") report("body", "only plain_message bodies are checked");
    else if (!COMPONENT(body.contents)) report("body.contents", "missing");
  }
  const buttons = [...(d.actions || []).map((b, i) => [`actions[${i}]`, b]), ...(d.exit_action ? [["exit_action", d.exit_action]] : [])];
  for (const [path, b] of buttons) {
    for (const [k, v] of Object.entries(b)) {
      if (!BUTTON[k]) report(`${path}.${k}`, "unknown button field");
      else if (!BUTTON[k](v)) report(`${path}.${k}`, "has an invalid value");
    }
    if (!("label" in b)) report(`${path}.label`, "missing");
    if (b.action) {
      const at = norm(String(b.action.type));
      const fields = DIALOG_ACTIONS[at];
      if (!fields) { report(`${path}.action.type`, `unknown action ${at}`); continue; }
      for (const k of Object.keys(b.action)) if (k !== "type" && !fields.includes(k)) report(`${path}.action.${k}`, "unknown field");
      for (const k of fields) if (typeof b.action[k] !== "string") report(`${path}.action.${k}`, "missing");
      if (at === "minecraft:run_command") ctx.dialogCommands.push(b.action.command.replace(/^\//, ""));
      if (at === "minecraft:show_dialog") ctx.need("dialog", b.action.dialog, `${path}.action.dialog`);
    }
  }
}

// --------------------------------------------------------------- functions --
const COMMANDS = new Set(["advancement", "attribute", "clear", "damage", "data", "dialog", "effect", "execute", "fill",
  "function", "give", "item", "kill", "particle", "playsound", "return", "say", "schedule", "scoreboard", "setblock",
  "spreadplayers", "summon", "tag", "teleport", "tellraw", "title", "tp", "trigger", "xp", "experience"]);
const SELECTOR_ARGS = new Set(["type", "tag", "scores", "gamemode", "distance", "limit", "sort", "name", "nbt", "team",
  "level", "x", "y", "z", "dx", "dy", "dz", "x_rotation", "y_rotation", "advancements", "predicate"]);
const GAMEMODES = new Set(["survival", "creative", "adventure", "spectator"]);
const CRITERIA = new Set(["dummy", "trigger", "deathCount", "playerKillCount", "totalKillCount", "health", "xp", "level", "food", "air", "armor"]);
const SLOTS = /^(armor\.(head|chest|legs|feet|body)|weapon(\.mainhand|\.offhand)?|container\.(\*|\d+)|hotbar\.(\*|\d+)|inventory\.(\*|\d+)|enderchest\.(\*|\d+)|saddle|horse\.\*)$/;

function splitTop(text, sep) {
  const out = [];
  let cur = "", depth = 0, quote = null;
  for (let i = 0; i < text.length; ++i) {
    const c = text[i];
    if (quote) {
      cur += c;
      if (c === "\\") cur += text[++i] || "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if ("[{(".includes(c)) depth++;
    else if ("]})".includes(c)) depth--;
    if (c === sep && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return { parts: out, balanced: depth === 0 && quote === null };
}

function lintFunctions(fnFiles, extraCommands, ix, objectives, err) {
  // objectives first: they may be created in any file (normally the load function)
  for (const [file, text] of fnFiles) {
    for (const line of text.split("\n")) {
      const m = /^scoreboard objectives add (\S+) (\S+)/.exec(line.trim());
      if (m) {
        if (!CRITERIA.has(m[2])) err(file, `unknown objective criteria ${m[2]}`);
        objectives.set(m[1], m[2]);
      }
    }
  }
  const runs = [...fnFiles].map(([f, t]) => [f, t.split("\n")]);
  runs.push(...extraCommands.map(([f, c]) => [f, [c]]));
  for (const [file, lines] of runs) {
    lines.forEach((raw, n) => {
      const line = raw.trim();
      if (!line || line.startsWith("#")) return;
      const where = `${file}:${n + 1}`;
      const report = (msg) => err(where, msg);
      const { parts, balanced } = splitTop(line, " ");
      if (!balanced) { report("unbalanced brackets or quotes"); return; }
      for (const m of line.matchAll(/translate:"([^"]+)"/g)) if (!(m[1] in ix.lang)) report(`missing translation ${m[1]}`);
      for (const m of line.matchAll(/objective:"([^"]+)"/g)) if (!objectives.has(m[1])) report(`unknown objective ${m[1]}`);
      command(parts.filter(Boolean), { report, ix, objectives, file });
    });
  }
}

function need(c, kind, id, what) {
  const sets = { item: ["asset:items"], block: ["asset:blockstates"], entity: ["entity", "tags/entity_type"] }[kind] || [kind];
  if (id === undefined) { c.report(`missing ${what || kind}`); return false; }
  if (!sets.some((s) => c.ix.has(s, id))) { c.report(`unknown ${what || kind} ${id}`); return false; }
  return true;
}

function objective(c, name, wantTrigger) {
  if (!c.objectives.has(name)) c.report(`objective ${name} is never created`);
  else if (wantTrigger && c.objectives.get(name) !== "trigger") c.report(`objective ${name} is not a trigger`);
}

function holder(c, h) { if (h && h.startsWith("@")) selector(c, h); }

function selector(c, s) {
  if (!s || !/^@[aeprsn](\[.*\])?$/.test(s)) { c.report(`bad selector ${s}`); return; }
  if (s.length === 2) return;
  for (const arg of splitTop(s.slice(3, -1), ",").parts) {
    const eq = arg.indexOf("=");
    const key = arg.slice(0, eq);
    const value = arg.slice(eq + 1).replace(/^!/, "");
    if (!SELECTOR_ARGS.has(key)) c.report(`unknown selector argument ${key}`);
    if (key === "type") need(c, "entity", value, "entity type");
    if (key === "gamemode" && !GAMEMODES.has(value)) c.report(`unknown game mode ${value}`);
    if (key === "scores") for (const s2 of splitTop(value.slice(1, -1), ",").parts) objective(c, s2.split("=")[0]);
  }
}

function components(c, list, predicate) {
  for (const entry of splitTop(list, ",").parts) {
    if (!entry) continue;
    const m = /^!?([a-z0-9_:./-]+)\s*([=~])?/.exec(entry);
    if (!m) { c.report(`bad component entry ${entry}`); continue; }
    if (m[2] === "~" && !predicate) c.report("~ only works in item predicates");
    if (!KNOWN_COMPONENTS.has(norm(m[1]))) c.report(`unknown component ${m[1]}`);
  }
}

function item(c, arg, predicate) {
  if (!arg) { c.report("missing item"); return; }
  const b = arg.indexOf("[");
  const id = b < 0 ? arg : arg.slice(0, b);
  if (!(predicate && id === "*")) need(c, id.startsWith("#") ? "tags/item" : "item", id);
  if (b >= 0) components(c, arg.slice(b + 1, -1), predicate);
}

function block(c, arg) {
  if (!arg) { c.report("missing block"); return; }
  const b = arg.indexOf("[");
  const id = norm(b < 0 ? arg : arg.slice(0, b));
  if (!need(c, "block", id)) return;
  if (b >= 0) blockProps(c.ix, id, Object.fromEntries(arg.slice(b + 1, -1).split(",").filter(Boolean).map((p) => p.split("="))), c.report);
}

function blockProps(ix, id, props, report) {
  const { props: all, complete } = ix.blocks;
  const known = all.get(id) || new Map();
  // Blockstate files skip values without a model (a wall side's "none") and
  // properties that don't change the model (waterlogged), so a block no stock
  // template uses also borrows from same-family blocks that one does (other walls).
  const family = id.slice(id.lastIndexOf("_") + 1);
  const relatives = complete.has(id) ? [] : [...complete].filter((b) => b !== id && b.endsWith("_" + family) &&
    [...known.keys()].every((k) => all.get(b).has(k)));
  const has = (k, v) => [id, ...relatives].some((b) => all.get(b) && all.get(b).has(k) && (v === undefined || all.get(b).get(k).has(String(v))));
  for (const [k, v] of Object.entries(props)) {
    if (!has(k)) {
      if (complete.has(id) || relatives.length) report(`${id} has no property ${k}`);
    } else if (!has(k, v)) {
      const values = new Set([id, ...relatives].flatMap((b) => [...((all.get(b) && all.get(b).get(k)) || [])]));
      report(`${id} property ${k} has no value ${v} (known: ${[...values].join(", ")})`);
    }
  }
}

function command(t, c) {
  const at = (i) => t[i];
  switch (t[0]) {
    case undefined: c.report("empty command"); return;
    case "execute": return execute(t.slice(1), c);
    case "return": if (at(1) === "run") return command(t.slice(2), c); return;
    case "function": need(c, "function", at(1)); return;
    case "advancement":
      selector(c, at(2));
      if (at(3) !== "everything") need(c, "advancement", at(4));
      return;
    case "dialog": if (at(1) === "show") { selector(c, at(2)); need(c, "dialog", at(3)); } return;
    case "damage": selector(c, at(1)); if (at(3)) need(c, "damage_type", at(3), "damage type"); return;
    case "effect": selector(c, at(2)); if (at(3)) need(c, "effect", at(3)); return;
    case "attribute":
      selector(c, at(1)); need(c, "attribute", at(2));
      if (!["base", "get", "modifier"].includes(at(3))) c.report(`unknown attribute operation ${at(3)}`);
      return;
    case "playsound":
      need(c, "sound", at(1));
      if (!["master", "music", "record", "weather", "block", "hostile", "neutral", "player", "ambient", "voice", "ui"].includes(at(2))) c.report(`unknown sound source ${at(2)}`);
      selector(c, at(3));
      return;
    case "particle": need(c, "asset:particles", at(1), "particle"); return;
    case "give": selector(c, at(1)); item(c, at(2)); return;
    case "clear": selector(c, at(1)); if (at(2)) item(c, at(2), true); return;
    case "item":
      if (at(1) !== "replace" || at(2) !== "entity" || at(5) !== "with") { c.report("only `item replace entity <targets> <slot> with <item>` is checked"); return; }
      selector(c, at(3));
      if (!SLOTS.test(at(4))) c.report(`unknown slot ${at(4)}`);
      item(c, at(6));
      return;
    case "fill": block(c, at(7)); if (at(8) && !["replace", "keep", "outline", "hollow", "destroy", "strict"].includes(at(8))) c.report(`unknown fill mode ${at(8)}`); return;
    case "setblock": block(c, at(4)); return;
    case "tag": selector(c, at(1)); if (!["add", "remove", "list"].includes(at(2))) c.report(`unknown tag operation ${at(2)}`); return;
    case "data": if (at(1) === "merge" && at(2) === "entity") selector(c, at(3)); return;
    case "tellraw": selector(c, at(1)); return;
    case "title":
      selector(c, at(1));
      if (!["title", "subtitle", "actionbar", "times", "clear", "reset"].includes(at(2))) c.report(`unknown title action ${at(2)}`);
      return;
    case "tp": case "teleport": selector(c, at(1)); return;
    case "spreadplayers": selector(c, t[t.length - 1]); return;
    case "trigger": objective(c, at(1), true); return;
    case "scoreboard": return scoreboard(t, c);
    default: if (!COMMANDS.has(t[0])) c.report(`unknown command ${t[0]}`);
  }
}

function scoreboard(t, c) {
  if (t[1] === "objectives") return;
  if (t[1] !== "players") { c.report(`unknown scoreboard command ${t[1]}`); return; }
  switch (t[2]) {
    case "set": case "add": case "remove": holder(c, t[3]); objective(c, t[4]); if (!/^-?\d+$/.test(t[5] || "")) c.report("score value must be a whole number"); return;
    case "enable": holder(c, t[3]); objective(c, t[4], true); return;
    case "reset": case "get": holder(c, t[3]); if (t[4]) objective(c, t[4]); return;
    case "operation": holder(c, t[3]); objective(c, t[4]); holder(c, t[6]); objective(c, t[7]); return;
    default: c.report(`unknown scoreboard players command ${t[2]}`);
  }
}

function execute(t, c) {
  let i = 0;
  while (i < t.length) {
    switch (t[i]) {
      case "as": case "at": selector(c, t[i + 1]); i += 2; break;
      case "in": need(c, "dimension", t[i + 1]); i += 2; break;
      case "anchored": case "align": i += 2; break;
      case "positioned":
        if (t[i + 1] === "as") { selector(c, t[i + 2]); i += 3; } else if (t[i + 1] === "over") i += 3; else i += 4;
        break;
      case "store":
        if (!["result", "success"].includes(t[i + 1]) || t[i + 2] !== "score") { c.report("only `store result|success score` is checked"); return; }
        holder(c, t[i + 3]); objective(c, t[i + 4]); i += 5;
        break;
      case "if": case "unless": {
        const k = t[i + 1];
        if (k === "entity") { selector(c, t[i + 2]); i += 3; }
        else if (k === "dimension") { need(c, "dimension", t[i + 2]); i += 3; }
        else if (k === "function") { need(c, "function", t[i + 2]); i += 3; }
        else if (k === "score") {
          holder(c, t[i + 2]); objective(c, t[i + 3]);
          if (t[i + 4] === "matches") i += 6; else { holder(c, t[i + 5]); objective(c, t[i + 6]); i += 7; }
        } else if (k === "items" && t[i + 2] === "entity") {
          selector(c, t[i + 3]);
          if (!SLOTS.test(t[i + 4])) c.report(`unknown slot ${t[i + 4]}`);
          item(c, t[i + 5], true); i += 6;
        } else if (k === "block") { block(c, t[i + 5]); i += 6; }
        else { c.report(`execute ${t[i]} ${k} is not checked`); return; }
        break;
      }
      case "run": return command(t.slice(i + 1), c);
      default: c.report(`unknown execute subcommand ${t[i]}`); return;
    }
  }
}

// --------------------------------------------------------------- references --
// what a string under a given key must name, by registry ("*" = any registry)
const KEY_REFS = {
  "*": {
    translate: "lang", sound: ["sound"], equip_sound: ["sound"], random_sequence: "free", message_id: "free",
    background: ["asset:textures"],
  },
  advancement: { parent: ["advancement"], function: ["function"], loot: ["loot_table"], recipes: ["recipe"], items: ["asset:items", "tags/item"], id: ["asset:items"], to: ["dimension"], from: ["dimension"], structures: ["worldgen/structure", "tags/worldgen/structure"] },
  recipe: { id: ["asset:items"], ingredients: ["asset:items", "tags/item"], key: ["asset:items", "tags/item"] },
  loot_table: { name: ["asset:items"] },
  dimension_type: { infiniburn: ["tags/block"], timelines: ["tags/timeline"], default_clock: ["world_clock"] },
  dimension: { type: ["dimension_type"], settings: ["worldgen/noise_settings"], biome: ["worldgen/biome"] },
  "worldgen/biome": { features: ["worldgen/placed_feature"], carvers: ["worldgen/carver"] },
  "worldgen/noise_settings": { material_rule: ["worldgen/material_rule"], default_block: ["asset:blockstates"], default_fluid: ["asset:blockstates"] },
  "worldgen/material_rule": { result_state: ["asset:blockstates"], noise: ["worldgen/noise"], random_name: "free" },
  "worldgen/structure": { biomes: ["tags/worldgen/biome"], start_pool: ["worldgen/template_pool"] },
  "worldgen/structure_set": { structure: ["worldgen/structure"] },
  "worldgen/template_pool": { location: ["structure"], fallback: ["worldgen/template_pool"], processors: ["worldgen/processor_list"] },
  cow_variant: { biomes: ["worldgen/biome", "tags/worldgen/biome"] },
  pig_variant: { biomes: ["worldgen/biome", "tags/worldgen/biome"] },
  chicken_variant: { biomes: ["worldgen/biome", "tags/worldgen/biome"] },
  "asset:items": { model: ["asset:models"] },
  "asset:models": { parent: ["asset:models"], layer0: ["asset:textures"] },
  painting_variant: { asset_id: "painting" },
  damage_type: {},
};
const TAG_TARGETS = {
  "tags/entity_type": ["entity", "tags/entity_type"], "tags/function": ["function"], "tags/block": ["asset:blockstates", "tags/block"],
  "tags/item": ["asset:items", "tags/item"], "tags/damage_type": ["damage_type", "tags/damage_type"],
  "tags/dialog": ["dialog", "tags/dialog"], "tags/painting_variant": ["painting_variant", "tags/painting_variant"],
  "tags/worldgen/biome": ["worldgen/biome", "tags/worldgen/biome"],
};

function textureRef(ix, id, prefix) {
  const [ns, p] = norm(id).split(":");
  return ix.has("asset:textures", `${ns}:${prefix}${p}`);
}

function references(reg, data, ix, shapes, report, lang) {
  const keyRefs = Object.assign({}, KEY_REFS["*"], KEY_REFS[reg] || {});
  const visit = (node, path, key, parentType) => {
    if (Array.isArray(node)) { node.forEach((v, i) => visit(v, `${path}[${i}]`, key, parentType)); return; }
    if (node && typeof node === "object") {
      const type = typeof node.type === "string" ? norm(node.type) : parentType;
      for (const [k, v] of Object.entries(node)) {
        if (k === "minecraft:item_model" && typeof v === "string" && !ix.has("asset:items", v)) report(`${path}.${k}`, `no item model ${v}`);
        if (k === "minecraft:equippable" && v && v.asset_id && !ix.has("asset:equipment", v.asset_id)) report(`${path}.${k}.asset_id`, `no equipment asset ${v.asset_id}`);
        if (ID_MAPS.has(key) && NSID.test(k) && !shapes.maps.get(key)?.has(k) && !ix.where(k).length
          && !(key === "components" && KNOWN_COMPONENTS.has(norm(k))) && !(key === "predicates" && ITEM_PREDICATES.has(norm(k)))) {
          report(`${path}.${k}`, `unknown ID ${k}`);
        }
        visit(v, `${path}.${k}`, k, type);
      }
      return;
    }
    if (typeof node !== "string") return;
    const rule = keyRefs[key];
    if (rule === "free") return;
    if (rule === "lang") { if (!(node in lang)) report(path, `missing translation ${node}`); return; }
    if (rule === "painting") { if (!textureRef(ix, node, "painting/")) report(path, `missing texture for ${node}`); return; }
    if (!NSID.test(node) && !(Array.isArray(rule) && /^[a-z0-9_./-]+$/.test(node) && (rule.includes("asset:items") || rule.includes("asset:blockstates")))) return;
    if (Array.isArray(rule)) {
      if (reg === "dimension" && key === "type" && path.split(".").length > 2) return; // generator/biome source types
      if (key === "type" && reg !== "dimension") return;
      if (!rule.some((set) => ix.has(set, node))) report(path, `unknown ${rule.join(" or ")} ${node}`);
      return;
    }
    // no rule for this key: it must name something that exists somewhere
    if (key === "type") return;
    if (!ix.where(node).length && !shapes.values.has(norm(node))) report(path, `unknown ID ${node}`);
  };
  visit(data, "", null, null);
  // registry specific
  if (/^cow_variant|^pig_variant|^chicken_variant/.test(reg)) {
    for (const k of ["asset_id", "baby_asset_id"]) if (data[k] && !textureRef(ix, data[k], "")) report(k, `missing texture ${data[k]}`);
  }
  if (reg === "asset:equipment") {
    for (const [layer, list] of Object.entries(data.layers || {})) {
      for (const l of list) if (!textureRef(ix, l.texture, `entity/equipment/${layer}/`)) report(`layers.${layer}`, `missing texture for ${l.texture}`);
    }
  }
}

// --------------------------------------------------------------- structures --
const ENTITY_KEYS = new Set(["id", "Pos", "Rotation", "Motion", "Tags", "CustomName", "CustomNameVisible", "Silent", "Glowing",
  "NoGravity", "Invulnerable", "equipment", "drop_chances", "attributes", "Health", "PersistenceRequired", "LeftHanded",
  "CanPickUpLoot", "NoAI"]);

function checkStructure(name, buf, ix, stockStructure, report, lang) {
  let t;
  try { t = readNBT(buf); } catch (e) { report("", "unreadable NBT: " + e.message); return; }
  if (t.DataVersion !== stockStructure.dataVersion) report("DataVersion", `${t.DataVersion}, stock templates use ${stockStructure.dataVersion}`);
  for (const k of ["size", "blocks", "palette", "entities", "DataVersion"]) if (!(k in t)) report(k, "missing");
  const size = t.size || [0, 0, 0];
  (t.palette || []).forEach((e, i) => {
    const id = norm(e.id || "");
    if (!e.id) report(`palette[${i}]`, "palette entries need an id");
    else if (!ix.has("asset:blockstates", id)) report(`palette[${i}]`, `unknown block ${id}`);
    else blockProps(ix, id, e.properties || {}, (m) => report(`palette[${i}]`, m));
  });
  const kinds = new Map();
  (t.blocks || []).forEach((b, i) => {
    if (b.pos.some((v, a) => v < 0 || v >= size[a])) report(`blocks[${i}]`, `position ${b.pos} is outside the size ${size}`);
    if (!(b.state >= 0 && b.state < t.palette.length)) report(`blocks[${i}]`, "state index out of range");
    if (!b.nbt) return;
    const be = norm(b.nbt.id || "");
    const ref = stockStructure.blockEntities.get(be);
    if (!ref) report(`blocks[${i}].nbt`, `no stock template has a ${be} block entity to compare with`);
    else {
      for (const [k, tt] of Object.entries(b.nbt.tagTypes)) {
        if (!ref.has(k)) report(`blocks[${i}].nbt.${k}`, `${be} examples have no such key`);
        else if (!ref.get(k).has(tt)) report(`blocks[${i}].nbt.${k}`, `NBT tag type ${tt}, examples use ${[...ref.get(k)]}`);
      }
    }
    if (b.nbt.LootTable && !ix.has("loot_table", b.nbt.LootTable)) report(`blocks[${i}].nbt.LootTable`, `unknown loot table ${b.nbt.LootTable}`);
    if (b.nbt.SpawnData) mob(b.nbt.SpawnData.entity, `blocks[${i}].nbt.SpawnData.entity`);
    for (const [j, sp] of (b.nbt.SpawnPotentials || []).entries()) mob(sp.data.entity, `blocks[${i}].nbt.SpawnPotentials[${j}]`);
    kinds.set(be, (kinds.get(be) || 0) + 1);
  });
  (t.entities || []).forEach((e, i) => {
    for (const k of ["nbt", "blockPos", "pos"]) if (!(k in e)) report(`entities[${i}]`, `missing ${k}`);
    if (e.nbt) mob(e.nbt, `entities[${i}].nbt`);
  });
  function mob(e, path) {
    if (!e || !ix.has("entity", e.id || "")) { report(path, `unknown entity ${e && e.id}`); return; }
    for (const k of Object.keys(e)) if (!ENTITY_KEYS.has(k)) report(`${path}.${k}`, "not a key this validator knows for mobs");
    for (const [slot, stack] of Object.entries(e.equipment || {})) {
      if (!["head", "chest", "legs", "feet", "mainhand", "offhand", "body", "saddle"].includes(slot)) report(`${path}.equipment.${slot}`, "unknown slot");
      if (!ix.has("asset:items", stack.id || "")) report(`${path}.equipment.${slot}`, `unknown item ${stack.id}`);
      for (const [k, v] of Object.entries(stack.components || {})) {
        if (!KNOWN_COMPONENTS.has(norm(k))) report(`${path}.equipment.${slot}.components`, `unknown component ${k}`);
        if (k === "minecraft:equippable" && !ix.has("asset:equipment", v.asset_id)) report(`${path}.equipment.${slot}`, `no equipment asset ${v.asset_id}`);
        if (k === "minecraft:item_model" && !ix.has("asset:items", v)) report(`${path}.equipment.${slot}`, `no item model ${v}`);
      }
    }
    for (const slot of Object.keys(e.drop_chances || {})) if (!(slot in (e.equipment || {}))) report(`${path}.drop_chances.${slot}`, "no item in that slot");
    for (const a of e.attributes || []) if (!ix.has("attribute", a.id || "")) report(`${path}.attributes`, `unknown attribute ${a.id}`);
    const name = e.CustomName;
    if (name && name.translate && !(name.translate in lang)) report(`${path}.CustomName`, `missing translation ${name.translate}`);
    if (e.equipment && e.equipment.tagTypes && Object.values(e.equipment.tagTypes).some((tt) => tt !== 10)) report(`${path}.equipment`, "slots must be compounds");
  }
}

function stockStructureInfo(stock) {
  const blockEntities = new Map();
  const versions = new Map();
  for (const [name, data] of stock) {
    if (!/^data\/minecraft\/structure\/.+\.nbt$/.test(name)) continue;
    let t;
    try { t = readNBT(data); } catch { continue; }
    versions.set(t.DataVersion, (versions.get(t.DataVersion) || 0) + 1);
    for (const b of t.blocks || []) {
      if (!b.nbt || !b.nbt.id) continue;
      const id = norm(b.nbt.id);
      if (!blockEntities.has(id)) blockEntities.set(id, new Map());
      const m = blockEntities.get(id);
      for (const [k, tt] of Object.entries(b.nbt.tagTypes)) {
        if (!m.has(k)) m.set(k, new Set());
        m.get(k).add(tt);
      }
    }
  }
  const dataVersion = [...versions].sort((a, b) => b[1] - a[1])[0][0];
  return { blockEntities, dataVersion };
}

// --------------------------------------------------------------------- main --
function registryOfFile(name) {
  const d = splitData(name);
  if (d) return d.reg;
  const a = splitAsset(name);
  return a ? a.reg : null;
}

function validate({ stock, files, ours }) {
  const errors = [];
  const notes = [];
  const ix = new Index(files, stock);
  const lang = ix.lang;
  const memo = learnedFrom(stock);
  const shapes = memo.shapes;
  const used = new Set();
  const shapesFor = (reg) => {
    used.add(reg);
    if (shapes.has(reg)) return shapes.get(reg);
    const s = new Shapes();
    for (const [name, data] of stock) {
      if (!name.endsWith(".json")) continue;
      const r = registryOfFile(name);
      if (r === reg || (RELATED[reg] || []).includes(r)) { s.learn(json(data)); s.examples++; }
      if (reg === "dimension" && /^data\/minecraft\/worldgen\/world_preset\//.test(name)) {
        for (const stem of Object.values(json(data).dimensions || {})) { s.learn(stem); s.examples++; }
      }
    }
    shapes.set(reg, s);
    return s;
  };
  let structureInfo = memo.structures;
  const fnFiles = new Map();
  const ctx = { dialogCommands: [] };
  let checked = 0;

  for (const name of [...ours].sort()) {
    if (!files.has(name)) continue;
    const reg = registryOfFile(name);
    if (!reg) continue;
    const report = (p, msg) => errors.push(`${name}${p ? " " + p : ""}: ${msg}`);
    const data = files.get(name);
    checked++;
    if (name.endsWith(".mcfunction")) {
      report("", NO_FUNCTIONS);
      fnFiles.set(name, data.toString("utf8"));
      continue;
    }
    if (reg === "tags/function") { report("", NO_FUNCTIONS); continue; }
    if (name.endsWith(".nbt")) {
      if (!structureInfo) structureInfo = memo.structures = stockStructureInfo(stock);
      checkStructure(name, data, ix, structureInfo, report, lang);
      continue;
    }
    if (!name.endsWith(".json") || reg === "asset:textures") continue;
    const obj = json(data);
    if (reg.startsWith("tags/")) {
      const targets = TAG_TARGETS[reg];
      if (!targets) { report("", `tags for ${reg.slice(5)} are not checked`); continue; }
      for (const v of obj.values || []) {
        const id = typeof v === "string" ? v : v.id;
        if (!targets.some((s) => ix.has(s, id))) report("values", `unknown ${targets[0]} ${id}`);
      }
      continue;
    }
    if (reg === "dialog") {
      ctx.need = (kind, id, p) => { if (!ix.has(kind, id)) report(p, `unknown ${kind} ${id}`); };
      checkDialog(obj, report, ctx);
      references(reg, obj, ix, new Shapes(), report, lang);
      continue;
    }
    const s = shapesFor(reg);
    if (!s.examples) { report("", `no stock ${reg} files to compare with`); continue; }
    if (!(stock.has(name))) s.check(obj, report, ix, "@", "", STRICT.test(reg)); // stock files we edit keep their own shape
    references(reg, obj, ix, s, report, lang);
    if (reg === "advancement" && obj.rewards && obj.rewards.function) report("rewards.function", NO_FUNCTIONS);
  }

  const objectives = new Map();
  lintFunctions(fnFiles, ctx.dialogCommands.map((c) => ["dialog", c]), ix,
    objectives, (where, msg) => errors.push(`${where}: ${msg}`));
  for (const [file, text] of fnFiles) {
    for (const m of text.matchAll(/function (minecraft:[a-z0-9_/]+)/g)) if (!ix.has("function", m[1])) errors.push(`${file}: unknown function ${m[1]}`);
  }
  // function tags must point at functions, and the tick/load tags must survive
  for (const tag of ["tick", "load"]) {
    const f = `data/minecraft/tags/function/${tag}.json`;
    if (files.has(f)) for (const v of json(files.get(f)).values) if (!ix.has("function", v)) errors.push(`${f}: unknown function ${v}`);
  }
  notes.push(`${checked} files checked against ${[...used].reduce((n, r) => n + shapes.get(r).examples, 0)} stock examples`);
  return { errors, notes, checked };
}

module.exports = { validate, readNBT, Shapes, splitData };
