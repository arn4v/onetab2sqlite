#! /usr/bin/env node
const path = require("path");
const fs = require("fs");
const arg = require("arg");

const args = arg({
  "--file": [String],
  "--db": String,
  "-f": "--file",
});

/** @param {string[]} paths */
const rj = (...paths) => path.resolve(path.join(...paths));
/** @type {string} */
const ROOT = path.resolve(process.cwd());
/** @type {string} */
const usage =
  "Usage: onetab2sqlite --db ./onetab.db --file ./onetab-export.txt. You can pass multiple --file arguments.";

if (!args["--db"]) {
  console.log("--db argument missing.\n", usage);
  process.exit(1);
}

if (!args["--file"]) {
  console.log("--file argument missing.\n", usage);
  process.exit(1);
}

const dbPath = rj(ROOT, args["--db"]);
const dbExists = fs.existsSync(dbPath);

if (!dbExists)
  console.log(
    `Database doesn't exist at ${dbPath}, creating new sqlite3 database.`
  );

const createTable = `CREATE TABLE links(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
const insertQuery = `INSERT INTO links (title, url) VALUES (?, ?)`;

const db = require("better-sqlite3")(dbPath);
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all();
if (tables.length === 0) db.exec(createTable);

let links = [];
for (const i of args["--file"]) {
  const filePath = rj(ROOT, i);
  const fileExists = fs.existsSync(filePath);
  if (!fileExists) {
    console.log(`${i} doesn't exist, skipping`);
  } else {
    let file = fs
      .readFileSync(filePath, { encoding: "utf-8" })
      .toString()
      .split("\n")
      .map((i) => {
        return i
          .replace(/\|/, "&&&")
          .split("&&&")
          .map((i) => i.trim());
      })
      .filter((i) => {
        return (
          i[0] &&
          i[1] &&
          !i[0].includes("chrome-extension://") &&
          !i[0].includes("google.")
        );
      })
      .map((i) => {
        if (!i[1]) i[1] = i[0];
        return i;
      });
    links = [...links, ...file];
  }
}

for (const i of links) {
  const rows = db.prepare(`SELECT * FROM links WHERE url = ?`).all(i[0]);

  if (Array.isArray(rows) && rows.length === 0) {
    db.prepare(insertQuery).run(i[1], i[0]);
  }
}

db.close();
