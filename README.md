# <img src="logo.svg" width="32" height="32" alt="" align="top"> Derm Research Shortlist

Live site: https://derm-research-shortlist.onrender.com

A single static web page. You upload the crowdsourced dermatology research-fellowship spreadsheet
(.xlsx or .csv), and it filters it against your profile, sorts by deadline urgency, and lets you sort and
filter every column. All processing happens in your browser. Nothing is uploaded to a server.

## Every week

Open the site and press **Update sheet**. The page loads the latest version of the crowdsourced Google Sheet
directly; if Google can't be reached, download the sheet (Google Sheets: **File → Download → Microsoft Excel
(.xlsx)**) and use **Upload file**. The **What changed** tab shows programs that are new, changed or removed
since the previous load.

## Where your data lives

Your profile settings, tracker statuses and notes, the last file you loaded, and the change history are
stored in this browser. To use the same data on several devices, open **Profile settings** and sign in
under **Sync across devices**: your profile, statuses, notes and decisions then sync through Firebase,
and the spreadsheet stays on each device. Without an account, use **Backup & restore** to save your data
to a file or move it to another device. The page loads the SheetJS library from cdnjs.cloudflare.com to
read .xlsx files (CSV uploads work without it), and the Firebase library from gstatic.com only if you sign in.

## Changing the page

`src/` holds the page source (engine.js is the filtering logic, sync.js the cross-device sync, app.js the
interface, style.css the look). `firestore.rules` holds the Firebase security rules. Run the tests with
`node --test tests/*.test.js`.
Push changes to `main`; Render runs `node build.js` to rebuild `public/index.html` and redeploys in a
minute or two. Don't edit `public/index.html` directly; the build overwrites it.
