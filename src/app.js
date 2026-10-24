(function () {
  "use strict";
  const E = window.FEngine;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------------------------------------------------------------- storage (never required for the page to work)
  const mem = {};
  const store = {
    get(k) { try { const v = localStorage.getItem(k); if (v !== null) return v; } catch (e) { /* blocked */ } return k in mem ? mem[k] : null; },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } },
    getJSON(k) { try { const v = this.get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    setJSON(k, v) { this.set(k, JSON.stringify(v)); },
  };
  const K = { profile: "fdf.profile.v1", tracker: "fdf.tracker.v1", dataset: "fdf.dataset.v1", snapshot: "fdf.snapshot.v1", cols: "fdf.cols.v1" };

  // ---------------------------------------------------------------- constants
  const TIER_SHORT = { 1: "Due ≤ 30 days", 2: "Due 31–90 days", 3: "Due later", 4: "Rolling", 5: "Passed · projected", 6: "No date" };
  const BUCKET_CLASS = { "Eligible": "b-Eligible", "Likely eligible": "b-Likely", "Needs verification": "b-Needs", "Excluded": "b-Excluded" };
  const BUCKET_ORDER = { "Eligible": 0, "Likely eligible": 1, "Needs verification": 2, "Excluded": 3 };
  const STATUSES = ["", "Interested", "Started", "Applied", "Not Interested"];
  const STATUS_MIGRATE = { "Emailed": "Started", "Skip": "Not Interested" };
  const GROUP_LABEL = { shortlist: "Shortlist", verify: "Needs verification", excluded: "Excluded" };
  const ALL_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
  const TABS = [
    { id: "shortlist", label: "Shortlist" },
    { id: "verify", label: "Needs verification" },
    { id: "excluded", label: "Excluded" },
    { id: "changes", label: "What changed" },
    { id: "all", label: "All programs" },
  ];

  const SHORT_PAY = { "Paid - uncertain/conditional": "Paid · uncertain", "Paid - partial/limited": "Paid · partial", "Paid - limited positions": "Paid · limited",
    "Paid (per description)": "Paid", "Stipend mentioned (per description)": "Stipend mentioned", "Unpaid (some expenses/support covered)": "Unpaid · costs covered",
    "Unpaid (expenses covered)": "Unpaid · costs covered", "Unpaid (per description)": "Unpaid" };
  const shortPay = (l) => SHORT_PAY[l] || l;
  const fmtDate = (isoStr) => E.fmt(E.parseISO(isoStr));
  const trackerOf = (id) => S.tracker[id] || { status: "", notes: "" };
  function migrateTracker(t) {
    let changed = false;
    for (const id of Object.keys(t || {})) {
      const m = STATUS_MIGRATE[t[id].status];
      if (m) { t[id].status = m; changed = true; }
    }
    return changed;
  }
  function setTrack(id, patch) {
    const r = S.byId && S.byId[id];
    const next = Object.assign({ status: "", notes: "" }, S.tracker[id], patch);
    if (r) { next.name = r.program; next.state = r.state; }
    if (!next.decision) { delete next.decision; delete next.decidedOn; delete next.textHash; }
    if (!next.status && !next.notes && !next.decision) delete S.tracker[id]; else S.tracker[id] = next;
    store.setJSON(K.tracker, S.tracker);
  }
  const textHashOf = (r) => E.fnv([r.requirements, r.description, r.notes].join("\u0001"));

  // Column definitions. text() feeds filters and search; sort() feeds sorting.
  const COLS = [
    { key: "program", label: "Program", kind: "text", sticky: true, w: window.innerWidth < 640 ? 200 : 230, sort: (r) => r.program.toLowerCase() },
    { key: "state", label: "State", kind: "cat", w: 64 },
    { key: "tier", label: "Urgency", kind: "cat", w: 135, text: (r) => TIER_SHORT[r.tier], sort: (r) => r.tier },
    { key: "deadline", label: "Deadline", kind: "date", w: 120, text: (r) => r.deadline, sort: (r) => r.deadline || "9999" },
    { key: "days", label: "Days left", kind: "num", w: 90, text: (r) => (r.days == null ? "" : String(r.days)), sort: (r) => (r.days == null ? 1e9 : r.days) },
    { key: "bucket", label: "Eligibility", kind: "cat", w: 130, sort: (r) => BUCKET_ORDER[r.bucket] },
    { key: "payLabel", label: "Pay", kind: "cat", w: 160, sort: (r) => r.payRank },
    { key: "payDetail", label: "Pay details (as listed)", kind: "text", w: 260 },
    { key: "availability", label: "Availability", kind: "text", w: 190 },
    { key: "length", label: "Length", kind: "text", w: 130 },
    { key: "keyReq", label: "Key requirements", kind: "text", w: 340 },
    { key: "flags", label: "Flags", kind: "text", w: 300 },
    { key: "components", label: "Application components", kind: "text", w: 300 },
    { key: "skills", label: "Skills mentioned", kind: "text", w: 170 },
    { key: "apply", label: "Apply / website", kind: "text", w: 220 },
    { key: "contact", label: "Contact", kind: "text", w: 220 },
    { key: "director", label: "Director", kind: "text", w: 180 },
    { key: "location", label: "Location", kind: "cat", w: 160, sort: (r) => r.locRank },
    { key: "why", label: "Why placed here", kind: "text", w: 360 },
    { key: "deadlineSheet", label: "Deadline (as listed)", kind: "text", w: 220 },
    { key: "status", label: "Status", kind: "cat", w: 130, hideIn: ["verify"], text: (r) => trackerOf(r.id).status || "None", sort: (r) => STATUSES.indexOf(trackerOf(r.id).status) },
    { key: "decide", label: "Review", kind: "none", w: 160, only: ["verify"] },
    { key: "myNotes", label: "My notes", kind: "text", w: 220, text: (r) => trackerOf(r.id).notes },
  ];
  const COLMAP = Object.fromEntries(COLS.map((c) => [c.key, c]));
  const colText = (r, c) => (c.text ? c.text(r) : String(r[c.key] == null ? "" : r[c.key]));
  const DEFAULT_COLS = {
    shortlist: ["program", "state", "tier", "deadline", "bucket", "payLabel", "status"],
    verify: ["program", "state", "tier", "deadline", "why", "payLabel", "decide"],
    excluded: ["program", "state", "why", "payLabel", "deadlineSheet"],
    all: ["program", "state", "bucket", "tier", "deadline", "payLabel", "status"],
  };

  // ---------------------------------------------------------------- state
  const S = {
    profile: Object.assign({}, E.DEFAULT_PROFILE, store.getJSON(K.profile) || {}),
    asOf: "",
    tracker: store.getJSON(K.tracker) || {}, byId: {},
    dataset: null, sheets: null, records: [], prepared: null, changes: null, changesMeta: null,
    tab: "shortlist", filters: {}, global: "", sort: {}, tierFilter: null, quick: { paid: false, east: false, hideNI: false },
    cols: Object.assign({}, DEFAULT_COLS, store.getJSON(K.cols) || {}), expanded: new Set(),
  };

  function todayUTC() {
    if (S.asOf) return E.parseISO(S.asOf);
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  // ---------------------------------------------------------------- feedback
  let toastTimer = null;
  function toast(msg, action) {
    const t = $("#toast");
    t.textContent = msg;
    if (action) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "undo"; b.textContent = action.label;
      b.onclick = () => { t.hidden = true; clearTimeout(toastTimer); action.run(); };
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 8000 : 3200);
  }
  function notice(msg, kind) {
    const n = $("#notice");
    if (!msg) { n.hidden = true; return; }
    n.className = "notice " + (kind || "info"); n.textContent = msg; n.hidden = false;
  }
  function copyText(text, okMsg, fallbackEl) {
    const fail = () => { if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); } toast("Copy was blocked. The text is selected; press Ctrl/Cmd+C."); };
    try {
      navigator.clipboard.writeText(text).then(() => toast(okMsg), fail);
    } catch (e) { fail(); }
  }
  function saveFile(name, text, mime) {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("Saved " + name + " (check your downloads)");
    } catch (e) { toast("Download is blocked here. Use Copy instead."); }
  }

  // ---------------------------------------------------------------- data loading
  // Date cells arrive as Date objects built at local midnight; read the local calendar day (rolling late-evening noise forward).
  function cellText(v) {
    if (v == null) return "";
    if (v instanceof Date) {
      let y = v.getFullYear(), m = v.getMonth(), d = v.getDate();
      if (v.getHours() >= 12) { const n = new Date(y, m, d + 1); y = n.getFullYear(); m = n.getMonth(); d = n.getDate(); }
      return `${m + 1}/${d}/${y}`;
    }
    return String(v);
  }
  function sheetsFromBuffer(buf) {
    const bytes = new Uint8Array(buf);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      if (typeof XLSX === "undefined") throw new Error("The spreadsheet reader could not load (no connection to the library host). Export the sheet as CSV and upload that instead.");
      const wb = XLSX.read(buf, { type: "array", cellDates: true, dateNF: "m/d/yyyy" });
      const out = {};
      for (const name of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "", blankrows: false });
        out[name] = rows.map((r) => r.map(cellText));
      }
      return out;
    }
    return E.parseTextSheets(new TextDecoder("utf-8").decode(buf));
  }

  function setDataset(ds, opts) {
    opts = opts || {};
    const sheets = { [ds.sheetName]: ds.rows };
    const prepared = E.prepareRows(sheets, ds.sheetName);
    S.dataset = ds; S.sheets = sheets; S.prepared = prepared;
    const hash = E.fnv(JSON.stringify(ds.rows));
    const cur = E.snapshot(prepared.rows);
    const prev = store.getJSON(K.snapshot);
    if (!prev) {
      S.changes = null; S.changesMeta = { baseline: true, runDate: ds.loadedAt };
      store.setJSON(K.snapshot, { hash, runDate: ds.loadedAt, programs: cur, changes: null, prevRunDate: null });
    } else if (prev.hash === hash) {
      S.changes = prev.changes || null; S.changesMeta = { baseline: !prev.prevRunDate, runDate: prev.runDate, prevRunDate: prev.prevRunDate };
    } else {
      const changes = E.diff(prev.programs, cur);
      S.changes = changes; S.changesMeta = { baseline: false, runDate: ds.loadedAt, prevRunDate: prev.runDate };
      store.setJSON(K.snapshot, { hash, runDate: ds.loadedAt, programs: cur, changes, prevRunDate: prev.runDate });
    }
    if (opts.persist) store.setJSON(K.dataset, ds);
    recompute();
  }

  // Your Needs-verification decisions sit on top of the rule engine: the engine's answer is kept (origBucket/origWhy) and r.group is where the row shows.
  function applyDecisions() {
    for (const r of S.records) {
      if (r.origWhy === undefined) { r.origBucket = r.bucket; r.origWhy = r.why; }
      r.why = r.origWhy; r.decision = ""; r.changedSince = false;
      r.group = r.bucket === "Excluded" ? "excluded" : r.bucket === "Needs verification" ? "verify" : "shortlist";
      const t = S.tracker[r.id];
      if (r.bucket === "Needs verification" && t && (t.decision === "shortlist" || t.decision === "excluded")) {
        r.group = t.decision; r.decision = t.decision;
        r.changedSince = !!t.textHash && t.textHash !== textHashOf(r);
        r.why = `You moved this to ${GROUP_LABEL[t.decision]}${t.decidedOn ? " on " + fmtDate(t.decidedOn) : ""}.` +
          (r.changedSince ? " The program’s requirements or description have changed since then, so recheck it." : "") +
          (r.origWhy ? ` Original reason it needed verification: ${r.origWhy.replace(/^Needs verification:\s*/i, "")}` : "");
      }
    }
  }

  function setDecision(id, group) {
    const r = S.byId[id]; if (!r) return;
    if (group) setTrack(id, { decision: group, decidedOn: E.iso(todayUTC()), textHash: textHashOf(r) });
    else setTrack(id, { decision: "" });
    applyDecisions();
    renderTabs(); renderOrphans(); renderBody(); refreshFilterOptions();
    if (group) toast(`Moved “${r.program}” to ${GROUP_LABEL[group]}.`, { label: "Undo", run: () => setDecision(id, "") });
    else toast(`Moved “${r.program}” back to Needs verification.`);
  }

  function recompute() {
    try {
      const res = E.run(S.sheets, S.profile, todayUTC(), S.dataset.sheetName);
      S.records = res.records;
      S.records.forEach((r, i) => { r._i = i; });
      S.byId = Object.fromEntries(S.records.map((r) => [r.id, r]));
      applyDecisions();
      S.warnings = res.warnings;
    } catch (e) { notice("Could not analyze this file: " + e.message, "err"); return; }
    renderAll();
  }

  async function handleFile(file) {
    if (!file) return;
    notice("Reading " + file.name + "…", "info");
    try {
      const buf = await file.arrayBuffer();
      const sheets = sheetsFromBuffer(buf);
      const name = E.chooseSheet(sheets);
      const now = new Date();
      const ds = { label: file.name, sheetName: name, rows: sheets[name], loadedAt: E.iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))), example: false };
      setDataset(ds, { persist: true });
      notice("");
      toast(`Analyzed ${S.records.length} programs from "${name}"`);
      S.tab = "shortlist"; renderAll();
    } catch (e) {
      notice("Could not read that file. " + e.message, "err");
    }
  }

  // ---------------------------------------------------------------- filtering / sorting
  function tabRecords(tab) {
    const rs = S.records;
    if (tab === "shortlist" || tab === "verify" || tab === "excluded") return rs.filter((r) => r.group === tab);
    return rs;
  }
  const filtersFor = (tab) => (S.filters[tab] = S.filters[tab] || {});

  function numMatch(q, v) {
    q = q.trim();
    if (!q) return true;
    if (v === "" || v == null) return false;
    const m = q.match(/^(<=|>=|<|>|=)?\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return String(v).includes(q);
    const n = parseFloat(m[2]), x = parseFloat(v), op = m[1] || "=";
    return op === "<" ? x < n : op === ">" ? x > n : op === "<=" ? x <= n : op === ">=" ? x >= n : x === n;
  }

  function visibleRows(tab) {
    let rows = tabRecords(tab);
    if (S.tierFilter != null && tab !== "excluded") rows = rows.filter((r) => r.tier === S.tierFilter);
    if (S.quick.paid) rows = rows.filter((r) => r.payLabel.startsWith("Paid") || r.payLabel.startsWith("Stipend"));
    if (S.quick.east) rows = rows.filter((r) => r.location === "East Coast");
    if (S.quick.hideNI) rows = rows.filter((r) => trackerOf(r.id).status !== "Not Interested");
    const g = S.global.trim().toLowerCase();
    if (g) {
      rows = rows.filter((r) => {
        const hay = [r.program, r.state, r.director, r.keyReq, r.flags, r.components, r.contact, r.apply, r.payDetail, r.why, r.requirements, r.description, r.notes, r.skills, trackerOf(r.id).notes, trackerOf(r.id).status]
          .join(" \n ").toLowerCase();
        return g.split(/\s+/).every((w) => hay.includes(w));
      });
    }
    const f = filtersFor(tab);
    for (const [key, q] of Object.entries(f)) {
      if (!q) continue;
      const c = COLMAP[key];
      rows = rows.filter((r) => {
        const v = colText(r, c);
        if (c.kind === "cat") return v === q;
        if (c.kind === "num") return numMatch(q, v);
        return v.toLowerCase().includes(q.toLowerCase());
      });
    }
    const s = S.sort[tab];
    if (s) {
      const c = COLMAP[s.key];
      const val = (r) => (c.sort ? c.sort(r) : colText(r, c).toLowerCase());
      rows = rows.slice().sort((a, b) => {
        const x = val(a), y = val(b);
        const emptyX = x === "" || x == null, emptyY = y === "" || y == null;
        if (emptyX !== emptyY) return emptyX ? 1 : -1;
        const cmp = x < y ? -1 : x > y ? 1 : 0;
        return cmp ? cmp * s.dir : a._i - b._i;
      });
    } else if (tab === "excluded") {
      rows = rows.slice().sort((a, b) => a.why.localeCompare(b.why) || a.program.localeCompare(b.program));
    }
    return rows;
  }

  // ---------------------------------------------------------------- rendering
  function renderAll() {
    const has = !!S.dataset;
    for (const id of ["tabs", "chips", "tools", "frame", "legend"]) $("#" + id).hidden = !has;
    $("#emptyState").hidden = has;
    renderSource();
    if (!has) return;
    renderTabs(); renderChips(); renderToolsVisibility(); renderTable(); renderLegend(); renderOrphans();
  }

  function renderSource() {
    const ds = S.dataset;
    if (!ds) { $("#sourceLine").textContent = "No file loaded yet. Upload the fellowship spreadsheet to build your report."; return; }
    const n = S.records.length;
    const when = fmtDate(ds.loadedAt);
    const intro = `Analyzing <b>${esc(ds.label)}</b> (${n} programs from “${esc(ds.sheetName)}”, loaded ${when}).`;
    const s = S.profile;
    const step = { not_taken: "Step 3 not taken", planned: "Step 3 planned", passed: "Step 3 passed" }[s.step3_status];
    $("#sourceLine").innerHTML = `${intro} Filtered for a US ${s.us_citizen ? "citizen" : "applicant"} available ${fmtDate(s.available_from)}, ${step}. Deadlines are measured from ${fmtDate(E.iso(todayUTC()))}.`;
  }

  function renderTabs() {
    const counts = { shortlist: tabRecords("shortlist").length, verify: tabRecords("verify").length, excluded: tabRecords("excluded").length, all: S.records.length, changes: S.changes ? S.changes.length : "–" };
    $("#tabs").innerHTML = TABS.map((t) =>
      `<button class="tab" role="tab" id="tab-${t.id}" data-tab="${t.id}" aria-selected="${S.tab === t.id}">${t.label}<span class="n">${counts[t.id]}</span></button>`).join("");
  }

  function renderChips() {
    const box = $("#chips");
    renderStatusChips();
    if (S.tab === "changes" || S.tab === "excluded") { box.innerHTML = ""; box.hidden = true; return; }
    box.hidden = false;
    const rows = tabRecords(S.tab);
    const counts = {};
    rows.forEach((r) => { counts[r.tier] = (counts[r.tier] || 0) + 1; });
    let h = Object.keys(TIER_SHORT).map(Number).filter((t) => counts[t])
      .map((t) => `<button class="chip t${t}" style="--c:var(--t${t})" data-tier="${t}" aria-pressed="${S.tierFilter === t}">${TIER_SHORT[t]}<span class="n">${counts[t]}</span></button>`).join("");
    h += `<span class="sep"></span>`;
    h += `<button class="chip plain" data-quick="paid" aria-pressed="${S.quick.paid}">Paid only</button>`;
    h += `<button class="chip plain" data-quick="east" aria-pressed="${S.quick.east}">East Coast only</button>`;
    h += `<button class="chip plain" data-quick="hideNI" aria-pressed="${S.quick.hideNI}">Hide “Not Interested”</button>`;
    box.innerHTML = h;
  }

  function statusCounts(tab) {
    const counts = {};
    tabRecords(tab).forEach((r) => { const s = trackerOf(r.id).status || ""; counts[s] = (counts[s] || 0) + 1; });
    return counts;
  }
  function renderStatusChips() {
    const box = $("#statusChips");
    if (!S.dataset || S.tab === "changes" || S.tab === "verify") { box.innerHTML = ""; box.hidden = true; return; }
    const counts = statusCounts(S.tab);
    const shown = STATUSES.filter((s) => s && counts[s] > 0);
    if (!shown.length) { box.innerHTML = ""; box.hidden = true; return; }
    const cur = filtersFor(S.tab).status;
    box.innerHTML = `<span class="lbl dim" style="font-size:12px">Status</span>` + shown.map((s) =>
      `<button class="chip plain" data-stat="${esc(s)}" aria-pressed="${cur === s}">${esc(s)}<span class="n">${counts[s]}</span></button>`).join("");
    box.hidden = false;
  }

  // Orphans: saved statuses, notes or decisions whose program no longer exists in the loaded file (usually a renamed or deleted row).
  function orphanList() {
    if (!S.dataset) return [];
    return Object.keys(S.tracker).filter((id) => !S.byId[id] && (S.tracker[id].status || S.tracker[id].notes || S.tracker[id].decision));
  }
  function renderOrphans() {
    const n = orphanList().length, bar = $("#orphanBar");
    bar.hidden = !n;
    if (n) $("#orphanText").textContent = `${n} saved ${n === 1 ? "entry doesn’t" : "entries don’t"} match any program in this file (renamed or removed rows). Your status and notes are still saved.`;
  }
  const idTokens = (id) => new Set(String(id).split("-").filter((w) => w.length > 2));
  function bestMatch(id) {
    const a = idTokens(id); let best = null, score = 0;
    for (const r of S.records) {
      const b = idTokens(r.id); let inter = 0;
      a.forEach((w) => { if (b.has(w)) inter++; });
      const j = inter / (a.size + b.size - inter || 1);
      if (j > score) { score = j; best = r.id; }
    }
    return score >= 0.5 ? best : "";
  }
  function openOrphans() {
    const ids = orphanList();
    if (!ids.length) { closeModal(); renderOrphans(); return; }
    const opts = S.records.slice().sort((a, b) => a.program.localeCompare(b.program));
    const decTxt = { shortlist: "moved to Shortlist", excluded: "moved to Excluded" };
    openModal(`Saved entries with no matching program (${ids.length})`,
      `<p class="hint" style="margin:0">These were saved against a program that is not in the current file, usually because someone edited its name or director in the sheet. Attach each one to the program it became, or delete it. Leaving them alone is fine; they stay saved.</p>` +
      ids.map((id) => {
        const t = S.tracker[id], guess = bestMatch(id);
        const bits = [t.status && "Status: " + t.status, t.decision && "Your decision: " + decTxt[t.decision]].filter(Boolean).join(" · ");
        return `<div class="orphan-item" data-orphan="${esc(id)}"><div><b>${esc(t.name || id)}</b>${t.state ? ` <span class="dim">${esc(t.state)}</span>` : ""}</div>
          <div class="meta">${esc(bits) || "No status"}${t.notes ? " · Note: " + esc(t.notes.slice(0, 160)) : ""}</div>
          <div class="acts"><select aria-label="Program to attach to"><option value="">Attach to…</option>${opts.map((r) => `<option value="${esc(r.id)}" ${r.id === guess ? "selected" : ""}>${esc(r.program)} (${esc(r.state)})</option>`).join("")}</select>
          <button class="btn small" data-orph-attach type="button">Attach</button><button class="btn small" data-orph-del type="button">Delete</button></div></div>`;
      }).join(""));
  }
  function orphanAttach(id, to) {
    const o = S.tracker[id], cur = S.tracker[to] || {};
    // The entry already on the target wins field by field; notes from both are kept.
    const notes = [cur.notes, o.notes].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join("\n\n");
    const merged = { status: cur.status || o.status || "", notes, decision: cur.decision || o.decision || "" };
    if (merged.decision) { merged.decidedOn = cur.decision ? cur.decidedOn : o.decidedOn; merged.textHash = cur.decision ? cur.textHash : o.textHash; }
    delete S.tracker[id];
    setTrack(to, merged);
  }

  function renderToolsVisibility() {
    $("#tools").hidden = S.tab === "changes";
    $("#frame").hidden = false;
  }

  const colAllowed = (c, tab) => (!c.only || c.only.includes(tab)) && (!c.hideIn || !c.hideIn.includes(tab));
  function colsForTab() {
    const list = (S.cols[S.tab] || DEFAULT_COLS.all).slice();
    if (S.tab === "verify" && !list.includes("decide")) list.push("decide");
    return COLS.filter((c) => list.includes(c.key) && colAllowed(c, S.tab));
  }

  function renderTable() {
    if (S.tab === "changes") { renderChanges(); return; }
    renderHead(); renderBody();
  }

  // Options for a category filter. Status always lists every status with its count, so new choices show up without a reload.
  function optionsFor(c, f) {
    const rowsAll = tabRecords(S.tab), sel = f[c.key] || "";
    let items;
    if (c.key === "status") {
      const counts = statusCounts(S.tab);
      items = ["None", ...STATUSES.filter(Boolean)].map((v) => ({ v, label: `${v} (${counts[v === "None" ? "" : v] || 0})` }));
    } else {
      items = [...new Set(rowsAll.map((r) => colText(r, c)).filter((v) => v !== ""))].sort((a, b) => a.localeCompare(b)).map((v) => ({ v, label: v }));
      if (sel && !items.some((i) => i.v === sel)) items.push({ v: sel, label: sel });
    }
    return `<option value="">All</option>` + items.map((i) => `<option value="${esc(i.v)}" ${sel === i.v ? "selected" : ""}>${esc(i.label)}</option>`).join("");
  }
  function refreshFilterOptions() {
    const f = filtersFor(S.tab);
    document.querySelectorAll("#tbl select.flt").forEach((el) => {
      const c = COLMAP[el.dataset.flt]; if (c) el.innerHTML = optionsFor(c, f);
    });
  }

  function renderHead() {
    const cols = colsForTab();
    const f = filtersFor(S.tab);
    const s = S.sort[S.tab];
    const tbl = $("#tbl");
    tbl.classList.add("fixed");
    tbl.style.width = cols.reduce((n, c) => n + c.w, 0) + "px";
    let h = "<colgroup>" + cols.map((c) => `<col style="width:${c.w}px">`).join("") + "</colgroup><thead><tr>";
    for (const c of cols) {
      const arrow = s && s.key === c.key ? (s.dir === 1 ? "▲" : "▼") : "";
      h += `<th class="${c.sticky ? "sticky" : ""}" style="min-width:${c.w}px" aria-sort="${s && s.key === c.key ? (s.dir === 1 ? "ascending" : "descending") : "none"}"><button class="th-btn" data-sort="${c.key}" type="button">${esc(c.label)}<span class="arr">${arrow}</span></button></th>`;
    }
    h += `</tr><tr class="filters">`;
    for (const c of cols) {
      let inner = "";
      if (c.kind === "none") {
        inner = "";
      } else if (c.kind === "cat") {
        inner = `<select class="flt" data-flt="${c.key}" aria-label="Filter ${esc(c.label)}">${optionsFor(c, f)}</select>`;
      } else {
        const ph = c.kind === "num" ? "e.g. <60" : c.kind === "date" ? "e.g. 2027-03" : "contains…";
        inner = `<input class="flt" data-flt="${c.key}" placeholder="${ph}" value="${esc(f[c.key] || "")}" aria-label="Filter ${esc(c.label)}">`;
      }
      h += `<th class="${c.sticky ? "sticky" : ""}">${inner}</th>`;
    }
    h += "</tr></thead><tbody id=\"tbody\"></tbody>";
    $("#tbl").innerHTML = h;
  }

  function linkify(v) {
    if (/^(https?:\/\/|www\.)/i.test(v)) {
      const href = /^www\./i.test(v) ? "https://" + v : v;
      let label = v.replace(/^https?:\/\/(www\.)?/i, "");
      if (label.length > 38) label = label.slice(0, 37) + "…";
      return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    }
    return esc(v);
  }

  function cell(r, c) {
    switch (c.key) {
      case "program": {
        const open = S.expanded.has(r.id);
        return `<div class="pname"><button class="tog" data-exp="${esc(r.id)}" aria-expanded="${open}" aria-label="Show details for ${esc(r.program)}" type="button">${open ? "−" : "+"}</button><span class="t">${esc(r.program)}${r.director ? `<span class="s">${esc(r.director.slice(0, 70))}</span>` : ""}</span></div>`;
      }
      case "tier": return `<span class="pill t${r.tier}">${TIER_SHORT[r.tier]}</span>`;
      case "deadline":
        if (r.deadline) return `<span class="mono">${fmtDate(r.deadline)}</span>${r.projected ? ' <span class="dim">(projected)</span>' : ""}`;
        return '<span class="dim">—</span>';
      case "days": return r.days == null ? '<span class="dim">—</span>' : `<span class="mono">${r.projected ? "~" : ""}${r.days}</span>`;
      case "payLabel": return `<span class="pill p${r.payRank}" title="${esc(r.payLabel)}">${esc(shortPay(r.payLabel))}</span>`;
      case "apply": return r.apply ? `<div class="clamp">${linkify(r.apply)}</div>` : '<span class="dim">—</span>';
      case "decide":
        return `<div class="decide"><button class="btn small" type="button" data-decide="shortlist" data-id="${esc(r.id)}">Move to shortlist</button><button class="btn small" type="button" data-decide="excluded" data-id="${esc(r.id)}">Move to excluded</button></div>`;
      case "bucket":
        return `<span class="pill ${BUCKET_CLASS[r.bucket]}">${r.bucket}</span>` + (r.decision ? ` <span class="pill moved" title="You moved this out of Needs verification">Moved by you</span>` : "");
      case "status": {
        const cur = trackerOf(r.id).status;
        return `<select class="st ${cur ? "on" : ""}" data-track-status="${esc(r.id)}" aria-label="Status for ${esc(r.program)}">${STATUSES.map((s) => `<option value="${s}" ${s === cur ? "selected" : ""}>${s || "None"}</option>`).join("")}</select>`;
      }
      case "myNotes": return `<div class="clamp">${esc(trackerOf(r.id).notes)}</div>`;
      case "state": return `<span class="mono">${esc(r[c.key])}</span>`;
      default: {
        const v = colText(r, c);
        return v ? `<div class="clamp">${esc(v)}</div>` : '<span class="dim">—</span>';
      }
    }
  }

  function detail(r, ncols) {
    const t = trackerOf(r.id);
    const sec = (h, body, wide) => (body ? `<div class="${wide ? "wide" : ""}"><h3>${h}</h3><p>${body}</p></div>` : "");
    const links = r.links.length ? `<div class="linklist">${r.links.map((l) => linkify(l)).join("")}</div>` : "";
    const moved = r.decision ? `<span class="pill moved">Moved by you to ${GROUP_LABEL[r.decision]}</span> ${r.changedSince ? '<span class="pill warn">Program text changed since</span> ' : ""}<button class="btn small" type="button" data-undo="${esc(r.id)}">Move back to Needs verification</button><br>` : "";
    return `<tr class="detail"><td colspan="${ncols}"><div class="dgrid">
      ${sec("Why it is in this group", moved + `<span class="pill ${BUCKET_CLASS[r.bucket]}">${r.bucket}</span> ${esc(r.why || "No exclusion or verification flags. " + (r.bucket === "Eligible" ? "Text or columns explicitly accept graduates / post-PGY-1 MDs." : "Nothing in the text rules you out."))}`)}
      ${sec("Deadline", esc(r.deadlineNote) + (r.deadlineSheet ? `\nAs listed: ${esc(r.deadlineSheet)}` : ""))}
      ${sec("Pay", `<span class="pill p${r.payRank}">${esc(r.payLabel)}</span>\n${esc(r.payDetail)}`)}
      ${sec("Availability", esc(r.availability) + (r.availabilityRaw ? `\nAs listed: ${esc(r.availabilityRaw)}` : ""))}
      ${sec("Key requirements", esc(r.keyReq))}
      ${sec("Flags", esc(r.flags))}
      ${sec("Application components", esc(r.components))}
      ${sec("Skills mentioned (information only)", esc(r.skills))}
      ${sec("Contact", esc(r.contact))}
      ${links ? `<div><h3>Links</h3>${links}</div>` : ""}
      ${sec("Requirements (as listed)", esc(r.requirements), true)}
      ${sec("Description", esc(r.description), true)}
      ${sec("Notes (as listed)", esc(r.notes), true)}
      <div class="wide"><h3>My notes</h3><textarea data-track-notes="${esc(r.id)}" aria-label="My notes for ${esc(r.program)}" placeholder="Who you emailed, what they said, next step…">${esc(t.notes)}</textarea></div>
    </div></td></tr>`;
  }

  function renderBody() {
    const cols = colsForTab();
    const rows = visibleRows(S.tab);
    const total = tabRecords(S.tab).length;
    $("#count").textContent = `${rows.length} of ${total} shown`;
    const tb = $("#tbody");
    if (!rows.length) { tb.innerHTML = `<tr><td colspan="${cols.length}" class="empty">No programs match these filters.</td></tr>`; return; }
    let h = "";
    for (const r of rows) {
      const open = S.expanded.has(r.id);
      h += `<tr class="data ${open ? "open" : ""}">`;
      for (const c of cols) h += `<td class="${c.sticky ? "sticky" : ""}">${cell(r, c)}</td>`;
      h += "</tr>";
      if (open) h += detail(r, cols.length);
    }
    tb.innerHTML = h;
  }

  function renderChanges() {
    $("#count").textContent = "";
    const m = S.changesMeta || {};
    let body;
    if (!S.changes) {
      body = `<div class="empty">This is the first file loaded in this browser, so it is saved as the baseline.<br>Next time you upload an updated spreadsheet, programs that are new, changed or removed will be listed here.</div>`;
    } else if (!S.changes.length) {
      body = `<div class="empty">No differences between this file and the previous one${m.prevRunDate ? ` (loaded ${fmtDate(m.prevRunDate)})` : ""}.</div>`;
    } else {
      const byId = Object.fromEntries(S.records.map((r) => [r.id, r]));
      const order = { NEW: 0, CHANGED: 1, REMOVED: 2 };
      const rows = S.changes.slice().sort((a, b) => order[a.type] - order[b.type] || a.program.localeCompare(b.program));
      body = `<p class="legend" style="padding:10px 12px 0">Compared with the file loaded ${m.prevRunDate ? fmtDate(m.prevRunDate) : "earlier"}.</p><div class="frame" style="border:0;max-height:none"><table><thead><tr><th>Change</th><th>Program</th><th>Eligibility now</th><th>What changed</th></tr></thead><tbody>` +
        rows.map((c) => {
          const r = byId[c.id];
          const cls = c.type === "NEW" ? "t4" : c.type === "CHANGED" ? "t2" : "t6";
          return `<tr><td><span class="pill ${cls}">${c.type}</span></td><td><b>${esc(c.program)}</b></td><td>${r ? `<span class="pill ${BUCKET_CLASS[r.bucket]}">${r.bucket}</span>` : '<span class="dim">—</span>'}</td><td>${esc(c.details) || '<span class="dim">—</span>'}</td></tr>`;
        }).join("") + "</tbody></table></div>";
    }
    const tbl = $("#tbl");
    tbl.classList.remove("fixed"); tbl.style.width = "";
    tbl.innerHTML = `<tbody><tr><td style="padding:0">${body}</td></tr></tbody>`;
  }

  function renderLegend() {
    const L = {
      shortlist: "Ordered by deadline urgency, then pay (paid first), then location (East Coast first). Eligible means the sheet’s text or columns explicitly accept graduates; Likely eligible means nothing rules you out. The sheet is crowdsourced, so confirm every requirement, pay figure and date on the program’s own page.",
      verify: "Each row says why it is here. Ambiguous wording, an immediate-start request, a license or degree prerequisite, or wording that suggests students only. Ask the program before ruling them in or out.",
      excluded: "Every program removed, with the phrase that triggered it. If one of these looks wrong, tell Claude the program name and the rule will be tightened.",
      all: "Every program read from the sheet, in the order of the shortlist rules.",
      changes: "Changes are measured against the previously loaded file saved in this browser.",
    };
    $("#legend").textContent = L[S.tab] || "";
  }

  // ---------------------------------------------------------------- settings
  function renderSettings() {
    const p = S.profile;
    $("#settingsFields").innerHTML = `
      <div class="field"><label for="s-step3">USMLE Step 3</label><select id="s-step3"><option value="not_taken">Not taken yet</option><option value="planned">Planned before start</option><option value="passed">Passed</option></select></div>
      <div class="field"><label for="s-avail">Available from</label><input type="date" id="s-avail"></div>
      <div class="field"><label for="s-asof">Measure deadlines from</label><input type="date" id="s-asof" title="Leave blank for today"></div>
      <div class="field"><span class="lbl">Eligibility</span>
        <label class="check"><input type="checkbox" id="s-citizen"> US citizen</label>
        <label class="check"><input type="checkbox" id="s-two"> Two-year positions are acceptable</label>
        <label class="check"><input type="checkbox" id="s-remote"> Remote or hybrid ranks like East Coast</label></div>`;
    $("#s-step3").value = p.step3_status; $("#s-avail").value = p.available_from; $("#s-asof").value = S.asOf;
    $("#s-citizen").checked = !!p.us_citizen; $("#s-two").checked = !!p.two_year_ok; $("#s-remote").checked = !!p.remote_bonus;
    $("#stateChips").innerHTML = ALL_STATES.map((st) => `<button type="button" data-state="${st}" aria-pressed="${p.east_coast_states.includes(st)}">${st}</button>`).join("");
  }
  function saveProfile() { store.setJSON(K.profile, S.profile); if (S.dataset) recompute(); }

  // ---------------------------------------------------------------- modal
  function openModal(title, html) {
    $("#mTitle").textContent = title; $("#mBody").innerHTML = html; $("#modal").hidden = false;
  }
  const closeModal = () => { $("#modal").hidden = true; };

  function csvEscape(v) { v = String(v == null ? "" : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function buildCSV(rows) {
    const head = ["Program", "State", "Director", "Eligibility (rule engine)", "Your decision", "Group (after your decisions)", "Why placed here", "Urgency", "Deadline (next/projected)", "Deadline projected?", "Days left", "Deadline detail", "Deadline (as listed)", "Pay", "Pay details", "Availability", "Length", "Key requirements", "Flags", "Application components", "Skills mentioned", "Apply / website", "Contact", "Location", "Status", "My notes", "ID"];
    const lines = [head.map(csvEscape).join(",")];
    for (const r of rows) {
      const t = trackerOf(r.id);
      lines.push([r.program, r.state, r.director, r.origBucket || r.bucket, r.decision ? "Moved to " + GROUP_LABEL[r.decision] : "", GROUP_LABEL[r.group] || "", r.why, TIER_SHORT[r.tier], r.deadline, r.projected ? "yes" : "", r.days == null ? "" : r.days, r.deadlineNote, r.deadlineSheet, r.payLabel, r.payDetail, r.availability, r.length, r.keyReq, r.flags, r.components, r.skills, r.apply, r.contact, r.location, t.status, t.notes, r.id].map(csvEscape).join(","));
    }
    return lines.join("\n");
  }
  function exportView() {
    const rows = visibleRows(S.tab === "changes" ? "all" : S.tab);
    const csv = buildCSV(rows);
    openModal(`Export ${rows.length} rows`, `<p class="hint" style="margin:0 0 8px">Exports the rows currently shown, with every column. Open the file in Excel or Google Sheets.</p>
      <div class="row-actions" style="margin:0 0 8px"><button class="btn primary" id="csvDl" type="button">Download CSV</button><button class="btn" id="csvCopy" type="button">Copy CSV text</button></div>
      <textarea id="csvText" readonly aria-label="CSV text"></textarea>`);
    $("#csvText").value = csv;
    $("#csvDl").onclick = () => saveFile(`fellowships-${S.tab}-${E.iso(todayUTC())}.csv`, csv, "text/csv;charset=utf-8");
    $("#csvCopy").onclick = () => copyText(csv, "CSV copied", $("#csvText"));
  }

  function backupPayload() {
    return JSON.stringify({ app: "derm-fellowship-finder", version: 1, savedAt: new Date().toISOString(), profile: S.profile, tracker: S.tracker, snapshot: store.getJSON(K.snapshot), dataset: S.dataset || null });
  }
  function openBackup() {
    const n = Object.values(S.tracker).filter((t) => t.status || t.notes || t.decision).length;
    openModal("Backup & restore", `<p class="hint" style="margin:0">Your profile settings, application tracker (${n} program${n === 1 ? "" : "s"} with a status, note or decision), last loaded file and change history live only in this browser. Back them up before clearing browser data or switching devices.</p>
      <div class="sec"><div class="row-actions" style="margin:0"><button class="btn primary" id="bkDl" type="button">Download backup file</button><button class="btn" id="bkCopy" type="button">Copy backup text</button></div><textarea id="bkText" readonly aria-label="Backup text"></textarea></div>
      <div class="sec"><strong>Clear saved file</strong><p class="hint" style="margin:0">Removes the last loaded spreadsheet and the change history from this browser. Your tracker statuses and notes are kept.</p><div class="row-actions" style="margin:0"><button class="btn" id="clrBtn" type="button">Clear saved file and change history</button></div></div>
      <div class="sec"><strong>Restore</strong><input type="file" id="bkFile" accept=".json,application/json" aria-label="Backup file"><textarea id="bkPaste" placeholder="Or paste backup text here" aria-label="Paste backup text"></textarea><div class="row-actions" style="margin:0"><button class="btn" id="bkRestore" type="button">Restore from backup</button></div></div>`);
    const payload = backupPayload();
    $("#bkText").value = payload;
    $("#bkDl").onclick = () => saveFile(`fellowship-finder-backup-${E.iso(todayUTC())}.json`, payload, "application/json");
    $("#bkCopy").onclick = () => copyText(payload, "Backup copied", $("#bkText"));
    $("#clrBtn").onclick = () => {
      const b = $("#clrBtn");
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Click again to confirm"; return; }
      store.set(K.dataset, ""); store.set(K.snapshot, "");
      S.dataset = null; S.sheets = null; S.records = []; S.changes = null; S.changesMeta = null; S.tab = "shortlist";
      closeModal(); renderAll(); toast("Saved file cleared");
    };
    const doRestore = (text) => {
      try {
        const d = JSON.parse(text);
        if (d.app !== "derm-fellowship-finder") throw new Error("This is not a backup from this tool.");
        if (d.profile) { S.profile = Object.assign({}, E.DEFAULT_PROFILE, d.profile); store.setJSON(K.profile, S.profile); }
        if (d.tracker) { S.tracker = d.tracker; migrateTracker(S.tracker); store.setJSON(K.tracker, S.tracker); }
        if (d.snapshot) store.setJSON(K.snapshot, d.snapshot);
        if (d.dataset) { store.setJSON(K.dataset, d.dataset); setDataset(d.dataset, { persist: false }); } else if (S.dataset) recompute();
        renderSettings(); closeModal(); toast("Backup restored");
      } catch (e) { toast("Could not restore: " + e.message); }
    };
    $("#bkFile").onchange = (ev) => { const f = ev.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => doRestore(String(fr.result)); fr.readAsText(f); };
    $("#bkRestore").onclick = () => { const t = $("#bkPaste").value.trim(); if (t) doRestore(t); else toast("Choose a backup file or paste its text first."); };
  }

  // ---------------------------------------------------------------- events
  function wire() {
    $("#uploadBtn").onclick = () => $("#fileInput").click();
    $("#emptyUpload").onclick = () => $("#fileInput").click();
    $("#fileInput").onchange = (e) => { handleFile(e.target.files[0]); e.target.value = ""; };
    $("#settingsBtn").onclick = () => {
      const p = $("#settingsPanel"); p.hidden = !p.hidden; $("#settingsBtn").setAttribute("aria-expanded", String(!p.hidden));
    };
    $("#closeSettings").onclick = () => { $("#settingsPanel").hidden = true; $("#settingsBtn").setAttribute("aria-expanded", "false"); };
    $("#resetProfile").onclick = () => { S.profile = Object.assign({}, E.DEFAULT_PROFILE, { east_coast_states: E.EAST.slice() }); S.asOf = ""; renderSettings(); saveProfile(); toast("Profile reset"); };
    $("#backupBtn").onclick = openBackup;
    $("#mClose").onclick = closeModal;
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); $("#colsPop").hidden = true; } });

    $("#settingsFields").addEventListener("change", (e) => {
      const id = e.target.id, p = S.profile;
      if (id === "s-step3") p.step3_status = e.target.value;
      else if (id === "s-avail" && e.target.value) p.available_from = e.target.value;
      else if (id === "s-asof") S.asOf = e.target.value;
      else if (id === "s-citizen") p.us_citizen = e.target.checked;
      else if (id === "s-two") p.two_year_ok = e.target.checked;
      else if (id === "s-remote") p.remote_bonus = e.target.checked;
      saveProfile();
    });
    $("#stateChips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-state]"); if (!b) return;
      const st = b.dataset.state, list = S.profile.east_coast_states;
      const i = list.indexOf(st);
      if (i >= 0) list.splice(i, 1); else list.push(st);
      b.setAttribute("aria-pressed", String(i < 0)); saveProfile();
    });

    $("#tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]"); if (!b) return;
      S.tab = b.dataset.tab; S.tierFilter = null; renderTabs(); renderChips(); renderToolsVisibility(); renderTable(); renderLegend(); buildColsMenu();
    });
    $("#chips").addEventListener("click", (e) => {
      const t = e.target.closest("[data-tier]"), q = e.target.closest("[data-quick]");
      if (t) { const n = Number(t.dataset.tier); S.tierFilter = S.tierFilter === n ? null : n; }
      else if (q) S.quick[q.dataset.quick] = !S.quick[q.dataset.quick];
      else return;
      renderChips(); renderBody();
    });
    $("#globalSearch").addEventListener("input", (e) => { S.global = e.target.value; if (S.tab !== "changes") renderBody(); });
    $("#clearBtn").onclick = () => {
      S.filters[S.tab] = {}; S.sort[S.tab] = null; S.global = ""; S.tierFilter = null; S.quick = { paid: false, east: false, hideNI: false };
      $("#globalSearch").value = ""; renderChips(); renderTable();
    };
    $("#exportBtn").onclick = exportView;
    $("#orphanBtn").onclick = openOrphans;
    $("#mBody").addEventListener("click", (e) => {
      const item = e.target.closest("[data-orphan]"); if (!item) return;
      const id = item.dataset.orphan;
      if (e.target.closest("[data-orph-attach]")) {
        const to = item.querySelector("select").value;
        if (!to) { toast("Choose the program to attach this to first."); return; }
        orphanAttach(id, to); applyDecisions(); renderAll(); openOrphans(); toast("Attached to " + S.byId[to].program);
      } else if (e.target.closest("[data-orph-del]")) {
        const b = e.target.closest("[data-orph-del]");
        if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Click again to delete"; return; }
        delete S.tracker[id]; store.setJSON(K.tracker, S.tracker); renderOrphans(); openOrphans(); toast("Deleted");
      }
    });
    $("#statusChips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-stat]"); if (!b) return;
      const f = filtersFor(S.tab);
      f.status = f.status === b.dataset.stat ? "" : b.dataset.stat;
      renderStatusChips(); refreshFilterOptions(); renderBody();
    });

    $("#frame").addEventListener("scroll", (e) => { e.currentTarget.classList.toggle("scrolled", e.currentTarget.scrollLeft > 0); }, { passive: true });
    const tbl = $("#tbl");
    tbl.addEventListener("click", (e) => {
      const sb = e.target.closest("[data-sort]");
      if (sb) {
        const key = sb.dataset.sort, cur = S.sort[S.tab];
        S.sort[S.tab] = !cur || cur.key !== key ? { key, dir: 1 } : cur.dir === 1 ? { key, dir: -1 } : null;
        renderHead(); renderBody(); return;
      }
      const dc = e.target.closest("[data-decide]");
      if (dc) { setDecision(dc.dataset.id, dc.dataset.decide); return; }
      const un = e.target.closest("[data-undo]");
      if (un) { setDecision(un.dataset.undo, ""); return; }
      const tg = e.target.closest("[data-exp]");
      if (tg) { const id = tg.dataset.exp; if (S.expanded.has(id)) S.expanded.delete(id); else S.expanded.add(id); renderBody(); }
    });
    tbl.addEventListener("input", (e) => {
      const f = e.target.closest("input[data-flt]");
      if (f) { filtersFor(S.tab)[f.dataset.flt] = f.value; renderBody(); return; }
      const n = e.target.closest("[data-track-notes]");
      if (n) { setTrack(n.dataset.trackNotes, { notes: n.value }); renderOrphans(); }
    });
    tbl.addEventListener("change", (e) => {
      const f = e.target.closest("select[data-flt]");
      if (f) { filtersFor(S.tab)[f.dataset.flt] = f.value; renderBody(); return; }
      const st = e.target.closest("[data-track-status]");
      if (st) {
        const id = st.dataset.trackStatus;
        setTrack(id, { status: st.value });
        renderStatusChips(); refreshFilterOptions(); renderBody();
      }
    });

    $("#colsBtn").onclick = (e) => { e.stopPropagation(); const p = $("#colsPop"); p.hidden = !p.hidden; $("#colsBtn").setAttribute("aria-expanded", String(!p.hidden)); };
    document.addEventListener("click", (e) => { if (!e.target.closest(".menu")) { $("#colsPop").hidden = true; $("#colsBtn").setAttribute("aria-expanded", "false"); } });
    $("#colsPop").addEventListener("change", (e) => {
      const key = e.target.dataset.col; if (!key) return;
      const list = (S.cols[S.tab] || DEFAULT_COLS.all).slice();
      const i = list.indexOf(key);
      if (e.target.checked && i < 0) list.push(key); else if (!e.target.checked && i >= 0 && list.length > 1) list.splice(i, 1);
      if (key === "program") list.includes("program") || list.unshift("program");
      S.cols[S.tab] = COLS.map((c) => c.key).filter((k) => list.includes(k));
      store.setJSON(K.cols, S.cols); renderTable(); buildColsMenu();
    });

    let dragDepth = 0;
    window.addEventListener("dragenter", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { dragDepth++; $("#drop").hidden = false; e.preventDefault(); } });
    window.addEventListener("dragover", (e) => { e.preventDefault(); });
    window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $("#drop").hidden = true; });
    window.addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; $("#drop").hidden = true; const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) handleFile(f); });
  }

  function buildColsMenu() {
    const list = S.cols[S.tab] || DEFAULT_COLS.all;
    $("#colsPop").innerHTML = COLS.filter((c) => colAllowed(c, S.tab)).map((c) => `<label><input type="checkbox" data-col="${c.key}" ${list.includes(c.key) ? "checked" : ""} ${c.key === "program" || c.key === "decide" ? "disabled" : ""}> ${esc(c.label)}</label>`).join("");
  }

  // ---------------------------------------------------------------- start
  function start() {
    if (migrateTracker(S.tracker)) store.setJSON(K.tracker, S.tracker);
    wire(); renderSettings(); buildColsMenu();
    const ds = store.getJSON(K.dataset);
    if (ds && ds.rows && ds.sheetName) {
      try { setDataset(ds, { persist: false }); } catch (e) { notice("Could not open the saved file: " + e.message, "err"); renderAll(); }
    } else renderAll();
  }
  window.__fdf = { S, E, handleFile, setDataset };
  start();
})();
