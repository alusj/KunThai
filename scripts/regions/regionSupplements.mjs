// Curated additions to the ISO 3166-2 subdivision list used by
// buildCountryRegionsSql.mjs. ISO is the base (every country's official
// states / provinces / districts with their parent links); this file only adds
// what ISO leaves out and what people actually type.
//
// Codes for non-ISO rows use a long suffix (e.g. SL-KAMBIA). Official ISO
// suffixes are at most three characters, so these can never collide with a
// future ISO code.

// Subdivisions ISO does not list. Sierra Leone is the important one: ISO stops
// at the five provinces, but people think (and KunThai targets) in districts.
export const EXTRA_REGIONS = [
  // Sierra Leone — 16 districts (2017 local government boundaries).
  ...[
    ["SL-KAILAHUN", "Kailahun", "SL-E"],
    ["SL-KENEMA", "Kenema", "SL-E"],
    ["SL-KONO", "Kono", "SL-E"],
    ["SL-BOMBALI", "Bombali", "SL-N"],
    ["SL-FALABA", "Falaba", "SL-N"],
    ["SL-KOINADUGU", "Koinadugu", "SL-N"],
    ["SL-TONKOLILI", "Tonkolili", "SL-N"],
    ["SL-KAMBIA", "Kambia", "SL-NW"],
    ["SL-KARENE", "Karene", "SL-NW"],
    ["SL-PORTLOKO", "Port Loko", "SL-NW"],
    ["SL-BO", "Bo", "SL-S"],
    ["SL-BONTHE", "Bonthe", "SL-S"],
    ["SL-MOYAMBA", "Moyamba", "SL-S"],
    ["SL-PUJEHUN", "Pujehun", "SL-S"],
    ["SL-WESTRURAL", "Western Area Rural", "SL-W"],
    ["SL-WESTURBAN", "Western Area Urban", "SL-W"],
  ].map(([code, name, parent]) => ({ code, name, type: "District", parent })),

  // Hong Kong — 18 districts (no ISO 3166-2 subdivisions).
  ...[
    ["HK-CENTRALWESTERN", "Central and Western"],
    ["HK-EASTERN", "Eastern"],
    ["HK-SOUTHERN", "Southern"],
    ["HK-WANCHAI", "Wan Chai"],
    ["HK-KOWLOONCITY", "Kowloon City"],
    ["HK-KWUNTONG", "Kwun Tong"],
    ["HK-SHAMSHUIPO", "Sham Shui Po"],
    ["HK-WONGTAISIN", "Wong Tai Sin"],
    ["HK-YAUTSIMMONG", "Yau Tsim Mong"],
    ["HK-ISLANDS", "Islands"],
    ["HK-KWAITSING", "Kwai Tsing"],
    ["HK-NORTH", "North"],
    ["HK-SAIKUNG", "Sai Kung"],
    ["HK-SHATIN", "Sha Tin"],
    ["HK-TAIPO", "Tai Po"],
    ["HK-TSUENWAN", "Tsuen Wan"],
    ["HK-TUENMUN", "Tuen Mun"],
    ["HK-YUENLONG", "Yuen Long"],
  ].map(([code, name]) => ({ code, name, type: "District" })),

  // Kosovo — 7 districts (not in ISO 3166).
  ...[
    ["XK-FERIZAJ", "Ferizaj", ["Uroševac"]],
    ["XK-GJAKOVA", "Gjakova", ["Đakovica", "Gjakovë"]],
    ["XK-GJILAN", "Gjilan", ["Gnjilane"]],
    ["XK-MITROVICA", "Mitrovica", ["Mitrovicë"]],
    ["XK-PEJA", "Peja", ["Peć", "Pejë"]],
    ["XK-PRISHTINA", "Prishtina", ["Pristina", "Prishtinë"]],
    ["XK-PRIZREN", "Prizren", []],
  ].map(([code, name, aliases]) => ({ code, name, type: "District", aliases })),
];

// Common English names where ISO uses a romanised local name. The ISO name is
// kept as an alias, so both spellings resolve.
export const DISPLAY_NAMES = {
  "SL-W": "Western Area",
  "NG-FC": "Federal Capital Territory (Abuja)",
  "EG-ALX": "Alexandria", "EG-ASN": "Aswan", "EG-AST": "Asyut", "EG-BA": "Red Sea", "EG-BH": "Beheira",
  "EG-BNS": "Beni Suef", "EG-C": "Cairo", "EG-DK": "Dakahlia", "EG-DT": "Damietta", "EG-FYM": "Faiyum",
  "EG-GH": "Gharbia", "EG-GZ": "Giza", "EG-IS": "Ismailia", "EG-JS": "South Sinai", "EG-KB": "Qalyubia",
  "EG-KFS": "Kafr El Sheikh", "EG-KN": "Qena", "EG-LX": "Luxor", "EG-MN": "Minya", "EG-MNF": "Monufia",
  "EG-MT": "Matrouh", "EG-PTS": "Port Said", "EG-SHG": "Sohag", "EG-SHR": "Sharqia", "EG-SIN": "North Sinai",
  "EG-SUZ": "Suez", "EG-WAD": "New Valley",
  "SA-01": "Riyadh", "SA-02": "Makkah", "SA-03": "Madinah", "SA-04": "Eastern Province", "SA-05": "Al-Qassim",
  "SA-06": "Ha'il", "SA-07": "Tabuk", "SA-08": "Northern Borders", "SA-09": "Jazan", "SA-10": "Najran",
  "SA-11": "Al Bahah", "SA-12": "Al Jawf", "SA-14": "Asir",
  "AE-AJ": "Ajman", "AE-AZ": "Abu Dhabi", "AE-DU": "Dubai", "AE-FU": "Fujairah", "AE-RK": "Ras Al Khaimah",
  "AE-SH": "Sharjah", "AE-UQ": "Umm Al Quwain",
  "DZ-16": "Algiers",
  "ET-AM": "Amhara", "ET-TI": "Tigray",
  "ZA-KZN": "KwaZulu-Natal",
};

// Extra names that should resolve to a subdivision: abbreviations, capitals and
// well-known towns. Resolution prefers the most specific level, so a town listed
// under a district wins over the same word on its province.
export const ALIASES = {
  // Sierra Leone — district towns and Freetown neighbourhoods.
  "SL-W": ["Freetown", "Western"],
  "SL-N": ["North", "Northern Region"],
  "SL-NW": ["North West", "Northwest", "North-West"],
  "SL-E": ["East", "Eastern Region"],
  "SL-S": ["South", "Southern Region"],
  "SL-WESTURBAN": ["Freetown", "Western Urban", "Freetown City", "Lumley", "Aberdeen", "Wilberforce", "Kissy", "Wellington", "Congo Town", "Brookfields", "Murray Town", "Hill Station", "Tengbeh Town", "Cline Town", "Kingtom", "Fourah Bay", "East End", "West End", "Central Freetown"],
  "SL-WESTRURAL": ["Western Rural", "Waterloo", "Hastings", "Tombo", "York", "Kent", "Newton", "Regent", "Lakka", "Tokeh", "Sussex", "Hamilton", "Grafton"],
  "SL-BOMBALI": ["Makeni", "Makeni City", "Kamabai", "Binkolo"],
  "SL-KAMBIA": ["Rokupr", "Kukuna", "Mambolo"],
  "SL-PORTLOKO": ["Portloko", "Lunsar", "Lungi", "Masiaka", "Pepel"],
  "SL-KARENE": ["Kamakwie", "Batkanu"],
  "SL-KOINADUGU": ["Kabala"],
  "SL-FALABA": ["Bendugu", "Mongo Bendugu"],
  "SL-TONKOLILI": ["Magburaka", "Mile 91", "Yele", "Bumbuna", "Masingbi"],
  "SL-KONO": ["Koidu", "Koidu Town", "Sefadu"],
  "SL-KAILAHUN": ["Pendembu", "Daru", "Segbwema", "Buedu", "Koindu"],
  "SL-KENEMA": ["Kenema City", "Blama", "Tongo", "Tongo Field", "Panguma"],
  "SL-BO": ["Bo City", "Bo Town", "Tikonko"],
  "SL-MOYAMBA": ["Mano", "Njala", "Shenge", "Rotifunk"],
  "SL-PUJEHUN": ["Zimmi", "Potoru"],
  "SL-BONTHE": ["Mattru Jong", "Mattru", "Sherbro", "Sherbro Island"],

  // Nigeria — state capitals and major cities.
  "NG-LA": ["Lagos State", "Ikeja", "Lekki", "Victoria Island", "Ikoyi", "Surulere", "Yaba", "Ajah", "Badagry", "Epe", "Ikorodu", "Apapa", "Festac"],
  "NG-FC": ["FCT", "Abuja", "Abuja FCT", "Federal Capital Territory", "Garki", "Wuse", "Maitama", "Gwagwalada", "Kubwa"],
  "NG-RI": ["Port Harcourt", "PH"],
  "NG-OY": ["Ibadan", "Ogbomosho", "Oyo State"],
  "NG-ED": ["Benin City", "Benin"],
  "NG-KD": ["Zaria", "Kaduna State"],
  "NG-PL": ["Jos"],
  "NG-BO": ["Maiduguri"],
  "NG-AN": ["Onitsha", "Awka", "Nnewi"],
  "NG-AB": ["Aba", "Umuahia"],
  "NG-IM": ["Owerri"],
  "NG-CR": ["Calabar"],
  "NG-AK": ["Uyo"],
  "NG-DE": ["Warri", "Asaba"],
  "NG-OG": ["Abeokuta", "Ota", "Sagamu"],
  "NG-KW": ["Ilorin"],
  "NG-ON": ["Akure"],
  "NG-OS": ["Osogbo", "Ile-Ife", "Ife"],
  "NG-EK": ["Ado-Ekiti", "Ado Ekiti"],
  "NG-AD": ["Yola"],
  "NG-BE": ["Makurdi"],
  "NG-KO": ["Lokoja"],
  "NG-NI": ["Minna"],
  "NG-NA": ["Lafia"],
  "NG-TA": ["Jalingo"],
  "NG-YO": ["Damaturu"],
  "NG-JI": ["Dutse"],
  "NG-KE": ["Birnin Kebbi"],
  "NG-ZA": ["Gusau"],
  "NG-BY": ["Yenagoa"],
  "NG-EB": ["Abakaliki"],

  // Ghana.
  "GH-AA": ["Accra", "Tema", "Madina", "Greater Accra Region"],
  "GH-AH": ["Kumasi", "Obuasi"],
  "GH-NP": ["Tamale"],
  "GH-WP": ["Takoradi", "Sekondi", "Sekondi-Takoradi"],
  "GH-CP": ["Cape Coast"],
  "GH-EP": ["Koforidua"],
  "GH-TV": ["Ho"],
  "GH-BO": ["Sunyani"],
  "GH-UE": ["Bolgatanga"],
  "GH-UW": ["Wa"],

  // Liberia.
  "LR-MO": ["Monrovia", "Paynesville"],
  "LR-BG": ["Gbarnga"],
  "LR-GB": ["Buchanan"],
  "LR-MY": ["Harper"],
  "LR-MG": ["Kakata"],
  "LR-LO": ["Voinjama"],
  "LR-NI": ["Ganta", "Sanniquellie"],
  "LR-GG": ["Zwedru"],
  "LR-CM": ["Robertsport"],
  "LR-BM": ["Tubmanburg"],

  // Elsewhere in West Africa and beyond.
  "GN-C": ["Conakry City"],
  "GM-B": ["Banjul City"],
  "SN-DK": ["Dakar City"],
  "CI-AB": ["Abidjan City"],
  "KE-30": ["Nairobi"],
  "KE-28": ["Mombasa City"],
  "US-DC": ["Washington DC", "Washington D.C.", "DC"],
  "US-NY": ["New York City", "NYC"],
  "SA-02": ["Mecca", "Makkah al Mukarramah", "Jeddah"],
  "SA-03": ["Medina"],
  "SA-04": ["Dammam", "Eastern Region"],
  "AE-DU": ["Dubai City"],
  "EG-C": ["Cairo City"],
};

// Which level people normally mean when they say "state" or "district". The
// default is the deepest level with 3-60 entries; these override it.
export const PRIMARY_LEVEL_OVERRIDES = {
  GB: 2,
  UG: 2,
  PH: 2,
};

// Label overrides (singular, plural) for the primary level.
export const LABEL_OVERRIDES = {
  GB: ["Local authority", "Local authorities"],
  UG: ["District", "Districts"],
  ET: ["Region", "Regions"],
  NE: ["Region", "Regions"],
  ML: ["Region", "Regions"],
  US: ["State", "States"],
  NG: ["State", "States"],
};
