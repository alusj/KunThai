// EditProfile.jsx
// Full screen Edit Profile page

import BackTab from "./BackTab";

export default function TermsOfService({ onBack }) {
  return (
    <div className="fixed inset-0 bg-white z-[999] flex flex-col">

      {/* HEADER */}
      <div className="relative h-14 flex items-center border-b px-4">

        {/* Back Button (LEFT) */}
        <BackTab onBack={onBack} />

        {/* Centered Title */}
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold">
          Terms Of Services
        </h1>

      </div>

      {/* PAGE CONTENT */}
      <div className="flex-1 overflow-y-auto p-4">
       <p>
       By using MyBiz, you agree to follow all platform rules and
        applicable laws.
      </p>

      <p>
        Violation of these terms may result in suspension or termination.
      </p>

        {/* Form fields go here */}
      </div>

    </div>
  );
}
