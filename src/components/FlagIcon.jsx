import { getCountryProfile } from "../data/globalCountryProfiles";

const FLAG_VIEWBOX = "0 0 64 48";

function FlagFrame({ children, className = "" }) {
  return (
    <svg
      viewBox={FLAG_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="64" height="48" rx="6" fill="#f8fafc" />
      {children}
    </svg>
  );
}

function Star({ cx, cy, r, fill = "#111827", rotation = -90 }) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = ((Math.PI * 2) / 10) * index + (rotation * Math.PI) / 180;
    const radius = index % 2 === 0 ? r : r * 0.42;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    return `${x},${y}`;
  }).join(" ");

  return <polygon points={points} fill={fill} />;
}

function GenericStripeFlag({ flag, className }) {
  const colors = Array.isArray(flag?.colors) && flag.colors.length ? flag.colors : ["#e2e8f0"];
  const vertical = flag?.direction === "vertical";

  return (
    <FlagFrame className={className}>
      {colors.map((color, index) => (
        <rect
          key={`${color}-${index}`}
          x={vertical ? (64 / colors.length) * index : 0}
          y={vertical ? 0 : (48 / colors.length) * index}
          width={vertical ? 64 / colors.length : 64}
          height={vertical ? 48 : 48 / colors.length}
          fill={color}
        />
      ))}
    </FlagFrame>
  );
}

function FlagSvg({ code, className }) {
  switch (code) {
    case "SL":
      return (
        <FlagFrame className={className}>
          <rect width="64" height="16" fill="#16a34a" />
          <rect y="16" width="64" height="16" fill="#ffffff" />
          <rect y="32" width="64" height="16" fill="#2563eb" />
        </FlagFrame>
      );
    case "NG":
      return (
        <FlagFrame className={className}>
          <rect width="21.34" height="48" fill="#16a34a" />
          <rect x="21.34" width="21.32" height="48" fill="#ffffff" />
          <rect x="42.66" width="21.34" height="48" fill="#16a34a" />
        </FlagFrame>
      );
    case "GH":
      return (
        <FlagFrame className={className}>
          <rect width="64" height="16" fill="#dc2626" />
          <rect y="16" width="64" height="16" fill="#facc15" />
          <rect y="32" width="64" height="16" fill="#16a34a" />
          <Star cx={32} cy={24} r={7} />
        </FlagFrame>
      );
    case "LR":
      return (
        <FlagFrame className={className}>
          {Array.from({ length: 11 }, (_, index) => (
            <rect
              key={index}
              y={(48 / 11) * index}
              width="64"
              height={48 / 11}
              fill={index % 2 === 0 ? "#dc2626" : "#ffffff"}
            />
          ))}
          <rect width="28" height="22" fill="#1d4ed8" />
          <Star cx={14} cy={11} r={5.8} fill="#ffffff" />
        </FlagFrame>
      );
    case "GN":
      return (
        <FlagFrame className={className}>
          <rect width="21.34" height="48" fill="#dc2626" />
          <rect x="21.34" width="21.32" height="48" fill="#facc15" />
          <rect x="42.66" width="21.34" height="48" fill="#16a34a" />
        </FlagFrame>
      );
    case "CI":
      return (
        <FlagFrame className={className}>
          <rect width="21.34" height="48" fill="#f97316" />
          <rect x="21.34" width="21.32" height="48" fill="#ffffff" />
          <rect x="42.66" width="21.34" height="48" fill="#16a34a" />
        </FlagFrame>
      );
    case "SN":
      return (
        <FlagFrame className={className}>
          <rect width="21.34" height="48" fill="#16a34a" />
          <rect x="21.34" width="21.32" height="48" fill="#facc15" />
          <rect x="42.66" width="21.34" height="48" fill="#dc2626" />
          <Star cx={32} cy={24} r={6.2} fill="#16a34a" />
        </FlagFrame>
      );
    case "GM":
      return (
        <FlagFrame className={className}>
          <rect width="64" height="16" fill="#dc2626" />
          <rect y="16" width="64" height="4" fill="#ffffff" />
          <rect y="20" width="64" height="8" fill="#2563eb" />
          <rect y="28" width="64" height="4" fill="#ffffff" />
          <rect y="32" width="64" height="16" fill="#16a34a" />
        </FlagFrame>
      );
    case "BJ":
      return (
        <FlagFrame className={className}>
          <rect width="25" height="48" fill="#16a34a" />
          <rect x="25" width="39" height="24" fill="#facc15" />
          <rect x="25" y="24" width="39" height="24" fill="#dc2626" />
        </FlagFrame>
      );
    case "TG":
      return (
        <FlagFrame className={className}>
          {Array.from({ length: 5 }, (_, index) => (
            <rect
              key={index}
              y={index * 9.6}
              width="64"
              height="9.6"
              fill={index % 2 === 0 ? "#16a34a" : "#facc15"}
            />
          ))}
          <rect width="28" height="28" fill="#dc2626" />
          <Star cx={14} cy={14} r={6.4} fill="#ffffff" />
        </FlagFrame>
      );
    case "ML":
      return (
        <FlagFrame className={className}>
          <rect width="21.34" height="48" fill="#16a34a" />
          <rect x="21.34" width="21.32" height="48" fill="#facc15" />
          <rect x="42.66" width="21.34" height="48" fill="#dc2626" />
        </FlagFrame>
      );
    case "BF":
      return (
        <FlagFrame className={className}>
          <rect width="64" height="24" fill="#dc2626" />
          <rect y="24" width="64" height="24" fill="#16a34a" />
          <Star cx={32} cy={24} r={7} fill="#facc15" />
        </FlagFrame>
      );
    case "NE":
      return (
        <FlagFrame className={className}>
          <rect width="64" height="16" fill="#f97316" />
          <rect y="16" width="64" height="16" fill="#ffffff" />
          <rect y="32" width="64" height="16" fill="#16a34a" />
          <circle cx="32" cy="24" r="5.3" fill="#f97316" />
        </FlagFrame>
      );
    case "GW":
      return (
        <FlagFrame className={className}>
          <rect width="20" height="48" fill="#dc2626" />
          <rect x="20" width="44" height="24" fill="#facc15" />
          <rect x="20" y="24" width="44" height="24" fill="#16a34a" />
          <Star cx={10} cy={24} r={6.4} />
        </FlagFrame>
      );
    case "CV":
      return (
        <FlagFrame className={className}>
          <rect width="64" height="48" fill="#1d4ed8" />
          <rect y="27" width="64" height="4" fill="#ffffff" />
          <rect y="31" width="64" height="3" fill="#dc2626" />
          <rect y="34" width="64" height="4" fill="#ffffff" />
          {[
            [20, 26],
            [25, 21],
            [31, 18],
            [37, 19],
            [42, 23],
            [44, 29],
            [42, 35],
            [37, 39],
            [31, 40],
            [25, 37],
          ].map(([cx, cy], index) => (
            <Star key={index} cx={cx} cy={cy} r={2.6} fill="#facc15" />
          ))}
        </FlagFrame>
      );
    case "MR":
      return (
        <FlagFrame className={className}>
          <rect width="64" height="48" fill="#16a34a" />
          <rect width="64" height="8" fill="#dc2626" />
          <rect y="40" width="64" height="8" fill="#dc2626" />
          <path
            d="M22 22c3.8 8.4 16.2 8.4 20 0-1 10.5-19 10.5-20 0Z"
            fill="#facc15"
          />
          <Star cx={32} cy={18} r={5.8} fill="#facc15" />
        </FlagFrame>
      );
    default:
      return <GenericStripeFlag flag={getCountryProfile(code)?.flag} className={className} />;
  }
}

export default function FlagIcon({ code, className = "" }) {
  return <FlagSvg code={code?.toUpperCase?.()} className={className} />;
}
