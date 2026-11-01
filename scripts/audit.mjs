#!/usr/bin/env node
// Read-only audit of a GitHub profile via `gh api` → JSON + human summary.
import { dirname, join, resolve } from "node:path";
import { args, login, gh, write, normEvent, tryJSON } from "./_lib.mjs";

const a = args(`
Usage: node audit.mjs --user <login> [--out data/audit.json]
Read-only: users/<u>, repos (paginated), pinned (GraphQL), profile README + last commit, workflows, public events.
If data/github.json exists next to --out, low contribution totals are flagged. Requires an authenticated \`gh\`.`, ["user"]);
const U = login(a.user), OUT = typeof a.out === "string" ? a.out : "data/audit.json";

const u = gh(`users/${U}`);
const raw = [];
for (let page = 1; ; page++) {
  const batch = gh(`users/${U}/repos?per_page=100&sort=pushed&page=${page}`) || [];
  raw.push(...batch);
  if (batch.length < 100) break;
}
const repos = raw.map((r) => ({
  name: r.name, description: r.description, language: r.language, stargazers_count: r.stargazers_count,
  fork: r.fork, archived: !!r.archived, homepage: r.homepage || null, html_url: r.html_url, topics: r.topics || [], pushed_at: r.pushed_at,
}));
const pinnedQ = `query($u:String!){ user(login:$u){ pinnedItems(first:6,types:REPOSITORY){ nodes{ ... on Repository{ name } } } } }`;
const pinned = gh("graphql", { extra: ["-f", `query=${pinnedQ}`, "-f", `u=${U}`] }).data.user.pinnedItems.nodes.map((n) => n.name);

const profileRepo = repos.find((r) => r.name.toLowerCase() === U.toLowerCase());
// readme JSON gives the real path (readme.md, README.MD, ...) for the last-commit lookup.
const rmeta = profileRepo ? gh(`repos/${U}/${U}/readme`, { allow404: true }) : null;
const readme = rmeta ? Buffer.from(rmeta.content || "", "base64").toString("utf8") : null;
const rpath = rmeta?.path || "README.md";
const lastCommit = profileRepo ? gh(`repos/${U}/${U}/commits?path=${encodeURIComponent(rpath)}&per_page=1`, { allow404: true }) : null;
const readme_updated = lastCommit?.[0]?.commit?.committer?.date ?? null;
const wf = profileRepo ? gh(`repos/${U}/${U}/contents/.github/workflows`, { allow404: true }) : null;
const workflows = Array.isArray(wf) ? wf.map((f) => f.name) : [];
const events = (gh(`users/${U}/events/public?per_page=30`) || []).slice(0, 30).map(normEvent);

const gaps = [];
if (!u.bio) gaps.push("empty bio");
if (!u.company) gaps.push("empty company");
else if (/^http/i.test(u.company)) gaps.push("company should be an @org handle");
const blogIsTwitter = /(^|\/\/|\.)(twitter\.com|x\.com)\b/i.test(u.blog || "");
if (blogIsTwitter) gaps.push("twitter URL is in the blog field; move it to the Twitter field");
else {
  if (!u.twitter_username) gaps.push("empty twitter");
  if (!u.blog) gaps.push("empty blog");
}
if (!profileRepo) gaps.push(`no profile repo (${U}/${U})`);
else if (readme == null) gaps.push("profile repo has no README");
if (readme_updated && Date.now() - Date.parse(readme_updated) > 90 * 864e5)
  gaps.push(`profile README untouched for ${Math.floor((Date.now() - Date.parse(readme_updated)) / 864e5)}d`);
if (pinned.length < 6) gaps.push(`only ${pinned.length}/6 repos pinned`);
const recent = repos.filter((r) => !r.fork && !r.archived && r.name !== profileRepo?.name).sort((x, y) => (y.pushed_at > x.pushed_at ? 1 : -1)).slice(0, 3);
const unpinned = recent.filter((r) => !pinned.includes(r.name)).map((r) => r.name);
if (unpinned.length) gaps.push(`recently-pushed repos not pinned: ${unpinned.join(", ")}`);
const nodesc = repos.filter((r) => !r.fork && !r.archived && !r.description).length;
if (nodesc) gaps.push(`${nodesc} repos without description`);
if (readme) {
  const hosted = [...new Set(readme.match(/github-readme-stats|streak-stats|profile-trophy|capsule-render|readme-typing-svg/g) || [])];
  if (hosted.length) gaps.push(`hosted stats endpoints in README: ${hosted.join(", ")}`);
  const urls = [...readme.matchAll(/(?:src=["']|!\[[^\]]*\]\()([^"')\s]+)/g)].map((m) => m[1]);
  const dup = [...new Set(urls.filter((x, i) => urls.indexOf(x) !== i))];
  if (dup.length) gaps.push(`duplicated badge/image URLs: ${dup.length}`);
}
if (!workflows.length) gaps.push("no workflows in profile repo");
const contrib = tryJSON(join(dirname(resolve(OUT)), "github.json"));
if (contrib && contrib.total < 150)
  gaps.push(`private contributions likely hidden (${contrib.total} in the last year) — suggest enabling 'Include private contributions'`);

const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k] ?? null]));
const out = {
  fetched: new Date().toISOString(),
  user: pick(u, ["login", "name", "bio", "company", "twitter_username", "blog", "location", "email", "avatar_url", "html_url", "followers", "following", "public_repos", "created_at"]),
  repos, pinned, profile_repo: !!profileRepo, readme, readme_updated, workflows, events, gaps,
};
write(OUT, JSON.stringify(out, null, 2));

console.log(`\n${u.name || U} (@${U}) · ${u.public_repos} public repos (${repos.length} fetched) · ${u.followers} followers · ${u.location || "no location"}`);
console.log(`pinned: ${pinned.join(", ") || "none"}`);
console.log(`profile README: ${readme == null ? "none" : `${readme.length} chars, updated ${readme_updated?.slice(0, 10) ?? "?"}`} · workflows: ${workflows.join(", ") || "none"}`);
console.log(`events: ${events.length}${contrib ? ` · contributions: ${contrib.total}` : " · (no github.json next to --out; run fetch-contributions first for the private-contributions check)"}`);
console.log(gaps.length ? `gaps:\n${gaps.map((g) => `  - ${g}`).join("\n")}` : "gaps: none");
