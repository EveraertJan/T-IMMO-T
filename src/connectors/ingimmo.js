const axios   = require('axios');
const cheerio = require('cheerio');
const { HEADERS, parsePrice, parseNum, enrichWithDetails, kwhToEPC } = require('./../utils');

const BASE_URL = 'https://www.ingimmo.be';
const LIST_URL = `${BASE_URL}/te-koop?MinimumSoldPeriod=&SoldPeriod=&MinimumRentedPeriod=&RentedPeriod=&FlowStatus=&ExcludeProjectRelatedItems=&EstateTypes=&Categories=&marketingtypes-excl=&searchon=list&sorts=Dwelling&transactiontype=Sale`;
const VENDOR   = 'ingimmo';

async function fetchDetail(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);

    let kwh =  $("td:contains('Totaal verbruik:')").next().text().replace(" kWh/(m² jaar)", "").split(",")[0].trim();
    if(kwh == 0) {
      //
      kwh =  $("td:contains('EPC Index:')").next().text().replace(" kWh/(m² jaar)", "").split(",")[0].trim();
    }
    return {
      surface:  parseNum($("td:contains('Bewoonbare opp.:')").next().text()),
      rooms:    parseNum($("td:contains('Slaapkamers:')").next().text().split('(')[0]),
      price:    parsePrice($("td:contains('Vraagprijs:')").next().text().split('/')[0]),
      location: $("td:contains('Referentie:')").next().text().trim(),
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

    $('.pand-wrapper').each((_, el) => {
      const href = $(el).attr('href') || '';
      // Expected: /detail/te-koop-[type]-[city]/[id]
      const m = href.match(/\/detail\/[^/]+\/(\d+)/);
      if (!m) return;

      const id = m[1];
      if (seen.has(id)) return;
      seen.add(id);

      const url      = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const h3Text   = $(el).closest('.property-card').find('h3').first().text().trim();
      const dashIdx  = h3Text.indexOf(' - ');
      const location = dashIdx >= 0 ? h3Text.slice(0, dashIdx).trim() : '';

      listings.push({ id, vendor: VENDOR, url, title: h3Text, location, epc: '', kwh: 0 });
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
