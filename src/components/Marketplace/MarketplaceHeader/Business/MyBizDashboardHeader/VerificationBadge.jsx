import { MarketplaceVerificationBadge } from "../../../shared/MarketplaceVerification";

export default function VerificationBadge({ onClick, status, verified }) {
  return <MarketplaceVerificationBadge status={status} verified={verified} onClick={onClick} />;
}
