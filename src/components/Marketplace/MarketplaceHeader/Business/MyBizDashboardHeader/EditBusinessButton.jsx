// src/components/Marketplace/MarketplaceHeader/Business/BusinessIdentity/EditBusinessButton.jsx

/**
 * EditBusinessButton
 * ------------------
 * Call-to-action for editing business profile.
 * Navigation logic can be added later.
 */

export default function EditBusinessButton() {
  return (
    <button
      className="w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
      onClick={() => {
        console.log("Edit business clicked");
      }}
    >
      Edit Business Profile
    </button>
  );
}
