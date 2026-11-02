#!/usr/bin/env node
// Reads the public GitHub numbers used by the github.ts card and saves them
// to scripts/cards/github.json. Also saves your achievement badges (Pull Shark,
// YOLO...) to assets/achievements/. Run it before build.mjs to refresh the card.
//
//   node scripts/cards/fetch-github.mjs [login]
//
// Needs Node 22+ and the GitHub CLI (`gh`), already logged in. GitHub has no API
// for achievements, so they are read from the public profile page.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const login = process.argv[2] ?? "edgonzalez24";
const gh = (...args) =>
  JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 26 }));

const user = gh("api", `users/${login}`);
const repos = gh("api", `users/${login}/repos?per_page=100&type=owner`).filter((r) => !r.fork);

const { user: u } = gh(
  "api", "graphql", "-f",
  `query=query { user(login: "${login}") { contributionsCollection {
    contributionCalendar { totalContributions }
  } } }`,
).data;

// Achievement badges: the image URLs carry a content hash that changes over time,
// so the images are saved into the repo instead of being linked.
const html = await (await fetch(`https://github.com/${login}?tab=achievements`)).text();
const found = new Map();
for (const m of html.matchAll(/<img src="(https:\/\/github\.githubassets\.com\/assets\/[^"]+\.png)"[^>]*alt="Achievement: ([^"]+)"/g)) {
  found.set(m[2], m[1]);
}
const outDir = join(here, "..", "..", "assets", "achievements");
mkdirSync(outDir, { recursive: true });
const achievements = [];
for (const [name, url] of found) {
  const file = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".png";
  writeFileSync(join(outDir, file), Buffer.from(await (await fetch(url)).arrayBuffer()));
  achievements.push({ name, file });
}

const out = {
  login,
  since: new Date(user.created_at).getFullYear(),
  repos: user.public_repos,
  stars: repos.reduce((a, r) => a + r.stargazers_count, 0),
  followers: user.followers,
  contributions: u.contributionsCollection.contributionCalendar.totalContributions,
  updated: new Date().toISOString().slice(0, 10),
  achievements,
};

writeFileSync(join(here, "github.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote scripts/cards/github.json (${out.contributions} contributions)`);
console.log("achievements: " + (achievements.map((a) => a.name).join(", ") || "none"));
