// EditProfile.jsx
// Full screen Edit Profile page

import BackTab from "./BackTab";

export default function DataUsage({ onBack }) {
  return (
    <div className="fixed inset-0 bg-white z-[999] flex flex-col">

      {/* HEADER */}
      <div className="relative h-14 flex items-center border-b px-4">

        {/* Back Button (LEFT) */}
        <BackTab onBack={onBack} />

        {/* Centered Title */}
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold">
          Data Usage
        </h1>

      </div>

      {/* PAGE CONTENT */}
      <div className="flex-1 overflow-y-auto p-4">
       <p>
        Your data is used strictly for service delivery, analytics,
        and security purposes.
      </p>

      <p>
        We do not sell your personal data to third parties.
      </p>

        {/* Form fields go here */}
      </div>

    </div>
  );
}
