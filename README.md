# Derm Fellowship Finder

A single static web page. You upload the crowdsourced dermatology research-fellowship spreadsheet
(.xlsx or .csv), and it filters it against your profile, sorts by deadline urgency, and lets you sort and
filter every column. All processing happens in your browser. Nothing is uploaded to a server.

## Put it on Render (one time, about ten minutes)

1. Create a new **public or private** repository on GitHub (for example `derm-fellowship-finder`).
2. Upload everything in this folder to it (GitHub: **Add file → Upload files**, drag the folder contents in, **Commit**).
3. In Render, choose **New + → Static Site** and connect that repository.
4. Set **Build Command** to nothing (leave it blank) and **Publish Directory** to `public`.
5. Click **Create Static Site**. Render gives you an address ending in `.onrender.com`.

(`render.yaml` describes the same settings if you prefer **New + → Blueprint**.)

## Updating the page later

Replace `public/index.html` in the repository (GitHub: open the file, **pencil icon**, or **Upload files**
over it). Render redeploys by itself in a minute or two.

## Every week

Open the site, drag the newly downloaded spreadsheet onto the page (Google Sheets: **File → Download →
Microsoft Excel (.xlsx)**). The **What changed** tab shows programs that are new, changed or removed since
the previous file you loaded.

## Where your data lives

Your profile settings, tracker statuses and notes, the last file you loaded, and the change history are
stored in this browser only. Use **Backup & restore** to save them to a file or move them to another
device. The page loads the SheetJS library from cdnjs.cloudflare.com to read .xlsx files; CSV uploads work
without it.

## For editing the code

`src/` holds the page source (engine.js is the filtering logic, app.js the interface, style.css the look).
`node build.js` assembles `public/index.html`. `test/compare.js` checks the JavaScript engine against the
original Python script's results.
