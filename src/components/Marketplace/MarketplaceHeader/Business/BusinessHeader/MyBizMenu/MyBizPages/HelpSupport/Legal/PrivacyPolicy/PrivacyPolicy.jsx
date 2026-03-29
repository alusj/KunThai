// EditProfile.jsx
// Full screen Edit Profile page

import BackTab from "./BackTab";

export default function PrivacyPolicy({ onBack }) {
  return (
    <div className="fixed inset-0 bg-white z-[999] flex flex-col">

      {/* HEADER */}
      <div className="relative h-14 flex items-center border-b px-4">

        {/* Back Button (LEFT) */}
        <BackTab onBack={onBack} />

        {/* Centered Title */}
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold">
          Privacy Policy
        </h1>

      </div>

      {/* PAGE CONTENT */}
      <div className="flex-1 overflow-y-auto p-4">
        <p>
        This Privacy Policy explains how we collect, use, and protect your
        personal information when you use MyBiz.
      </p>

      <p>
        We only collect information necessary to operate the platform and
        improve your experience.
      </p>

        {/* Form fields go here */}
      </div>

    </div>
  );
}
