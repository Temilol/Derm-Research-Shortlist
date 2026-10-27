// Snapshot of every real program's result, so a rule change shows exactly which programs moved.
// Needs tests/fixtures/sheet.csv (node tests/fetch-sheet.js). UPDATE=1 records the current results as expected.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const E = require("../src/engine.js");

const DIR = path.join(__dirname, "fixtures");
const SHEET = path.join(DIR, "sheet.csv"), EXPECTED = path.join(DIR, "sheet.expected.json");
const TODAY = new Date(Date.UTC(2026, 9, 27));

function summarize() {
  const sheets = E.parseTextSheets(fs.readFileSync(SHEET, "utf8"));
  const res = E.run(sheets, {}, TODAY, E.chooseSheet(sheets));
  const out = {};
  for (const r of res.records) {
    out[r.id] = { bucket: r.bucket, tier: r.tier, deadline: r.deadline, pay: r.payLabel, why: r.why, items: r.checkItems.map((i) => i.key).join(",") };
  }
  return out;
}

test("real sheet: every program's result matches the recorded snapshot", { skip: !fs.existsSync(SHEET) && "no tests/fixtures/sheet.csv; run node tests/fetch-sheet.js" }, (t) => {
  const cur = summarize();
  if (process.env.UPDATE || !fs.existsSync(EXPECTED)) {
    fs.writeFileSync(EXPECTED, JSON.stringify(cur, null, 1));
    t.diagnostic(`Recorded ${Object.keys(cur).length} programs as the expected results.`);
    return;
  }
  const exp = JSON.parse(fs.readFileSync(EXPECTED, "utf8"));
  const moved = [];
  for (const id of new Set([...Object.keys(exp), ...Object.keys(cur)])) {
    const a = exp[id], b = cur[id];
    if (!a || !b) { moved.push(`${id}: ${a ? "no longer in the sheet" : "new in the sheet"}`); continue; }
    const diffs = Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k} ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
    if (diffs.length) moved.push(`${id}: ${diffs.join("; ")}`);
  }
  assert.equal(moved.length, 0, `${moved.length} program(s) changed. If intended, rerun with UPDATE=1.\n` + moved.join("\n"));
});
