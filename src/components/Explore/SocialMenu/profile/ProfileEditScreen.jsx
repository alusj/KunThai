import { useEffect, useRef, useState } from "react";

import { SPACE_IDENTITY_TYPE, getProfileIdentity, updateExploreProfile, updateExploreSpace } from "../../../../Backend/services/exploreService";
import { optimizeImageFile } from "../../../../Backend/services/marketplace/imageOptimization";
import { friendlyErrorMessage } from "../../../../Backend/services/friendlyErrorService";
import { haptics } from "../../../../Backend/services/feedbackService";
import { showToast } from "../../../../Backend/services/toastService";
import { useI18n } from "../../../../i18n";
import ProfileEditForm from "./ProfileEditForm";
import ProfileHeaderCard from "./ProfileHeaderCard";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

export default function ProfileEditScreen({
  authProfile = null,
  currentUserId = "",
  onProfileUpdate,
  profile,
}) {
  const { t } = useI18n();
  const [values, setValues] = useState(profile || {});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const profileIdentity = getProfileIdentity(values);
  const isSpace = profileIdentity.type === SPACE_IDENTITY_TYPE;

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
      // Downscale + re-encode before turning it into a data URL, so the save
      // uploads a small image instead of a multi-megabyte phone photo.
      updateField("avatarUrl", await fileToDataUrl(await optimizeImageFile(file)));
    } catch (error) {
      setFeedback(error.message || t("profile.unableLoadImage"));
    } finally {
      event.target.value = "";
    }
  }

  async function handleCoverChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Cover photos are the biggest profile upload; optimize before saving so
      // it no longer takes a long time on a normal connection.
      updateField("coverUrl", await fileToDataUrl(await optimizeImageFile(file)));
    } catch (error) {
      setFeedback(error.message || t("profile.unableLoadCover"));
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
      setFeedback(updated.avatarWarning || (isSpace ? t("profile.spaceUpdated") : t("profile.profileUpdated")));
      showToast(isSpace ? t("profile.spaceUpdated") : t("profile.profileUpdated"), "success");
      haptics.light("explore");
    } catch (error) {
      setFeedback(friendlyErrorMessage(error, t("profile.unableUpdateProfile")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full space-y-4 px-4 py-4 sm:px-6 lg:px-8">
      <ProfileHeaderCard
        editable
        editing
        coverInputRef={coverInputRef}
        feedback={feedback}
        fileInputRef={fileInputRef}
        followed={false}
        onAvatarChange={handleAvatarChange}
        onCoverChange={handleCoverChange}
        onCoverPreset={(preset) => updateField("coverUrl", `preset:${preset}`)}
        onEdit={saveProfile}
        saving={saving}
        stats={{
          feed: values?.stats?.feed || 0,
          swip: values?.stats?.swip || 0,
          followers: values?.stats?.followers || 0,
          following: values?.stats?.following || 0,
        }}
        values={values}
      />

      <ProfileEditForm values={values} onChange={updateField} />

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <button
          type="button"
          onClick={saveProfile}
          disabled={saving}
          className="h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white shadow-sm disabled:bg-slate-300"
        >
          {saving ? t("profile.savingProfile") : t("profile.saveProfile")}
        </button>
      </div>
    </div>
  );
}
