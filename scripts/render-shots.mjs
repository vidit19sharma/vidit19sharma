#!/usr/bin/env node
// Project thumbnails: Playwright PNG of the live demo when possible, else a terminal-style SVG.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { args, esc, trunc, readJSON, tryJSON, write, works } from "./_lib.mjs";

const a = args(`
Usage: node render-shots.mjs --config profile.config.json [--out assets/shots/] [--audit data/audit.json]
Per project: <repo>.png from the demo URL (needs \`npx -y playwright\` + browsers), else <repo>.svg.
--audit (default: <config dir>/data/audit.json if present) supplies language/stars for derived SVG lines.`, ["config"]);
const C = readJSON(a.config);
const audit = tryJSON(typeof a.audit === "string" ? a.audit : join(dirname(resolve(a.config)), "data/audit.json"));
const repoInfo = (name) => audit?.repos?.find((r) => r.name.toLowerCase() === name.toLowerCase()) || {};
const out = resolve(typeof a.out === "string" ? a.out : "assets/shots/");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let pw; // lazily probed: only when some project has a demo
const safe = (s) => String(s).replace(/[^\w.-]/g, "_");

function svgThumb(p) {
  const owner = p.owner || C.user, info = repoInfo(p.repo);
  const d = (p.description || info.description || "").trim(), pushed = info.pushed_at && new Date(info.pushed_at);
  const lines = p.shot_lines?.length ? p.shot_lines.slice(0, 4) : [
    `$ gh repo view ${owner}/${p.repo}`,
    d ? `✓ ${trunc(d, 48)}` : null,
    `✓ ${info.language || p.tags?.[0] || "code"} · ★ ${info.stargazers_count ?? 0}`,
    !d && pushed ? `✓ pushed ${MON[pushed.getUTCMonth()]} ${pushed.getUTCFullYear()}` : null,
    `${trunc(p.repo, 40)} ›`,
  ].filter(Boolean);
  const last = lines.length - 1, M = "ui-monospace,SFMono-Regular,Menlo,monospace";
  const y0 = 225 - (last * 56) / 2;
  const body = lines.map((l, i) => {
    const y = Math.round(y0 + i * 56);
    if (i === last) {
      const x = +(60 + ([...l].length + 1) * 13.2).toFixed(1); // 22px mono ≈ 13.2px/char
      return `<text x="60" y="${y}" fill="#39d353">${esc(l)}</text><rect x="${Math.min(x, 760)}" y="${y - 20}" width="13" height="26" fill="#39d353"><animate attributeName="opacity" values="1;0" dur="1s" calcMode="discrete" repeatCount="indefinite"/></rect>`;
    }
    if (l.startsWith("$ ")) return `<text x="60" y="${y}"><tspan fill="#7d8590">$</tspan> ${esc(l.slice(2))}</text>`;
    if (l.startsWith("✓")) return `<text x="60" y="${y}"><tspan fill="#39d353">✓</tspan>${esc(l.slice(1))}</text>`;
    return `<text x="60" y="${y}">${esc(l)}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img" aria-label="${esc(p.repo)}">
<style>@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
<rect width="800" height="450" fill="#0d1117"/>
<rect x="0.5" y="0.5" width="799" height="449" rx="10" fill="none" stroke="#30363d"/>
<circle cx="30" cy="30" r="7" fill="#ff5f57"/><circle cx="54" cy="30" r="7" fill="#febc2e"/><circle cx="78" cy="30" r="7" fill="#28c840"/>
<text x="400" y="35" text-anchor="middle" font-family="${M}" font-size="14" fill="#7d8590">${esc(p.repo)}</text>
<g font-family="${M}" font-size="22" fill="#e6edf3" xml:space="preserve">
${body}
</g>
</svg>
`;
}

let fails = 0;
for (const p of C.projects || []) {
  if (!p.repo) continue;
  const base = join(out, safe(p.repo));
  try {
    if (p.demo && /^https?:\/\//.test(p.demo)) {
      pw ??= works("npx", ["-y", "playwright", "--version"]);
      if (pw) {
        try {
          execFileSync("npx", ["-y", "playwright", "screenshot", "--viewport-size=1280,720", "--wait-for-timeout=3000", p.demo, base + ".png"], { stdio: "ignore", timeout: 120000 });
          if (process.platform === "darwin") works("sips", ["-z", "450", "800", base + ".png"], 30000);
          if (existsSync(base + ".svg")) rmSync(base + ".svg");
          console.log(`${base}.png (screenshot of ${p.demo})`);
          continue;
        } catch { console.error(`screenshot failed for ${p.demo} → SVG fallback`); }
      }
    }
    if (existsSync(base + ".png")) { console.log(`${base}.png kept (existing screenshot)`); continue; }
    write(base + ".svg", svgThumb(p));
  } catch (e) { fails++; console.error(`${p.repo}: ${e.message}`); }
}
if (fails) console.error(`${fails} project(s) failed`);
