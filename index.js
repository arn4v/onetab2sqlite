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

(async () => {
  const db = new Database(dbPath);
  const createTableQuery = `CREATE TABLE links(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
  const insertQuery = `INSERT INTO links (title, url) VALUES (?, ?)`;

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

  const doesExist = (url) =>
    new Promise((resolve, reject) => {
      db.all(
        `SELECT title, url FROM links WHERE url=${`${
          url.includes("'") ? '"' : "'"
        }${url}${url.includes("'") ? '"' : "'"}`}`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });

  if (tables.length === 0) {
    db.run(createTableQuery);
  }

  db.serialize(function () {
    for (const i of args["--file"]) {
      const filePath = rj(ROOT, i);
      const fileExists = fs.existsSync(filePath);
      if (!fileExists) {
        console.log(`${i} doesn't exist, skipping`);
      } else {
        const file = fs
          .readFileSync(filePath, { encoding: "utf-8" })
          .toString()
          .split("\n");
        file
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
          .forEach((i) => {
            if (i[0]) {
              if (!i[1]) i[1] = i[0];
              doesExist(i[0].trim())
                .then((rows) => {
                  if (Array.isArray(rows) && rows.length === 0) {
                    const stmt = db.prepare(insertQuery);
                    stmt.run(i[1], i[0]);
                    stmt.finalize();
                  }
                })
                .catch((err) => {
                  console.log(err.toString());
                });
            }
          });
      }
    }
  });
  return db;
})().then((db) => {
  db.close();
});
