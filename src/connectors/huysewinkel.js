const axios   = require('axios');
const cheerio = require('cheerio');
const { HEADERS, parsePrice, parseNum, enrichWithDetails, kwhToEPC } = require('./../utils');

const BASE_URL = 'https://www.huysewinkel.be';
const LIST_URL = `${BASE_URL}/te-koop?city_search=&type[]=Woning&type_search=p`;
const VENDOR   = 'huysewinkel';

async function fetchDetail(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const kwh = $("td:contains('EPC waarde')").next().text().trim().replace("kWh/m2", "").trim()
    return {
      price:   parsePrice($('.price').text()),
      rooms:   parseNum($("td:contains('Aantal slaapkamers')").next().text()),
      surface: parseNum($("td:contains('Woonoppervlakte')").next().text().replace("m2", "").trim()),
      epc: kwhToEPC(kwh), 
      kwh: kwh,
      location: $(".pretitle").first().text().replace(/\n/g, "").trim()
    };
  } catch (err) {
    console.error(err);
    return { price: 0, rooms: 0, surface: 0, epc: '', kwh: 0, location: "" };
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
      const m    = href.match(/\/te-koop\/([^/]+)\/([^/]+)\/(\d+)/);
      if (!m) return;

      const id = m[3];
      if (seen.has(id)) return;
      seen.add(id);

      const url      = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const title    = $(el).find('h2, h3').first().text().trim();
      const infoText = $(el).find('div').first().text().trim();
      const slashIdx = infoText.indexOf('/');
      const location = slashIdx >= 0 ? infoText.slice(0, slashIdx).trim() : m[1];
      const price    = slashIdx >= 0 ? parsePrice(infoText.slice(slashIdx + 1)) : 0;

      listings.push({ id, vendor: VENDOR, url, title, price, rooms: 0, surface: 0, location, epc: '', kwh: 0 });
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
