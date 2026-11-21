"""Shared helpers for the Aerospace expansion generator.

Every registry file is built by copying a real Eaglercraft 26.3 file from the
unpacked upstream assets (npm run unpack) and changing only what the expansion
needs, so the formats always match the game exactly.
"""
import copy
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
UPSTREAM = os.path.join(ROOT, ".cache", "upstream-assets")
OVERLAY = os.path.join(ROOT, "aerospace", "overlay")
NS = "minecraft"

LANG = {}
WRITTEN = []


def vanilla(path):
    """Load a JSON file from the unpacked stock assets (path relative to their root)."""
    full = os.path.join(UPSTREAM, path)
    if not os.path.exists(full):
        raise SystemExit("missing %s: run `npm run unpack` first" % full)
    with open(full, encoding="utf-8") as fh:
        return json.load(fh)


def vanilla_copy(path):
    return copy.deepcopy(vanilla(path))


def write_json(path, obj):
    full = os.path.join(OVERLAY, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(obj, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    WRITTEN.append(path)


def write_text(path, text):
    full = os.path.join(OVERLAY, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text if text.endswith("\n") else text + "\n")
    WRITTEN.append(path)


def write_bytes(path, data):
    full = os.path.join(OVERLAY, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as fh:
        fh.write(data)
    WRITTEN.append(path)


def lang(key, text):
    if key in LANG and LANG[key] != text:
        raise SystemExit("conflicting translations for " + key)
    LANG[key] = text
    return key


def tr(key, text=None, **style):
    """Translatable text component (registers the English text when given)."""
    if text is not None:
        lang(key, text)
    c = {"translate": key}
    c.update(style)
    return c


def mc(name):
    return NS + ":" + name


# ------------------------------------------------------------------ SNBT --
def snbt(value):
    """Python value -> SNBT for commands (strings quoted, dict keys bare when safe)."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        r = repr(value)
        return r if ("." in r or "e" in r) else r + ".0"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(snbt(v) for v in value) + "]"
    if isinstance(value, dict):
        parts = []
        for k, v in value.items():
            key = k if all(ch.isalnum() or ch in "_-.+" for ch in k) else json.dumps(k)
            parts.append(key + ":" + snbt(v))
        return "{" + ",".join(parts) + "}"
    raise TypeError(value)


def item_arg(item_id, components):
    """Item argument for /give, /item, /clear: id[comp=value,...]."""
    if not components:
        return item_id
    return item_id + "[" + ",".join(k + "=" + snbt(v) for k, v in components.items()) + "]"
