const fs = require('fs');
const E = require('../src/engine.js');
const text = fs.readFileSync('/mnt/user-data/uploads/Research_Fellowship_Spreadsheet', 'utf8');
const sheets = E.parseTextSheets(text);
const today = new Date(Date.UTC(2026, 9, 18));
const res = E.run(sheets, {}, today);
const py = JSON.parse(fs.readFileSync('py_out.json', 'utf8'));
let diffs = 0;
const fields = [['bucket','bucket'],['why','why'],['tier','tier'],['deadline','deadline'],['deadlineNote','note'],
  ['payLabel','pay'],['payRank','payRank'],['payDetail','payDetail'],['location','loc'],['keyReq','keyReq'],
  ['flags','flags'],['components','components'],['skills','skills'],['availability','avail'],['length','length'],['apply','apply']];
const seen = new Set();
for (const r of res.records) {
  seen.add(r.id);
  const p = py[r.id];
  if (!p) { console.log('MISSING IN PY', r.id); diffs++; continue; }
  for (const [jk, pk] of fields) {
    if (String(r[jk]) !== String(p[pk])) { diffs++; console.log(`DIFF ${r.id} [${jk}]\n  js: ${r[jk]}\n  py: ${p[pk]}`); }
  }
}
for (const id of Object.keys(py)) if (!seen.has(id)) { console.log('MISSING IN JS', id); diffs++; }
const c = {}; res.records.forEach(r => c[r.bucket] = (c[r.bucket]||0)+1);
console.log('records', res.records.length, c, 'diffs', diffs);
