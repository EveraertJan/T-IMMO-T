const Database = require('better-sqlite3');
const path = require('path');
const { extractPostalCode } = require('./utils');

const DB_PATH = path.join(__dirname, '..', 'data', 'seen.db');

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS seen_listings (
    vendor   TEXT NOT NULL,
    id       TEXT NOT NULL,
    seen_at  INTEGER NOT NULL,
    PRIMARY KEY (vendor, id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    vendor      TEXT    NOT NULL,
    id          TEXT    NOT NULL,
    seen_at     INTEGER NOT NULL,
    matched     INTEGER NOT NULL DEFAULT 0,
    dismissed   INTEGER NOT NULL DEFAULT 0,
    url         TEXT    NOT NULL DEFAULT '',
    title       TEXT    NOT NULL DEFAULT '',
    epc         TEXT    NOT NULL DEFAULT '',
    kwh         INTEGER NOT NULL DEFAULT 0,
    price       INTEGER NOT NULL DEFAULT 0,
    rooms       INTEGER NOT NULL DEFAULT 0,
    surface     INTEGER NOT NULL DEFAULT 0,
    location    TEXT    NOT NULL DEFAULT '',
    postal_code TEXT    NOT NULL DEFAULT '',
    PRIMARY KEY (vendor, id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS scrape_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ran_at      INTEGER NOT NULL,
    new_items   INTEGER NOT NULL DEFAULT 0,
    new_matches INTEGER NOT NULL DEFAULT 0
  )
`);

// Migrate existing databases
try { db.exec(`ALTER TABLE listings ADD COLUMN dismissed   INTEGER NOT NULL DEFAULT 0`);  } catch (_) {}
try { db.exec(`ALTER TABLE listings ADD COLUMN postal_code TEXT    NOT NULL DEFAULT ''`); } catch (_) {}
try { db.exec(`ALTER TABLE listings ADD COLUMN epc         TEXT    NOT NULL DEFAULT ''`); } catch (_) {}
try { db.exec(`ALTER TABLE listings ADD COLUMN kwh         INTEGER NOT NULL DEFAULT 0`);  } catch (_) {}

// Backfill postal_code from existing location values
{
  const rows = db.prepare(`SELECT vendor, id, location FROM listings WHERE postal_code = '' AND location != ''`).all();
  const stmtBackfill = db.prepare(`UPDATE listings SET postal_code = ? WHERE vendor = ? AND id = ?`);
  for (const r of rows) {
    const pc = extractPostalCode(r.location);
    if (pc) stmtBackfill.run(pc, r.vendor, r.id);
  }
}

const stmtIsNew  = db.prepare('SELECT 1 FROM seen_listings WHERE vendor = ? AND id = ?');
const stmtMark   = db.prepare('INSERT OR IGNORE INTO seen_listings (vendor, id, seen_at) VALUES (?, ?, ?)');
const stmtSave   = db.prepare(`
  INSERT OR IGNORE INTO listings (vendor, id, seen_at, matched, url, title, epc, kwh, price, rooms, surface, location, postal_code)
  VALUES (@vendor, @id, @seen_at, @matched, @url, @title, @epc, @kwh, @price, @rooms, @surface, @location, @postal_code)
`);
const stmtGetAll        = db.prepare('SELECT * FROM listings WHERE dismissed = 0 ORDER BY seen_at DESC');
const stmtGetMatched    = db.prepare('SELECT * FROM listings WHERE matched = 1 AND dismissed = 0 ORDER BY seen_at DESC');
const stmtGetDismissed  = db.prepare('SELECT * FROM listings WHERE dismissed = 1 ORDER BY seen_at DESC');
const stmtDismiss       = db.prepare('UPDATE listings SET dismissed = 1 WHERE vendor = ? AND id = ?');

const EDITABLE_FIELDS = new Set(['title', 'price', 'rooms', 'surface', 'epc', 'kwh', 'location', 'postal_code']);
const updateCache = {};
function getUpdateStmt(field) {
  if (!updateCache[field]) {
    updateCache[field] = db.prepare(`UPDATE listings SET ${field} = ? WHERE vendor = ? AND id = ?`);
  }
  return updateCache[field];
}

function isNew(vendor, id) {
  return stmtIsNew.get(vendor, id) === undefined;
}

function markSeen(vendor, id) {
  stmtMark.run(vendor, id, Date.now());
}

function saveListing(listing, matched) {
  stmtSave.run({
    vendor:      listing.vendor,
    id:          listing.id,
    seen_at:     Date.now(),
    matched:     matched ? 1 : 0,
    url:         listing.url      || '',
    title:       listing.title    || '',
    epc:         listing.epc      || '',
    kwh:         listing.kwh      || 0,
    price:       listing.price    || 0,
    rooms:       listing.rooms    || 0,
    surface:     listing.surface  || 0,
    location:    listing.location || '',
    postal_code: extractPostalCode(listing.location) || '',
  });
  markSeen(listing.vendor, listing.id);
}

function getAll() {
  return stmtGetAll.all();
}

function getMatched() {
  return stmtGetMatched.all();
}

function getDismissed() {
  return stmtGetDismissed.all();
}

function dismiss(vendor, id) {
  stmtDismiss.run(vendor, id);
}

function updateListing(vendor, id, field, value) {
  if (!EDITABLE_FIELDS.has(field)) throw new Error(`Field '${field}' is not editable`);
  getUpdateStmt(field).run(value, vendor, id);
}

const stmtLogScrape = db.prepare(`INSERT INTO scrape_logs (ran_at, new_items, new_matches) VALUES (?, ?, ?)`);
const stmtGetLogs   = db.prepare(`SELECT * FROM scrape_logs ORDER BY ran_at DESC LIMIT 200`);

function logScrape(newItems, newMatches) {
  stmtLogScrape.run(Date.now(), newItems, newMatches);
}

function getLogs() {
  return stmtGetLogs.all();
}

module.exports = { isNew, markSeen, saveListing, getAll, getMatched, getDismissed, dismiss, updateListing, logScrape, getLogs };
