#!/usr/bin/env node
// Fill templates/README.template.md from config + contributions + audit → README.md (HTML-only, <h3> only, no inline style).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { args, esc, render, readJSON, write, activityBlock, warnMissing, TEMPLATES } from "./_lib.mjs";

const a = args(`
Usage: node build-readme.mjs --config profile.config.json [--data data/github.json] [--audit data/audit.json] [--out README.md]
Sections are toggled by config.sections. Asset paths are relative to the README (assets/...).`, ["config"]);
const OUT = typeof a.out === "string" ? a.out : "README.md";
const C = readJSON(a.config);
const D = typeof a.data === "string" ? readJSON(a.data) : null;
const A = typeof a.audit === "string" ? readJSON(a.audit) : null;
const S = { hero: "session", socials: true, ascii: true, neofetch: true, heatmap: "square", projects: true, stack: true, stats: "none", snake: false, activity: true, footer: true, ...C.sections };
const U = C.user, both = C.theme === "both", outDir = dirname(resolve(OUT));
const repo = (n) => A?.repos?.find((r) => r.name.toLowerCase() === n.toLowerCase()) || {};

// theme both → <picture> with prefers-color-scheme sources; dark|light → single <img> for that theme.
const pic = (dark, light, attrs) => both
  ? `<picture><source media="(prefers-color-scheme: dark)" srcset="${esc(dark)}"><source media="(prefers-color-scheme: light)" srcset="${esc(light)}"><img src="${esc(dark)}" ${attrs}></picture>`
  : `<img src="${esc(C.theme === "light" ? light : dark)}" ${attrs}>`;
const asset = (n, attrs) => pic(`assets/${n}.svg`, `assets/${n}-light.svg`, attrs);

// Socials (skillicons, same look as the mock).
const L = C.links || {};
const term = L.terminal && (/^https?:/.test(L.terminal) ? L.terminal : `https://${L.terminal}`).replace(/\/+$/, "");
const socials = [
  [L.website || C.site, "vercel", "Website"], [L.linkedin, "linkedin", "LinkedIn"], [L.x, "twitter", "X"],
  [L.email && (L.email.startsWith("mailto:") ? L.email : `mailto:${L.email}`), "gmail", "Email"],
].filter(([u]) => u).map(([u, i, alt]) => `<a href="${esc(/^(https?:|mailto:)/.test(u) ? u : `https://${u}`)}"><img src="https://skillicons.dev/icons?i=${i}" width="36" alt="${alt}"></a>`).join("&nbsp;\n");

// About bullets: config.about[] (plain text, escaped) or derived from projects/bio/stack.
const feat = (C.projects || []).slice(0, 3);
const desc = (p) => p.description || repo(p.repo).description || "";
const siteHref = C.site && (/^https?:/.test(C.site) ? C.site : `https://${C.site}`);
const about = C.about?.length ? C.about.map(esc) : [
  feat[0] && `🔭 Building <b>${esc(feat[0].repo)}</b>${desc(feat[0]) ? ` — ${esc(desc(feat[0]))}` : ""}`,
  feat.length > 1 && `🧩 Also shipping ${feat.slice(1).map((p) => `<b>${esc(p.repo)}</b>`).join(" and ")}`,
  C.bio && `🌱 ${esc(C.bio)}`,
  C.stack?.length && `💬 Ask me about ${esc(C.stack.slice(0, 3).join(", "))}`,
  (C.location || siteHref) && `📍 ${[C.location && esc(C.location), siteHref && `<a href="${esc(siteHref)}">${esc(C.site.replace(/^https?:\/\//, ""))}</a>`].filter(Boolean).join(" · ")}`,
].filter(Boolean);
if (term) about.push(`⌨️ Try the interactive terminal → <a href="${esc(term)}">${esc(term.replace(/^https?:\/\//, ""))}</a>`);

// Heatmap.
const hstyle = S.heatmap === "glyph" ? "heatmap-glyph" : "heatmap";
const heatmap_html = pic(`assets/${hstyle}-dark.svg`, `assets/${hstyle}-light.svg`, `width="470" alt="${esc(D ? `${D.total} contributions in the last year` : "Contributions")}"`);

// Projects: 2-col table.
const thumb = (p) => existsSync(join(outDir, "assets/shots", `${p.repo}.png`)) ? `assets/shots/${p.repo}.png` : `assets/shots/${p.repo}.svg`;
const cell = (p) => {
  const src = `https://github.com/${p.owner || U}/${p.repo}`, href = p.demo || src;
  const stars = repo(p.repo).stargazers_count ?? 0;
  return `<td width="50%" valign="top">
<a href="${esc(href)}"><img src="${esc(thumb(p))}" width="400" alt="${esc(p.repo)}"></a><br>
<b><a href="${esc(src)}">${esc(p.repo)}</a></b> &nbsp;⭐ ${stars}<br>
${desc(p) ? `${esc(desc(p))}<br>\n` : ""}${(p.tags || []).map((t) => `<code>${esc(t)}</code>`).join(" ")}${p.tags?.length ? "<br>\n" : ""}${p.demo ? `<a href="${esc(p.demo)}">Live demo</a> · ` : ""}<a href="${esc(src)}">Source</a>
</td>`;
};
const P = C.projects || [], rows = [];
for (let i = 0; i < P.length; i += 2) rows.push(`<tr>\n${P.slice(i, i + 2).map(cell).join("\n")}\n</tr>`);

// Stack → skillicons ids.
const ICON = { typescript: "ts", javascript: "js", "node.js": "nodejs", node: "nodejs", python: "py", shell: "bash", "c++": "cpp", "c#": "cs", golang: "go", postgresql: "postgres", "next.js": "nextjs", "vue.js": "vue", tailwind: "tailwind", tailwindcss: "tailwind", "github actions": "githubactions", kubernetes: "kubernetes", k8s: "kubernetes" };
const wanted = (C.stack || []).map((s) => ICON[s.toLowerCase()] || s.toLowerCase().replace(/[^a-z0-9]/g, ""));
// Unknown ids render as blank slots on skillicons, so validate against its live list (short-name aliases included).
// Set NGP_OFFLINE=1 (selftest does) or lose the network → keep everything.
const SHORT = "js,ts,py,tailwind,vue,nuxt,go,cf,wasm,postgres,k8s,next,mongo,md,ps,ai,pr,ae,scss,sc,net,gatsbyjs,gql,vlang,amazonwebservices,bots,express,googlecloud,mui,windi,unreal,nest,ktorio,pwsh,au,rollup,rxjs,rxjava,ghactions,sklearn".split(",");
let known = null;
if (!process.env.NGP_OFFLINE) {
  try {
    const r = await fetch("https://skillicons.dev/api/icons", { signal: AbortSignal.timeout(4000) });
    if (r.ok) known = new Set([...(await r.json()), ...SHORT]);
  } catch { /* offline: no filtering */ }
}
const icons = known ? wanted.filter((i) => known.has(i)) : wanted;
const dropped = wanted.filter((i) => !icons.includes(i));
if (dropped.length) console.warn(`stack: no skillicons icon for ${dropped.join(", ")} (listed in alt text only)`);

// Hosted stats (opt-in; endpoints are often rate-limited).
const enc = encodeURIComponent(U);
const stat = (path, dq, lq, alt) => `<td valign="top">${pic(path + dq, path + lq, `width="400" alt="${alt}"`)}</td>`;
const stats_html = [
  stat(`https://github-readme-stats.vercel.app/api?username=${enc}&show_icons=true&hide_border=true`, "&theme=github_dark", "&theme=default", "GitHub stats"),
  stat(`https://streak-stats.demolab.com?user=${enc}&hide_border=true`, "&theme=github-dark-blue", "&theme=default", "Streak"),
  stat(`https://github-readme-stats.vercel.app/api/top-langs/?username=${enc}&layout=compact&hide_border=true`, "&theme=github_dark", "&theme=default", "Top languages"),
].reduce((acc, c, i) => acc + (i === 2 ? "\n</tr><tr>\n" : i ? "\n" : "") + c, "");

const snakeBase = `https://raw.githubusercontent.com/${enc}/${enc}/output/github-contribution-grid-snake`;
const snake_html = `<picture><source media="(prefers-color-scheme: dark)" srcset="${snakeBase}-dark.svg"><source media="(prefers-color-scheme: light)" srcset="${snakeBase}.svg"><img src="${snakeBase}-dark.svg" width="846" alt="Contribution snake"></picture>`;

const footer_html = [siteHref && `<a href="${esc(siteHref)}">${esc(C.site.replace(/^https?:\/\//, ""))}</a>`, `<a href="https://github.com/${enc}?tab=repositories">all repositories</a>`, term && `<a href="${esc(term)}">live terminal</a>`, "assets refresh daily via GitHub Actions"].filter(Boolean).join(" · ");

const view = {
  name: C.name, tagline: C.tagline,
  hero: S.hero && S.hero !== "none", hero_html: asset("hero", `width="846" alt="${esc(`${C.name} — ${C.tagline || ""}`)}"`),
  ascii_html: asset("ascii-portrait", `width="276" alt="ASCII portrait of ${esc(C.name)}"`),
  neofetch_html: asset("neofetch", `width="300" alt="neofetch: ${esc(C.name)}"`),
  // A bare <img> on GitHub links to the raw image; always wrap the icon row.
  stack_href: term ? `${term}/?cmd=stack` : "#-tech-stack", // GitHub slug of "💻 Tech Stack" (emoji dropped → leading "-")
  socials: S.socials && socials, socials_html: socials,
  about: about.length || S.ascii, ascii: S.ascii, about_html: about.map((x) => `<li>${x}</li>`).join("\n"),
  cards: S.neofetch || (S.heatmap && S.heatmap !== "none"), neofetch: S.neofetch, heatmap: S.heatmap && S.heatmap !== "none", heatmap_html,
  projects: S.projects && rows.length, projects_html: rows.join("\n"),
  stack: S.stack && icons.length, stack_icons: icons.join(","), stack_perline: Math.min(icons.length, 15) || 1, stack_list: (C.stack || []).join(", "),
  stats: S.stats === "hosted", stats_html,
  snake: S.snake, snake_html,
  activity: S.activity, activity_html: activityBlock(A?.events || []),
  footer: S.footer, footer_html,
};
const md = render(readFileSync(join(TEMPLATES, "README.template.md"), "utf8"), view).replace(/\n{3,}/g, "\n\n").trim() + "\n";
if (/<h[12][\s>]|\sstyle=/i.test(md)) throw new Error("README contains <h1>/<h2> or inline style= — template bug");
write(OUT, md);
warnMissing(md, outDir, existsSync, join);
