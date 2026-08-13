import { createPortal } from "react-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRightOnRectangle,
  HiOutlineArrowsRightLeft,
  HiOutlineBolt,
  HiOutlineBookmark,
  HiOutlineBuildingOffice2,
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
  HiOutlineRocketLaunch,
  HiOutlineScale,
  HiOutlineShieldCheck,
  HiOutlineUserCircle,
  HiOutlineUserGroup,
} from "react-icons/hi2";

import { signOutSocialSession } from "../../../../Backend/services/sessionService";
import { useI18n } from "../../../../i18n";

import MenuSection from "./menu/MenuSection";
import MenuActionButton from "./menu/MenuActionButton";
import { t as i18nText } from "../../../../i18n/index";

// Each item is [navigationTarget, i18nKey, icon]; label/description resolve from
// the `menu.items.<i18nKey>Label / Description` translation keys at render time.
const MENU_GROUPS = [
  {
    groupKey: "social",
    items: [
      ["messages", "messages", HiOutlineChatBubbleLeftRight],
      ["connections", "connections", HiOutlineUserGroup],
      ["activity", "activity", HiOutlineBolt],
      ["saved-posts", "savedPosts", HiOutlineBookmark],
      ["my-posts", "myPosts", HiOutlineDocumentText],
    ],
  },
  {
    groupKey: "settingsPrivacy",
    items: [
      ["settings", "settings", HiOutlineCog6Tooth],
      ["privacy", "privacy", HiOutlineShieldCheck],
      ["security", "security", HiOutlineKey],
      ["permissions", "permissions", HiOutlineDevicePhoneMobile],
      ["data-mobile-use", "dataMobile", HiOutlineCircleStack],
    ],
  },
  {
    groupKey: "support",
    items: [
      ["help-center", "helpCenter", HiOutlineQuestionMarkCircle],
      ["your-voice", "yourVoice", HiOutlineLightBulb],
      ["report-problem", "reportProblem", HiOutlineExclamationTriangle],
      ["safety-center", "safetyCenter", HiOutlineShieldCheck],
      ["terms-policies", "policyCenter", HiOutlineScale],
      ["about-kunthai", "aboutKunThai", HiOutlineInformationCircle],
    ],
  },
];

export function SocialMenuContent({ compact = false, currentProfile = null, onClose, onNavigate, onSelectIdentity, spaces = [] }) {
  const { t } = useI18n();
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
      "future-features": "FutureFeatures",
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
      <div className="flex-1 touch-pan-y overflow-y-auto overscroll-contain bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="rounded-[26px] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-2 shadow-sm">
            <MenuActionButton
              icon={HiOutlineUserCircle}
              label={t("menu.yourProfileLabel")}
              description={t("menu.yourProfileDescription")}
              tone="strong"
              onClick={() => {
                onSelectIdentity?.(null);
                handleSelect("profile");
              }}
            />
          </div>

          {spaces.length ? (
          <div className="rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{t("menu.spacesTitle")}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{t("menu.spacesDescription")}</p>
              </div>
            </div>
            <div className="space-y-2">
              {spaces.map((space) => {
                const active = currentProfile?.spaceId && currentProfile.spaceId === space.spaceId;
                return (
                  <MenuActionButton
                    key={space.spaceId}
                    icon={HiOutlineBuildingOffice2}
                    label={space.displayName || t("explore.spaceFallback")}
                    description={i18nText("ui.literals.k46d33b4835b6", { value0: active ? t("explore.spaceActivePrefix") : "", value1: space.categoryLabel || t("explore.spaceDefault"), value2: space.memberRole || t("explore.spaceMember") })}
                    tone={active ? "strong" : "default"}
                    onClick={() => {
                      if (space.membershipStatus === "pending") return;
                      onClose?.();
                      onSelectIdentity?.(space, { openDashboard: true });
                    }}
                  />
                );
              })}
            </div>
          </div>
          ) : null}

          <div className={`grid gap-5 ${compact ? "grid-cols-1" : "lg:grid-cols-2 xl:grid-cols-3"}`}>
            {MENU_GROUPS.map((group) => (
              <MenuSection key={group.groupKey} title={t(`menu.groups.${group.groupKey}Title`)} description={t(`menu.groups.${group.groupKey}Description`)}>
                {group.items.map(([target, i18nKey, icon]) => (
                  <MenuActionButton key={target} icon={icon} label={t(`menu.items.${i18nKey}Label`)} description={t(`menu.items.${i18nKey}Description`)} onClick={() => handleSelect(target)} />
                ))}
              </MenuSection>
            ))}

            <MenuSection title={t("menu.groups.accountTitle")} description={t("menu.groups.accountDescription")}>
              <MenuActionButton
                icon={HiOutlineArrowsRightLeft}
                label={t("menu.items.switchAccountLabel")}
                description={t("menu.items.switchAccountDescription")}
                tone="strong"
                onClick={handleSwitchAccount}
              />
              <MenuActionButton
                icon={HiOutlineArrowRightOnRectangle}
                label={t("menu.items.signOutLabel")}
                description={t("menu.items.signOutDescription")}
                tone="danger"
                onClick={handleSignOut}
              />
              <MenuActionButton
                icon={HiOutlineRocketLaunch}
                label={t("menu.items.futureFeaturesLabel")}
                description={t("menu.items.futureFeaturesDescription")}
                tone="strong"
                onClick={() => handleSelect("future-features")}
              />
            </MenuSection>
          </div>
        </div>
      </div>
    </>
  );
}

export default function HeaderMenu({ open, onClose, onNavigate }) {
  const { t } = useI18n();
  if (!open) return null;

  return createPortal(
    <section className="fixed inset-0 z-50 flex h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-800 shadow-sm"
            aria-label={t("nav.backToExplore")}
          >
            <HiOutlineArrowLeft />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">KunThai</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{t("nav.socialMenu")}</h2>
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
