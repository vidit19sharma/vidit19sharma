#!/usr/bin/env node
// Render the README hero SVG from profile.config.json.
import { args, esc, trunc, readJSON, write } from "./_lib.mjs";

const a = args(`
Usage: node render-hero.mjs --config profile.config.json [--template session|masthead] [--theme dark|light] [--out assets/hero[-light].svg]
session : terminal window (whoami → name, cat role.txt → tagline, ls ~/projects → featured repos)
masthead: editorial header (kicker, hairline, big name, tagline, stack column)`, ["config"]);
const theme = a.theme || "dark";
if (!["dark", "light"].includes(theme)) throw new Error("--theme dark|light");
const OUT = typeof a.out === "string" ? a.out : `assets/hero${theme === "light" ? "-light" : ""}.svg`;
// Only colours differ between themes; geometry, timing and attributes stay identical.
const K = {
  dark: { win: "#161b22", page: "#0d1117", bd: "#30363d", tx: "#e6edf3", hi: "#ffffff", mu: "#7d8590", sub: "#9198a1", ac: "#39d353" },
  light: { win: "#ffffff", page: "#ffffff", bd: "#d0d7de", tx: "#1f2328", hi: "#1f2328", mu: "#656d76", sub: "#656d76", ac: "#1a7f37" },
}[theme];
const C = readJSON(a.config), tpl = a.template || "session";
const featured = (C.projects || []).slice(0, 3).map((p) => p.repo);
const stack = (C.stack || []).slice(0, 3);
const f = (x) => +x.toFixed(2);

function session() {
  const handle = (C.name || C.user || "me").split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9_-]/g, "") || C.user;
  const P = `${handle}@${C.alias || "github"}`;
  const cx = f(20 + ([...P].length + 5) * 7.8 + 3); // 13px mono ≈ 7.8px/char; "<P> ~ % "
  const prompt = (y) => `<text x="20" y="${y}" xml:space="preserve"><tspan fill="${K.ac}">${esc(P)}</tspan><tspan fill="${K.mu}"> ~ %</tspan></text>`;
  // Cover rect slides right in steps → typewriter reveal of the command.
  const cmd = (y, s, dur, delay) => {
    const w = Math.ceil(s.length * 7.8) + 8;
    return `<text x="${cx}" y="${y}" fill="${K.tx}">${esc(s)}</text>
<rect x="${f(cx - 2)}" y="${y - 14}" width="${w}" height="20" fill="${K.win}" class="t" style="--n:${s.length};animation-duration:${dur}s;animation-delay:${delay}s;transform:translateX(${w}px)"/>`;
  };
  const projects = featured.map((r) => `${r}/`).join("    ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="846" height="252" viewBox="0 0 846 252" data-theme="${theme}" role="img" aria-label="${esc(`Terminal: whoami ${C.name}, ${C.tagline || ""}`)}">
<style>
text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.f{animation:fade .25s ease-out both}
.t{animation:type steps(var(--n)) both}
.k{animation:blink 1.1s steps(1) 3.6s infinite}
@keyframes fade{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
@keyframes type{from{transform:translateX(0)}}
@keyframes blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<rect x="0.5" y="0.5" width="845" height="251" rx="6" fill="${K.win}" stroke="${K.bd}"/>
<path d="M1 32.5H845" stroke="${K.bd}"/>
<circle cx="20" cy="16" r="5" fill="${K.bd}"/><circle cx="37" cy="16" r="5" fill="${K.bd}"/><circle cx="54" cy="16" r="5" fill="${K.bd}"/>
<text x="423" y="20" font-size="12" fill="${K.mu}" text-anchor="middle">${esc(P)} — zsh</text>
<text x="826" y="20" font-size="12" fill="${K.mu}" text-anchor="end">${esc(trunc(C.location, 40))}</text>
<g font-size="13">
${prompt(62)}
${cmd(62, "whoami", 0.45, 0.4)}
<g class="f" style="animation-delay:1s"><text x="18" y="104" font-size="36" font-weight="700" letter-spacing="-1" fill="${K.hi}">${esc(trunc(C.name, 28))}</text>
${stack.length ? `<text x="826" y="104" font-size="12" fill="${K.mu}" text-anchor="end"># ${esc(stack.join(" · "))}</text>` : ""}</g>
<g class="f" style="animation-delay:1.3s">${prompt(136)}</g>
${cmd(136, "cat role.txt", 0.7, 1.45)}
<text class="f" style="animation-delay:2.3s" x="20" y="158" fill="${K.tx}">${esc(trunc(C.tagline, 100))}</text>
<g class="f" style="animation-delay:2.6s">${prompt(190)}</g>
${cmd(190, "ls ~/projects", 0.75, 2.75)}
<text class="f" style="animation-delay:3.6s" x="20" y="212" fill="${K.ac}" xml:space="preserve">${esc(trunc(projects, 100))}</text>
<g class="f" style="animation-delay:3.8s">${prompt(236)}
<rect class="k" x="${cx}" y="225" width="8" height="15" fill="${K.ac}"/></g>
</g>
</svg>
`;
}

function masthead() {
  const kicker = `${C.alias || C.user || ""}${C.location ? ` / ${C.location}` : ""}`.toUpperCase();
  const x1 = Math.max(170, Math.ceil(48 + [...kicker].length * 8.6 + 16)), x2 = 790, len = x2 - x1;
  // Highlight the first two featured project names inside the tagline.
  const names = featured.slice(0, 2).filter(Boolean);
  let tag = esc(trunc(C.tagline, 90));
  if (names.length) {
    const re = new RegExp(`(${names.map((n) => esc(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    tag = tag.replace(re, `<tspan fill="${K.tx}">$1</tspan>`);
  }
  const rise = (d) => `style="animation-delay:${d}s"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="846" height="220" viewBox="0 0 846 220" data-theme="${theme}" role="img" aria-label="${esc(`${C.name} — ${C.tagline || ""}`)}">
<style>
text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif}
.m{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.r{animation:rise .5s cubic-bezier(.2,.7,.2,1) both}
.h{stroke-dasharray:${len};animation:draw .8s ease-out .1s both}
.q{transform-box:fill-box;transform-origin:center;animation:pulse .6s ease-in-out .9s both}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes draw{from{stroke-dashoffset:${len}}to{stroke-dashoffset:0}}
@keyframes pulse{0%{opacity:0}1%{opacity:1;transform:none}50%{transform:scale(1.8)}100%{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<rect width="846" height="220" rx="6" fill="${K.page}"/>
<text class="m r" ${rise(0)} x="48" y="60" font-size="11" letter-spacing="2" fill="${K.mu}">${esc(kicker)}</text>
<path class="h" d="M${x1} 56.5H${x2}" stroke="${K.ac}" stroke-width="1"/>
<rect class="q" x="${x2}" y="53.5" width="6" height="6" fill="${K.ac}"/>
<text class="r" ${rise(0.15)} x="48" y="128" font-size="56" font-weight="800" letter-spacing="-2" fill="${K.tx}">${esc(trunc(C.name, 24))}</text>
<text class="r" ${rise(0.3)} x="48" y="164" font-size="17" fill="${K.sub}">${tag}</text>
${stack.map((s, i) => `<text class="m r" ${rise(0.45 + i * 0.08)} x="798" y="${104 + i * 18}" font-size="12" text-anchor="end" fill="${K.mu}">${esc(trunc(s, 24))}</text>`).join("\n")}
</svg>
`;
}

if (!["session", "masthead"].includes(tpl)) throw new Error("--template session|masthead");
write(OUT, tpl === "session" ? session() : masthead());
