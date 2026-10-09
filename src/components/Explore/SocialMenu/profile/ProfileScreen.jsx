import { useEffect, useRef, useState } from "react";

import { fetchSpaceCreditWallet, shareSpaceInviteLink, transferSpaceVisibilityCredits } from "../../../../Backend/services/visibilityCreditService";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import { useExploreFollows } from "../../../../Backend/hooks/useExploreFollows";
import { useIdentityPosts } from "../../../../Backend/hooks/useProfilePosts";
import { countIdentityPosts } from "../../../../Backend/services/explore/postService";
import { useExploreFollowStats } from "../../../../Backend/hooks/useExploreFollowStats";
import { useVisibilityCredits } from "../../../../Backend/hooks/useVisibilityCredits";
import {
  SPACE_IDENTITY_TYPE,
  getProfileIdentity,
  respondExploreSpaceInvite,
  updateExploreProfile,
  updateExploreSpace,
} from "../../../../Backend/services/exploreService";
import { blockExploreIdentity, reportExploreProfile, reportExploreSpace } from "../../../../Backend/services/explore/safetyService";
import { showToast } from "../../../../Backend/services/toastService";
import { inlineErrorMessage, shortErrorToast } from "../../../../Backend/services/friendlyErrorService";
import { useI18n } from "../../../../i18n";
import ProfilePostList from "./ProfilePostList";
import { copyProfileLink, shareProfileLink } from "./profileLinks";
import { notifyProfileSaveError, notifyProfileUploadProblems } from "./profileSaveFeedback";
import Avatar from "../../shared/Avatar";
import EmptyState from "../../shared/EmptyState";
import ActivityScreen from "../activity/ActivityScreen";
import SavedPostsScreen from "../savedPosts/SavedPostsScreen";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import ProfileEditForm from "./ProfileEditForm";
import ProfileHeaderCard from "./ProfileHeaderCard";
import ProfileTabs from "./ProfileTabs";
import { uiText as translateUi } from "../../../../i18n/index.js";
import SpaceActivityBadge from "../../shared/SpaceActivityBadge";

const PROFILE_TAB_ORDER = ["feed", "swip", "saved", "activity"];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

// Shown while a Space's balance loads, so the card never blinks out.
const SPACE_WALLET_PLACEHOLDER = { balance: 0, canSpend: false, inviteCode: "", inviteUrl: "" };

export default function ProfileScreen({
  currentUserId = "",
  editable = false,
  authProfile = null,
  hideHeader = false,
  loading = false,
  loadError = "",
  managedSpace = null,
  spaceActivity = {},
  onEditProfile,
  onCreateSpace,
  onOpenNotification,
  onOpenSpaceDashboard,
  onProfileUpdate,
  onSpaceInviteResponse,
  onSwitchIdentity,
  onStartChat,
  personalProfile = null,
  profile,
  profileFetched = true,
  spaces = [],
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [postTab, setPostTab] = useState("feed");
  const [tabSlideDirection, setTabSlideDirection] = useState("forward");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [values, setValues] = useState(profile || {});
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  // The shared feed hook keeps this account's likes and saves; the profile's
  // own posts come from the server, page by page.
  const feed = useExploreFeed("feed");
  const profileIdentity = getProfileIdentity(values);
  const isSpace = profileIdentity.type === SPACE_IDENTITY_TYPE;
  const followStats = useExploreFollowStats(profileIdentity);
  const { followedUsers, toggleFollow } = useExploreFollows(currentUserId);
  const feedList = useIdentityPosts(profileIdentity, "feed");
  const swipList = useIdentityPosts(profileIdentity, "swip");
  const [postCounts, setPostCounts] = useState(null);
  const blockingRef = useRef(false);
  const credits = useVisibilityCredits({ enabled: editable && !isSpace && Boolean(currentUserId) });
  // A Space has its own Visibility Credits (members only). The card stays on
  // screen while the balance loads; it is hidden only when Space credits are
  // not deployed at all (the wallet call answers "unavailable").
  const spaceCreditId = editable && isSpace ? profileIdentity.id : "";
  const [spaceWallet, setSpaceWallet] = useState(null);
  const [spaceWalletLoading, setSpaceWalletLoading] = useState(Boolean(spaceCreditId));
  const [spaceWalletUnavailable, setSpaceWalletUnavailable] = useState(false);
  const [spaceWalletVersion, setSpaceWalletVersion] = useState(0);
  useEffect(() => {
    // A purchase or boost elsewhere changed a balance: reload it.
    const reload = () => setSpaceWalletVersion((value) => value + 1);
    window.addEventListener("kuntai-visibility-credits-updated", reload);
    return () => window.removeEventListener("kuntai-visibility-credits-updated", reload);
  }, []);
  useEffect(() => {
    if (!spaceCreditId) {
      setSpaceWallet(null);
      setSpaceWalletLoading(false);
      return undefined;
    }
    let alive = true;
    setSpaceWalletLoading(true);
    fetchSpaceCreditWallet(spaceCreditId)
      .then((wallet) => {
        if (!alive) return;
        setSpaceWallet(wallet);
        setSpaceWalletUnavailable(!wallet);
      })
      .catch(() => {
        // A failed load keeps the card (and the last balance) on screen.
      })
      .finally(() => {
        if (alive) setSpaceWalletLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [spaceCreditId, spaceWalletVersion]);
  // Post counts are exact server counts (what this viewer may see), not the
  // number of posts loaded so far.
  useEffect(() => {
    if (!profileIdentity.id) {
      setPostCounts(null);
      return undefined;
    }
    let alive = true;
    countIdentityPosts(profileIdentity)
      .then((counts) => {
        if (alive) setPostCounts(counts);
      })
      .catch(() => {
        if (alive) setPostCounts(null);
      });
    return () => {
      alive = false;
    };
    // profileIdentity is rebuilt every render; its key is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileIdentity.key, feedList.total, feedList.posts.length, swipList.posts.length]);
  const displayedStats = {
    ...(followStats.stats || {}),
    feed: postCounts ? postCounts.feed : Number(followStats.stats?.feed || 0),
    swip: postCounts ? postCounts.swip : Number(followStats.stats?.swip || 0),
  };
  const followed = Boolean(profileIdentity.key && (followedUsers.has(profileIdentity.key) || followedUsers.has(profileIdentity.id)));
  const accountUnavailable = Boolean(values?.deactivatedAt) && !editable;

  useEffect(() => {
    setValues(profile || {});
  }, [profile]);

  function updateField(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setFeedback("");
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      updateField("avatarUrl", await fileToDataUrl(file));
    } catch {
      setFeedback(t("profile.unableLoadImage"));
    } finally {
      event.target.value = "";
    }
  }

  async function handleCoverChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      updateField("coverUrl", await fileToDataUrl(file));
    } catch {
      setFeedback(t("profile.unableLoadCover"));
    } finally {
      event.target.value = "";
    }
  }

  async function saveProfile() {
    try {
      setSaving(true);
      const updated = isSpace
        ? await updateExploreSpace(values.spaceId || profileIdentity.id, values)
        : await updateExploreProfile({
          ...authProfile,
          ...values,
          userId: currentUserId || values.userId || authProfile?.userId || "",
        });
      setValues(updated);
      onProfileUpdate?.(updated);
      setEditing(false);
      const uploadProblem = notifyProfileUploadProblems(updated, { t });
      setFeedback(uploadProblem || (isSpace ? t("profile.spaceUpdated") : t("profile.profileUpdated")));
      if (!uploadProblem) showToast(isSpace ? "Space has been updated" : t("profile.profileUpdated"), "success");
    } catch (error) {
      setFeedback(notifyProfileSaveError(error, { isSpace, t }));
    } finally {
      setSaving(false);
    }
  }

  async function followProfile() {
    // toggleFollow rolls back and shows its own toast when the server refuses.
    try {
      await toggleFollow(profileIdentity);
    } catch (error) {
      showToast(shortErrorToast(error, "Connection not updated"), "danger");
    }
  }

  function changeProfileTab(nextTab) {
    if (nextTab === postTab) return;

    const currentIndex = PROFILE_TAB_ORDER.indexOf(postTab);
    const nextIndex = PROFILE_TAB_ORDER.indexOf(nextTab);
    setTabSlideDirection(nextIndex >= currentIndex ? "forward" : "backward");
    setPostTab(nextTab);
  }

  async function handleShare() {
    try {
      const result = await shareProfileLink(values, t);
      if (result === "cancelled") return;
      setFeedback(t("profile.profileLinkReady"));
      showToast(t("profile.profileLinkReady"), "success");
    } catch {
      setFeedback(t("profile.unableShareProfile"));
      showToast(t("exploreProfileFix.profileNotShared"), "danger");
    }
  }

  async function handleCopyLink() {
    try {
      await copyProfileLink(values);
      showToast(t("exploreProfileFix.linkCopied"), "success");
    } catch {
      showToast(t("exploreProfileFix.linkNotCopied"), "danger");
    }
  }

  async function handleShareCredits() {
    try {
      if (isSpace) {
        // The Space's own invite link: a successful join credits the Space.
        const wallet = await shareSpaceInviteLink(profileIdentity.id, values.displayName || values.name);
        if (wallet) setSpaceWallet(wallet);
      } else {
        await credits.shareInvite();
      }
      setFeedback(t("profile.inviteLinkReady"));
      showToast(t("profile.inviteLinkReady"), "success", { title: t("exploreProfileFix.visibilityCredits") });
    } catch (error) {
      const message = inlineErrorMessage(error, t("profile.unableShareInvite"));
      setFeedback(message);
      showToast(shortErrorToast(error, "Couldn't share invite"), "danger");
    }
  }

  async function handleTransferCredits(kunThaiId, amount) {
    try {
      const result = isSpace
        ? await transferSpaceVisibilityCredits(profileIdentity.id, kunThaiId, amount)
        : await credits.transfer(kunThaiId, amount);
      if (isSpace && result) {
        setSpaceWallet((current) => (current ? { ...current, balance: Number(result.senderBalance ?? current.balance) } : current));
      }
      const recipientName = result?.recipientName || t("profile.recipientFallback");
      const message = t("profile.creditsSharedWith", { amount: Number(result?.amount || amount), name: recipientName });
      setFeedback(message);
      showToast(`${Number(result?.amount || amount)} credits shared`, "success", { title: t("profile.creditsShared") });
      return result;
    } catch (error) {
      const message = inlineErrorMessage(error, t("profile.unableShareCredits"));
      setFeedback(message);
      showToast(shortErrorToast(error, "Credits weren't shared"), "danger");
      throw error;
    }
  }


  async function blockProfile() {
    if (isSpace) {
      try {
        await blockExploreIdentity(profileIdentity, "blocked from Space profile");
        setFeedback(t("profile.spaceBlocked"));
        showToast("Space has been blocked", "success");
      } catch (error) {
        const message = error.message || t("profile.unableBlockSpace");
        setFeedback(message);
        showToast(shortErrorToast(error, "Couldn't block Space"), "danger");
      }
      return;
    }
    if (blockingRef.current) return;
    const name = values.displayName || values.username || t("feed.profileFallback");
    if (!window.confirm(t("exploreProfileFix.blockConfirm", { name }))) return;
    blockingRef.current = true;
    try {
      await blockExploreIdentity(profileIdentity, "blocked from profile");
      setFeedback(t("profile.profileBlocked"));
      showToast(t("exploreProfileFix.profileBlocked"), "success");
    } catch (error) {
      setFeedback(inlineErrorMessage(error, t("exploreProfileFix.profileNotBlocked")));
      showToast(shortErrorToast(error, "Couldn't block profile"), "danger");
    } finally {
      blockingRef.current = false;
    }
  }

  async function reportProfile() {
    if (isSpace) {
      try {
        const result = await reportExploreSpace(values.spaceId || profileIdentity.id);
        const message = result.alreadyReported ? t("profile.spaceAlreadyReported") : t("profile.spaceReportSent");
        setFeedback(message);
        showToast(result.alreadyReported ? "Space already reported" : "Space has been reported", "success");
      } catch (error) {
        const message = error.message || t("profile.unableReportSpace");
        setFeedback(message);
        showToast(shortErrorToast(error, "Couldn't report Space"), "danger");
      }
      return;
    }
    try {
      const result = await reportExploreProfile(values.userId);
      const message = result.alreadyReported ? t("profile.profileAlreadyReported") : t("profile.profileReportSent");
      setFeedback(message);
      showToast(result.alreadyReported ? "Profile already reported" : "Profile has been reported", "success");
    } catch (error) {
      const message = error.message || t("profile.unableReportProfile");
      setFeedback(message);
      showToast(shortErrorToast(error, "Couldn't report profile"), "danger");
    }
  }

  async function respondToSpaceInvite(space, accept) {
    try {
      const result = await respondExploreSpaceInvite(space, accept);
      onSpaceInviteResponse?.(space, result, accept);
      const message = accept ? t("profile.spaceInviteAccepted") : t("profile.spaceInviteDeclined");
      setFeedback(message);
      showToast(accept ? "Space invite accepted" : "Space invite declined", "success");
    } catch (error) {
      const message = error.message || t("profile.unableRespondSpaceInvite");
      setFeedback(message);
      showToast(shortErrorToast(error, "Couldn't answer invite"), "danger");
    }
  }

  function renderPosts(list, surface) {
    return (
      <ProfilePostList
        list={list}
        reactions={feed}
        surface={surface}
        currentUserId={currentUserId}
        spaces={spaces}
        emptyTitle={surface === "swip" ? t("profile.noSwipTitle") : t("profile.noFeedTitle")}
        emptyMessage={surface === "swip" ? t("profile.noSwipMsg") : t("profile.noFeedMsg")}
        onHide={editable ? undefined : (postId) => {
          feed.hidePost(postId);
          list.removePost(postId);
        }}
        onReport={editable ? undefined : (postId, reason) => feed.reportPost(postId, reason)}
      />
    );
  }

  function renderTabContent() {
    if (postTab === "feed") return renderPosts(feedList, "feed");
    if (postTab === "swip") return renderPosts(swipList, "swip");
    if (postTab === "saved" && editable) return <SavedPostsScreen currentUserId={currentUserId} hideHeader />;
    if (postTab === "activity" && editable) return <ActivityScreen currentUserId={currentUserId} hideHeader onOpenNotification={onOpenNotification} />;
    return null;
  }

  return (
    <div>
      {!hideHeader ? (
        <SocialScreenHeader
          title={t("profile.headerTitle")}
          subtitle={t("profile.headerSubtitle")}
        />
      ) : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-6 lg:px-8">
        {loading && !profile ? (
          <p className="py-12 text-center text-sm font-bold text-slate-400">{t("profile.opening")}</p>
        ) : loadError ? (
          <EmptyState title={t("profile.couldNotLoad")} message={translateUi(loadError)} />
        ) : accountUnavailable ? (
          <EmptyState
            title={t("profile.accountUnavailable")}
            message={t("profile.accountUnavailableMsg")}
          />
        ) : profileFetched && !profile ? (
          <CreateProfileState
            onCreate={() => {
              setValues({ ...(authProfile || {}), userId: currentUserId || authProfile?.userId || "" });
              setEditing(true);
            }}
          />
        ) : null}

        {!loadError && !accountUnavailable && (profile || editing) ? (
          <>
        {/* Acting as a Space: one tap back to the personal profile, the same
            card the Space dashboard shows. */}
        {editable && isSpace && typeof onSwitchIdentity === "function" ? (
          <section className="flex items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={personalProfile?.displayName} src={personalProfile?.avatarUrl} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">{personalProfile?.displayName || translateUi("Your profile")}</p>
                <p className="truncate text-xs font-bold text-slate-500">{translateUi("Personal profile minimized while this Space is active")}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSwitchIdentity(null, { openProfile: true })}
              className="kt-pressable h-10 flex-none rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
            >
              {translateUi("Switch back")}
            </button>
          </section>
        ) : null}
        {/* Viewing a Space you own/administer from outside it: the page stays
            public, with one tap to act as the Space and manage it. */}
        {!editable && isSpace && managedSpace && typeof onSwitchIdentity === "function" ? (
          <section className="flex items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{translateUi("You manage this Space")}</p>
              <p className="truncate text-xs font-bold text-slate-500">{translateUi("Others see this public view")}</p>
            </div>
            <button
              type="button"
              onClick={() => onSwitchIdentity(managedSpace, { openProfile: true })}
              className="kt-pressable h-10 flex-none rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
            >
              {translateUi("Manage")}
            </button>
          </section>
        ) : null}
        {editable && !isSpace && spaces.length ? (
          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{t("profile.yourSpaces")}</p>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 kuntai-scrollbar-none">
              {spaces.map((space) => (
                <div
                  key={space.spaceId}
                  className="flex min-w-[112px] flex-col items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-center"
                >
                  <button type="button" disabled={space.membershipStatus === "pending"} onClick={() => onSwitchIdentity?.(space, { openProfile: true })} className="kt-pressable flex flex-col items-center gap-2 disabled:cursor-default">
                    <span className="relative">
                      <Avatar name={space.displayName} src={space.avatarUrl} size="md" />
                      <SpaceActivityBadge activity={spaceActivity[space.spaceId]} className="absolute -right-2 -top-1" />
                    </span>
                    <span className="line-clamp-2 text-xs font-black leading-4 text-slate-700">{space.displayName}</span>
                  </button>
                  {space.membershipStatus === "pending" ? (
                    <div className="grid w-full grid-cols-2 gap-1">
                      <button type="button" onClick={() => respondToSpaceInvite(space, true)} className="h-8 rounded-xl bg-sky-700 text-[11px] font-black text-white">
                        {t("profile.accept")}
                      </button>
                      <button type="button" onClick={() => respondToSpaceInvite(space, false)} className="h-8 rounded-xl bg-white text-[11px] font-black text-slate-600">
                        {t("profile.decline")}
                      </button>
                    </div>
                  ) : (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-sky-700">{space.memberRole || t("profile.member")}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <ProfileHeaderCard
          currentUserId={currentUserId}
          editable={editable}
          editing={editing}
          coverInputRef={coverInputRef}
          feedback={feedback}
          fileInputRef={fileInputRef}
          followed={followed}
          onAvatarChange={handleAvatarChange}
          onBlock={blockProfile}
          onCoverChange={handleCoverChange}
          onCoverPreset={(preset) => updateField("coverUrl", `preset:${preset}`)}
          onCreateSpace={editable && !isSpace ? onCreateSpace : undefined}
          onOpenDashboard={editable && isSpace ? onOpenSpaceDashboard : undefined}
          onEdit={() => {
            if (!editing && onEditProfile) {
              onEditProfile();
              return;
            }

            editing ? saveProfile() : setEditing(true);
          }}
          onFollow={followProfile}
          onMessage={() => {
            // The Space's own team can't message it as a customer: take them
            // to its shared inbox instead.
            if (!editable && isSpace && managedSpace && typeof onSwitchIdentity === "function") {
              onSwitchIdentity(managedSpace, { openMessages: true });
              return;
            }
            onStartChat?.(values);
          }}
          onLookupCreditRecipient={credits.lookupRecipient}
          onReport={reportProfile}
          onShare={handleShare}
          onCopyLink={handleCopyLink}
          onShareCredits={handleShareCredits}
          onTransferCredits={handleTransferCredits}
          saving={saving}
          creditLoading={isSpace ? spaceWalletLoading || !spaceWallet : credits.loading}
          creditWallet={editable ? (isSpace ? (spaceWalletUnavailable ? null : spaceWallet || SPACE_WALLET_PLACEHOLDER) : credits.wallet) : null}
          creditSpaceId={isSpace ? profileIdentity.id : ""}
          loadingStats={followStats.loading && !followStats.stats}
          stats={displayedStats}
          values={values}
        />

        {editing ? <ProfileEditForm values={values} onChange={updateField} /> : null}

        <ProfileTabs active={postTab} editable={editable} onChange={changeProfileTab} />

        <section
          key={postTab}
          className={`w-full space-y-4 ${tabSlideDirection === "backward" ? "kt-parent-tab-slide-backward" : "kt-parent-tab-slide-forward"}`}
        >
          {renderTabContent()}
        </section>
          </>
        ) : null}
      </div>
    </div>
  );
}


function CreateProfileState({ onCreate }) {
  const { t } = useI18n();
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
      <h3 className="text-base font-black text-slate-950">{t("profile.createProfileTitle")}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
        {t("profile.createProfileMsg")}
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 h-11 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
      >
        {t("profile.createProfileBtn")}
      </button>
    </div>
  );
}
