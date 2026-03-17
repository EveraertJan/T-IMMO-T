const axios   = require('axios');
const cheerio = require('cheerio');
const { HEADERS, parsePrice, parseNum, enrichWithDetails } = require('./../utils');

const BASE_URL = 'https://www.immo-zone.be';
const LIST_URL = `${BASE_URL}/kopen/alle/huis/alle/alle/lijst`;
const VENDOR   = 'immozone';

async function fetchDetail(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    return {
      rooms:   parseNum($("li:contains('Slaapkamers')").find('span').first().text()),
      price:   $('.price').first().text().replace(/ /g, "").replace("€", "").replace(/ /g, ""),
      surface: parseNum($("li:contains('Bewoonbare oppervlakte')").find('span').first().text().replace("m2", "")),
      epc: $("li:contains('EPC')").find('span').first().text(),
      kwh: 0,
      location: $(".address").first().text()
    };
  } catch (_) {
    return { rooms: 0, surface: 0, price: 0, epc: '', kwh: 0, location: '' };
  }
}

async function scrape() {
  const listings = [];
  try {
    const { data } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const seen = new Set();

    $('a[href*="/te-koop/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      // Expected: /te-koop/[city]/[slug]/[id]
      const m = href.match(/\/te-koop\/([^/]+)\/([^/]+)\/(\d+)/);
      if (!m) return;

      const id = m[3];
      if (seen.has(id)) return;
      seen.add(id);

      const url      = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const title    = $(el).find('div.title, .title').first().text().trim() || m[2].replace(/-/g, ' ');
      const location = m[1].replace(/-/g, ' ');

      listings.push({ id, vendor: VENDOR, url, title, location, epc: '', kwh: 0 });
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
