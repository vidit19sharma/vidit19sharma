#!/usr/bin/env node
// Render contribution JSON → animated terminal-style heatmap SVG.
import { args, esc, readJSON, write, palette } from "./_lib.mjs";

const a = args(`
Usage: node render-heatmap.mjs --data data/github.json --style square|glyph --theme dark|light|light-warm|light-cool [--prompt "<data.user>@github"] [--out assets/heatmap[-glyph]-<dark|light>.svg]`, ["data"]);
const style = a.style || "square", theme = a.theme || "dark";
if (!["square", "glyph"].includes(style)) throw new Error("--style square|glyph");
const K = palette(theme);
const data = readJSON(a.data);
const OUT = typeof a.out === "string" ? a.out : `assets/${style === "glyph" ? "heatmap-glyph" : "heatmap"}-${theme === "dark" ? "dark" : "light"}.svg`;
const PROMPT = typeof a.prompt === "string" ? a.prompt : `${data.user}@github`;

const T = { bg: K.card, border: K.frame ? K.border : null, text: K.text, muted: K.muted, user: K.ac, cur: K.cursor, flash: K.flash,
  lv: K.heat, empty: `fill="${K.heat[0]}"${K.cell_stroke ? ` stroke="${K.cell_stroke}" stroke-width=".8"` : ""}`, gl: K.glyph };
const GLYPH = ".:+#@", SCR = ["#", "%", "&amp;", "*", "+", "=", "?", "@", ":"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const start = new Date(data.start + "T00:00:00Z");
const dateAt = (k) => new Date(start.getTime() + k * 864e5);
const n = data.counts.length; // calendar ends at today; k >= n is future
const cellFill = (l) => (l === 0 ? T.empty : `fill="${T.lv[l]}"`);
const f = (x) => +x.toFixed(3);

// Month labels: first week whose month differs from previous; drop labels that would collide.
const months = [];
for (let c = 0, prev = -1; c < 53; c++) {
  const m = dateAt(c * 7).getUTCMonth();
  if (m !== prev && (!months.length || c - months.at(-1).c >= 3)) months.push({ c, m });
  prev = m;
}

let cells = "";
for (let k = 0; k < 53 * 7; k++) {
  const col = Math.floor(k / 7), row = k % 7, x = 34 + col * 8, y = 50 + row * 8;
  const d = f(0.3 + (col + row * 1.6) * 0.022);
  if (k >= n) {
    if (style === "square") cells += `<rect x="${x}" y="${y}" width="7" height="7" rx="1.5" ${T.empty}/>`;
    continue;
  }
  const l = +data.levels[k] || 0;
  if (style === "square") {
    cells += `<rect class="c" x="${x}" y="${y}" width="7" height="7" rx="1.5" ${cellFill(l)} style="animation-delay:${d}s"/>`;
    if (l) cells += `<rect class="f" x="${x}" y="${y}" width="7" height="7" rx="1.5" fill="${T.flash}" style="animation-delay:${d}s"/>`;
  } else {
    const tx = x + 3.5, ty = y + 6.5, s1 = SCR[k % 9], s2 = SCR[(k * 7 + 3) % 9];
    const on = (t) => `<set attributeName="opacity" to="1" begin="${t}s"/>`, off = (t) => `<set attributeName="opacity" to="0" begin="${t}s"/>`;
    cells += `<g transform="translate(${tx} ${ty})" fill="${T.gl[l]}">` +
      `<text opacity="0">${s1}${on(d)}${off(f(d + 0.08))}</text>` +
      `<text opacity="0">${s2}${on(f(d + 0.08))}${off(f(d + 0.16))}</text>` +
      `<text opacity="0">${GLYPH[l]}${on(f(d + 0.16))}</text></g>`;
  }
}

const legend = [0, 1, 2, 3, 4].map((l, i) => style === "square"
  ? `<rect x="${358 + i * 9}" y="127" width="7" height="7" rx="1.5" ${cellFill(l)}/>`
  : `<text x="${361.5 + i * 9}" y="134" font-size="9" font-weight="700" text-anchor="middle" fill="${T.gl[l]}">${GLYPH[l]}</text>`).join("");

const bd = new Date(data.best.date + "T00:00:00Z");
const stats = `# ${data.total} contributions · ${data.streak.current ? `${data.streak.current}d streak` : `longest streak ${data.streak.longest}d`}` +
  (data.best.count ? ` · best ${data.best.count} on ${MON[bd.getUTCMonth()]} ${bd.getUTCDate()}` : "");

const css = style === "square"
  ? `.c{transform-box:fill-box;transform-origin:center;animation:pop .56s cubic-bezier(.34,1.56,.64,1) both}.f{opacity:0;animation:flash .56s ease-out forwards}@keyframes pop{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:scale(1)}}@keyframes flash{0%{opacity:0}30%{opacity:.9}100%{opacity:0}}@media (prefers-reduced-motion:reduce){*{animation:none!important}.f{display:none}}`
  : `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
const prompt = (cmd) => `<tspan fill="${T.user}">${esc(PROMPT)}</tspan><tspan fill="${T.muted}"> ~ % </tspan>${cmd ? `<tspan fill="${T.text}">${cmd}</tspan>` : ""}`;
const cursorX = f(16 + ([...PROMPT].length + 5) * 6.02 + 1); // 10px mono ≈ 6.02px/char

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 200" width="470" height="200"${theme === "dark" ? "" : ` data-theme="${theme}"`} role="img" aria-label="${esc(`${data.total} GitHub contributions in the last year by ${data.user}`)}">
<style>${css}</style>
<rect x=".5" y=".5" width="469" height="199" rx="6" fill="${T.bg}"${T.border ? ` stroke="${T.border}"` : ""}/>
<g font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="10">
<text x="16" y="24" xml:space="preserve">${prompt("git contrib --past-year")}</text>
<g fill="${T.muted}">${months.map(({ c, m }) => `<text x="${34 + c * 8}" y="44">${MON[m]}</text>`).join("")}<text x="8" y="66">Mon</text><text x="8" y="82">Wed</text><text x="8" y="98">Fri</text>
<text x="330" y="135">Less</text><text x="408" y="135">More</text>
<text x="16" y="160">${stats}</text></g>
${legend}
<g${style === "glyph" ? ' font-size="9" font-weight="700" text-anchor="middle"' : ""}>${cells}</g>
<text x="16" y="185" xml:space="preserve">${prompt("")}</text>
<rect x="${cursorX}" y="176" width="6" height="11" fill="${T.cur}"><animate attributeName="opacity" values="1;0" dur="1s" repeatCount="indefinite"/></rect>
</g></svg>
`;
write(OUT, svg);
