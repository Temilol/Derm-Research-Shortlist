# Handoff: Derm Research Shortlist

> **Note to any AI assistant working on this project:** read this entire file before responding to any prompt in this project, every time you see the project for the first time

## What this is

A single-page website that reads the crowdsourced dermatology research-fellowship Google Sheet (an .xlsx or .csv export) and sorts every program into Shortlist, Needs verification and Excluded, ordered by deadline urgency, then pay, then location. It runs entirely in the browser. There is no server of our own and no AI needed to use it. An account is optional: signing in syncs your data across devices through Firebase.

## Using it

1. Open the site and press Load the latest sheet. The page reads the public Google Sheet directly (its xlsx export). Uploading an .xlsx or .csv still works if Google can't be reached.
2. Open Profile settings first and enter your own facts: Step 3 status, the date you are available from, citizenship, and your preferred states. The defaults belong to the original user.
3. Read the Shortlist. Work Needs verification by moving each program to Shortlist or Excluded. Track progress with the Status column, notes and each program's application checklist (open a program's details). Mark shared documents such as your CV once under Profile settings, My documents.
4. Press Update sheet weekly (the header nudges after 7 days). Your statuses, notes, decisions and checklists carry over because they are saved by program. The What changed tab lists new, changed and removed programs since the previous load.
5. Saved data lives in your browser. To use more than one device, sign in to sync (Profile settings, Sync across devices). Without an account, use Backup & restore to move data or keep a copy before clearing browser data.

## Rules in brief (the decisions behind the design)

- Hard exclusions: student-only wording (gap year, between 3rd and 4th year, current medical student, MD/DO not eligible), more training than the applicant will have (2+ years of residency, completed residency, board eligibility required), and citizenship mismatch.
- Missing information never excludes a program and never counts as a pass. Ambiguous wording goes to Needs verification with the reason shown.
- Pay, skills, two-year length, Step 3, and license requirements are shown and flagged, never used as filters. Skills never affect ranking.
- The sheet is crowdsourced. Confirm every requirement, pay figure and deadline on the program's own page before applying.

## Changing the tool

Everything is in `src/` (engine.js holds the rules, sync.js the cross-device sync, app.js the interface, style.css, template.html). Run `node build.js` to regenerate `public/index.html`, which is the page Render serves. To try it locally, run `python3 -m http.server 8765` in `public/` and open http://localhost:8765/. Opening the file straight from disk breaks Load the latest sheet (Google refuses file:// pages), and any port other than 8765 breaks sign-in (the Firebase key only allows that one). Run `node --test tests/*.test.js` for the tests; they cover the sync merge rules (including checklists), not the eligibility engine yet. A new field on a tracker entry must also be added to `firestore.rules` and republished, or sync refuses it. If you use an AI assistant to make changes, give it this file, README.md and the `src` folder, and tell it: keep it a single static page with no server of its own, never filter on missing data, and keep statuses and notes stored by program ID in localStorage.

## Application checklist

Each program's details open with a checklist built from the application items the engine finds in its text (`appComponentList` in engine.js, keyed by type such as `cv`, `ps`, `lor`, so ticks survive rewording). People add their own items too. Ticks live in the tracker entry as `items` {key: {done, at, label?, removed?}}.

- Shared documents (CV, USMLE scores, transcript, dean's letter, photo) are ticked once in Profile settings, My documents (`profile.docs`). A tick inside one program overrides that for the one program.
- Letter writers are `profile.writers` [{id, name, at, removed}]; a program's letters are items `w:<writer id>`, done meaning received. The letters item ticks itself once enough letters are in.
- An item the sheet stops listing keeps its tick and shows "no longer listed"; unticked ones drop off. Status is never changed automatically; "Mark as Applied" appears when everything is ticked.
- Items, documents and writers merge one at a time across devices, and removals are kept as flagged entries so they sync.

## Sync across devices

Optional email and password sign-in through Firebase (project `derm-research-shortlist`; Authentication and Firestore). The Firebase SDK loads only after someone signs in, so the page stays light for everyone else.

- localStorage stays the working copy on each device. Firestore holds `users/{uid}` (profile, including My documents and letter writers) and `users/{uid}/tracker/{programId}` (status, notes, decision, checklist items). The spreadsheet, the What changed snapshot and column choices stay on each device.
- Merging is field by field and the newer edit wins. Every status, note, decision and profile setting stores when it last changed. On a tie the account wins, so a fresh device never overwrites real settings. A note edited on two devices keeps both versions. A clear is an edit and syncs; entries are never deleted while syncing.
- Signing out removes the synced data from that browser; it stays in the account. Deleting the account removes the account and its Firestore data and leaves the browser's own copy.
- Access control is `firestore.rules`: each person can read and write only their own records. Paste it into Firebase console, Firestore Database, Rules, and Publish after any change. The web config in app.js is public by design.
- The Firebase project holds users' email addresses. Free plan limits apply (Firestore reads and writes per day, sign-in emails per day).
- Firebase's authorized domains must include the live domain (and `localhost` for local testing). The web key is also restricted by website in Google Cloud (APIs & Services, Credentials: the live domain and `http://localhost:8765/*`) and limited to Firebase's own APIs. Add any new domain in both places, or sign-in fails.

## Instruction files

`AGENTS.md` holds the working style and tells an assistant to read this file first. `CLAUDE.md` contains one line, `@AGENTS.md`, so Claude Code loads the same instructions automatically. Other agents that read `AGENTS.md` pick it up directly. Edit `AGENTS.md`, not `CLAUDE.md`. In a Claude.ai Project, paste the contents of `AGENTS.md` into the project instructions and upload this file.

## Deploying on Render

The live site is https://derm-research-shortlist.onrender.com. To recreate it, create a Static Site from the GitHub repo, set the build command to `node build.js` and the publish directory to `public` (render.yaml has these settings). Render rebuilds `public/index.html` from `src/` on every push.
