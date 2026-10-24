# Handoff: Derm Research Shortlist

> **Note to any AI assistant working on this project:** read this entire file before responding to any prompt in this project, every time you see the project for the first time

## What this is

A single-page website that reads the crowdsourced dermatology research-fellowship Google Sheet (an .xlsx or .csv export) and sorts every program into Shortlist, Needs verification and Excluded, ordered by deadline urgency, then pay, then location. It runs entirely in the browser. There is no server, no account and no AI needed to use it.

## Using it

1. Open the site. In Google Sheets choose File, Download, Microsoft Excel (.xlsx), then drop the file on the page.
2. Open Profile settings first and enter your own facts: Step 3 status, the date you are available from, citizenship, and your preferred states. The defaults belong to the original user.
3. Read the Shortlist. Work Needs verification by moving each program to Shortlist or Excluded. Track progress with the Status column and notes.
4. Upload a fresh export weekly. Your statuses, notes and decisions carry over because they are saved by program. The What changed tab lists new, changed and removed programs.
5. Saved data lives only in your own browser. Use Backup & restore to download a backup before clearing browser data or switching devices.

## Rules in brief (the decisions behind the design)

- Hard exclusions: student-only wording (gap year, between 3rd and 4th year, current medical student, MD/DO not eligible), more training than the applicant will have (2+ years of residency, completed residency, board eligibility required), and citizenship mismatch.
- Missing information never excludes a program and never counts as a pass. Ambiguous wording goes to Needs verification with the reason shown.
- Pay, skills, two-year length, Step 3, and license requirements are shown and flagged, never used as filters. Skills never affect ranking.
- The sheet is crowdsourced. Confirm every requirement, pay figure and deadline on the program's own page before applying.

## Changing the tool

Everything is in `src/` (engine.js holds the rules, app.js the interface, style.css, template.html). Run `node build.js` to regenerate `public/index.html`, which is the page Render serves. There are no automated tests yet. If you use an AI assistant to make changes, give it this file, README.md and the `src` folder, and tell it: keep it a single static page with no server, never filter on missing data, and keep statuses and notes stored by program ID in localStorage.

## Instruction files

`AGENTS.md` holds the working style and tells an assistant to read this file first. `CLAUDE.md` contains one line, `@AGENTS.md`, so Claude Code loads the same instructions automatically. Other agents that read `AGENTS.md` pick it up directly. Edit `AGENTS.md`, not `CLAUDE.md`. In a Claude.ai Project, paste the contents of `AGENTS.md` into the project instructions and upload this file.

## Deploying on Render

Create a Static Site from the GitHub repo, set the build command to `node build.js` and the publish directory to `public` (render.yaml has these settings). Render rebuilds `public/index.html` from `src/` on every push.
