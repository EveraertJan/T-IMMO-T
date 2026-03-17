const axios   = require('axios');
const cheerio = require('cheerio');
const { HEADERS, parsePrice, parseNum, enrichWithDetails,kwhToEPC } = require('./../utils');

const BASE_URL  = 'https://www.vastgoedpoppe.be';
const LIST_URL  = `${BASE_URL}/nl/te-koop/woningen/?type[]=5&price-min=&price-max=`;
const VENDOR    = 'vastgoedpoppe';

// URL pattern: /nl/te-koop/[type]/[city-postal]/[id]
const DETAIL_RE = /\/nl\/te-koop\/([^/]+)\/([^/]+)\/([^/?#]+)/;

async function fetchDetail(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const text = $('body').text().replace(/\s+/g, ' ');
    const kwh = $('td:contains("EPC waarde")').next().text().replace("kWh/m²", "").trim()
    return {
      rooms:   parseInt(text.match(/(\d+)\s*slaapkamer/i)?.[1], 10) || 0,
      surface: parseInt(text.match(/(\d+)\s*m2\s*woonopp/i)?.[1], 10) || 0,
      price:   parsePrice(text.match(/€\s*([\d.,]+)/)?.[1]),
      epc: kwhToEPC(kwh), 
      kwh: kwh,
    };
  } catch (_) {
    return { rooms: 0, surface: 0, price: 0, epc: '', kwh: 0 };
  }
}

async function scrape() {
  const listings = [];
  try {
    const { data } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const seen = new Set();

    $('a[href]').each((_, el) => {
      const href  = $(el).attr('href') || '';
      const match = href.match(DETAIL_RE);

      if (!match) return;
      const [id, , rawLocation, ] = match;
      if (seen.has(id)) return;
      seen.add(id);


      const url      = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const location = rawLocation.replace(/-[\d]+$/, '').replace(/-/g, ' ');
      const card     = $(el);
      const typeText = card.find('.property-type').first().text().trim();
      const cityText = card.find('.property-city').first().text().trim();
      const title    = typeText ? `${typeText} ${cityText || location}` : location;

      listings.push({
        id, vendor: VENDOR, url, title, location,
        price:   parsePrice(card.find('.property-price').first().text()),
        rooms:   parseNum(card.find('.property-rooms').first().text()),
        surface: parseNum(card.find('.property-surface').first().text()),
        epc: '', kwh: 0,
      });
    });
  } catch (err) {
    console.error(`[${VENDOR}] Scrape error:`, err.message);
  }

  const seen = new Set();
  const unique = listings.filter(l => seen.has(l.id) ? false : seen.add(l.id));

  console.log(`[${VENDOR}] ${unique.length} listings — fetching details`);
  await enrichWithDetails(unique, fetchDetail);

  console.log(`[${VENDOR}] Found ${unique.length} listing(s)`);
  return unique;
}

module.exports = { scrape };
