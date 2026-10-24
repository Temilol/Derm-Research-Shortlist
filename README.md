# Derm Research Shortlist

A single static web page. You upload the crowdsourced dermatology research-fellowship spreadsheet
(.xlsx or .csv), and it filters it against your profile, sorts by deadline urgency, and lets you sort and
filter every column. All processing happens in your browser. Nothing is uploaded to a server.

## Every week

Open the site, drag the newly downloaded spreadsheet onto the page (Google Sheets: **File → Download →
Microsoft Excel (.xlsx)**). The **What changed** tab shows programs that are new, changed or removed since
the previous file you loaded.

## Where your data lives

Your profile settings, tracker statuses and notes, the last file you loaded, and the change history are
stored in this browser only. Use **Backup & restore** to save them to a file or move them to another
device. The page loads the SheetJS library from cdnjs.cloudflare.com to read .xlsx files; CSV uploads work
without it.

## Changing the page

`src/` holds the page source (engine.js is the filtering logic, app.js the interface, style.css the look).
Push changes to `main`; Render runs `node build.js` to rebuild `public/index.html` and redeploys in a
minute or two. Don't edit `public/index.html` directly; the build overwrites it.
