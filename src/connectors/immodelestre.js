const axios   = require('axios');
const cheerio = require('cheerio');
const { HEADERS, parsePrice, parseNum, enrichWithDetails } = require('./../utils');

const BASE_URL = 'https://www.immodelestre.be';
const LIST_URL = `${BASE_URL}/kopen/`;
const VENDOR   = 'immodelestre';

async function fetchDetail(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    return {
      price:   parsePrice($("p:contains('€')").first().text()),
      surface: parseNum($("td:contains('Woonoppervlakte')").first().next().text()),
      rooms:   parseNum($("td:contains('Aantal slaapkamers')").first().next().text()),
      title:   $('h1').text().trim(),
      epc: $("td:contains('EPC label')").first().next().text(), 
      kwh: parseNum($("td:contains('EPC')").first().find("span").text().replace("kWh/m²", "").trim()),
      location: $('.maps-link').first().text()
    };
  } catch (_) {
    return { surface: 0, rooms: 0, epc: '', kwh: 0 };
  }
}

async function scrape() {
  const listings = [];
  try {
    const { data } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const seen = new Set();

    $('.pand-item a[href*="/pand/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m    = href.match(/\/pand\/([^/]+)\/?$/);
      if (!m) return;

      if(href.match(/investeringseigendom/g) || href.match(/bouwgrond/g) || href.match(/commercieel-pand/g) || href.match(/opbrengsteigendom/g) || href.match(/handel/g) || href.match(/-app-/g) || href.match(/appartement/g)) return

      const id = m[1];
      if (seen.has(id)) return;
      seen.add(id);

      const url      = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const h3Text   = $(el).find('h3').first().text().trim();
      const commaIdx = h3Text.lastIndexOf(',');
      const location = commaIdx >= 0 ? h3Text.slice(commaIdx + 1).trim() : '';

      listings.push({ id, vendor: VENDOR, url, rooms: 0, surface: 0, location, epc: '', kwh: 0 });
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
