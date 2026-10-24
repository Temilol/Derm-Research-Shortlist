/*
 * Fellowship engine: a line-by-line port of fellowship_filter.py.
 * Pure functions, no DOM. Input: sheets {name: [[cell,...],...]}, a profile, today (UTC Date).
 * Output: one record per program with bucket, deadline tier, pay, flags, etc.
 */
(function (root) {
  "use strict";
  const raw = String.raw;

  // ------------------------------------------------------------------ profile
  const EAST = ["ME", "NH", "VT", "MA", "RI", "CT", "NY", "NJ", "PA", "DE", "MD", "DC", "VA", "NC", "SC", "GA", "FL"];
  const DEFAULT_PROFILE = {
    available_from: "2027-07-01",
    us_citizen: true,
    step3_status: "not_taken", // not_taken | planned | passed
    east_coast_states: EAST.slice(),
    remote_bonus: true,
    two_year_ok: true,
  };

  // ------------------------------------------------------------------ regex helpers
  const cache = new Map();
  function rx(src, flags) {
    const k = flags + "/" + src;
    let r = cache.get(k);
    if (!r) { r = new RegExp(src, flags); cache.set(k, r); }
    return r;
  }
  const search = (src, text, flags = "i") => rx(src, flags.replace("g", "")).exec(text == null ? "" : text);
  const test = (src, text, flags = "i") => search(src, text, flags) !== null;
  const matchStart = (src, text, flags = "i") => rx("^(?:" + src + ")", flags).exec(text == null ? "" : text);
  function* finditer(src, text, flags = "i") {
    const r = new RegExp(src, flags.replace("g", "") + "g");
    let m;
    while ((m = r.exec(text)) !== null) {
      yield m;
      if (m[0] === "") r.lastIndex++;
    }
  }

  // ------------------------------------------------------------------ text helpers
  const clean = (s) => String(s == null ? "" : s).replace(/​/g, "").replace(/\s+/g, " ").trim();
  const trunc = (s, n) => { s = clean(s); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+$/, "") + "…"; };
  const PREP = [["U.S.", "US"], ["M.D.", "MD"], ["D.O.", "DO"], ["Ph.D.", "PhD"], ["Dr.", "Dr"], ["e.g.", "eg"],
    ["i.e.", "ie"], ["vs.", "vs"], ["–", "-"], ["—", "-"], ["’", "'"]];
  function prep(s) {
    s = s == null ? "" : String(s);
    for (const [a, b] of PREP) s = s.split(a).join(b);
    return s;
  }
  function rfind(text, ch, end) { return end <= 0 ? -1 : text.lastIndexOf(ch, end - 1); }
  function sentenceAt(text, start, end) {
    const left = Math.max(rfind(text, ".", start), rfind(text, "\n", start), rfind(text, ";", start));
    const rights = [text.indexOf(".", end), text.indexOf("\n", end), text.indexOf(";", end)].filter((i) => i !== -1);
    const right = rights.length ? Math.min(...rights) : text.length;
    return text.slice(left + 1, right);
  }
  function snip(text, m, w = 45) {
    const a = Math.max(0, m.index - w), b = Math.min(text.length, m.index + m[0].length + w);
    return clean(text.slice(a, b));
  }
  const HEDGE = raw`\b(prefer\w*|ideal\w*|encourag\w*|plus|welcome|typical\w*|usual\w*|most often|generally|often|strong plus|a plus|recommended)\b`;
  function* scan(fields, patterns, flags = "i") {
    for (const [name, text] of Object.entries(fields)) {
      if (!text) continue;
      for (const pat of patterns) {
        for (const m of finditer(pat, text, flags)) {
          yield [name, m, sentenceAt(text, m.index, m.index + m[0].length), text];
        }
      }
    }
  }
  const rawOr = (row, k) => (row[k + "_raw"] !== undefined ? row[k + "_raw"] : (row[k] == null ? "" : row[k]));

  // ------------------------------------------------------------------ dates
  const MON_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const MON = raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)`;
  const OPENS_CTX = raw`(open(?:s|ed|ing)?(?: date)?|starting|start(?:s|ed)?|begin(?:s|ning)?|from|since|posted|released)\W[^.;]{0,25}$`;
  const mnum = (s) => MONTHS[s.slice(0, 3).toLowerCase()];
  function mkDate(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0));
  const fmt = (d) => `${MON_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  const iso = (d) => d.toISOString().slice(0, 10);
  const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const dayDiff = (a, b) => Math.round((a.getTime() - b.getTime()) / 86400000);

  function findDates(text) {
    const out = [];
    const t = prep(text);
    for (const m of finditer(raw`(?<![\d/])(\d{1,2})/(\d{1,2})/(\d{2,4})(?![\d/])`, t, "")) {
      let y = parseInt(m[3], 10);
      if (y < 100) y += 2000;
      const d = mkDate(y, parseInt(m[1], 10), parseInt(m[2], 10));
      if (d) out.push({ date: d, hasYear: true, span: [m.index, m.index + m[0].length], kind: "full" });
    }
    for (const m of finditer(raw`(?<![\d-])(\d{4})-(\d{1,2})-(\d{1,2})(?![\d-])`, t, "")) {
      const d = mkDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
      if (d) out.push({ date: d, hasYear: true, span: [m.index, m.index + m[0].length], kind: "full" });
    }
    for (const m of finditer(raw`\b(${MON})\.?\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?`, t, "i")) {
      const mo = mnum(m[1]), dd = parseInt(m[2], 10), y = m[3] ? parseInt(m[3], 10) : null;
      const d = mkDate(y || 2000, mo, dd);
      if (!d) continue;
      out.push({ date: d, hasYear: !!y, span: [m.index, m.index + m[0].length], kind: y ? "full" : "recurring" });
    }
    for (const m of finditer(raw`\b(${MON})\.?,?\s+(\d{4})\b`, t, "i")) {
      const mo = mnum(m[1]), y = parseInt(m[2], 10);
      if (out.some((o) => o.span[0] <= m.index && m.index < o.span[1])) continue;
      out.push({ date: lastDay(y, mo), hasYear: true, span: [m.index, m.index + m[0].length], kind: "monthyear" });
    }
    for (const o of out) {
      const ctx = t.slice(Math.max(0, o.span[0] - 40), o.span[0]);
      o.opens = test(OPENS_CTX, ctx, "i");
    }
    out.sort((a, b) => a.span[0] - b.span[0]);
    return out;
  }

  function nextOccurrence(date, today) {
    const y = today.getUTCFullYear();
    for (const yy of [y, y + 1, y + 2]) {
      const cand = mkDate(yy, date.getUTCMonth() + 1, date.getUTCDate()) || mkDate(yy, date.getUTCMonth() + 1, 28);
      if (cand.getTime() >= today.getTime()) return cand;
    }
    return date;
  }

  const ROLLING_RE = raw`rolling|until (?:the )?(?:position|positions)? ?(?:is |are )?filled|until further notice|no official deadline|open until|as (?:they are )?received|ongoing|continuous|reviewed as they|asap|as soon as possible`;
  const TIERS = {
    1: "1 - Due within 30 days",
    2: "2 - Due in 31-90 days",
    3: "3 - Due later (90+ days)",
    4: "4 - Rolling / open until filled",
    5: "5 - Listed date passed (projected next cycle)",
    6: "6 - No deadline listed",
  };

  function classifyDeadline(text, today) {
    const t = clean(text);
    const dates = findDates(text).filter((d) => !d.opens);
    const rolling = test(ROLLING_RE, t);
    const res = { tier: 6, next: null, days: null, note: "", projected: false, rolling };
    const future = [], past = [];
    for (const d of dates) {
      if (d.hasYear) (d.date.getTime() >= today.getTime() ? future : past).push(d.date);
      else future.push(nextOccurrence(d.date, today));
    }
    const uniqSorted = (arr) => [...new Map(arr.map((x) => [x.getTime(), x])).values()].sort((a, b) => a - b);
    if (future.length) {
      const nxt = new Date(Math.min(...future.map((x) => x.getTime())));
      const days = dayDiff(nxt, today);
      res.tier = days <= 30 ? 1 : days <= 90 ? 2 : 3; res.next = nxt; res.days = days;
      let note = `Next date: ${fmt(nxt)}`;
      if (past.length) note += ` (earlier date(s) already passed: ${uniqSorted(past).map(fmt).join(", ")})`;
      if (rolling) note += "; rolling after listed date";
      res.note = note;
      return res;
    }
    if (rolling) {
      res.tier = 4;
      res.note = "Rolling / until filled" + (past.length ? ` (listed date passed: ${fmt(new Date(Math.max(...past.map((x) => x.getTime()))))})` : "");
      return res;
    }
    if (past.length) {
      const last = new Date(Math.max(...past.map((x) => x.getTime())));
      const proj = nextOccurrence(last, today);
      res.tier = 5; res.next = proj; res.days = dayDiff(proj, today); res.projected = true;
      res.note = `Listed date ${fmt(last)} has passed; if it recurs annually, expect about ${fmt(proj)}`;
      return res;
    }
    res.note = "No parseable deadline" + (t ? ` ('${trunc(t, 60)}')` : "");
    return res;
  }

  // ------------------------------------------------------------------ eligibility patterns
  const STRONG_STUDENT = [
    raw`\bwill not consider[^.]{0,80}(?:residents?|physicians?)`,
    raw`\bleave of absence\b[^.]{0,40}medical school`,
    raw`\b(?:only|solely|exclusively)\s+(?:open\s+|available\s+)?(?:to|for)\s+[^.]{0,35}?\bstudents?\b`,
    raw`\bmedical students?\s+only\b|\bstudents?\s+only\b`,
    raw`not a medical student is not eligible`,
    raw`\bpost-?graduates?\b[^.]{0,60}\b(?:do not|don't|not)\s+qualify\b`,
    raw`\bmust be (?:a )?(?:currently )?enrolled\b|\bcandidates must be enrolled\b`,
    raw`\bcurrent medical students?\b`,
  ];
  const MEDIUM_STUDENT = [
    raw`\bbetween\s+(?:their\s+|the\s+)?(?:3rd|third|m3|ms3)\b[^.]{0,20}?(?:4th|fourth|m4|ms4)\b`,
    raw`\brising\s+(?:third|fourth|3rd|4th|m3|m4|ms3|ms4)`,
    raw`\b(?:first|second|third|fourth|1st|2nd|3rd|4th|m[1-4]|ms[1-4])(?:\s*(?:or|and|-|/)\s*(?:first|second|third|fourth|1st|2nd|3rd|4th))?[- ]?(?:year|yr)\s+(?:medical\s+)?students?\b`,
    raw`\bgap[- ]year\b`,
    raw`\bm[1-4]\s*[-/]\s*m[1-4]\b|\bms[1-4]\s*(?:and|[-/])\s*ms[1-4]\b`,
    raw`\bsenior medical students?\b`,
    raw`\bpre-?doctoral\b`,
  ];
  const WEAK_STUDENT = [raw`\bmedical students?\b`, raw`\bstudents?\b`];
  const GRAD = [
    raw`\b(?:medical school|medical|md|us|american)\s+graduates?\b`,
    raw`\bgraduates?\s+(?:of|from)\s+(?:an?\s+)?(?:accredited|approved|us|medical)`,
    raw`\brecent(?:ly)?\s+(?:[a-z]+\s+){0,3}graduates?\b`,
    raw`\b(?:students?|residents?|physicians?)\s*(?:,|and|or|/)\s*(?:recent\s+)?(?:medical\s+)?graduates?\b`,
    raw`\bor\s+(?:recent\s+)?(?:medical\s+)?graduates?\b`,
    raw`\bpost-?doc(?:toral)?\b`,
    raw`\b(?:physician|md)\s+(?:research\s+)?fellows?\b|\bmd\s+fellowships?\b`,
    raw`\bearly[- ]career physicians?\b|\btrains? physicians?\b|\bfor (?:us )?physicians?\b|\bphysicians? (?:interested|wishing|who)\b|\bopen to (?:[a-z/ ,]{0,40})physicians?\b`,
    raw`\b(?:completed|completion of|complete|completing)\s+(?:a |an |one |their |at least |the |one-year )*(?:one[- ]year )?(?:pgy-?1|internship|intern year|transitional year|acgme pgy)`,
    raw`\binternship\b|\bintern year\b|\bpgy-?\d\b`,
    raw`\bmd\s*(?:/|or|,)\s*(?:do|md[- ]?phd)\b|\bmd/do\b|\bmd or do\b`,
    raw`\bmedical degree\b|\bmd degree\b|\bcompleted an? md\b|\bmd,? or md/phd\b`,
    raw`licen[sc]e[- ]eligib|eligib\w*\s+(?:for|to obtain|to apply for)\s+(?:an?\s+)?(?:\w+\s+)?(?:state\s+)?(?:medical\s+)?licen[sc]e`,
  ];
  const TRAINING_EXCESS = [
    [raw`\b(?:at least |minimum of |a minimum of )?(?:two|2|three|3)\s+years?\s+of\s+(?:an?\s+)?(?:acgme[- ]accredited\s+)?(?:residency|post-?graduate|clinical training)`, "2+ years of residency/post-graduate training"],
    [raw`\bgraduate of an?\s+(?:accredited\s+)?(?:[a-z]+\s+){0,4}residency`, "completed residency"],
    [raw`\b(?:must (?:be|have)|requires?|need to be)\s+(?:to be\s+)?board[- ](?:eligib|certif)\w*|requirement[^.]{0,40}\bis\s+board[- ]eligib\w*`, "board eligibility/certification"],
    [raw`\b(?:completed|completion of)\s+(?:at least\s+)?(?:one\s+year\s+of\s+|1 year of\s+)?(?:a\s+)?(?:peds|pediatrics?|pediatric)\s+residency\b|\byear of peds residency\b|\bpgy-?1 in peds\b`, "pediatrics-specific PGY-1"],
  ];
  const HOLD_LICENSE = raw`\b(?:hold|possess|have)\s+(?:a\s+)?(?:permanent|full|unrestricted|valid|current)\s+(?:\w+\s+)?(?:state\s+)?medical\s+licen[sc]e`;
  const DEGREE_PREREQ = raw`\b(?:possess|have|hold)\s+a\s+master'?s\s+degree|minimum qualifications?:?\s*candidates should possess a master|\bmds? who have an mph\b`;
  const NOT_APPLYING = raw`not (?:be )?applying (?:to|for) residency (?:this|in the)`;
  const CITIZEN = raw`\b(?:us citizens?|citizens? or permanent residents?|us citizenship)\b`;
  const SCAN_FIELDS = ["requirements", "description", "notes", "status", "mddo", "pgy", "program", "years"];
  const ASAP = raw`\basap\b|as soon as possible`;

  function analyzeEligibility(row, prof) {
    const F = {};
    for (const k of SCAN_FIELDS) F[k] = prep(rawOr(row, k));
    const ev = { strong: [], medium: [], medium_hedged: [], weak: [], grad_text: [], train: [], nv: [], flags: [] };

    for (const col of ["mddo", "pgy"]) {
      const v = F[col].toLowerCase();
      if (test(raw`not eligible|ineligible`, v)) ev.strong.push([col, clean(F[col]).slice(0, 90), false]);
    }
    for (const [, m, , text] of scan(F, GRAD)) {
      const before = text.slice(Math.max(0, m.index - 25), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 25);
      if (test(raw`\b(?:no|not|without|nor|never)\b[^.]{0,22}$`, before) ||
          matchStart(raw`[^.]{0,15}\b(?:not required|not needed|is not|are not)\b`, after)) continue;
      ev.grad_text.push(snip(text, m));
    }
    const gradText = ev.grad_text.length > 0;
    const mddoL = F.mddo.toLowerCase();
    const gradCol = mddoL.startsWith("yes") || mddoL.startsWith("md") ||
      !!matchStart(raw`\s*(yes|required|preferred|no, but preferred|ideal)`, F.pgy);

    for (const [name, m, sent, text] of scan(F, STRONG_STUDENT)) {
      if (name === "status") continue;
      const hasGradHere = GRAD.some((g) => test(g, sent));
      ev.strong.push([name, snip(text, m), hasGradHere]);
    }
    for (const [name, m, , text] of scan(F, MEDIUM_STUDENT)) {
      if (name === "status") continue;
      const near = text.slice(Math.max(0, m.index - 45), m.index + m[0].length + 10);
      (test(HEDGE, near) ? ev.medium_hedged : ev.medium).push(snip(text, m));
    }
    if (!(ev.strong.length || ev.medium.length || ev.medium_hedged.length)) {
      const sub = { requirements: F.requirements, description: F.description, notes: F.notes };
      for (const [, m, , text] of scan(sub, WEAK_STUDENT)) { ev.weak.push(snip(text, m)); break; }
    }
    for (const [pat, label] of TRAINING_EXCESS) {
      for (const [, m, sent, text] of scan(F, [pat])) {
        if (label === "pediatrics-specific PGY-1" && test("transitional", Object.values(F).join(" "))) continue;
        if (test(HEDGE, sent)) continue;
        ev.train.push([label, snip(text, m)]);
      }
    }

    const excl = [];
    const strongHard = ev.strong.filter((s) => !s[2]);
    const strongSoft = ev.strong.filter((s) => s[2]);
    if (strongHard.length) {
      excl.push(["Student-only program", `${strongHard[0][0]}: "${strongHard[0][1]}"`]);
    } else if (ev.medium.length && !gradText) {
      if (gradCol) ev.nv.push(`Text points to students ("${ev.medium[0]}") but columns suggest MD/PGY-1 are accepted`);
      else excl.push(["Student-year-specific program", `"${ev.medium[0]}" and no mention of graduates`]);
    }
    if (ev.train.length) excl.push(["Requires more training than you will have", `${ev.train[0][0]}: "${ev.train[0][1]}"`]);
    const fullText = Object.values(F).join(" ");
    if (test(CITIZEN, fullText)) {
      if (prof.us_citizen) ev.flags.push("US citizen/PR required (you meet this)");
      else excl.push(["Citizenship requirement", "Program requires US citizen/permanent resident"]);
    }
    if (excl.length) return ["Excluded", excl, ev, gradText || gradCol];

    const nv = ev.nv;
    for (const s of strongSoft) nv.push(`Student-only wording, but graduates also mentioned nearby: "${s[1]}"`);
    if (ev.medium_hedged.length && !gradText) nv.push(`Student-year wording is hedged ("${ev.medium_hedged[0]}"); graduates not mentioned`);
    if (ev.weak.length && !(gradText || gradCol) && !ev.medium_hedged.length) nv.push("Mentions medical students; graduates not mentioned - ask the program");
    let asapFound = false;
    for (const _ of scan(F, [ASAP])) {
      nv.push(`Wants an immediate start; you are available from ${fmt(parseISO(prof.available_from))} - confirm flexibility`);
      asapFound = true; break;
    }
    if (!asapFound && test(ASAP, row.deadline || "")) {
      nv.push(`Deadline says ASAP; you are available from ${fmt(parseISO(prof.available_from))} - confirm flexibility`);
    }
    for (const [, m, , text] of scan(F, [HOLD_LICENSE])) { nv.push(`Requires already holding a medical license: "${snip(text, m)}"`); break; }
    for (const [, m, , text] of scan(F, [DEGREE_PREREQ])) { nv.push(`Degree prerequisite you may not meet: "${snip(text, m)}"`); break; }
    for (const [, m, , text] of scan(F, [NOT_APPLYING])) { nv.push(`Says applicants are not applying to residency this cycle: "${snip(text, m)}"`); break; }
    const bucket = nv.length ? "Needs verification" : (gradText || gradCol ? "Eligible" : "Likely eligible");
    return [bucket, nv.map((x) => ["Needs verification", x]), ev, gradText || gradCol];
  }

  // ------------------------------------------------------------------ status / years / step 3 / license / skills
  function classifyStatus(status, prof) {
    const s = clean(status), low = s.toLowerCase();
    const pairs = [];
    for (const m of finditer(raw`\b(20\d\d)\s*[-/]\s*(?:20)?(\d\d)\b`, prep(s), "")) pairs.push([parseInt(m[1], 10), 2000 + parseInt(m[2], 10)]);
    for (const m of finditer(raw`'(\d\d)\s*-\s*'(\d\d)`, s, "")) pairs.push([2000 + parseInt(m[1], 10), 2000 + parseInt(m[2], 10)]);
    const target = parseISO(prof.available_from).getUTCFullYear();
    const covers = pairs.map(([a, b]) => a === target || (b - a > 1 && a <= target && target < b));
    const cycle = pairs.map(([a, b]) => `${a}-${b}`).join(", ");
    const filled = test(raw`\bfilled\b|\bclosed\b|no longer accepting|not (?:currently )?accepting|no current openings|all positions|has concluded|concluded his selection`, low);
    const opened = test(raw`\bopen\b|available|accepting|actively|currently interviewing|\bactive\b|remaining|will begin reviewing|recruiting|seeking|looking to fill|application will open|^yes for`, low);
    const label = filled && opened ? "Filled now; later cycle open/reviewing" : filled ? "Filled / closed" : opened ? "Open" : "Unclear";
    return { label, cycle, matches_target: covers.some(Boolean) ? true : (pairs.length ? false : null), raw: trunc(s, 140) };
  }

  function classifyYears(years, desc) {
    const t = prep(clean(years));
    const words = { one: 1, two: 2, three: 3 };
    const num = (x) => (words[x.toLowerCase()] !== undefined ? words[x.toLowerCase()] : parseInt(x, 10));
    let lo = null, hi = null, m;
    if ((m = search(raw`\b([1-5]|one|two|three)\s*(?:-|to|and|or|/)\s*([1-5]|two|three)[- ]?(?:years?|yrs?)`, t))) {
      lo = num(m[1]); hi = num(m[2]);
    } else if ((m = search(raw`\b([1-5]|one|two|three)[- ]?(?:years?|yrs?)\b`, t))) {
      lo = hi = num(m[1]);
    } else if ((m = matchStart(raw`\s*([1-5])\s*(?:-\s*([1-5]))?\s*$`, t, ""))) {
      lo = parseInt(m[1], 10); hi = m[2] ? parseInt(m[2], 10) : lo;
    } else if (test(raw`\b12\s*months?\b|\b9\s*months?\b|\b11\s*months?\b`, t)) {
      lo = hi = 1;
    }
    if (lo === null) {
      const m2 = search(raw`\b(one|two|1|2)[- ]year\b`, prep(desc || ""));
      if (m2) lo = hi = num(m2[1]);
    }
    let flag = "";
    if (lo !== null && lo >= 2) flag = "2+ year commitment";
    else if (lo !== null && hi !== null && hi >= 2) flag = "1-2 year option";
    return { text: trunc(years, 40), lo, hi, flag };
  }

  function step3Info(row, prof) {
    const req = prep(rawOr(row, "requirements"));
    const allt = ["requirements", "description", "notes", "pgy", "mddo"].map((k) => prep(rawOr(row, k))).join(" ");
    const pieces = allt.split(/(?<=[.;\n])/).filter((p) => !test(raw`step\s*3[^.]{0,30}not (?:required|needed)|not required[^.]{0,20}step\s*3`, p));
    const allt2 = pieces.join("");
    const required = test(raw`step\s*3[^.]{0,40}\b(?:is required|required|prior to|before)\b|\b(?:require\w*|must)\b[^.]{0,30}step\s*3|usmle\s*(?:step\s*)?iii?\s*(?:is\s*)?required`, allt2);
    const atApp = test(raw`(?:step|usmle)s?\s*(?:\(|:)?\s*(?:1|I)\b[^.\n]{0,28}\b(?:3|III)\b`, req);
    const col = clean(row.pgy || "").toLowerCase();
    const colYes = col.startsWith("yes") || col.startsWith("required");
    const tags = [];
    if (prof.step3_status === "passed") return tags;
    if (required) tags.push("Needs Step 3 by start (stated in text)");
    else if (colYes) tags.push("Sheet column = Yes for PGY-1/Step 3 (Step 3 not confirmed in text) - assume needed");
    if (atApp && !required) tags.push("Asks for Step 3 score at application (you will not have it yet)");
    else if (atApp) tags.push("Step 3 score may be requested at application");
    return tags;
  }

  function licenseInfo(row) {
    const allt = ["requirements", "description", "notes", "mddo", "pgy"].map((k) => prep(rawOr(row, k))).join(" ");
    let m = search(raw`[^.\n;]{0,45}(?:medical licen[sc]e|licen[sc]e[- ]eligib\w*|licensure)[^.\n;]{0,40}`, allt);
    if (m) return trunc(m[0], 90);
    m = search(raw`\b(?:CA|Ohio|Texas|Missouri|Maryland|NY|New York|South Carolina|Illinois|California|NM|New Mexico)\s+licen[sc]e`, allt);
    return m ? trunc(m[0], 90) : "";
  }

  const SKILL_PATTERNS = [
    ["R", raw`\bR\b(?=[,)/ ]*(?:,|\)|/| or | and |programming|stata|python|statistic))`], ["Stata", raw`\bstata\b`], ["Python", raw`\bpython\b`],
    ["SQL", raw`\bSQL\b`], ["SAS", raw`\bSAS\b`], ["SPSS", raw`\bSPSS\b`], ["REDCap", raw`\bredcap\b`],
    ["Statistics/biostats", raw`\bstatistic\w*|\bbiostatistic\w*`],
    ["Coding/programming", raw`\bcoding\b|\bprogramming\b|computational biology|bioinformatic\w*|machine learning`],
    ["Phlebotomy", raw`\bphlebotomy\b|\bvenipuncture\b|blood draws?`],
    ["Wet-lab", raw`wet[- ]lab|\bELISA\b|cell cultures?|bench`],
    ["Prior research", raw`(?:prior|previous) research experience|research experience`],
  ];
  function skillsInfo(row) {
    const allt = ["requirements", "description", "notes"].map((k) => prep(rawOr(row, k))).join(" ");
    const out = [];
    for (const [name, pat] of SKILL_PATTERNS) {
      const flags = ["R", "SQL", "SAS", "SPSS"].includes(name) ? "" : "i";
      if (test(pat, allt, flags)) out.push(name);
    }
    return out;
  }

  // ------------------------------------------------------------------ pay
  function classifyPay(row) {
    const cell = clean(row.paid || ""), cl = cell.toLowerCase();
    const allt = prep(["description", "requirements", "notes"].map((k) => rawOr(row, k)).join(" "));
    const lowAll = allt.toLowerCase();
    const unpaidText = test(raw`\b(?:unpaid|not funded|is not paid|without pay|volunteers?)\b|fellowship is not funded`, lowAll);
    const paidText = test(raw`\bpaid (?:position|fellowship|research|clinical)\b|full-time paid|salaried|\bsalary\b|\bfully funded\b|funded fellowship`, lowAll);
    const stipText = test(raw`\bstipend\b|compensat`, lowAll);
    const uncertainRe = raw`pending|depend|tbd|grant (?:receipt|allocation|support)|based on|possibl|negotiab|varies|variable|sometimes|\bmaybe\b|\bif\b`;
    let label = "Unknown", rank = 4;
    const flags = [];
    const hrs = search(raw`(\d+)\s*(?:hours?|hrs?)\s*(?:/|per|a)\s*week`, cl);
    const partTime = test(raw`not paid|unpaid|\bonly\b|partial|part[- ]time`, cl) || !!(hrs && parseInt(hrs[1], 10) < 30);
    if (cl.startsWith("yes") || cl.startsWith("paid") || cl === "y") {
      if (partTime) { label = "Paid - partial/limited"; rank = 2; }
      else if (test(uncertainRe, cl) || test(raw`paid[^.]{0,30}(?:based on|depend\w*|contingent)[^.]{0,30}(?:grant|funding)`, lowAll)) { label = "Paid - uncertain/conditional"; rank = 1; }
      else { label = "Paid"; rank = 0; }
    } else if (cl.startsWith("no")) {
      label = test(raw`but|however|expens|travel|conference|publication|fees|stipend|award|funding`, cl) ? "Unpaid (some expenses/support covered)" : "Unpaid";
      rank = 3;
      if (paidText && !unpaidText) flags.push("Paid? column says No, but text mentions pay - verify");
    } else if (["", "tbd", "n/a", "na"].includes(cl) || cl.startsWith("http")) {
      if (unpaidText) { label = "Unpaid (per description)"; rank = 3; }
      else if (paidText) { label = "Paid (per description)"; rank = 0; }
      else if (stipText) { label = "Stipend mentioned (per description)"; rank = 1; }
      else { label = "Unknown"; rank = 4; }
    } else {
      if (test(raw`\b\d+\s+paid\s+positions?`, cl)) { label = "Paid - limited positions"; rank = 1; }
      else if (test(raw`conference|travel|fees|registration|lodging|\bcosts?\b`, cl) && !test(raw`\$|salary|stipend|\bpaid\b|benefit`, cl)) { label = "Unpaid (expenses covered)"; rank = 3; }
      else if (test(uncertainRe, cl)) { label = "Paid - uncertain/conditional"; rank = 1; }
      else if (test(raw`\$\s?\d|salary|benefit|stipend|commensur|per nih|pgy|funded|award`, cl)) { label = "Paid"; rank = 0; }
      else if (unpaidText) { label = "Unpaid (per description)"; rank = 3; }
      else { label = "Unknown"; rank = 4; }
    }
    const snippets = [];
    const hay = prep(allt) + " " + prep(cell);
    for (const pat of [
      raw`[^.\n]{0,40}\$\s?[\d,]+(?:\.\d+)?(?:\s?[kK])?(?:\s?(?:/|per)\s?(?:hour|hr|year|yr|month|week))?[^.\n]{0,35}`,
      raw`[^.\n]{0,30}\bPGY-?\d\s+(?:level|salary)[^.\n]{0,20}`,
      raw`[^.\n]{0,30}\bNIH\b[^.\n]{0,30}(?:scale|NRSA|stipend)[^.\n]{0,20}`,
    ]) {
      for (const m of finditer(pat, hay, "")) {
        const s = clean(m[0]);
        if (s && snippets.every((x) => !x.includes(s) && !s.includes(x))) snippets.push(s);
        if (snippets.length >= 2) break;
      }
    }
    let detail = cell ? trunc(cell, 150) : "";
    if (snippets.length) {
      const extra = snippets.filter((s) => !detail.includes(s)).map((s) => trunc(s, 110)).join(" | ");
      detail = (detail + (detail && extra ? " || " : "") + extra).trim();
    }
    return { label, rank, detail: detail || "(none listed)", flags };
  }

  function locationInfo(row, prof) {
    const stateRaw = clean(row.state || "");
    const st = stateRaw.length <= 3 ? stateRaw.toUpperCase().slice(0, 2) : "";
    const allt = prep(["description", "requirements", "notes"].map((k) => rawOr(row, k)).join(" "));
    const remote = test(raw`\b(?:hybrid|remote(?:ly)?|virtual(?:ly)?)\b`, allt) && !test(raw`not (?:a )?(?:remote|virtual)|in-person only`, allt);
    const east = prof.east_coast_states.includes(st);
    let rank, label;
    if (east) { rank = 0; label = "East Coast"; }
    else if (remote && prof.remote_bonus) { rank = 0.5; label = "Remote/hybrid mentioned"; }
    else if (st) { rank = 1; label = "Other US"; }
    else { rank = 1.5; label = "State not listed"; }
    return { rank, label, remote, state: st || stateRaw };
  }

  // ------------------------------------------------------------------ components, key requirements, links
  const NUM = { one: 1, two: 2, three: 3, four: 4, 1: 1, 2: 2, 3: 3, 4: 4 };
  const numOf = (x) => (NUM[x.toLowerCase()] !== undefined ? NUM[x.toLowerCase()] : x);
  function appComponents(row) {
    const t = prep(rawOr(row, "requirements")) + "\n" + prep(rawOr(row, "description"));
    const comps = [];
    const has = (p) => search(p, t);
    if (has(raw`\bcv\b|curriculum vitae|\bresume\b|resumé`)) comps.push("CV/resume");
    if (has(raw`cover letter`)) comps.push("Cover letter");
    if (has(raw`letter of (?:interest|intent)|statement of interest|statement of research|brief letter of interests`)) comps.push("Letter/statement of interest");
    if (has(raw`personal statement|statement of purpose`)) comps.push("Personal statement");
    let m = has(raw`\b(\d|one|two|three|four)\s*(?:strong\s+)?(?:\(?\d\)?\s*)?(?:letters? of (?:recommendation|reference|support)|LORs?|LOR's)`);
    if (m) comps.push(`${numOf(m[1])} letter(s) of recommendation`);
    else if (has(raw`letters? of (?:recommendation|reference)|\bLORs?\b|\bLOR's\b`)) comps.push("Letter(s) of recommendation");
    const m2 = has(raw`\b(\d|one|two|three|four|2-3|3-5)\s*(?:professional\s+)?references?`);
    if (m2) comps.push(`${numOf(m2[1])} references`);
    else if (has(raw`\breferences?\b`)) comps.push("References");
    if (has(raw`transcript`)) comps.push("Transcript");
    if (has(raw`\busmle\b|step\s*[123]|\bstep scores?\b|board scores`)) comps.push("USMLE/Step scores");
    if (has(raw`\bmcat\b`)) comps.push("MCAT score");
    if (has(raw`dean'?s letter|letter of good standing`)) comps.push("Dean's letter");
    if (has(raw`headshot|photograph|\bpicture\b|\bphoto\b`)) comps.push("Photo");
    if (has(raw`writing sample|best written piece|copies of any prior publications|list of publications|bibliography|research writing`)) comps.push("Writing sample/publications");
    if (has(raw`research proposal|short research proposal`)) comps.push("Research proposal");
    if (has(raw`\bERAS\b`)) comps.push("ERAS application");
    if (has(raw`powerpoint`)) comps.push("Presentation");
    if (has(raw`redcap|docs\.google\.com/forms|forms\.gle|smartsheet|application portal|apply (?:online|through)|online application|recruit\.ap\.uci|icims|apply\.mayoclinic|applyjobs|jobs\.cooperhealth|csod\.com`)) comps.push("Online application/portal");
    return comps.length ? comps.join("; ") : "(not specified - see raw requirements)";
  }

  function keyRequirements(row, eligFlags, step3Tags, lic, yrs, prof) {
    const bits = [];
    const mddo = clean(row.mddo || "").toLowerCase(), pgy = clean(row.pgy || "").toLowerCase();
    if (mddo.startsWith("yes") || mddo.startsWith("md")) bits.push("MD/DO required");
    if (pgy.startsWith("yes") || pgy.startsWith("required")) bits.push("PGY-1 required (sheet)");
    else if (pgy.startsWith("preferred") || pgy.startsWith("no, but preferred") || pgy.startsWith("ideal")) bits.push("PGY-1 preferred");
    const allt = prep(["requirements", "description", "notes"].map((k) => rawOr(row, k)).join(" "));
    if (test(raw`\b(?:completed|completion of)\s+(?:a |an |one |their |at least |the )*(?:one[- ]year )?(?:pgy-?1|internship|intern year)`, allt)) {
      if (!bits.includes("PGY-1 required (sheet)")) bits.push("PGY-1/internship completed (text)");
    }
    bits.push(...step3Tags);
    if (lic) bits.push(`License: ${lic}`);
    bits.push(...eligFlags);
    const m = search(raw`at least \d+ years? of research experience`, allt);
    if (m) bits.push(m[0]);
    if (yrs.flag) bits.push(yrs.flag + (prof.two_year_ok ? " (you said OK)" : ""));
    return bits.length ? bits.join("; ") : "(none stated beyond the application list)";
  }

  function linksOf(row) {
    const t = prep(["requirements", "website", "description", "notes"].map((k) => rawOr(row, k)).join(" "));
    const found = t.match(/https?:\/\/[^\s,;)"']+|(?<![\w/])www\.[^\s,;)"']+/g) || [];
    const seen = [];
    for (let f of found) { f = f.replace(/\.+$/, ""); if (!seen.includes(f)) seen.push(f); }
    return seen;
  }

  // Flags a start window naming either of the two months before available_from (default Jul 1, 2027: "May/June 2027").
  const MON_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  function earlyStartFlag(allt, prof) {
    const avail = parseISO(prof.available_from);
    const m = avail.getUTCMonth();
    const name = (k) => MON_FULL[(k + 12) % 12];
    const year = new Date(Date.UTC(avail.getUTCFullYear(), m - 1, 1)).getUTCFullYear();
    if (!test(raw`(?:${name(m - 2)}|${name(m - 1)})\s*[/&,-]?\s*(?:and|or|to)?\s*(?:${name(m - 1)}|${name(m)})?\s*,?\s*${year}`, allt)) return "";
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    return `Start window includes ${cap(name(m - 2))}-${cap(name(m - 1))} ${year} (before you are available on ${fmt(avail)}; confirm flexibility)`;
  }

  function extraFlags(row, yrs, prof) {
    const allt = prep(["requirements", "description", "notes", "status", "deadline", "years"].map((k) => rawOr(row, k)).join(" "));
    const flags = [];
    if (test(raw`(?:agree to not accept|not accept (?:a|any) residency)`, allt)) flags.push("BARS accepting a residency during the fellowship");
    if (yrs.flag === "2+ year commitment") flags.push("Two-year commitment");
    else if (yrs.flag) flags.push("1-2 year option");
    const early = earlyStartFlag(allt, prof);
    if (early) flags.push(early);
    if (test(raw`(?:undergoing|in the process of)[^.]{0,40}acgme`, allt)) flags.push("Accreditation pending - do diligence before applying");
    if (row._short) flags.push(`Sparse row (${row._cells} filled cells) - details may be missing`);
    return flags;
  }

  // ------------------------------------------------------------------ reading sheets
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", inQ = false, i = 0;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { if (text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function parseTextSheets(text) {
    text = text.replace(/^﻿/, "");
    if (/^## Sheet name:/m.test(text)) {
      const parts = text.split(/^## Sheet name:\s*(.*)$/m);
      const out = {};
      for (let i = 1; i < parts.length; i += 2) out[parts[i].trim()] = parseCSV(parts[i + 1].replace(/^\n+|\n+$/g, ""));
      return out;
    }
    return { Sheet1: parseCSV(text) };
  }

  function findHeader(recs) {
    for (let i = 0; i < recs.length; i++) {
      const low = recs[i].map((c) => clean(c).toLowerCase());
      if (low.filter(Boolean).length >= 4 && low.some((c) => c.includes("deadline"))) return i;
    }
    return null;
  }
  function chooseSheet(sheets, requested) {
    if (requested) {
      const hit = Object.keys(sheets).find((n) => n.toLowerCase() === requested.toLowerCase());
      if (!hit) throw new Error(`Sheet '${requested}' not found.`);
      return hit;
    }
    const cands = [];
    for (const [name, recs] of Object.entries(sheets)) {
      const h = findHeader(recs);
      if (h === null) continue;
      const low = recs[h].map((c) => clean(c).toLowerCase()).join(" ");
      if (!low.includes("fellowship") && !low.includes("program")) continue;
      const n = name.toLowerCase();
      let score = 0;
      if (n.includes("inactive") || n.includes("histor")) score -= 10;
      if (n.includes("active") || n.includes("current")) score += 5;
      cands.push([score, name]);
    }
    if (!cands.length) throw new Error("Could not find a sheet with fellowship columns and a Deadline column.");
    cands.sort((a, b) => b[0] - a[0]);
    return cands[0][1];
  }
  const COLUMN_RULES = [
    ["state", (h) => h === "state"],
    ["director", (h) => h.includes("director")],
    ["status", (h) => h.includes("filled") || h.includes("open for")],
    ["years", (h) => h.includes("# of year") || h === "years" || h === "length"],
    ["description", (h) => h.includes("description")],
    ["requirements", (h) => h.includes("requirement")],
    ["deadline", (h) => h.includes("deadline")],
    ["positions", (h) => h.includes("position") && !h.includes("filled")],
    ["contact", (h) => h.includes("contact")],
    ["website", (h) => h.includes("website") || h === "link" || h === "url"],
    ["pgy", (h) => h.includes("pgy") || h.includes("step 3")],
    ["mddo", (h) => h.includes("md/do") || h.includes("md or do")],
    ["paid", (h) => h.includes("paid") || h.includes("stipend") || h.includes("salary")],
    ["notes", (h) => h.startsWith("note")],
    ["program", (h) => h.includes("fellowship") || h.includes("program") || h === "name"],
  ];
  function mapColumns(header) {
    const mapping = {}, used = new Set();
    const low = header.map((h) => clean(h).toLowerCase());
    for (const [key, fn] of COLUMN_RULES) {
      for (let i = 0; i < low.length; i++) {
        if (!used.has(i) && low[i] && fn(low[i])) { mapping[key] = i; used.add(i); break; }
      }
    }
    const missing = ["program", "deadline"].filter((k) => !(k in mapping));
    if (missing.length) throw new Error(`Could not find required column(s): ${missing.join(", ")}.`);
    return mapping;
  }
  function buildRows(recs) {
    const h = findHeader(recs);
    const header = recs[h];
    const mapping = mapColumns(header);
    const warnings = [];
    const usedIdx = new Set(Object.values(mapping));
    const unmapped = header.map((c, i) => [clean(c), i]).filter(([c, i]) => c && !usedIdx.has(i)).map(([c]) => c);
    if (unmapped.length) warnings.push(`Columns not used: ${unmapped.join(", ")}`);
    const rows = [], seen = {};
    for (const rawRow of recs.slice(h + 1)) {
      if (!rawRow.some((c) => clean(c))) continue;
      const row = {};
      for (const [k, i] of Object.entries(mapping)) row[k] = i < rawRow.length ? clean(rawRow[i]) : "";
      for (const k of ["description", "requirements", "notes", "status", "deadline", "paid"]) {
        if (k in mapping && mapping[k] < rawRow.length) row[k + "_raw"] = String(rawRow[mapping[k]] == null ? "" : rawRow[mapping[k]]);
      }
      if (!row.program && !row.description) continue;
      row._cells = rawRow.filter((c) => clean(c)).length;
      row._short = rawRow.length < 12;
      const base = `${row.state || ""}-${row.program || ""}-${row.director || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 90).replace(/^-+|-+$/g, "");
      const n = seen[base] || 0;
      seen[base] = n + 1;
      row.id = n === 0 ? base : `${base}-${n + 1}`;
      rows.push(row);
    }
    return { rows, warnings, header };
  }

  // ------------------------------------------------------------------ processing
  const BUCKET_RANK = { "Eligible": 0, "Likely eligible": 1, "Needs verification": 2 };
  function processRow(row, prof, today) {
    const [bucket, reasons, ev] = analyzeEligibility(row, prof);
    const dl = classifyDeadline(rawOr(row, "deadline"), today);
    const st = classifyStatus(row.status, prof);
    const yrs = classifyYears(row.years, row.description);
    const pay = classifyPay(row);
    const loc = locationInfo(row, prof);
    const s3 = step3Info(row, prof);
    const lic = licenseInfo(row);
    const skills = skillsInfo(row);
    const flags = extraFlags(row, yrs, prof).concat(pay.flags);
    const links = linksOf(row);
    const website = clean(row.website || "");
    let apply = links[0] || "";
    if (!apply) apply = ["", "n/a", "none", "tbd"].includes(website.toLowerCase()) ? "" : website;
    if (!apply) {
      const em = (row.contact || "").match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
      if (em) apply = `Email ${em[0]}`;
    }
    const dateNum = dl.next ? dl.next.getTime() : 4102444800000;
    const rec = {
      id: row.id, program: clean(row.program), state: row.state || "", director: clean(row.director || ""),
      bucket, why: reasons.map(([a, b]) => `${a}: ${b}`).join("; "),
      tier: dl.tier, tierLabel: TIERS[dl.tier], deadline: dl.next ? iso(dl.next) : "", projected: dl.projected,
      days: dl.days, deadlineNote: dl.note, deadlineSheet: trunc(row.deadline || "", 160),
      payLabel: pay.label, payRank: pay.rank, payDetail: pay.detail,
      availability: st.label + (st.cycle ? ` [${st.cycle}]` : ""), availabilityRaw: st.raw,
      length: yrs.text, keyReq: keyRequirements(row, ev.flags, s3, lic, yrs, prof),
      flags: flags.join("; "), components: appComponents(row), skills: skills.join(", "),
      apply, contact: trunc(row.contact || "", 160), location: loc.label, locRank: loc.rank,
      requirements: trunc(row.requirements || "", 1500), description: trunc(row.description || "", 1500),
      notes: trunc(row.notes || "", 800), positions: clean(row.positions || ""), website, sheetPaid: clean(row.paid || ""),
      sheetPgy: clean(row.pgy || ""), sheetMddo: clean(row.mddo || ""), sheetStatus: clean(row.status || ""),
      links,
    };
    rec.sort = [dl.tier, pay.rank, loc.rank, BUCKET_RANK[bucket] === undefined ? 3 : BUCKET_RANK[bucket], dateNum, rec.program.toLowerCase()];
    return rec;
  }
  function cmpSort(a, b) {
    for (let i = 0; i < a.sort.length; i++) {
      if (a.sort[i] < b.sort[i]) return -1;
      if (a.sort[i] > b.sort[i]) return 1;
    }
    return 0;
  }
  function run(sheets, profile, today, sheetName) {
    const prof = Object.assign({}, DEFAULT_PROFILE, profile || {});
    const name = chooseSheet(sheets, sheetName);
    const { rows, warnings, header } = buildRows(sheets[name]);
    const records = rows.map((r) => processRow(r, prof, today)).sort(cmpSort);
    return { sheetName: name, warnings, header, records };
  }

  // ------------------------------------------------------------------ change tracking
  const TRACK = ["status", "deadline", "paid", "years", "positions", "contact", "website"];
  function fnv(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }
  function snapshot(sheetRows) {
    // sheetRows: the parsed rows from buildRows (not records), so tracking does not depend on the profile
    const out = {};
    for (const row of sheetRows) {
      const d = {};
      for (const k of TRACK) d[k] = clean(row[k] || "");
      d.requirements = fnv(clean(row.requirements || ""));
      d.description = fnv(clean(row.description || ""));
      d.program = clean(row.program || "").slice(0, 80);
      out[row.id] = d;
    }
    return out;
  }
  function diff(prev, cur) {
    const changes = [];
    for (const [id, snap] of Object.entries(cur)) {
      if (!(id in prev)) changes.push({ type: "NEW", id, program: snap.program, details: "" });
      else {
        const diffs = Object.keys(snap).filter((k) => k !== "program" && prev[id][k] !== snap[k])
          .map((k) => (k === "requirements" || k === "description" ? `${k} text edited` : `${k}: '${prev[id][k] || ""}' -> '${snap[k]}'`));
        if (diffs.length) changes.push({ type: "CHANGED", id, program: snap.program, details: diffs.join("; ") });
      }
    }
    for (const [id, snap] of Object.entries(prev)) {
      if (!(id in cur)) changes.push({ type: "REMOVED", id, program: snap.program || "", details: "no longer in the sheet" });
    }
    return changes;
  }
  function prepareRows(sheets, sheetName) {
    const name = chooseSheet(sheets, sheetName);
    return { name, ...buildRows(sheets[name]) };
  }

  const api = { DEFAULT_PROFILE, EAST, TIERS, run, parseCSV, parseTextSheets, snapshot, diff, fnv, prepareRows,
    chooseSheet, fmt, iso, parseISO, cmpSort, classifyDeadline, findDates, trunc, clean };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
