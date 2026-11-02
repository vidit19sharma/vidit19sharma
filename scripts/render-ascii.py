#!/usr/bin/env python3
"""Render N transparent-bg images into a looping typewriter ASCII-art SVG (rows type left->right, top->bottom).

python3 scripts/render-ascii.py --cols 66 --rows 48 --row 0.07 --hold 3.0 \
    --out assets/ascii-portrait.svg assets/frames/*.png
"""
import argparse
import sys
from PIL import Image, ImageOps

RAMP = "@%#*+=-:. "  # dense -> empty
W = 256  # working resolution for crop + sampling


SS = 4  # supersamples per cell edge


def sobel(v, w, h):
    g = [0.0] * (w * h)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            i = y * w + x
            a, b, c = v[i - w - 1], v[i - w], v[i - w + 1]
            d, f = v[i - 1], v[i + 1]
            p, q, r = v[i + w - 1], v[i + w], v[i + w + 1]
            gx = (c + 2 * f + r) - (a + 2 * d + p)
            gy = (p + 2 * q + r) - (a + 2 * b + c)
            g[i] = (gx * gx + gy * gy) ** 0.5
    return g


def to_ascii(path, cols, rows, cw=264, ch=288):
    im = Image.open(path).convert("RGBA")
    src = min(im.size)
    im = ImageOps.fit(im, (src, src))
    small = [v / 255 for v in im.resize((W, W), Image.BOX).getchannel("A").getdata()]
    # auto-crop: 2-98th percentile bbox of alpha>0.2, fit to the cw:ch text-block aspect, +6% pad, clamped
    pts = [(i % W, i // W) for i, a in enumerate(small) if a > 0.2]
    x0, x1, y0, y1 = 0, W, 0, W
    if pts:
        xs, ys = sorted(p[0] for p in pts), sorted(p[1] for p in pts)
        q = lambda s, p: s[min(int(p * len(s)), len(s) - 1)]
        x0, x1, y0, y1 = q(xs, .02), q(xs, .98) + 1, q(ys, .02), q(ys, .98) + 1
    bh = min(max((x1 - x0) * ch / cw, y1 - y0) * 1.12, W)
    bw = bh * cw / ch
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bx, by = min(max(cx - bw / 2, 0), W - bw), min(max(cy - bh / 2, 0), W - bh)
    s = src / W
    box = tuple(round(c * s) for c in (bx, by, bx + bw, by + bh))
    print(f"{path}: crop {box} of {src}x{src}", file=sys.stderr)

    sw, sh = cols * SS, rows * SS
    im = im.crop(box).resize((sw, sh), Image.BOX)
    alpha = [v / 255 for v in im.getchannel("A").getdata()]
    L = [l / 255 * a for l, a in zip(im.convert("RGB").convert("L").getdata(), alpha)]
    op = [l for l, a in zip(L, alpha) if a > 0] or [0]
    lo, hi = min(op), max(op)
    tone = [min(max((l - lo) / max(hi - lo, 1e-6), 0), 1) for l in L]
    edge = [max(e1, e2) for e1, e2 in zip(sobel(L, sw, sh), sobel(alpha, sw, sh))]
    p98 = sorted(edge)[int(0.98 * len(edge))] or 1
    edge = [min(e / p98, 1) for e in edge]

    def cellmean(v):
        return [sum(v[(r * SS + j) * sw + c * SS + i] for j in range(SS) for i in range(SS)) / SS ** 2
                for r in range(rows) for c in range(cols)]

    n = len(RAMP) - 1
    out = []
    for a, t, e in zip(cellmean(alpha), cellmean(tone), cellmean(edge)):
        if a < 0.15:
            out.append((" ", None))
            continue
        d = min(max(0.45 * t + 1.6 * e, 0), 1) ** 0.8
        c = RAMP[n - min(int(d * n + 0.5), n)]
        out.append((c, None if c == " " else "a" if e > t else None))
    return [out[r * cols:(r + 1) * cols] for r in range(rows)]


def tspans(line):
    # text default fill is the mid green, so only edge (a) runs need a tspan
    out, i = [], 0
    while i < len(line):
        j, k = i, line[i][1]
        while j < len(line) and line[j][1] == k:
            j += 1
        seg = "".join(ch for ch, _ in line[i:j]).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        out.append(f'<tspan class="{k}">{seg}</tspan>' if k else seg)
        i = j
    return "".join(out)


def main():
    ap = argparse.ArgumentParser(description="images positional, or --config profile.config.json (frames[] + ascii{}); flags override config")
    ap.add_argument("--config")
    ap.add_argument("--cols", type=int)
    ap.add_argument("--rows", type=int)
    ap.add_argument("--row", type=float)
    ap.add_argument("--hold", type=float)
    import json, os
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "_palettes.json")) as fh:
        palettes = json.load(fh)
    ap.add_argument("--theme", choices=tuple(palettes), default="dark")
    ap.add_argument("--out", help="default assets/ascii-portrait.svg (dark) / assets/ascii-portrait-light.svg (any light*)")
    ap.add_argument("images", nargs="*")
    a = ap.parse_args()
    cfg = {}
    if a.config:
        with open(a.config) as fh:
            cfg = json.load(fh)
        base = os.path.dirname(os.path.abspath(a.config))
        if not a.images:
            a.images = [p if os.path.isabs(p) else os.path.join(base, p) for p in cfg.get("frames") or []]
    knobs = cfg.get("ascii") or {}
    for k, d in (("cols", 66), ("rows", 48), ("row", 0.07), ("hold", 3.0)):
        if getattr(a, k) is None:
            setattr(a, k, type(d)(knobs.get(k, d)))
    if not a.out:
        a.out = "assets/ascii-portrait.svg" if a.theme == "dark" else "assets/ascii-portrait-light.svg"
    P = palettes[a.theme]
    ink, edge, cur = P["ink"], P["edge"], P["cursor"]
    # framed (light) cards: 1px border + 22px titlebar strip; the grid shifts down by BAR and the viewBox grows
    BAR = 22 if P.get("frame") else 0
    H = 300 + BAR
    if not a.images:
        ap.error("no images: pass PNG paths or --config with a non-empty frames[]")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    frames = [to_ascii(p, a.cols, a.rows) for p in a.images]
    K, R, C = len(frames), a.row, a.cols
    SLOT = a.rows * R + a.hold
    T = K * SLOT
    p1, p2, q = R / T * 100, SLOT / T * 100, R / SLOT * 100
    hide, show = "clip-path:inset(0 100% 0 0)", "clip-path:inset(0 0 0 0)"
    o = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 276 {H}" width="276" height="{H}" role="img" '
        f'data-cols="{C}" data-rows="{a.rows}" data-frames="{K}" data-cell-w="{264 / C:g}" data-cell-h="6" data-theme="{a.theme}" '
        'aria-label="ASCII art of Neo\'s mascot, typed line by line">',
        (f'<rect x=".5" y=".5" width="275" height="{H - 1}" rx="6" fill="{P["card"]}" stroke="{P["border"]}"/>'
         f'<path d="M1 {BAR}V6.5A5.5 5.5 0 0 1 6.5 1H269.5A5.5 5.5 0 0 1 275 6.5V{BAR}Z" fill="{P["bar"]}"/>'
         f'<path d="M1 {BAR + 0.5}H275" stroke="{P["border"]}"/>'
         + "".join(f'<circle cx="{12 + i * 11}" cy="{BAR / 2 + 0.5}" r="3.5" fill="{c}"/>' for i, c in enumerate(P["dots"]))
         + f'<text x="138" y="{BAR / 2 + 4}" style="font:10px ui-monospace,SFMono-Regular,Menlo,monospace;fill:{P["muted"]}" '
         f'text-anchor="middle">mascot.txt</text><g transform="translate(0 {BAR})">') if BAR
        else f'<rect width="276" height="300" rx="6" fill="{P["card"]}"/>',
        f"<style>text{{font:6px/1 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;fill:{ink}}}"
        f".a{{fill:{edge}}}"
        f".k{{animation:type {T:.2f}s linear infinite;{hide}}}"
        f"@keyframes type{{0%{{opacity:1;{hide};animation-timing-function:steps({C},end)}}"
        f"{p1:.3f}%{{opacity:1;{show}}}{p2:.3f}%{{opacity:1;{show}}}"
        f"{p2 + 0.01:.3f}%{{opacity:0;{hide}}}100%{{opacity:0;{hide}}}}}"
        f".cur{{animation:cur {SLOT:.2f}s linear infinite}}"
        f"@keyframes cur{{0%{{opacity:1;transform:translateX(0);animation-timing-function:steps({C},end)}}"
        f"{q:.3f}%{{opacity:1;transform:translateX(264px)}}{q + 0.01:.3f}%{{opacity:0}}"
        "100%{opacity:0;transform:translateX(264px)}}"
        "@media (prefers-reduced-motion:reduce){.k,.cur{animation:none}.k{opacity:0;clip-path:none}.k0{opacity:1}}"
        "</style>",
    ]
    for r in range(a.rows):
        o.append('<g class="r">')
        for k, fr in enumerate(frames):
            # row r of frame k types at k*SLOT + r*R (mod T); -T keeps k>0 delays negative (running, hidden)
            d = r * R + k * SLOT - (T if k else 0)
            o.append(
                f'<text class="k{" k0" if k == 0 else ""}" x="6" y="{12 + r * 6}" xml:space="preserve" '
                f'textLength="264" lengthAdjust="spacingAndGlyphs" opacity="0" '
                f'style="animation-delay:{d:.2f}s">{tspans(fr[r])}</text>'
            )
        o.append("</g>")
    for r in range(a.rows):
        o.append(f'<rect class="cur" width="4" height="6" x="6" y="{6 + r * 6}" fill="{cur}" opacity="0" '
                 f'style="animation-delay:{r * R:.2f}s"/>')
    o.append("</g></svg>\n" if BAR else "</svg>\n")
    open(a.out, "w").write("\n".join(o))


if __name__ == "__main__":
    main()
