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

const createLinksTable = `CREATE TABLE links(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
const createTempTable = `CREATE TABLE temp(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
const insertQuery = `INSERT INTO temp (title, url) VALUES (?, ?)`;
const copyTemp = `INSERT INTO links SELECT DISTINCT * FROM temp`;
const dropTemp = `DROP TABLE temp`;

(async () => {
  const db = new Database(dbPath);

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
    db.run(createLinksTable);
  }

  if (!tables.some((i) => i.name === "temp")) {
    db.run(createTempTable);
  }

  for (const i of args["--file"]) {
    const filePath = rj(ROOT, i);
    const fileExists = fs.existsSync(filePath);
    if (!fileExists) {
      console.log(`${i} doesn't exist, skipping`);
    } else {
      let file = fs
        .readFileSync(filePath, { encoding: "utf-8" })
        .toString()
        .split("\n");

      file = file.map((i) => {
        return i
          .replace(/\|/, "&&&")
          .split("&&&")
          .map((i) => i.trim());
      });

      file = file.filter((i) => {
        return (
          i[0] &&
          i[1] &&
          !i[0].includes("chrome-extension://") &&
          !i[0].includes("google.")
        );
      });

      for (const i of file) {
        if (i[0]) {
          if (!i[1]) i[1] = i[0];
          db.serialize(function () {
            const stmt = db.prepare(insertQuery);
            stmt.run(i[1], i[0]);
            stmt.finalize();
          });
        }
      }
    }
  }
  return db;
})()
  .then((db) => {
    db.serialize(() => {
      db.run(copyTemp);
      db.run(dropTemp);
    });
    return db;
  })
  .then((db) => {
    new Promise((resolve, reject) => {
      let queries = [];
      db.each(
        `SELECT * FROM links`,
        (err, row) => {
          if (err) reject(err);
          queries.push(row);
        },
        (err, n) => {
          if (err) reject(err);
          resolve(queries);
        }
      );
    }).then(
      /** @param {Array} queries */ (queries) => {
        console.log(queries);
      }
    );
    return db;
  })
  .then((db) => {
    db.close();
  });
