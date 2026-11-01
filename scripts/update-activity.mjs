#!/usr/bin/env node
// Refresh only the <!--ACTIVITY:START-->…<!--ACTIVITY:END--> block of a README from public events.
import { readFileSync } from "node:fs";
import { args, login, gh, write, normEvent, activityBlock } from "./_lib.mjs";

const a = args(`
Usage: node update-activity.mjs --user <login> --readme README.md`, ["user", "readme"]);
const md = readFileSync(a.readme, "utf8");
const re = /<!--ACTIVITY:START-->[\s\S]*?<!--ACTIVITY:END-->/;
if (!re.test(md)) { console.error(`${a.readme}: no ACTIVITY markers — nothing to do`); process.exit(0); }
const events = (gh(`users/${login(a.user)}/events/public?per_page=30`) || []).map(normEvent);
const next = md.replace(re, activityBlock(events));
if (next === md) console.log("activity unchanged");
else write(a.readme, next);
