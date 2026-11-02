#!/usr/bin/env node
// Renders the editor-window images used by README.md into assets/cards/.
//
//   node scripts/cards/build.mjs
//
// Needs Node 22+ and Chromium or Chrome (set CHROME to point at a binary).
// The text is set in JetBrains Mono, so install it for the same result.
// Card content lives in data.json, thumbnails in thumbs/.

import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "assets", "cards");
const data = JSON.parse(readFileSync(join(here, "data.json"), "utf8"));

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const bin of ["chromium", "google-chrome-stable", "google-chrome", "chrome", "microsoft-edge"]) {
    try {
      return execFileSync("which", [bin], { encoding: "utf8" }).trim();
    } catch {}
  }
  throw new Error("No Chromium or Chrome found. Set the CHROME environment variable.");
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Minimal highlighter: comments, strings, dates and a few keywords.
function highlight(line) {
  return esc(line).replace(
    /(\/\/.*$)|("[^"]*")|(\b\d{4}-\d{2}-\d{2}\b)|\b(export|default|const)\b/g,
    (m, c, s, d, k) =>
      c ? `<span class="c">${c}</span>`
      : s ? `<span class="s">${s}</span>`
      : d ? `<span class="n">${d}</span>`
      : `<span class="k">${k}</span>`,
  );
}

const css = `
  :root { --bg:#09110e; --bar:#050a08; --side:#070d0b; --line:#3a524a; --txt:#e6f0ec; --dim:#7f968e;
          --kw:#3fd0a8; --str:#b9e8d6; --num:#e0b872; --com:#567067; --stat:#14604e; }
  * { box-sizing: border-box; margin: 0; }
  html, body { background: transparent; }
  body { font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; color: var(--txt); }
  .ed { background: var(--bg); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
  .tabs { display: flex; background: var(--bar); height: 36px; flex: none; font-size: 12px; }
  .tab { padding: 0 16px; display: flex; align-items: center; color: var(--dim); white-space: nowrap; }
  .tab.on { background: var(--bg); color: var(--txt); }
  .pv { display: block; width: 100%; height: 232px; object-fit: cover; object-position: top; flex: none; }
  .code { flex: 1; padding: 16px 18px; font: 12px/21px "JetBrains Mono", monospace; white-space: pre; overflow: hidden; }
  .status { flex: none; height: 28px; display: flex; justify-content: space-between; align-items: center;
            background: var(--stat); color: #e6f6f0; padding: 0 16px; font-size: 11px; }
  .status span + span { margin-left: 16px; }
  .k { color: var(--kw); } .s { color: var(--str); } .n { color: var(--num); } .c { color: var(--com); }
  .main { display: grid; grid-template-columns: 170px 1fr; flex: 1; min-height: 0; }
  .side { background: var(--side); padding: 14px 0; color: var(--dim); font-size: 12px; line-height: 1.4; }
  .side div { padding: 4px 18px; }
  .side .dir { color: var(--txt); font-weight: 700; padding-bottom: 8px; }
  .side .on { background: #12201b; color: var(--txt); }
  .crumb { padding: 10px 20px 0; color: var(--dim); font-size: 12px; }
  .editor { display: grid; grid-template-columns: auto 1fr; gap: 0 20px; padding: 10px 20px; font-size: 13px; line-height: 24px; }
  .nums { color: var(--line); text-align: right; white-space: pre; }
  .src { white-space: pre; }
  .caret { display: inline-block; width: 8px; height: 16px; background: var(--kw); vertical-align: text-bottom; }
`;

const wrap = (width, height, inner) =>
  `<!doctype html><meta charset="utf-8"><style>${css}.ed{width:${width}px;height:${height}px}</style>${inner}`;

function profileHtml(p) {
  const nums = p.code.map((_, i) => i + 1).join("\n");
  const code = p.code.map(highlight).join("\n");
  const side = p.sidebar
    .map((f, i) => `<div class="${i === 0 ? "on" : ""}">${esc(f)}</div>`)
    .join("");
  return wrap(830, 352, `
    <div class="ed">
      <div class="tabs"><span class="tab on">${esc(p.file)}</span></div>
      <div class="main">
        <div class="side"><div class="dir">edgonzalez24</div>${side}</div>
        <div>
          <div class="crumb">edgonzalez24 › ${esc(p.file)}</div>
          <div class="editor"><div class="nums">${nums}</div><div class="src">${code}<span class="caret"></span></div></div>
        </div>
      </div>
      <div class="status"><div>${p.status.map((s) => `<span>${esc(s)}</span>`).join("")}</div><span>Ln ${p.code.length}, Col 3</span></div>
    </div>`);
}

function cardHtml(c) {
  const thumb = pathToFileURL(join(here, "thumbs", c.thumb)).href;
  return wrap(410, 440, `
    <div class="ed">
      <div class="tabs"><span class="tab on">${esc(c.file)}</span></div>
      <img class="pv" src="${thumb}" alt="">
      <div class="code">${c.code.map(highlight).join("\n")}</div>
      <div class="status"><span>${esc(c.lang)}</span><span>${esc(c.cta)}</span></div>
    </div>`);
}

const chrome = findChrome();
const tmp = mkdtempSync(join(tmpdir(), "cards-"));
mkdirSync(outDir, { recursive: true });

function render(html, width, height, out) {
  const page = join(tmp, "card.html");
  writeFileSync(page, html);
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    "--default-background-color=00000000", "--force-device-scale-factor=2",
    `--window-size=${width},${height}`, `--screenshot=${join(outDir, out)}`,
    pathToFileURL(page).href,
  ], { stdio: "ignore" });
  console.log("wrote assets/cards/" + out);
}

try {
  render(profileHtml(data.profile), 830, 352, data.profile.out);
  for (const c of [...data.projects, ...data.posts]) render(cardHtml(c), 410, 440, c.out);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
