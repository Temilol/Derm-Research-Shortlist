// Eligibility and deadline rules from HANDOFF, on made-up programs. Run with: node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../src/engine.js");

const TODAY = new Date(Date.UTC(2026, 9, 27));
const HEADER = ["State", "Fellowship Program", "Director", "Deadline", "Description", "Requirements", "Paid"];
// One program per call; fields not given are left blank, like a sparse row in the sheet.
function judge(fields, profile) {
  const row = HEADER.map((h) => fields[h] || "");
  row[0] = row[0] || "NY"; row[1] = row[1] || "Test Fellowship";
  return E.run({ Sheet1: [HEADER, row] }, profile || {}, TODAY).records[0];
}
const bucket = (fields, profile) => judge(fields, profile).bucket;

test("graduates who completed PGY-1 are eligible", () => {
  assert.equal(bucket({ Description: "Open to MD graduates who have completed PGY-1." }), "Eligible");
});

test("missing information never excludes a program", () => {
  const r = judge({ Description: "Research fellowship in dermatology." });
  assert.notEqual(r.bucket, "Excluded");
});

test("student-only wording excludes", () => {
  const r = judge({ Requirements: "This position is for current medical students only." });
  assert.equal(r.bucket, "Excluded");
  assert.match(r.why, /Student-only/);
});

test("a gap year between 3rd and 4th year excludes when graduates aren't mentioned", () => {
  assert.equal(bucket({ Description: "For students taking a gap year between 3rd and 4th year." }), "Excluded");
});

test("hedged student-year wording goes to Needs verification instead", () => {
  assert.equal(bucket({ Description: "Ideal for a gap year between 3rd and 4th year of medical school." }), "Needs verification");
});

test("students and graduates together are not excluded", () => {
  assert.notEqual(bucket({ Description: "Open to medical students and recent graduates." }), "Excluded");
});

test("requiring two years of residency excludes", () => {
  const r = judge({ Requirements: "Applicants must have completed at least two years of residency training." });
  assert.equal(r.bucket, "Excluded");
  assert.match(r.why, /more training/i);
});

test("requiring board certification excludes", () => {
  assert.equal(bucket({ Requirements: "Applicants must be board certified in dermatology." }), "Excluded");
});

test("citizenship: excluded only when you aren't a US citizen", () => {
  const fields = { Requirements: "Open to MD graduates. US citizens or permanent residents only." };
  assert.notEqual(bucket(fields, { us_citizen: true }), "Excluded");
  const r = judge(fields, { us_citizen: false });
  assert.equal(r.bucket, "Excluded");
  assert.match(r.why, /Citizenship/);
});

test("an immediate start needs verification against your availability", () => {
  assert.equal(bucket({ Description: "MD graduates welcome. Start ASAP." }), "Needs verification");
});

test("pay is shown, never used to exclude", () => {
  const r = judge({ Description: "Open to MD graduates.", Paid: "No, unpaid" });
  assert.equal(r.bucket, "Eligible");
  assert.match(r.payLabel, /Unpaid/);
});

test("deadline tiers", () => {
  const tier = (d) => judge({ Description: "Open to MD graduates.", Deadline: d }).tier;
  assert.equal(tier("Nov 15 2026"), 1); // within 30 days
  assert.equal(tier("Jan 10 2027"), 2); // 31-90 days
  assert.equal(tier("Jun 1 2027"), 3); // later
  assert.equal(tier("Rolling admissions"), 4);
  assert.equal(tier("Jan 5 2025"), 5); // passed, projected to next year
  assert.equal(tier(""), 6);
});

test("a passed deadline is projected to the next year and marked", () => {
  const r = judge({ Description: "Open to MD graduates.", Deadline: "Jan 5 2025" });
  assert.equal(r.projected, true);
  assert.equal(r.deadline, "2027-01-05");
});

test("checklist items are detected from the requirements", () => {
  const r = judge({ Requirements: "Send your CV, a personal statement and three letters of recommendation." });
  assert.deepEqual(r.checkItems.map((i) => i.key), ["cv", "ps", "lor"]);
  assert.equal(r.checkItems[2].count, 3);
});
