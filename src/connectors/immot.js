const axios   = require('axios');
const cheerio = require('cheerio');
const { HEADERS, parsePrice, parseNum, enrichWithDetails, kwhToEPC } = require('./../utils');
const BASE_URL = 'https://immo-t.be';
const LIST_URL = `${BASE_URL}/aanbod`;
const VENDOR   = 'immot';

async function fetchDetail(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const kwh = $("th:contains('EPC')").first().next().text().trim().replace(" kWh/m²", "");
    return {
      rooms:    parseNum($("th:contains('Slaapkamers')").first().next().text()),
      price:    parsePrice($("th:contains('Prijs')").first().next().text()),
      surface:  parseNum($("th:contains('Bewoonbare oppervlakte')").first().next().text()),
      location: $("address").first().html().replace(/<br>/g, " - "),
      epc:      kwhToEPC(kwh),
      kwh:      kwh,
    };

  } catch (_) {
    return { price: 0, rooms: 0, surface: 0, location: '', epc: '', kwh: 0 };
  }
}

async function scrape() {
  const listings = [];
  try {
    const { data } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const seen = new Set();

    $('a[href*="/aanbod/detail/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      // Expected: /aanbod/detail/[type]/[slug]/[id]
      const m = href.match(/\/aanbod\/detail\/([^/]+)\/([^/]+)\/(\d+)/);
      if (!m) return;

      const slug = m[2];
      const id   = m[3];
      if (seen.has(id)) return;
      seen.add(id);

      const url   = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const title = slug.replace(/-/g, ' ');

      listings.push({ id, vendor: VENDOR, url, title, epc: '', kwh: 0 });
    });

    console.log(`[${VENDOR}] ${listings.length} listings — fetching details`);
    await enrichWithDetails(listings, fetchDetail);
  } catch (err) {
    console.error(`[${VENDOR}] Scrape error:`, err.message);
  }

  console.log(`[${VENDOR}] Found ${listings.length} listing(s)`);
  return listings;
}

module.exports = { scrape };
