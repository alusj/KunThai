// EditProfile.jsx
// Full screen Edit Profile page

import BackTab from "./BackTab";

export default function CommunityGuidelines({ onBack }) {
  return (
    <div className="fixed inset-0 bg-white z-[999] flex flex-col">

      {/* HEADER */}
      <div className="relative h-14 flex items-center border-b px-4">

        {/* Back Button (LEFT) */}
        <BackTab onBack={onBack} />

        {/* Centered Title */}
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold">
          Community Guidelines
        </h1>

      </div>

      {/* PAGE CONTENT */}
      <div className="flex-1 overflow-y-auto p-4">
        <p>
        We expect all users to behave respectfully and professionally.
      </p>

      <p>
        Harassment, abuse, or fraudulent activity is not tolerated.
      </p>

        {/* Form fields go here */}
      </div>

    </div>
  );
}
