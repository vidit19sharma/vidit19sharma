#!/usr/bin/env node
// Wrap a built README in a GitHub-profile-like page for local preview (+ optional Playwright screenshot).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { args, esc, render, readJSON, write, works, warnMissing, TEMPLATES } from "./_lib.mjs";

const a = args(`
Usage: node build-mock.mjs --config profile.config.json [--readme README.md] [--audit data/audit.json] [--out mock.html] [--screenshot mock.png] [--delay 8] [--color-scheme dark|light]
The README is HTML-only, so it is inlined as-is. Relative asset paths resolve next to --out.
--delay: seconds to wait before the screenshot (mid-animation frames: e.g. 1.5).
--color-scheme: emulated prefers-color-scheme for the screenshot (default dark); <picture> sources follow it.`, ["config"]);
const C = readJSON(a.config);
const README = typeof a.readme === "string" ? a.readme : "README.md", OUT = typeof a.out === "string" ? a.out : "mock.html";
const A = typeof a.audit === "string" ? readJSON(a.audit) : null;
const S = C.sections || {};
const u = A?.user || {}, U = u.login || C.user;
const blog = u.blog || C.site || "";
const readme = readFileSync(README, "utf8");

const bio_html = u.bio ? `<p>${esc(u.bio)}</p>` : C.bio ? `<p class="proposed">${esc(C.bio)} (proposed)</p>` : "";
const pending = [S.stats === "hosted" && "hosted stats cards", S.snake && "the snake"].filter(Boolean);
const note = `Local mock of github.com/${U}` + (pending.length ? ` — ${pending.join(" and ")} only render once the profile repo is pushed.` : ".");

const html = render(readFileSync(join(TEMPLATES, "mock-shell.html"), "utf8"), {
  user: U, name: u.name || C.name || U, bio_html, note,
  avatar: `https://github.com/${encodeURIComponent(U)}.png`,
  public_repos: u.public_repos ?? A?.repos?.length ?? 0, followers: u.followers ?? 0, following: u.following ?? 0,
  location: u.location || C.location, blog: blog.replace(/^https?:\/\//, ""), blog_href: /^https?:/.test(blog) ? blog : `https://${blog}`,
  readme,
});
write(OUT, html);
warnMissing(readme, dirname(resolve(OUT)), existsSync, join);

if (typeof a.screenshot === "string") {
  const delay = Math.round((Number(typeof a.delay === "string" ? a.delay : 8) || 8) * 1000);
  const scheme = a["color-scheme"] === "light" ? "light" : "dark";
  const argv = ["-y", "playwright", "screenshot", "--full-page", `--color-scheme=${scheme}`, "--viewport-size=1280,900", `--wait-for-timeout=${delay}`, pathToFileURL(resolve(OUT)).href, resolve(a.screenshot)];
  const cmd = `npx ${argv.join(" ")}`;
  if (!works("npx", ["-y", "playwright", "--version"])) console.log(`playwright unavailable — run later:\n  ${cmd}`);
  else {
    try { execFileSync("npx", argv, { stdio: "inherit", timeout: 180000 }); console.log(`${a.screenshot} written`); }
    catch { console.log(`screenshot failed (file:// blocked or browsers missing). Try:\n  npx playwright install chromium && ${cmd}\n  or serve the dir: python3 -m http.server 8765 and screenshot http://localhost:8765/${OUT}`); }
  }
}
