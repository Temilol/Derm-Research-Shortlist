// Merge rules for cross-device sync. Run with: node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeEntry, mergeProfile } = require("../src/sync.js");

const NOW = 1000;

test("program only on the account is kept and copied to this device", () => {
  const m = mergeEntry(undefined, { status: "Applied", statusAt: 5, notes: "", decision: "" }, true, NOW);
  assert.equal(m.local.status, "Applied");
  assert.equal(m.localChanged, true);
  assert.equal(m.remoteChanged, false);
});

test("program only on this device is added to the account", () => {
  const m = mergeEntry({ status: "Interested", statusAt: 5, notes: "" }, undefined, false, NOW);
  assert.equal(m.remote.status, "Interested");
  assert.equal(m.remoteChanged, true);
  assert.equal(m.localChanged, false);
});

test("same status changed on both: the newer edit wins", () => {
  const m = mergeEntry({ status: "Started", statusAt: 20 }, { status: "Applied", statusAt: 10 }, true, NOW);
  assert.equal(m.local.status, "Started");
  assert.equal(m.remote.status, "Started");
  const m2 = mergeEntry({ status: "Started", statusAt: 10 }, { status: "Applied", statusAt: 20 }, true, NOW);
  assert.equal(m2.local.status, "Applied");
});

test("status on one device and notes on the other are both kept", () => {
  const m = mergeEntry({ status: "", notes: "Emailed PI", notesAt: 15 }, { status: "Applied", statusAt: 12, notes: "" }, true, NOW);
  assert.equal(m.local.status, "Applied");
  assert.equal(m.local.notes, "Emailed PI");
});

test("notes edited on both devices are kept together, newer first", () => {
  const m = mergeEntry({ notes: "Phone note", notesAt: 30 }, { notes: "Laptop note", notesAt: 20 }, true, NOW);
  assert.equal(m.conflict, true);
  assert.match(m.local.notes, /^Phone note\n\n— From another device.*:\nLaptop note$/);
  assert.equal(m.local.notesAt, NOW);
});

test("a merged note does not merge again on the other device", () => {
  const first = mergeEntry({ notes: "Phone note", notesAt: 30 }, { notes: "Laptop note", notesAt: 20 }, true, NOW);
  // The laptop last agreed at 10, then typed "Laptop note" at 20; the merged text arrives from the account.
  const laptop = mergeEntry({ notes: "Laptop note", notesAt: 20, notesSyncedAt: 10 }, first.remote, true, NOW + 5);
  assert.equal(laptop.conflict, false);
  assert.equal(laptop.local.notes, first.remote.notes);
});

test("deleting part of a note is not undone by the older fuller copy", () => {
  const m = mergeEntry({ notes: "Keep", notesAt: 20, notesSyncedAt: 10 }, { notes: "Keep this too", notesAt: 10 }, true, NOW);
  assert.equal(m.local.notes, "Keep");
  assert.equal(m.remote.notes, "Keep");
});

test("a newer cleared status wins over an older one", () => {
  const m = mergeEntry({ status: "", statusAt: 30 }, { status: "Applied", statusAt: 20 }, true, NOW);
  assert.equal(m.local.status, "");
  assert.equal(m.remote.status, "");
  assert.equal(m.remoteChanged, true);
});

test("entries saved before sync existed (no times) still reach an account that lacks them", () => {
  const m = mergeEntry({ status: "Applied", notes: "old note" }, { status: "", notes: "", decision: "" }, true, NOW);
  assert.equal(m.local.status, "Applied");
  assert.equal(m.local.notes, "old note");
});

test("decisions travel with their date and text hash", () => {
  const m = mergeEntry({ decision: "", decisionAt: 0 }, { decision: "shortlist", decidedOn: "2026-10-20", textHash: "ab12", decisionAt: 9 }, true, NOW);
  assert.deepEqual([m.local.decision, m.local.decidedOn, m.local.textHash], ["shortlist", "2026-10-20", "ab12"]);
});

test("merging identical entries changes nothing", () => {
  const e = { status: "Applied", statusAt: 5, notes: "x", notesAt: 6, decision: "", name: "Alpha", state: "NY" };
  const m = mergeEntry(Object.assign({ notesSyncedAt: 6 }, e), e, true, NOW);
  assert.equal(m.localChanged, false);
  assert.equal(m.remoteChanged, false);
});

test("an untouched profile on a new device never overwrites the account", () => {
  const local = { available_from: "2027-07-01", us_citizen: true };
  const remote = { available_from: "2028-07-01", us_citizen: false };
  const m = mergeProfile(local, {}, remote, { available_from: 5, us_citizen: 5 }, true);
  assert.deepEqual(m.profile, remote);
  assert.equal(m.remoteChanged, false);
});

test("profile settings merge one at a time, newer wins", () => {
  const m = mergeProfile(
    { available_from: "2027-08-01", us_citizen: true }, { available_from: 30 },
    { available_from: "2027-07-01", us_citizen: false }, { available_from: 10, us_citizen: 20 }, true);
  assert.equal(m.profile.available_from, "2027-08-01");
  assert.equal(m.profile.us_citizen, false);
  assert.equal(m.localChanged, true);
  assert.equal(m.remoteChanged, true);
});

test("the first device to sign in seeds the account's profile", () => {
  const m = mergeProfile({ us_citizen: true }, {}, {}, {}, false);
  assert.deepEqual(m.profile, { us_citizen: true });
  assert.equal(m.remoteChanged, true);
});
