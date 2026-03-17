const config  = require('../config.json');
const communes = require('./communes.json');

const HEADERS   = { 'User-Agent': 'Mozilla/5.0 (compatible; immoscrape/1.0)' };
const LOCATIONS = (config.criteria && config.criteria.locations) || [];

// Build a lowercase name → postal code string map from communes.json
const communeMap = new Map();
for (const entry of communes) {
  const pc = String(entry['Postal Code']);
  for (const field of [
    'Sub-municipality name (Dutch)',
    'Sub-municipality name (French)',
    'Municipality name (Dutch)',
    'Municipality name (French)',
  ]) {
    const name = (entry[field] || '').trim().toLowerCase();
    if (name && !communeMap.has(name)) communeMap.set(name, pc);
  }
}

function extractPostalCode(location) {
  if (!location) return null;
  const match = location.match(/\b(\d{4})\b/);
  if (match) return match[1];
  const lastWord = location.trim().split(/\s+/).pop().toLowerCase();
  return communeMap.get(lastWord) || null;
}

function parsePrice(str) {
  if (!str) return 0;
  const n = parseInt(String(str).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function parseNum(str) {
  if (!str) return 0;
  const n = parseInt(String(str).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function locationMatches(location) {
  if (!LOCATIONS.length) return true;
  const loc = (location || '').toLowerCase();
  return LOCATIONS.some(l => loc.includes(l.toLowerCase()));
}

async function enrichWithDetails(listings, fetchDetail, batchSize = 5) {
  for (let i = 0; i < listings.length; i += batchSize) {
    const batch   = listings.slice(i, i + batchSize);
    const details = await Promise.all(batch.map(l => fetchDetail(l.url)));
    for (let j = 0; j < batch.length; j++) {
      for (const [key, val] of Object.entries(details[j])) {
        if (val !== 0 && val !== '') batch[j][key] = val;
      }
    }
  }
}

// Convert kWh/m²year to Belgian EPC label (A+→G)
function kwhToEPC(kwh) {
  if(/\d+/.test(kwh)){
    const n = parseNum(kwh);
    if (n <= 0)   return 'A+';
    if (n <= 100) return 'A';
    if (n <= 200) return 'B';
    if (n <= 300) return 'C';
    if (n <= 400) return 'D';
    if (n <= 500) return 'E';
    return 'F';
  } else {
    return "NAN"
  }
}

module.exports = { HEADERS, parsePrice, parseNum, locationMatches, enrichWithDetails, kwhToEPC, extractPostalCode };
