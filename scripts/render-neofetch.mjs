#!/usr/bin/env node
// Render a neofetch-style card SVG from profile.config.json (+ optional contributions JSON / audit).
import { args, esc, trunc, readJSON, write, palette, titlebar } from "./_lib.mjs";

const a = args(`
Usage: node render-neofetch.mjs --config profile.config.json [--data data/github.json] [--audit data/audit.json] [--theme dark|light|light-warm|light-cool] [--out assets/neofetch[-light].svg]
Rows: Name/Role/Location/Building/Stack/Site (+ Commits when --data is given). Empty values are skipped.
Languages bar: data.languages (bytes, from fetch-contributions) else per-repo primary languages from --audit; omitted when neither.`, ["config"]);
const theme = a.theme || "dark";
const PL = palette(theme);
const OUT = typeof a.out === "string" ? a.out : `assets/neofetch${theme === "dark" ? "" : "-light"}.svg`;
const C = readJSON(a.config);
const D = typeof a.data === "string" ? readJSON(a.data) : null;
const AU = typeof a.audit === "string" ? readJSON(a.audit) : null;
const P = C.handle_prompt || `${C.user}@github`;
const p0 = (C.projects || [])[0];
const K = { bg: PL.card, tx: PL.text, mu: PL.muted, ac: PL.ac, cur: PL.cursor, track: PL.track };
const BAR = PL.frame ? 22 : 0; // framed (light) cards get a titlebar strip; content shifts down by BAR

const rows = [
  ["Name", C.name],
  ["Role", C.role || C.tagline],
  ["Location", C.location],
  ["Building", p0 && [p0.repo, p0.tags?.[0]].filter(Boolean).join(" · ")],
  ["Stack", (C.stack || []).slice(0, 3).join(", ")],
  ["Site", (C.site || "").replace(/^https?:\/\//, "").replace(/\/$/, "")],
  ...(D ? [["Commits", `${D.total} this year`]] : []),
].filter(([, v]) => v);

// Languages: bytes from data.languages, else count of owned non-fork repos by primary language.
const LANG = { TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5", Shell: "#89e051", HTML: "#e34c26", CSS: "#563d7c", EJS: "#a91e50",
  Go: "#00ADD8", Rust: "#dea584", Java: "#b07219", C: "#555555", "C++": "#f34b7d", Ruby: "#701516", PHP: "#4F5D95", Swift: "#F05138",
  Kotlin: "#A97BFF", Dart: "#00B4AB", Vue: "#41b883", Svelte: "#ff3e00", Markdown: "#083fa1" };
let langs = Array.isArray(D?.languages) && D.languages.length ? D.languages.map((l) => ({ name: l.name, color: l.color, n: l.bytes })) : [];
if (!langs.length && AU?.repos) {
  const m = {};
  for (const r of AU.repos) if (r.language && !r.fork) m[r.language] = (m[r.language] || 0) + 1;
  langs = Object.entries(m).map(([name, n]) => ({ name, n }));
}
const sum = langs.reduce((s, l) => s + l.n, 0);
const top = langs.sort((x, y) => y.n - x.n).slice(0, 5).map((l) => ({ ...l, color: l.color || LANG[l.name] || "#8b949e", pct: (l.n / sum) * 100 }));

const f = (x) => +x.toFixed(2);
// Base state = settled (visible). SMIL starts at 0 and holds hidden until `t` via keyTimes, so viewers
// without SMIL (or with animations stripped) still see the final card.
const kt = (t, d) => `dur="${f(t + d)}s" keyTimes="0;${f(t / (t + d))};1" fill="freeze"`;
const anim = (t) => `<animate attributeName="opacity" values="0;0;1" ${kt(t, 0.3)}/><animateTransform attributeName="transform" type="translate" values="-8 0;-8 0;0 0" ${kt(t, 0.3)}/>`;
const body = rows.map(([k, v], i) => `<g>${anim(f(1.1 + i * 0.15))}<text x="16" y="${82 + i * 18}" fill="${K.ac}">${k}</text><text x="96" y="${82 + i * 18}" fill="${K.tx}">${esc(trunc(v, 26))}</text></g>`).join("\n");

let lang = "", H = 82 + rows.length * 18 + 10;
if (top.length) {
  const yk = 82 + rows.length * 18, by = yk + 8, BW = 268;
  let x = 16;
  const segs = top.map((l) => { const w = f((l.pct / 100) * BW), r = `<rect x="${f(x)}" y="${by}" width="${w}" height="8" fill="${l.color}"/>`; x += w; return r; }).join("");
  // Legend: "● Name 62%" items joined by " · ", greedily wrapped at ~40 chars (11px mono ≈ 6.62px/char over 268px).
  const pct = (p) => (p < 1 ? "<1%" : `${Math.round(p)}%`);
  const lines = [[]];
  let len = 0;
  for (const l of top) {
    const n = `● ${l.name} ${pct(l.pct)}`.length + (lines.at(-1).length ? 3 : 0);
    if (len + n > 40 && lines.at(-1).length) lines.push([]), (len = n - 3); else len += n;
    lines.at(-1).push(`<tspan fill="${l.color}">●</tspan> ${esc(l.name)} <tspan fill="${K.mu}">${pct(l.pct)}</tspan>`);
  }
  const legend = lines.map((ln, i) => `<text x="16" y="${yk + 32 + i * 16}" font-size="11" fill="${K.tx}" xml:space="preserve">${ln.join(`<tspan fill="${K.mu}"> · </tspan>`)}</text>`).join("\n");
  lang = `<g>${anim(f(1.1 + rows.length * 0.15))}<text x="16" y="${yk}" fill="${K.ac}">Languages</text>
<rect x="16" y="${by}" width="${BW}" height="8" rx="4" fill="${K.track}"/>
<g clip-path="url(#lb)">${segs}</g>
${legend}</g>`;
  H = yk + 32 + (lines.length - 1) * 16 + 14;
}
const clip = top.length ? `<clipPath id="lb"><rect x="16" y="${82 + rows.length * 18 + 8}" width="268" height="8" rx="4"/></clipPath>` : "";
const cursorX = f(16 + ([...P].length + 11) * 7.22 + 2); // 12px mono ≈ 7.22px/char; "<P> ~ % whoami"
const label = [...rows.map(([k, v]) => `${k}: ${v}`), top.length && `Languages: ${top.map((l) => `${l.name} ${Math.round(l.pct)}%`).join(", ")}`].filter(Boolean).join("; ");

const HH = H + BAR;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="${HH}" viewBox="0 0 300 ${HH}" data-theme="${theme}" role="img" aria-label="${esc(label)}">
<style>@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
<defs><clipPath id="t"><rect height="32" width="300"><animate attributeName="width" values="0;300" dur="0.9s" fill="freeze"/></rect></clipPath>${clip}</defs>
${BAR ? `<rect x=".5" y=".5" width="299" height="${HH - 1}" rx="6" fill="${K.bg}" stroke="${PL.border}"/>
${titlebar(PL, 300, BAR, "neofetch — zsh")}
<g transform="translate(0 ${BAR})">` : `<rect width="300" height="${H}" rx="6" fill="${K.bg}"/>`}
<g font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12">
<g clip-path="url(#t)"><text x="16" y="24" xml:space="preserve"><tspan fill="${K.ac}">${esc(P)}</tspan><tspan fill="${K.mu}"> ~ % </tspan><tspan fill="${K.tx}">whoami</tspan></text></g>
<rect x="${Math.min(cursorX, 284)}" y="14" width="7" height="13" fill="${K.cur}"><animate attributeName="opacity" values="1;0;1;0;1;0;0" dur="1.5s" begin="0.9s" fill="freeze"/></rect>
<text x="16" y="50" fill="${K.ac}" font-weight="bold">${esc(P)}</text>
<text x="16" y="62" fill="${K.mu}">${"-".repeat(Math.min([...P].length, 36))}</text>
${body}
${lang}
</g>${BAR ? "</g>" : ""}
</svg>
`;
write(OUT, svg);
