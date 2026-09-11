const fs = require("fs");
const path = require("path");
const express = require("express");
const initSqlJs = require("sql.js");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "venue.db");
const SEED_PATH = path.join(DATA_DIR, "bands.json");

function saveDatabase(db) {
  const bytes = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(bytes));
}

function createSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS bands (
      id INTEGER PRIMARY KEY,
      payload TEXT NOT NULL
    );
  `);
}

function seedFromJson(db) {
  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`Missing seed file: ${SEED_PATH}`);
  }

  const bands = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  if (!Array.isArray(bands)) {
    throw new Error("Seed file must be a JSON array");
  }

  db.run("DELETE FROM bands");
  const insert = db.prepare(
    "INSERT INTO bands (id, payload) VALUES (?, ?)",
  );

  bands.forEach((band) => {
    insert.run([band.id, JSON.stringify(band)]);
  });

  insert.free();
  saveDatabase(db);
  return bands.length;
}

function readBands(db) {
  const result = db.exec("SELECT payload FROM bands ORDER BY id ASC");
  if (!result.length) return [];

  return result[0].values.map(([payload]) => JSON.parse(payload));
}

function readBandById(db, id) {
  const stmt = db.prepare("SELECT payload FROM bands WHERE id = ?");
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return JSON.parse(row.payload);
}

async function start() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const SQL = await initSqlJs();
  let db;

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  createSchema(db);

  const existing = db.exec("SELECT COUNT(*) FROM bands");
  const count = existing.length ? Number(existing[0].values[0][0]) : 0;
  const forceSeed = process.argv.includes("--seed");

  if (count === 0 || forceSeed) {
    const seeded = seedFromJson(db);
    console.log(`Seeded ${seeded} bands into SQLite`);
  }

  const app = express();
  app.use(express.json());

  app.get("/api/bands", (_req, res) => {
    res.json(readBands(db));
  });

  app.get("/api/bands/:id", (req, res) => {
    const band = readBandById(db, Number(req.params.id));
    if (!band) {
      res.status(404).json({ error: "Band not found" });
      return;
    }
    res.json(band);
  });

  app.use(express.static(ROOT));

  app.listen(PORT, () => {
    console.log(`Venue API + site: http://localhost:${PORT}`);
    console.log("Bands array: GET /api/bands");
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
