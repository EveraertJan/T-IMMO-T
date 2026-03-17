const config = require('../config.json');
const { extractPostalCode } = require('./utils');
const criteria = config.criteria || {};

function passes(listing) {
  if (criteria.maxPrice !== undefined && listing.price > 0 && listing.price > criteria.maxPrice) {
    return false;
  }
  if (criteria.minPrice !== undefined && listing.price > 0 && listing.price < criteria.minPrice) {
    return false;
  }
  if (criteria.EPC !== undefined && (listing.kwh > 0 || (listing.epc !== "NAN" && listing.epc !== ""))) {
    let toMatch = listing.kwh;
    if(listing.epc !== "" && listing.epc !== "NAN" && listing.kwh <= 0) {
      toMatch = EPCLabelToKWH(listing.epc)
    }
    if(toMatch >= EPCLabelToKWH(criteria.EPC)) {
      return false
    }
  }
  if (criteria.minRooms !== undefined && listing.rooms > 0 && listing.rooms < criteria.minRooms) {
    return false;
  }
  if (criteria.minSurface !== undefined && listing.surface > 0 && listing.surface < criteria.minSurface) {
    return false;
  }
  if (criteria.locations && criteria.locations.length > 0) {
    const pc = listing.postal_code || extractPostalCode(listing.location);
    if (pc && !criteria.locations.includes(pc)) return false;
  }
  return true;
}


function EPCLabelToKWH(EPC) {
  switch(EPC) {
    case "A":
      return 100;
      break;
    case "B":
      return 200;
      break;
    case "C":
      return 300;
      break;
    case "D":
      return 400;
      break;
    case "E":
      return 500;
      break;
    case "F":
      return 600;
      break;
    default: 
      return 1000;
      break;
  }
  return -1;

}
module.exports = { passes };
