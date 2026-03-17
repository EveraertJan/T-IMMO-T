require('dotenv').config();

const connectors = {
  immodavinci:   require('./connectors/immodavinci'),
  dewaele:       require('./connectors/dewaele'),
  vastgoedpoppe: require('./connectors/vastgoedpoppe'),
  immot:         require('./connectors/immot'),
  immozone:      require('./connectors/immozone'),
  immodesmet:    require('./connectors/immodesmet'),
  ingimmo:       require('./connectors/ingimmo'),
  huysewinkel:   require('./connectors/huysewinkel'),
  immodelestre:  require('./connectors/immodelestre'),
};

const vendor = process.argv[2];

if (!vendor) {
  console.error('Usage: node src/debug-vendor.js <vendor>');
  console.error('Available vendors:', Object.keys(connectors).join(', '));
  process.exit(1);
}

if (!connectors[vendor]) {
  console.error(`Unknown vendor: "${vendor}"`);
  console.error('Available vendors:', Object.keys(connectors).join(', '));
  process.exit(1);
}

console.log(`Running scraper for: ${vendor}\n`);

connectors[vendor].scrape()
  .then(listings => {
    console.log(`Found ${listings.length} listing(s):\n`);
    listings.forEach((l, i) => {
      console.log(`--- [${i + 1}] ---`);
      console.log(JSON.stringify(l, null, 2));
    });
  })
  .catch(err => {
    console.error('Scraper threw an error:', err);
    process.exit(1);
  });
