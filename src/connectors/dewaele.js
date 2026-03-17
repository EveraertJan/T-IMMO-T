const axios   = require('axios');
const cheerio = require('cheerio');
const { HEADERS, parsePrice, parseNum, locationMatches, enrichWithDetails, kwhToEPC } = require('./../utils');

const BASE_URL  = 'https://www.dewaele.com';
const LIST_URL  = `${BASE_URL}/nl/te-koop/alle/huis`;
const VENDOR    = 'dewaele';

// URL pattern: /nl/te-koop/[postal]-[city]/[type]/[slug]-[id]
const DETAIL_RE = /\/nl\/te-koop\/([\d]+)-([^/]+)\/([^/]+)\/[^/]+-(\d+)/;

async function fetchDetail(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const kwh = $(".text-xs:contains('EPC')").first().next().text().trim().replace("kWh/m²", "").trim();
    return {
      price:   parsePrice($('.price').text()),
      rooms:   parseNum($("td:contains('Slaapkamers')").first().next().text()),
      surface: parseNum($("td:contains('Bewoonbare oppervlakte')").next().text()),
      epc: kwhToEPC(kwh), 
      kwh: kwh,
      location: $('a[href="#property-map"]').text().trim()
    };
  } catch (_) {
    console.log(_)
    return { price: 0, rooms: 0, surface: 0, epc: '', kwh: 0 };
  }
}

async function scrape() {
  const listings = [];
  try {
    const { data } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const seen = new Set();

    $('a[href*="/nl/te-koop/"]')
      .filter((_, el) => DETAIL_RE.test($(el).attr('href') || ''))
      .each((_, el) => {
        const href = $(el).attr('href');
        if (seen.has(href)) return;
        seen.add(href);

        const m = href.match(DETAIL_RE);
        if (!m) return;
        const [, postal, citySlug, , id] = m;

        const url      = `${BASE_URL}${href}`;
        const location = `${postal} ${citySlug.replace(/-/g, ' ')}`;
        const card     = $(el).parent().parent().parent().parent();
        const title    = card.find('h3').first().text().trim() || location;
        const text     = card.text().replace(/\s+/g, ' ');

        const priceM  = text.match(/€\s*([\d.]+)/);
        const surfM   = text.match(/(\d+)\s*m²/);
        const roomsM  = text.match(/m²\s+(\d+)\s+EPC/);

        listings.push({
          id, vendor: VENDOR, url, title, location,
          price:   priceM ? parsePrice(priceM[1]) : 0,
          surface: surfM  ? parseInt(surfM[1], 10) : 0,
          rooms:   roomsM ? parseInt(roomsM[1], 10) : 0,
          epc: '', kwh: 0,
        });
      });

    const candidates = listings;
    console.log(`[${VENDOR}] ${candidates.length}/${listings.length} listings match location — fetching details`);
    await enrichWithDetails(candidates, fetchDetail);
  } catch (err) {
    console.error(`[${VENDOR}] Scrape error:`, err.message);
  }

  console.log(`[${VENDOR}] Found ${listings.length} listing(s)`);
  return listings;
}

module.exports = { scrape };
