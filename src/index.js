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
const server     = require('./server');
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

  let newCount = 0;

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
        newCount++;
      } else {
        console.log(`${ts()} skip  ${listing.vendor}/${listing.id} (filtered out)`);
      }

      db.saveListing(listing, matched);
    }
  }

  console.log(`${ts()} Scrape cycle done. ${newCount} new matching listing(s) notified.`);
}

function clearChromiumLocks(dataPath) {
  // Remove stale Chromium singleton lock files left by a previous container run.
  // Without this, Chromium refuses to launch when the profile is "locked" by a
  // dead process from an old container (different hostname).
  const lockFiles = [
    path.join(dataPath, 'session', 'SingletonLock'),
    path.join(dataPath, 'session', 'SingletonCookie'),
    path.join(dataPath, 'session', 'SingletonSocket'),
  ];
  for (const f of lockFiles) {
    try {
      fs.unlinkSync(f);
      console.log(`${ts()} Removed stale lock: ${f}`);
    } catch (_) {
      // file doesn't exist — nothing to do
    }
  }
}

async function main() {
  console.log(`${ts()} immoscrape starting…`);
  server.start();

  const wwebAuthPath = path.join(__dirname, '..', 'data', 'wwebjs_auth');
  clearChromiumLocks(wwebAuthPath);

  // Init WhatsApp client
  const waClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: wwebAuthPath,
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  waClient.on('qr', async qr => {
    console.log(`${ts()} WhatsApp QR code — scan with your phone:`);
    qrcode.generate(qr, { small: true });

    // Also save as PNG for easier scanning
    const imgPath = path.join(__dirname, '..', 'data', 'whatsapp-qr.png');
    await qrcodeImg.toFile(imgPath, qr, { scale: 8 });
    console.log(`${ts()} QR also saved as image → open with: open ${imgPath}`);
  });

  waClient.on('authenticated', () => {
    console.log(`${ts()} WhatsApp authenticated`);
  });

  waClient.on('auth_failure', msg => {
    console.error(`${ts()} WhatsApp auth failure:`, msg);
  });

  waClient.on('disconnected', reason => {
    console.warn(`${ts()} WhatsApp disconnected:`, reason);
  });

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

  // Schedule: every hour on the hour
  // For testing, change to '* * * * *' (every minute)
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
