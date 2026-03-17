const axios   = require('axios');
const cheerio = require('cheerio');
const { HEADERS, parsePrice, parseNum, enrichWithDetails, kwhToEPC } = require('./../utils');

const BASE_URL = 'https://www.immodavinci.be';
const LIST_URL = `${BASE_URL}/residentieel/kopen?type[]=woningen`;
const VENDOR   = 'immodavinci';

function idFromUrl(url) {
  const parts = url.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || url;
}

async function fetchDetail(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const kwh = parseNum($("span:contains('EPC-score')").next().text().replace("kWh/m²/j", "").trim());
    return {
      rooms:    parseNum($('span:contains("Slaapkamers")').next().text()),
      surface:    parseNum($('span:contains("Oppervlakte")').first().next().text().replace("ca.", "").replace("m²", "").trim()),
      price:    parsePrice($("span:contains('Prijs')").first().next().text()),
      location: $("span:contains('Locatie')").first().next().text().trim(),
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

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (!href.includes('/detail/')) return;
      if($(el).find(".banner:contains('verkocht')").length > 0) return;
      const url   = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const id    = idFromUrl(url);
      const title = $(el).find('h3').first().text().trim() || id;
      const price = parsePrice($(el).find('p.price').first().text());

      const detailSpans = $(el).find('.property-details span');
      const rooms   = parseNum(detailSpans.filter((_, e) => $(e).find('img[src*="bedrooms"]').length > 0).first().text());
      const surface = parseNum(detailSpans.filter((_, e) => $(e).find('img[src*="/icons/surface"]').length > 0).first().text());

      if (id) {
        listings.push({ id, vendor: VENDOR, url, title, price, rooms, surface, epc: '', kwh: 0 });
      }
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
