import { createPortal } from "react-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRightOnRectangle,
  HiOutlineArrowsRightLeft,
  HiOutlineBolt,
  HiOutlineBookmark,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCircleStack,
  HiOutlineCog6Tooth,
  HiOutlineDevicePhoneMobile,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlineInformationCircle,
  HiOutlineKey,
  HiOutlineLightBulb,
  HiOutlineQuestionMarkCircle,
  HiOutlineScale,
  HiOutlineShieldCheck,
  HiOutlineUserCircle,
  HiOutlineUserGroup,
} from "react-icons/hi2";

import { signOutSocialSession } from "../../../../Backend/services/sessionService";

import MenuSection from "./menu/MenuSection";
import MenuActionButton from "./menu/MenuActionButton";

const MENU_GROUPS = [
  {
    title: "Social",
    description: "Conversations, people, and the things you keep.",
    items: [
      ["messages", "Messages", "Open conversations and message requests.", HiOutlineChatBubbleLeftRight],
      ["connections", "Connections", "Manage your circle and discover people.", HiOutlineUserGroup],
      ["activity", "Activity", "Review reactions, comments, and social updates.", HiOutlineBolt],
      ["saved-posts", "Saved Posts", "Return to posts you kept for later.", HiOutlineBookmark],
      ["my-posts", "My Posts", "View the content you shared.", HiOutlineDocumentText],
    ],
  },
  {
    title: "Settings & Privacy",
    description: "Shape how Explore works for you.",
    items: [
      ["settings", "Settings", "Notifications, feed, video, and messaging.", HiOutlineCog6Tooth],
      ["privacy", "Privacy Center", "Audience, messages, activity, and blocks.", HiOutlineShieldCheck],
      ["security", "Security", "Sign-in protection and account sessions.", HiOutlineKey],
      ["permissions", "Permissions", "Camera, microphone, location, and alerts.", HiOutlineDevicePhoneMobile],
      ["data-mobile-use", "Data & Mobile Use", "Media quality, autoplay, and device storage.", HiOutlineCircleStack],
    ],
  },
  {
    title: "Support & About",
    description: "Guidance, safety, policies, and product information.",
    items: [
      ["help-center", "Help Center", "Search guidance across KunThai services.", HiOutlineQuestionMarkCircle],
      ["your-voice", "Your Voice", "Share private ideas and product feedback with KunThai.", HiOutlineLightBulb],
      ["report-problem", "Report a Problem", "Tell support what went wrong.", HiOutlineExclamationTriangle],
      ["safety-center", "Safety Center", "Reporting, blocking, and safer service use.", HiOutlineShieldCheck],
      ["terms-policies", "Policy Center", "Rules, privacy, safety, and transparency.", HiOutlineScale],
      ["about-kunthai", "About KunThai", "Our connected super-app and its services.", HiOutlineInformationCircle],
    ],
  },
];

export function SocialMenuContent({ compact = false, onClose, onNavigate }) {
  const handleSelect = (target) => {
    onClose?.();

    const navigationMap = {
      profile: "Profile",
      "my-posts": "MyPosts",
      "saved-posts": "SavedPosts",
      activity: "Activity",
      messages: "Messages",
      connections: "Connections",
      privacy: "Privacy",
      settings: "Settings",
      security: "Security",
      permissions: "Permissions",
      "data-mobile-use": "DataMobileUse",
      "help-center": "HelpCenter",
      "your-voice": "YourVoice",
      "report-problem": "ReportProblem",
      "safety-center": "SafetyCenter",
      "terms-policies": "TermsPolicies",
      "about-kunthai": "AboutKunThai",
    };

    if (navigationMap[target]) {
      onNavigate?.(navigationMap[target], { fromMenu: true });
    }
  };

  const handleSwitchAccount = async () => {
    onClose?.();
    onNavigate?.("SwitchAccount", { fromMenu: true });
  };

  const handleSignOut = async () => {
    onClose?.();
    await signOutSocialSession();
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="rounded-[26px] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-2 shadow-sm">
            <MenuActionButton
              icon={HiOutlineUserCircle}
              label="Your Explore profile"
              description="View your public identity, bio, links, and profile activity."
              tone="strong"
              onClick={() => handleSelect("profile")}
            />
          </div>

          <div className={`grid gap-5 ${compact ? "grid-cols-1" : "lg:grid-cols-2 xl:grid-cols-3"}`}>
            {MENU_GROUPS.map((group) => (
              <MenuSection key={group.title} title={group.title} description={group.description}>
                {group.items.map(([target, label, description, icon]) => (
                  <MenuActionButton key={target} icon={icon} label={label} description={description} onClick={() => handleSelect(target)} />
                ))}
              </MenuSection>
            ))}

            <MenuSection title="Account" description="Session controls for this device.">
              <MenuActionButton
                icon={HiOutlineArrowsRightLeft}
                label="Switch Account"
                description="Choose another account saved on this device."
                tone="strong"
                onClick={handleSwitchAccount}
              />
              <MenuActionButton
                icon={HiOutlineArrowRightOnRectangle}
                label="Sign Out"
                description="Securely end this KunThai session."
                tone="danger"
                onClick={handleSignOut}
              />
            </MenuSection>
          </div>
        </div>
      </div>
    </>
  );
}

export default function HeaderMenu({ open, onClose, onNavigate }) {
  if (!open) return null;

  return createPortal(
    <section className="fixed inset-0 z-50 flex h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-800 shadow-sm"
            aria-label="Back to Explore"
          >
            <HiOutlineArrowLeft />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">KunThai</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Social Menu</h2>
          </div>
        </div>
      </header>
      <aside className="flex min-h-0 w-full flex-1 flex-col bg-white shadow-sm">
        <SocialMenuContent onClose={onClose} onNavigate={onNavigate} />
      </aside>
    </section>,
    document.body,
  );
}
