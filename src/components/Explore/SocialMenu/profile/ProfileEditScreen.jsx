import { useEffect, useRef, useState } from "react";

import { SPACE_IDENTITY_TYPE, getProfileIdentity, updateExploreProfile, updateExploreSpace } from "../../../../Backend/services/exploreService";
import { showToast } from "../../../../Backend/services/toastService";
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
      updateField("avatarUrl", await fileToDataUrl(file));
    } catch (error) {
      setFeedback(error.message || "Unable to load image.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleCoverChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      updateField("coverUrl", await fileToDataUrl(file));
    } catch (error) {
      setFeedback(error.message || "Unable to load cover image.");
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
      setFeedback(updated.avatarWarning || (isSpace ? "Space updated." : "Profile updated."));
      showToast(isSpace ? "Space updated." : "Profile updated.", "success");
    } catch (error) {
      setFeedback(error.message || "Unable to update profile.");
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
          {saving ? "Saving profile" : "Save profile"}
        </button>
      </div>
    </div>
  );
}
