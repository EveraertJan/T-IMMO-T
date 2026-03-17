const axios   = require('axios');
const cheerio = require('cheerio');
const { HEADERS, parsePrice, parseNum, enrichWithDetails, kwhToEPC} = require('./../utils');

const BASE_URL = 'https://www.immodesmet.be';
const LIST_URL = `${BASE_URL}/nl/te-koop`;
const VENDOR   = 'immodesmet';

async function fetchDetail(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    let kwh = [...$("span:contains('EPC')")];
    kwh_f = kwh.filter((e) => {
      return $(e).text().trim() == "EPC"
    });
    kwh = $(kwh_f).next().text().replace("kWh/m².jaar", "").trim();
    return {
      rooms:   parseNum($("span:contains('Aantal slaapkamers')").first().next().text()),
      surface: parseNum($("span:contains('Woongedeelte')").first().next().text()),
      price:   parsePrice($("span:contains('€')").first().text()),
      epc: kwhToEPC(kwh), 
      kwh: kwh,
      location: $(".infoTitleWrapper").text(),
    };
    
  } catch (_) {
    console.error(_)
    return { rooms: 0, surface: 0, price: 0, epc: '', kwh: 0, location };
  }
}

async function scrape() {
  const listings = [];
  try {
    const { data } = await axios.get(LIST_URL, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const seen = new Set();

    $('a[href*="/nl/te-koop/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m    = href.match(/\/nl\/te-koop\/(\d+)\/([^?#]*)/);
      if (!m) return;

      const id   = m[1];
      const slug = m[2];
      if (seen.has(id)) return;
      seen.add(id);

      const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;


      let title = slug.replace(/-/g, ' ');
      const divTexts = [];
      $(el).find('div').each((_, d) => {
        if ($(d).children().length === 0) {
          const t = $(d).text().trim();
          if (t) divTexts.push(t);
        }
      });
      for (const t of divTexts) {
        if (!/^\d/.test(t) && !t.includes('€') && t.length > 5) { title = t; break; }
      }

      listings.push({ id, vendor: VENDOR, url, title, location: '', epc: '', kwh: 0 });
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
