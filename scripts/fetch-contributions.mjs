#!/usr/bin/env node
// Fetch a user's contribution calendar via GitHub GraphQL (read-only) → JSON.
import { execFileSync } from "node:child_process";
import { args, login, write } from "./_lib.mjs";

const a = args(`
Usage: node fetch-contributions.mjs --user <login> [--out data/github.json]
Token: $GITHUB_TOKEN, else \`gh auth token\`. Output: {user,fetched,total,start,counts,levels,streak{current,longest},best{date,count},languages[{name,color,bytes,pct}]}
languages = bytes across owned, public, non-fork repos (top 6 per repo), sorted desc.`, ["user"]);
const OUT = typeof a.out === "string" ? a.out : "data/github.json";
const USER = login(a.user);

let token = process.env.GITHUB_TOKEN;
if (!token) {
  try { token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim(); }
  catch { console.error("No token: set GITHUB_TOKEN or run `gh auth login`."); process.exit(1); }
}
const query = `query($u:String!){ user(login:$u){ contributionsCollection{ contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount contributionLevel } } } }
  repositories(first:100, ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC){ nodes{ languages(first:6, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name color } } } } } } }`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "neo-github-profile" },
  body: JSON.stringify({ query, variables: { u: USER } }),
});
const json = await res.json();
const cal = json.data?.user?.contributionsCollection?.contributionCalendar;
if (!res.ok || json.errors || !cal) {
  console.error("GraphQL failed:", res.status, JSON.stringify(json.errors || json));
  console.error("If contributionsCollection is null, use a PAT with read:user (e.g. secrets.PROFILE_TOKEN).");
  process.exit(1);
}

const days = cal.weeks.flatMap((w) => w.contributionDays);
const LV = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const counts = days.map((d) => d.contributionCount);

// The calendar ends at today; a zero today doesn't break yesterday's streak.
let i = counts.length - 1;
if (counts[i] === 0) i--;
let current = 0;
while (i >= 0 && counts[i] > 0) current++, i--;
let longest = 0, run = 0;
for (const c of counts) longest = Math.max(longest, (run = c > 0 ? run + 1 : 0));

// Aggregate language bytes across repos.
const lb = {};
for (const r of json.data.user.repositories?.nodes || []) for (const { size, node } of r?.languages?.edges || [])
  (lb[node.name] ||= { name: node.name, color: node.color, bytes: 0 }).bytes += size;
const lsum = Object.values(lb).reduce((s, l) => s + l.bytes, 0) || 1;
const languages = Object.values(lb).sort((x, y) => y.bytes - x.bytes).map((l) => ({ ...l, pct: +((l.bytes / lsum) * 100).toFixed(1) }));

const bi = counts.reduce((b, c, k) => (c > counts[b] ? k : b), 0);
const out = {
  user: USER,
  fetched: new Date().toISOString(),
  total: cal.totalContributions,
  start: days[0].date,
  counts,
  levels: days.map((d) => LV[d.contributionLevel] ?? 0).join(""),
  streak: { current, longest },
  best: { date: days[bi].date, count: counts[bi] },
  languages,
};
write(OUT, JSON.stringify(out));
console.log(`total=${out.total} days=${counts.length} start=${out.start} streak=${current}/${longest} best=${out.best.date}:${out.best.count} langs=${languages.slice(0, 5).map((l) => `${l.name}:${l.pct}%`).join(",")}`);
