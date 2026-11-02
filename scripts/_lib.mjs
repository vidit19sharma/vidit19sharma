// Shared helpers for neo-github-profile scripts. Zero deps, Node >= 18.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATES = join(SKILL, "templates");
export const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";

// Colour table shared with render-ascii.py. Any non-dark theme writes the "-light" asset.
export const PALETTES = JSON.parse(readFileSync(join(SKILL, "scripts", "_palettes.json"), "utf8"));
export function palette(name = "dark") {
  if (!PALETTES[name]) throw new Error(`--theme ${Object.keys(PALETTES).join("|")} (got ${name})`);
  return PALETTES[name];
}
// Light-only window chrome: tinted strip of height h inside a 1px-bordered card (stroke is drawn by the card rect).
export const titlebar = (K, W, h, label, size = 10) =>
  `<path d="M1 ${h}V6.5A5.5 5.5 0 0 1 6.5 1H${W - 6.5}A5.5 5.5 0 0 1 ${W - 1} 6.5V${h}Z" fill="${K.bar}"/><path d="M1 ${h + 0.5}H${W - 1}" stroke="${K.border}"/>` +
  K.dots.map((c, i) => `<circle cx="${12 + i * 11}" cy="${h / 2 + 0.5}" r="3.5" fill="${c}"/>`).join("") +
  `<text x="${W / 2}" y="${h / 2 + 4}" font-family="${MONO}" font-size="${size}" fill="${K.muted}" text-anchor="middle">${esc(label)}</text>`;

// --key value | --flag. Prints usage on --help or missing required keys.
export function args(usage, required = []) {
  const a = {}, v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    if (!v[i].startsWith("--")) continue;
    const k = v[i].slice(2), n = v[i + 1];
    if (n === undefined || n.startsWith("--")) a[k] = true;
    else (a[k] = n), i++;
  }
  const missing = required.filter((k) => typeof a[k] !== "string");
  if (a.help || missing.length) {
    if (missing.length && !a.help) console.error(`missing: ${missing.map((k) => "--" + k).join(" ")}`);
    console.log(usage.trim());
    process.exit(a.help ? 0 : 1);
  }
  return a;
}

export const login = (u) => {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(u || "")) throw new Error(`invalid GitHub login: ${u}`);
  return u;
};
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export const trunc = (s, n) => { const c = [...String(s ?? "")]; return c.length > n ? c.slice(0, n - 1).join("") + "…" : c.join(""); };
export const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
export const tryJSON = (p) => { try { return readJSON(p); } catch { return null; } };
export function write(p, s) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, s);
  console.log(`${p} ${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`);
}

export function gh(path, { raw = false, allow404 = false, extra = [] } = {}) {
  try {
    const out = execFileSync("gh", ["api", ...(raw ? ["-H", "Accept: application/vnd.github.raw"] : []), ...extra, path],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
    return raw ? out : JSON.parse(out);
  } catch (e) {
    if (allow404 && /404|Not Found/i.test(String(e.stderr))) return null;
    throw new Error(`gh api ${path} failed: ${String(e.stderr || e.message).trim()}`);
  }
}
export const works = (cmd, argv, timeout = 180000) => {
  try { execFileSync(cmd, argv, { stdio: "ignore", timeout }); return true; } catch { return false; }
};

// Tiny mustache: {{#k}}..{{/k}} (truthy), {{^k}}..{{/k}} (falsy), {{{k}}} raw, {{k}} escaped.
export function render(tpl, view) {
  let prev;
  do {
    prev = tpl;
    tpl = tpl.replace(/\{\{([#^])([\w.]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_, op, k, body) => {
      const v = view[k], on = Array.isArray(v) ? v.length > 0 : !!v;
      return (op === "#") === on ? body : "";
    });
  } while (tpl !== prev);
  return tpl.replace(/\{\{\{([\w.]+)\}\}\}/g, (_, k) => String(view[k] ?? "")).replace(/\{\{([\w.]+)\}\}/g, (_, k) => esc(view[k]));
}

// Normalize a raw /events/public item to the audit shape (PR/issue/release titles under one `title` key).
export const normEvent = (e) => {
  const p = e.payload || {};
  return {
    type: e.type, repo: e.repo?.name, created_at: e.created_at, action: p.action ?? null,
    commits: p.commits?.length ?? p.size ?? null, ref_type: p.ref_type ?? null,
    merged: p.pull_request?.merged ?? null,
    title: (p.pull_request?.title || p.issue?.title || p.release?.name || p.release?.tag_name || "").trim() || null,
  };
};

const link = (r) => `<a href="https://github.com/${esc(r)}">${esc(r)}</a>`;
function eventText(e) {
  const r = link(e.repo), title = (e.title || e.release || "").trim();
  const q = (label, noun) => (title ? `${label} "${esc(trunc(title, 80))}" in ${r}` : `${label.replace(/ (PR|issue)$/, "")} ${noun} in ${r}`);
  switch (e.type) {
    case "PushEvent": return `🔼 Pushed ${e.commits ? `${e.commits} commit${e.commits === 1 ? "" : "s"} ` : ""}to ${r}`;
    case "ReleaseEvent": return title ? `🚀 Published release ${esc(trunc(title, 60))} in ${r}` : `🚀 Published a release in ${r}`;
    case "CreateEvent": return e.ref_type === "repository" ? `🎉 Created repo ${r}` : null;
    case "WatchEvent": return `⭐ Starred ${r}`;
    case "ForkEvent": return `🍴 Forked ${r}`;
    case "PullRequestEvent":
      if (e.action === "opened") return `💪 ${q("Opened PR", "a PR")}`;
      if (e.action === "closed" && e.merged) return `🎉 ${q("Merged PR", "a PR")}`;
      return null;
    case "IssuesEvent": return e.action === "opened" ? `❗ ${q("Opened issue", "an issue")}` : null;
    case "IssueCommentEvent": return `🗣 ${q("Commented on issue", "an issue")}`;
    case "PullRequestReviewCommentEvent": return `🗣 ${q("Commented on PR", "a PR")}`;
    case "PullRequestReviewEvent": return `👀 ${q("Reviewed PR", "a PR")}`;
    default: return null;
  }
}
// Consecutive pushes to the same repo collapse into one line.
export function activityItems(events, n = 5) {
  const merged = [];
  for (const e of events || []) {
    const last = merged.at(-1);
    if (e.type === "PushEvent" && last?.type === "PushEvent" && last.repo === e.repo) last.commits = (last.commits || 0) + (e.commits || 0);
    else merged.push({ ...e });
  }
  return merged.map(eventText).filter((t, i, all) => t && t !== all.slice(0, i).filter(Boolean).at(-1)).slice(0, n);
}
export function activityBlock(events, now = new Date()) {
  const items = activityItems(events);
  const d = now.toISOString().slice(0, 10);
  return `<!--ACTIVITY:START-->\n<ol>\n${(items.length ? items : ["🌙 Quiet lately"]).map((i) => `<li>${i}</li>`).join("\n")}\n</ol>\n<p><sub>Last refreshed: ${d}</sub></p>\n<!--ACTIVITY:END-->`;
}

// Warn for every local assets/... path referenced in html that doesn't exist relative to baseDir.
export const CANONICAL = "assets/hero.svg, assets/neofetch.svg, assets/heatmap-<dark|light>.svg, assets/heatmap-glyph-<dark|light>.svg, assets/ascii-portrait.svg, assets/shots/<repo>.(png|svg)";
export function warnMissing(html, baseDir, existsSync, join) {
  const refs = [...new Set([...html.matchAll(/(?:src|srcset)="(assets\/[^"]+)"/g)].map((m) => m[1]))];
  const miss = refs.filter((r) => !existsSync(join(baseDir, r)));
  for (const m of miss) console.warn(`warning: missing asset ${m} (expected canonical names: ${CANONICAL})`);
  return miss;
}
