'use strict';

/**
 * NCR pincode → city mapping for the five launch cities (decision 0020).
 *
 * SCOPE, per 0020: "just the pincodes for these five named areas" — the
 * CITIES, not their administrative districts. Gurugram district now includes
 * Nuh/Mewat (122104-122108, 122502-122508), which is 40-80 km from Gurugram
 * city and not a launch market; Faridabad district reaches Palwal and Hodal;
 * Gautam Buddha Nagar reaches Jewar and Dankaur. Those are deliberately
 * EXCLUDED. Greater Noida IS included under Noida, exactly as 0020 directs.
 *
 * SOURCES (fetched 2026-09-01):
 *   Gurugram   https://gurugram.gov.in/std-pin-codes/        (official, district)
 *   Ghaziabad  https://ghaziabad.nic.in/en/std-pin-code/     (official, 3 rows only)
 *              https://www.pincodesinfo.in/district/ghaziabad (fuller list)
 *   Noida/GN   https://www.pincodesinfo.in/district/gautam-buddha-nagar
 *   Faridabad  https://www.pincodesinfo.in/district/faridabad
 *   Delhi      110001-110099 range; 110096 is the highest in active use
 *
 * CONFIDENCE — read before treating this as launch-ready:
 *   HIGH   Gurugram city, Noida, Greater Noida, Faridabad city, Ghaziabad
 *          urban. Cross-checked against the official Gurugram and Ghaziabad
 *          government pages where those exist.
 *   MEDIUM Delhi. Enumerated as the full 110001-110096 contiguous block
 *          rather than from a per-post-office list (554 offices). Delhi's
 *          allocation is contiguous, so this is right in aggregate, but a
 *          handful of codes in the block may be unused or PO-Box-only.
 *   The city/district boundary calls below are JUDGEMENT, not India Post
 *          policy — a vendor in Nuh would currently find no city. Revisit if
 *          vendor density argues for it (0020 anticipates exactly this).
 *
 * Before launch this should be reconciled against the official India Post
 * "All India Pincode Directory" dataset, which is the authoritative source
 * and was not available through a direct download here.
 */

// Contiguous inclusive ranges, expanded at seed time. Used where a city's
// allocation is genuinely a block (Delhi), so the seeder stays readable
// instead of listing a hundred near-identical rows.
const RANGES = [
  // Delhi: the whole NCT block. 110001 (Sansad Marg / Secretariat) through
  // 110096 (Mayur Vihar Phase-III).
  { city: 'delhi', from: 110001, to: 110096 },
];

// Explicit pincodes, city by city.
const EXPLICIT = {
  // ── Gurugram city ────────────────────────────────────────────────────────
  // From gurugram.gov.in. Includes the urban sectors, DLF phases, Palam
  // Vihar, Manesar and Sohna Road. EXCLUDES Nuh/Mewat and the far-west rural
  // tehsils (Pataudi 122503, Farrukhnagar 122506, Tauru 122105, etc.).
  gurugram: [
    122001, // Gurgaon HO, Sector 17, Civil Lines, New Colony, Urban Estate
    122002, // DLF QE, Chakkarpur, Nathupur
    122003, // Sector 45, Jharsa, Gwal Pahari, Sohna
    122004, // Khandsa, Narsinghpur, Sikanderpur, Kherki Kaula
    122006, // Basai, Daultabad, Railway Road
    122007, // Industrial Estate
    122008, // DLF Phase II
    122009, // Galleria DLF-IV
    122010, // DLF Phase III
    122011, // Gurgaon Sector (Sushant Lok area)
    122015, // Palam Road, Sarhaul
    122016, // Dundahera, Industrial Complex
    122017, // Palam Vihar, Carterpuri
    122018, // South City II
    122051, // Manesar, Kasan
    122052, // IMT Manesar
    122101, // Badshahpur, Kadipur, Fazilpur, Paltra
    122102, // Bhondsi, Ghamroj, Damdama, Maruthi Kunj
  ],

  // ── Faridabad city ───────────────────────────────────────────────────────
  // Urban sectors plus Greater Faridabad (Neharpar). EXCLUDES Palwal, Hodal
  // and the Tigaon/Manjhawali rural belt (121101, 121102).
  faridabad: [
    121001, // Industrial Area, NIT, NH2/3/4
    121002, // Faridabad City, Sectors 16/16A/18
    121003, // Mathura Road, Anangpur, Amarnagar
    121004, // Sector 3, Ballabgarh, Chawla Colony
    121005, // Jawahar Colony, Sector 22
    121006, // GT Road, Sectors 7/8/9
    121007, // Escorts Nagar, Sectors 12/15
    121008, // Sector 29
    121009, // Surajkund
    121010, // Sector 46, NHPC Colony
    121012, // Sector 21D
    121013, // Sector 91
    121014, // Greater Faridabad (Neharpar)
    121015, // Sector 55
  ],

  // ── Noida + Greater Noida ────────────────────────────────────────────────
  // 0020: "Greater Noida is deliberately not separated out — treat it as part
  // of Noida's pincode_city_map entries." EXCLUDES Jewar, Dankaur, Dadri and
  // the rural 203xxx belt.
  noida: [
    201301, // Noida HO, Sectors 16/27
    201302, // NDC Noida
    201303, // Sectors 30/37/41/45
    201304, // Maharshi Nagar, Gejha, Baraula
    201305, // NEPZ, Nagla Charandas
    201306, // Surajpur IA, CRPF Greater Noida, Kulesra
    201307, // Sectors 12/34/55, Sarfabad
    201309, // Sector 62, Chhajarsi
    201310, // Alpha Greater Noida, Knowledge Park I
    201311, // Container Depot, Pali, Tilapta
    201312, // Gautam Buddha University, Kasna
    201313, // Amity University
    201314, // Shiv Nadar University and surrounds
    201315, // Gurjinder Vihar
    201316, // Sector 122
    201317, // Sector 128
    201318, // Sector 1 Greater Noida
    201319, // NDC NEPZ
    201320, // NDC Sector-1 Greater Noida
  ],

  // ── Ghaziabad ────────────────────────────────────────────────────────────
  // Urban Ghaziabad including Indirapuram, Vasundhara, Vaishali, Kaushambi,
  // Sahibabad and Crossings Republik. EXCLUDES Modinagar (201204),
  // Muradnagar (201206), Loni (201102) and Hapur — separate towns, and 0020
  // named Ghaziabad the city.
  ghaziabad: [
    201001, // Ghaziabad HO, Nehru Nagar, Ashok Nagar
    201002, // Kavi Nagar, Raj Nagar, Shastri Nagar
    201005, // Sahibabad
    201009, // Vijay Nagar, Arya Nagar
    201010, // Kaushambi, Sahibabad IE
    201011, // Chandra Nagar
    201012, // Vasundhara
    201013, // Govindpuram
    201014, // Shipra Sun City / Indirapuram
    201015, // Hindon Nagar, Dasna
    201016, // Crossings Republik
    201017, // Raj Nagar Extension
    201018, // Model Town
    201019, // Vaishali
    201020, // Khora
    201021, // Abhay Khand III (Indirapuram)
  ],
};

function expand() {
  const out = [];
  const seen = new Set();

  const add = (pincode, citySlug) => {
    const key = String(pincode);
    // A pincode maps to exactly one city (pincode is the PK). First wins, and
    // a collision is a data error worth surfacing rather than silently
    // overwriting.
    if (seen.has(key)) {
      throw new Error(`Duplicate pincode ${key} — already mapped before ${citySlug}`);
    }
    seen.add(key);
    out.push({ pincode: key, citySlug });
  };

  for (const [citySlug, list] of Object.entries(EXPLICIT)) {
    for (const p of list) add(p, citySlug);
  }
  for (const { city, from, to } of RANGES) {
    for (let p = from; p <= to; p += 1) add(p, city);
  }

  return out;
}

module.exports = { RANGES, EXPLICIT, expand };
