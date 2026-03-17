require('dotenv').config();
const cron       = require('node-cron');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode     = require('qrcode-terminal');
const qrcodeImg  = require('qrcode');
const path       = require('path');
const fs         = require('fs');

const db         = require('./db');
const { passes } = require('./filter');
const notifier   = require('./notifier');
const config     = require('../config.json');

const connectors = {
  immodavinci:    require('./connectors/immodavinci'),
  dewaele:        require('./connectors/dewaele'),
  vastgoedpoppe:  require('./connectors/vastgoedpoppe'),
  immot:          require('./connectors/immot'),
  immozone:       require('./connectors/immozone'),
  immodesmet:     require('./connectors/immodesmet'),
  ingimmo:        require('./connectors/ingimmo'),
  huysewinkel:    require('./connectors/huysewinkel'),
  immodelestre:   require('./connectors/immodelestre'),
};

function ts() {
  return `[${new Date().toISOString()}]`;
}

async function runScrape() {
  console.log(`${ts()} Scrape cycle starting…`);

  const enabledConnectors = Object.entries(config.connectors)
    .filter(([, cfg]) => cfg.enabled)
    .map(([name]) => name);

  const results = await Promise.allSettled(
    enabledConnectors.map(name => connectors[name].scrape())
  );

  let newItems   = 0;
  let newMatches = 0;

  for (let i = 0; i < enabledConnectors.length; i++) {
    const name   = enabledConnectors[i];
    const result = results[i];

    if (result.status === 'rejected') {
      console.error(`${ts()} [${name}] connector threw:`, result.reason);
      continue;
    }

    const listings = result.value;

    for (const listing of listings) {
      if (!db.isNew(listing.vendor, listing.id)) continue;

      const matched = passes(listing);
      if (matched) {
        console.log(`${ts()} MATCH ${listing.vendor}/${listing.id} — ${listing.title} — €${listing.price}`);
        await notifier.notify(listing);
        newMatches++;
      } else {
        console.log(`${ts()} skip  ${listing.vendor}/${listing.id} (filtered out)`);
      }

      db.saveListing(listing, matched);
      newItems++;
    }
  }

  db.logScrape(newItems, newMatches);
  console.log(`${ts()} Scrape cycle done. ${newItems} new item(s), ${newMatches} match(es)`);
}

function clearChromiumLocks(dataPath) {
  const lockFiles = [
    path.join(dataPath, 'session', 'SingletonLock'),
    path.join(dataPath, 'session', 'SingletonCookie'),
    path.join(dataPath, 'session', 'SingletonSocket'),
  ];
  for (const f of lockFiles) {
    try {
      fs.unlinkSync(f);
      console.log(`${ts()} Removed stale lock: ${f}`);
    } catch (_) {}
  }
}

async function main() {
  console.log(`${ts()} immoscrape scraper starting…`);

  const wwebAuthPath = path.join(__dirname, '..', 'data', 'wwebjs_auth');
  clearChromiumLocks(wwebAuthPath);

  const waClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: wwebAuthPath,
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
      ],
    },
  });

  waClient.on('qr', async qr => {
    console.log(`${ts()} WhatsApp QR code — scan with your phone:`);
    qrcode.generate(qr, { small: true });

    const imgPath = path.join(__dirname, '..', 'data', 'whatsapp-qr.png');
    await qrcodeImg.toFile(imgPath, qr, { scale: 8 });
    console.log(`${ts()} QR saved → ${imgPath}`);
  });

  waClient.on('authenticated', () => console.log(`${ts()} WhatsApp authenticated`));
  waClient.on('auth_failure',  msg => console.error(`${ts()} WhatsApp auth failure:`, msg));
  waClient.on('disconnected',  reason => console.warn(`${ts()} WhatsApp disconnected:`, reason));

  await new Promise((resolve, reject) => {
    waClient.on('ready', () => {
      console.log(`${ts()} WhatsApp client ready`);
      resolve();
    });
    waClient.on('auth_failure', reject);
    waClient.initialize();
  });

  notifier.setWhatsAppClient(waClient);
  await notifier.sendWhatsApp(`immoscrape gestart (${new Date().toLocaleString('nl-BE')})`);

  cron.schedule('*/10 * * * *', () => {
    runScrape().catch(err => console.error(`${ts()} runScrape error:`, err));
  });

  console.log(`${ts()} Cron scheduled (*/10 * * * *). Running initial scrape now…`);
  await runScrape();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
