import { createPortal } from "react-dom";
import { HiOutlineArrowLeft } from "react-icons/hi2";

import { signOutSocialSession, switchSocialAccount } from "../../../../Backend/services/sessionService";

import MenuSection from "./menu/MenuSection";
import ActivityMenuItem from "./menu/items/ActivityMenuItem";
import ConnectionsMenuItem from "./menu/items/ConnectionsMenuItem";
import HelpCenterMenuItem from "./menu/items/HelpCenterMenuItem";
import MessagesMenuItem from "./menu/items/MessagesMenuItem";
import MyPostsMenuItem from "./menu/items/MyPostsMenuItem";
import PrivacyMenuItem from "./menu/items/PrivacyMenuItem";
import ProfileMenuItem from "./menu/items/ProfileMenuItem";
import SavedPostsMenuItem from "./menu/items/SavedPostsMenuItem";
import SettingsMenuItem from "./menu/items/SettingsMenuItem";
import SignOutMenuItem from "./menu/items/SignOutMenuItem";
import SwitchAccountMenuItem from "./menu/items/SwitchAccountMenuItem";
import TermsPoliciesMenuItem from "./menu/items/TermsPoliciesMenuItem";

export function SocialMenuContent({ onClose, onNavigate }) {
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
      "help-center": "HelpCenter",
      "terms-policies": "TermsPolicies",
    };

    if (navigationMap[target]) {
      onNavigate?.(navigationMap[target], { fromMenu: true });
    }
  };

  const handleSwitchAccount = async () => {
    onClose?.();
    await switchSocialAccount();
  };

  const handleSignOut = async () => {
    onClose?.();
    await signOutSocialSession();
  };

  return (
    <>
      <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4 sm:p-6 lg:grid-cols-2 xl:grid-cols-3">
        <MenuSection title="You">
          <ProfileMenuItem onSelect={handleSelect} />
          <MyPostsMenuItem onSelect={handleSelect} />
          <SavedPostsMenuItem onSelect={handleSelect} />
          <ActivityMenuItem onSelect={handleSelect} />
        </MenuSection>

        <MenuSection title="Social">
          <MessagesMenuItem onSelect={handleSelect} />
          <ConnectionsMenuItem onSelect={handleSelect} />
        </MenuSection>

        <MenuSection title="Preferences">
          <PrivacyMenuItem onSelect={handleSelect} />
          <SettingsMenuItem onSelect={handleSelect} />
        </MenuSection>

        <MenuSection title="Support">
          <HelpCenterMenuItem onSelect={handleSelect} />
          <TermsPoliciesMenuItem onSelect={handleSelect} />
        </MenuSection>
      </div>

      <div className="grid gap-2 border-t border-slate-200 p-4 sm:p-6 lg:grid-cols-2">
        <SwitchAccountMenuItem onSwitchAccount={handleSwitchAccount} />
        <SignOutMenuItem onSignOut={handleSignOut} />
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
            <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-700">KunThai</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Social Menu</h2>
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
