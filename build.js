// Assembles src/* into public/index.html, the page Render serves.
const fs = require("fs");
const path = require("path");
const E = require("./src/engine.js");
const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
let t = read("src/template.html")
  .replace("/*STYLE*/", () => read("src/style.css"))
  .replace("/*ENGINE*/", () => read("src/engine.js"))
  .replace("/*SYNC*/", () => read("src/sync.js"))
  .replace("/*APP*/", () => read("src/app.js"));
const cut = t.indexOf("</style>") + "</style>".length;
const head = t.slice(0, cut), body = t.slice(cut);
const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>body{margin:0}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
fs.mkdirSync(path.join(__dirname, "public"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "public/index.html"), full);
console.log("public/index.html", (full.length / 1024).toFixed(0) + " KB");
