// Downloads today's fellowship sheet (CSV export) into tests/fixtures/ for the snapshot test.
// The sheet holds program contacts' emails, so tests/fixtures/ stays out of git.
const fs = require("fs");
const path = require("path");
const SHEET_ID = "1q6rKR0emDDM6twbyT2L3s7_CmsAz8ks8saRUs8Ryl40";
const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
(async () => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const dir = path.join(__dirname, "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "sheet.csv"), await res.text());
  console.log("Saved tests/fixtures/sheet.csv. Record its results before changing rules: UPDATE=1 node --test tests/*.test.js");
})().catch((e) => { console.error(e.message); process.exit(1); });
