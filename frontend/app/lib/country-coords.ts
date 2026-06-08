// app/lib/country-coords.ts
//
// Static reference data: map marker positions [lng, lat] keyed by ISO-2 code.
// These are hardcoded on purpose — coordinates never change, must survive a DB
// reset, and should be present for anyone who clones the repo without a seeded
// database. Generated once from the original public/api/risk.json snapshot.
//
// To add a country: add its ISO-2 entry here (and ensure it exists in the DB).

export const COUNTRY_COORDS: Record<string, [number, number]> = {
  AR: [-64.8816, -35],      // Argentina
  AU: [134.53, -24.6809],   // Australia
  AT: [14.3738, 47.6082],   // Austria
  BD: [90.0125, 24.5103],   // Bangladesh
  BE: [4.7, 50.6003],       // Belgium
  BR: [-53.3, -10.3],       // Brazil
  CA: [-108.007, 60.9215],  // Canada
  CL: [-71.1, -31.8],       // Chile
  CN: [105, 35],            // China
  CO: [-73, 4],             // Colombia
  DK: [10.5683, 55.6761],   // Denmark
  FI: [25.62, 63.3],        // Finland
  FR: [2, 46.6],            // France
  DE: [10.5, 51.2],         // Germany
  GR: [22.3, 39],           // Greece
  HK: [114.1694, 22.3193],  // Hong Kong SAR, China
  HU: [19.5, 47.15],        // Hungary
  IN: [78.5, 22.35],        // India
  ID: [118, -2.5],          // Indonesia
  IE: [-8, 52.8],           // Ireland
  IL: [35, 31],             // Israel
  IT: [12.8, 42.6],         // Italy
  JP: [139.2, 36.5],        // Japan
  KE: [38.52, 1.36],        // Kenya
  LU: [5.7, 49.85],         // Luxembourg
  MY: [102.2, 4.5],         // Malaysia
  MX: [-102, 23.6],         // Mexico
  MA: [-7.2, 31.2],         // Morocco
  NL: [5.7, 52.25],         // Netherlands
  NZ: [173, -41.5],         // New Zealand
  NG: [8, 9.5],             // Nigeria
  NO: [8.7, 61.2],          // Norway
  PK: [71.4, 30.35],        // Pakistan
  PE: [-75, -7],            // Peru
  PH: [122.5, 13],          // Philippines
  PL: [19, 52.2297],        // Poland
  PT: [-8, 39.7],           // Portugal
  QA: [51.031, 25.2854],    // Qatar
  RO: [24.9, 46],           // Romania
  SA: [42.35, 25.56],       // Saudi Arabia
  SG: [103.8198, 1.3521],   // Singapore
  ZA: [25, -28.9],          // South Africa
  ES: [-4.8, 39.4],         // Spain
  SE: [14.5, 59.65],        // Sweden
  CH: [8, 46.75],           // Switzerland
  TH: [101, 15],            // Thailand
  UA: [31, 49.5],           // Ukraine
  AE: [54, 24],             // United Arab Emirates
  GB: [-3.5, 54.75],        // United Kingdom
  US: [-100.5, 39.75],      // United States
  VE: [-66, 8],             // Venezuela
  TR: [35.3, 39.3],         // Turkey
  RU: [97.7, 64.7],         // Russia
  KR: [127.83, 36.6],       // South Korea
  KZ: [66.55, 48.08],       // Kazakhstan
  MN: [103.8, 46.78],       // Mongolia
  EG: [29.3, 26.2],         // Egypt
};

// Name-normalized fallback, for the rare case a DB row lacks/​mismatches its
// ISO-2 code. Built from the same source names as above.
const NAME_TO_ISO2: Record<string, string> = {
  argentina: "AR",
  australia: "AU",
  austria: "AT",
  bangladesh: "BD",
  belgium: "BE",
  brazil: "BR",
  canada: "CA",
  chile: "CL",
  china: "CN",
  colombia: "CO",
  denmark: "DK",
  finland: "FI",
  france: "FR",
  germany: "DE",
  greece: "GR",
  "hong kong sar, china": "HK",
  hungary: "HU",
  india: "IN",
  indonesia: "ID",
  ireland: "IE",
  israel: "IL",
  italy: "IT",
  japan: "JP",
  kenya: "KE",
  luxembourg: "LU",
  malaysia: "MY",
  mexico: "MX",
  morocco: "MA",
  netherlands: "NL",
  "new zealand": "NZ",
  nigeria: "NG",
  norway: "NO",
  pakistan: "PK",
  peru: "PE",
  philippines: "PH",
  poland: "PL",
  portugal: "PT",
  qatar: "QA",
  romania: "RO",
  "saudi arabia": "SA",
  singapore: "SG",
  "south africa": "ZA",
  spain: "ES",
  sweden: "SE",
  switzerland: "CH",
  thailand: "TH",
  ukraine: "UA",
  "united arab emirates": "AE",
  "united kingdom": "GB",
  "united states": "US",
  venezuela: "VE",
  turkey: "TR",
  russia: "RU",
  "south korea": "KR",
  kazakhstan: "KZ",
  mongolia: "MN",
  egypt: "EG",
};

/**
 * Resolve a country's [lng, lat] from its ISO-2 code, falling back to a
 * normalized-name lookup. Returns null if the country has no known position
 * (such countries are simply not placed on the map).
 */
export function resolveCoords(
  iso2?: string | null,
  name?: string | null
): [number, number] | null {
  const code = iso2?.toUpperCase();
  if (code && COUNTRY_COORDS[code]) return COUNTRY_COORDS[code];

  if (name) {
    const mapped = NAME_TO_ISO2[name.trim().toLowerCase()];
    if (mapped && COUNTRY_COORDS[mapped]) return COUNTRY_COORDS[mapped];
  }
  return null;
}
