#! /usr/bin/env node
const path = require("path");
const fs = require("fs");
const arg = require("arg");
const { Database } = require("sqlite3");

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

const db = new Database(dbPath);
const createTableQuery = `CREATE TABLE links(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, link TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
const insertQuery = `INSERT INTO links (title, link) VALUES (?, ?)`;

(async () => {
  const tables = await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.all(
        "select name from sqlite_master where type='table'",
        function (err, tables) {
          if (err) reject(err);
          resolve(tables);
        }
      );
    });
  });

  if (tables.length === 0) {
    db.run(createTableQuery, (_, err) => console.log(_, err));
  }

  args["--file"].forEach((i) => {
    const filePath = rj(ROOT, i);
    const fileExists = fs.existsSync(filePath);
    if (!fileExists) {
      console.log(`${i} doesn't exist, skipping`);
    } else {
      const file = fs
        .readFileSync(filePath, { encoding: "utf-8" })
        .toString()
        .split("\n");
      db.serialize(function () {
        const stmt = db.prepare(insertQuery);
        file
          .filter(
            (i) =>
              i.length > 0 &&
              !i.includes("chrome-extension://") &&
              !i.includes("google.")
          )
          .map((i) => {
            return i
              .replace(/\|/, "&&&")
              .split("&&&")
              .map((i) => i.trim());
          })
          .forEach((i) => {
            if (i[0]) {
              if (i[1]) i[1] = i[0];
              stmt.run(i[1], i[0]);
            }
          });
        stmt.finalize();
      });
    }
  });
})().finally(() => db.close());
