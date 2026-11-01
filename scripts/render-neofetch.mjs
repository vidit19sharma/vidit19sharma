#!/usr/bin/env node
// Render a neofetch-style card SVG from profile.config.json (+ optional contributions JSON).
import { args, esc, trunc, readJSON, write } from "./_lib.mjs";

const a = args(`
Usage: node render-neofetch.mjs --config profile.config.json [--data data/github.json] [--out assets/neofetch.svg]
Rows: Name/Role/Location/Building/Stack/Site (+ Commits when --data is given). Empty values are skipped.`, ["config"]);
const OUT = typeof a.out === "string" ? a.out : "assets/neofetch.svg";
const C = readJSON(a.config);
const D = typeof a.data === "string" ? readJSON(a.data) : null;
const P = C.handle_prompt || `${C.user}@github`;
const p0 = (C.projects || [])[0];

const rows = [
  ["Name", C.name],
  ["Role", C.role || C.tagline],
  ["Location", C.location],
  ["Building", p0 && [p0.repo, p0.tags?.[0]].filter(Boolean).join(" · ")],
  ["Stack", (C.stack || []).slice(0, 3).join(", ")],
  ["Site", (C.site || "").replace(/^https?:\/\//, "").replace(/\/$/, "")],
  ...(D ? [["Commits", `${D.total} this year`]] : []),
].filter(([, v]) => v);

const f = (x) => +x.toFixed(2);
// Base state = settled (visible). SMIL starts at 0 and holds hidden until `t` via keyTimes, so viewers
// without SMIL (or with animations stripped) still see the final card.
const kt = (t, d) => `dur="${f(t + d)}s" keyTimes="0;${f(t / (t + d))};1" fill="freeze"`;
const anim = (t) => `<animate attributeName="opacity" values="0;0;1" ${kt(t, 0.3)}/><animateTransform attributeName="transform" type="translate" values="-8 0;-8 0;0 0" ${kt(t, 0.3)}/>`;
const body = rows.map(([k, v], i) => `<g>${anim(f(1.1 + i * 0.15))}<text x="16" y="${82 + i * 18}" fill="#39d353">${k}</text><text x="96" y="${82 + i * 18}" fill="#e6edf3">${esc(trunc(v, 26))}</text></g>`).join("\n");
const by = 82 + rows.length * 18 - 4, H = by + 14, b0 = 2 + (rows.length - 6) * 0.15;
const ANSI = ["#4d4d4d", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#e5e5e5"];
const blocks = ANSI.map((c, j) => `<rect x="${16 + j * 20}" y="${by}" width="18" height="10" fill="${c}"><animate attributeName="opacity" values="0;0;1" ${kt(f(b0 + j * 0.06), 0.15)}/></rect>`).join("\n");
const cursorX = f(16 + ([...P].length + 11) * 7.22 + 2); // 12px mono ≈ 7.22px/char; "<P> ~ % whoami"

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="${H}" viewBox="0 0 300 ${H}" role="img" aria-label="${esc(rows.map(([k, v]) => `${k}: ${v}`).join("; "))}">
<style>@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
<defs><clipPath id="t"><rect height="32" width="300"><animate attributeName="width" values="0;300" dur="0.9s" fill="freeze"/></rect></clipPath></defs>
<rect width="300" height="${H}" rx="6" fill="#161b22"/>
<g font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12">
<g clip-path="url(#t)"><text x="16" y="24" xml:space="preserve"><tspan fill="#39d353">${esc(P)}</tspan><tspan fill="#7d8590"> ~ % </tspan><tspan fill="#e6edf3">whoami</tspan></text></g>
<rect x="${Math.min(cursorX, 284)}" y="14" width="7" height="13" fill="#39d353"><animate attributeName="opacity" values="1;0;1;0;1;0;0" dur="1.5s" begin="0.9s" fill="freeze"/></rect>
<text x="16" y="50" fill="#39d353" font-weight="bold">${esc(P)}</text>
<text x="16" y="62" fill="#7d8590">${"-".repeat(Math.min([...P].length, 36))}</text>
${body}
</g>
${blocks}
</svg>
`;
write(OUT, svg);
