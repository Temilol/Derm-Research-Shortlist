/* Optional cross-device sync through Firebase (email/password sign-in, Firestore).
 * Each browser's localStorage stays the working copy; Firestore is where devices meet.
 * The merge functions are pure so they can be tested in Node; the Firebase SDK loads only when someone signs in.
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ merge (pure)
  // Fields that travel to Firestore. notesSyncedAt stays on the device: it is the notes time both sides last agreed on.
  const ENTRY_FIELDS = ["status", "statusAt", "notes", "notesAt", "decision", "decidedOn", "textHash", "decisionAt", "name", "state"];
  const at = (o, key) => (o && o[key + "At"]) || 0;
  const norm = (v) => (v == null || v === 0 ? "" : v);
  const sameOn = (a, b, fields) => fields.every((f) => norm(a[f]) === norm(b[f]));
  const blank = (o, fields) => fields.every((f) => !o[f]);
  const day = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // Newer edit wins. On a tie the account wins, unless the account has nothing there.
  function pick(local, remote, key, fields, remoteExists) {
    const lA = at(local, key), rA = at(remote, key);
    const useLocal = lA > rA || (lA === rA && (!remoteExists || blank(remote, fields)));
    const src = useLocal ? local : remote, out = {};
    for (const f of fields) if (src[f]) out[f] = src[f];
    if (at(src, key)) out[key + "At"] = at(src, key);
    return out;
  }

  // Notes edited on both sides since they last agreed are kept together, newest first, so typed text is never lost.
  function mergeNotes(local, remote, remoteExists, now) {
    const ln = local.notes || "", rn = remote.notes || "";
    const lA = at(local, "notes"), rA = at(remote, "notes");
    const base = local.notesSyncedAt || 0;
    const bothEdited = !base || (lA > base && rA > base);
    if (ln && rn && ln !== rn && bothEdited) {
      // One side already holds the other's text (an earlier merge, or typing that only added): keep the fuller one.
      if (rn.includes(ln)) return { notes: rn, notesAt: Math.max(rA, lA) };
      if (ln.includes(rn)) return { notes: ln, notesAt: Math.max(rA, lA) };
      const [newer, older, olderAt] = lA > rA ? [ln, rn, rA] : [rn, ln, lA];
      return { notes: `${newer}\n\n— From another device${olderAt ? " (" + day(olderAt) + ")" : ""}:\n${older}`, notesAt: now, conflict: true };
    }
    const out = pick(local, remote, "notes", ["notes"], remoteExists);
    return { notes: out.notes || "", notesAt: out.notesAt || 0 };
  }

  // Merge one program's entry. Returns the entry to keep locally, the one to write remotely, and what changed.
  function mergeEntry(local, remote, remoteExists, now) {
    local = local || {}; remote = remote || {};
    const m = Object.assign(
      { status: "", notes: "", decision: "" },
      pick(local, remote, "status", ["status"], remoteExists),
      pick(local, remote, "decision", ["decision", "decidedOn", "textHash"], remoteExists),
    );
    const n = mergeNotes(local, remote, remoteExists, now);
    m.notes = n.notes;
    if (n.notesAt) m.notesAt = n.notesAt;
    const name = local.name || remote.name, state = local.state || remote.state;
    if (name) m.name = name;
    if (state) m.state = state;
    const remoteOut = {};
    for (const f of ENTRY_FIELDS) if (m[f] !== undefined && m[f] !== "") remoteOut[f] = m[f];
    for (const f of ["status", "notes", "decision"]) remoteOut[f] = m[f];
    const localOut = Object.assign({}, m, { notesSyncedAt: m.notesAt || 0 });
    return {
      local: localOut,
      remote: remoteOut,
      localChanged: !sameOn(local, m, ENTRY_FIELDS),
      remoteChanged: !remoteExists || !sameOn(remote, m, ENTRY_FIELDS),
      conflict: !!n.conflict,
    };
  }

  // Profile settings merge one setting at a time. A setting never edited on this device loses to the account.
  function mergeProfile(local, localAt, remote, remoteAt, remoteExists) {
    const profile = {}, profileAt = {};
    let localChanged = false, remoteChanged = !remoteExists;
    const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
    for (const k of keys) {
      const lA = (localAt && localAt[k]) || 0, rA = (remoteAt && remoteAt[k]) || 0;
      const useLocal = !remoteExists || !(k in remote) || lA > rA;
      profile[k] = useLocal ? local[k] : remote[k];
      if (Math.max(lA, rA)) profileAt[k] = useLocal ? lA : rA;
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      if (!same(profile[k], local[k])) localChanged = true;
      if (!remoteExists || !same(profile[k], remote[k]) || (profileAt[k] || 0) !== rA) remoteChanged = true;
    }
    return { profile, profileAt, localChanged, remoteChanged };
  }

  // ------------------------------------------------------------------ Firebase (browser only)
  const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
  let loading = null, auth = null, db = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve;
      s.onerror = () => reject(Object.assign(new Error("Could not load the sync service. Check your connection and try again."), { code: "sdk-load" }));
      document.head.appendChild(s);
    });
  }
  function load(config) {
    if (!loading) {
      loading = loadScript(SDK + "firebase-app-compat.js")
        .then(() => Promise.all([loadScript(SDK + "firebase-auth-compat.js"), loadScript(SDK + "firebase-firestore-compat.js")]))
        .then(() => { const fb = root.firebase; fb.initializeApp(config); auth = fb.auth(); db = fb.firestore(); });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  const userDoc = (uid) => db.collection("users").doc(uid);
  const trackerCol = (uid) => userDoc(uid).collection("tracker");

  async function writeTracker(uid, writes) {
    const ids = Object.keys(writes);
    for (let i = 0; i < ids.length; i += 400) {
      const batch = db.batch();
      for (const id of ids.slice(i, i + 400)) batch.set(trackerCol(uid).doc(id), writes[id]);
      await batch.commit();
    }
  }
  async function deleteAccount(email, password) {
    const user = auth.currentUser;
    if (!user) throw Object.assign(new Error("Not signed in."), { code: "auth/no-current-user" });
    await user.reauthenticateWithCredential(root.firebase.auth.EmailAuthProvider.credential(email, password));
    const snap = await trackerCol(user.uid).get();
    const refs = snap.docs.map((d) => d.ref).concat([userDoc(user.uid)]);
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      refs.slice(i, i + 400).forEach((r) => batch.delete(r));
      await batch.commit();
    }
    await user.delete();
  }

  const MESSAGES = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/user-not-found": "Email or password is incorrect.",
    "auth/invalid-login-credentials": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
    "auth/weak-password": "Use a password of at least 6 characters.",
    "auth/password-does-not-meet-requirements": "That password doesn’t meet the requirements. Try a longer one.",
    "auth/invalid-email": "That email address doesn’t look right.",
    "auth/missing-password": "Enter your password.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/network-request-failed": "Can’t reach the sync service. Check your connection.",
    "auth/requires-recent-login": "Please enter your password again.",
    "permission-denied": "The sync service refused the change.",
    "resource-exhausted": "The sync service’s daily limit was reached. Changes stay on this device and sync later.",
    "unavailable": "Can’t reach the sync service right now.",
  };
  const message = (e) => MESSAGES[e && e.code] || (e && e.message) || "Something went wrong.";

  const api = {
    mergeEntry, mergeProfile, ENTRY_FIELDS, message, load,
    onAuth: (cb) => auth.onAuthStateChanged(cb),
    signIn: (email, pw) => auth.signInWithEmailAndPassword(email, pw),
    signUp: (email, pw) => auth.createUserWithEmailAndPassword(email, pw),
    resetPassword: (email) => auth.sendPasswordResetEmail(email),
    signOut: () => auth.signOut(),
    watchTracker: (uid, onNext, onError) => trackerCol(uid).onSnapshot(onNext, onError),
    watchProfile: (uid, onNext, onError) => userDoc(uid).onSnapshot(onNext, onError),
    writeTracker,
    writeProfile: (uid, data) => userDoc(uid).set(data),
    waitForPendingWrites: () => db.waitForPendingWrites(),
    deleteAccount,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FSync = api;
})(typeof window !== "undefined" ? window : globalThis);
