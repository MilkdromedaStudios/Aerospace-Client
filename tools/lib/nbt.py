"""Minimal NBT reader/writer (Java Edition, big-endian), enough for structure templates.

Values map to Python types with explicit tags where Python is ambiguous:
  Byte/Short/Int/Long/Float/Double -> TagByte(v) etc. (subclasses of int/float)
  String -> str, Compound -> dict, List -> TagList(tag_type, items)
  ByteArray/IntArray/LongArray -> TagByteArray/TagIntArray/TagLongArray (lists)
"""
import gzip
import struct


class TagByte(int): tag = 1
class TagShort(int): tag = 2
class TagInt(int): tag = 3
class TagLong(int): tag = 4
class TagFloat(float): tag = 5
class TagDouble(float): tag = 6
class TagByteArray(list): tag = 7
class TagIntArray(list): tag = 11
class TagLongArray(list): tag = 12


class TagList(list):
    tag = 9

    def __init__(self, item_tag, items=()):
        super().__init__(items)
        self.item_tag = item_tag


def _tag_of(v):
    if hasattr(v, "tag"):
        return v.tag
    if isinstance(v, bool):
        return 1
    if isinstance(v, str):
        return 8
    if isinstance(v, dict):
        return 10
    if isinstance(v, int):
        return 3
    if isinstance(v, float):
        return 6
    raise TypeError("cannot infer NBT tag for %r" % (v,))


def _write(out, tag, v):
    if tag == 1: out.append(struct.pack(">b", int(v)))
    elif tag == 2: out.append(struct.pack(">h", int(v)))
    elif tag == 3: out.append(struct.pack(">i", int(v)))
    elif tag == 4: out.append(struct.pack(">q", int(v)))
    elif tag == 5: out.append(struct.pack(">f", float(v)))
    elif tag == 6: out.append(struct.pack(">d", float(v)))
    elif tag == 7:
        out.append(struct.pack(">i", len(v))); out.append(bytes(b & 0xff for b in v))
    elif tag == 8:
        b = v.encode("utf-8"); out.append(struct.pack(">H", len(b))); out.append(b)
    elif tag == 9:
        item_tag = v.item_tag if isinstance(v, TagList) else (_tag_of(v[0]) if v else 0)
        out.append(struct.pack(">bi", item_tag if v else (item_tag or 0), len(v)))
        for item in v:
            _write(out, item_tag, item)
    elif tag == 10:
        for k, item in v.items():
            t = _tag_of(item)
            kb = k.encode("utf-8")
            out.append(struct.pack(">bH", t, len(kb))); out.append(kb)
            _write(out, t, item)
        out.append(b"\x00")
    elif tag == 11:
        out.append(struct.pack(">i", len(v))); out.append(struct.pack(">%di" % len(v), *v))
    elif tag == 12:
        out.append(struct.pack(">i", len(v))); out.append(struct.pack(">%dq" % len(v), *v))
    else:
        raise ValueError(tag)


def dump(root, name=""):
    out = []
    nb = name.encode("utf-8")
    out.append(struct.pack(">bH", 10, len(nb))); out.append(nb)
    _write(out, 10, root)
    return gzip.compress(b"".join(out), mtime=0)


def load(data):
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    pos = [0]

    def take(fmt):
        size = struct.calcsize(fmt)
        r = struct.unpack_from(fmt, data, pos[0]); pos[0] += size
        return r[0] if len(r) == 1 else r

    def read(tag):
        if tag == 1: return TagByte(take(">b"))
        if tag == 2: return TagShort(take(">h"))
        if tag == 3: return TagInt(take(">i"))
        if tag == 4: return TagLong(take(">q"))
        if tag == 5: return TagFloat(take(">f"))
        if tag == 6: return TagDouble(take(">d"))
        if tag == 7:
            n = take(">i"); r = TagByteArray(struct.unpack_from(">%db" % n, data, pos[0])); pos[0] += n; return r
        if tag == 8:
            n = take(">H"); s = data[pos[0]:pos[0] + n].decode("utf-8", "replace"); pos[0] += n; return s
        if tag == 9:
            t = take(">b"); n = take(">i"); return TagList(t, [read(t) for _ in range(n)])
        if tag == 10:
            d = {}
            while True:
                t = take(">b")
                if t == 0: return d
                n = take(">H"); k = data[pos[0]:pos[0] + n].decode("utf-8"); pos[0] += n
                d[k] = read(t)
        if tag == 11:
            n = take(">i"); r = TagIntArray(struct.unpack_from(">%di" % n, data, pos[0])); pos[0] += 4 * n; return r
        if tag == 12:
            n = take(">i"); r = TagLongArray(struct.unpack_from(">%dq" % n, data, pos[0])); pos[0] += 8 * n; return r
        raise ValueError("bad tag %d" % tag)

    t = take(">b")
    assert t == 10, t
    n = take(">H"); pos[0] += n
    return read(10)
