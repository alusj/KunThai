import { createPortal } from "react-dom";

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

export default function HeaderMenu({ open, onClose, onNavigate }) {
  if (!open) return null;

  const handleSelect = (target) => {
    onClose();

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
    };

    if (navigationMap[target]) {
      onNavigate?.(navigationMap[target]);
    }
  };

  const handleSwitchAccount = async () => {
    onClose();
    await switchSocialAccount();
  };

  const handleSignOut = async () => {
    onClose();
    await signOutSocialSession();
  };

  return createPortal(
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/40" />

      <aside className="fixed inset-y-0 left-0 z-50 flex h-screen w-80 max-w-[88vw] flex-col border-r border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">KunThai</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Social Menu</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
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
          </MenuSection>
        </div>

        <div className="border-t border-slate-200 p-3">
          <SwitchAccountMenuItem onSwitchAccount={handleSwitchAccount} />
          <SignOutMenuItem onSignOut={handleSignOut} />
        </div>
      </aside>
    </>,
    document.body,
  );
}
