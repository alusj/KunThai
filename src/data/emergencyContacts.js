// West Africa emergency contacts used by KunThai SOS.
// Verify these numbers with official national agencies before production launch.
export const EMERGENCY_CONTACTS = {
  SL: {
    country: "Sierra Leone",
    police: ["999", "112", "911"],
    ambulance: ["999", "112", "911"],
    fire: ["019", "112", "911"],
    notes: "Use 112/911 on mobile where supported.",
  },
  NG: {
    country: "Nigeria",
    police: ["112", "199"],
    ambulance: ["112"],
    fire: ["112"],
  },
  GH: {
    country: "Ghana",
    police: ["191", "112"],
    ambulance: ["193", "112"],
    fire: ["192", "112"],
  },
  LR: {
    country: "Liberia",
    police: ["911"],
    ambulance: ["911"],
    fire: ["911"],
  },
  GM: {
    country: "The Gambia",
    police: ["117"],
    ambulance: ["116"],
    fire: ["118"],
  },
  GN: {
    country: "Guinea",
    police: ["117"],
    ambulance: ["442020"],
    fire: ["18"],
  },
  GW: {
    country: "Guinea-Bissau",
    police: ["117"],
    ambulance: ["119"],
    fire: ["118"],
  },
  SN: {
    country: "Senegal",
    police: ["17"],
    ambulance: ["15"],
    fire: ["18"],
  },
  CI: {
    country: "Cote d'Ivoire",
    police: ["111", "170"],
    ambulance: ["185"],
    fire: ["180"],
  },
  BF: {
    country: "Burkina Faso",
    police: ["17"],
    ambulance: ["112"],
    fire: ["18"],
  },
  ML: {
    country: "Mali",
    police: ["17"],
    ambulance: ["15"],
    fire: ["18"],
  },
  NE: {
    country: "Niger",
    police: ["17"],
    ambulance: ["15"],
    fire: ["18"],
  },
  TG: {
    country: "Togo",
    police: ["117"],
    ambulance: ["8200"],
    fire: ["118"],
  },
  BJ: {
    country: "Benin",
    police: ["117"],
    ambulance: ["118"],
    fire: ["118"],
  },
  CV: {
    country: "Cape Verde",
    police: ["132"],
    ambulance: ["130"],
    fire: ["131"],
  },
};

export const DEFAULT_EMERGENCY = {
  country: "Unknown",
  police: ["112", "911"],
  ambulance: ["112", "911"],
  fire: ["112", "911"],
  notes: "Country not detected. Try 112 or 911 if supported.",
};
