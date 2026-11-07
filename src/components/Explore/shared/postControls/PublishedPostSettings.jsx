import { useCallback, useEffect, useState } from "react";

import { postControlsOf } from "../../../../Backend/services/explore/postControls";
import { loadPublishedPostControls, savePublishedPostControls } from "../../../../Backend/services/explore/postControlsService";
import { shortErrorToast } from "../../../../Backend/services/friendlyErrorService";
import { showToast } from "../../../../Backend/services/toastService";
import { useI18n } from "../../../../i18n";
import AdvancedPostSheet from "./AdvancedPostSheet";

// The owner's "Post settings" for a post already published: loads the saved
// settings (with the excluded accounts), saves changes, and the server
// applies them at once. Open feeds on this device are refreshed by
// savePublishedPostControls.
export default function PublishedPostSettings({ open, post, ownerId = "", onClose, onSaved }) {
  const { t } = useI18n();
  const [controls, setControls] = useState(() => postControlsOf(post));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!post?.id) return;
    setLoading(true);
    setLoadError("");
    loadPublishedPostControls(post)
      .then(setControls)
      .catch(() => setLoadError(t("postControls.loadFailed")))
      .finally(() => setLoading(false));
  }, [post, t]);

  useEffect(() => {
    if (open) load();
    // Only on opening: a refreshed post object must not wipe edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save(next) {
    if (saving) return;
    setSaving(true);
    try {
      const row = await savePublishedPostControls(post.id, next);
      setControls(next);
      showToast(t("postControls.saved"), "success");
      onSaved?.(row);
      onClose?.();
    } catch (error) {
      showToast(shortErrorToast(error, t("postControls.saveFailed")), "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdvancedPostSheet
      open={open}
      title={t("postControls.editTitle")}
      initialControls={controls}
      ownerId={ownerId}
      loading={loading}
      loadError={loadError}
      saving={saving}
      editing
      scheduleEditable={Boolean(controls.scheduled)}
      onRetry={load}
      onClose={() => {
        if (!saving) onClose?.();
      }}
      onSave={save}
    />
  );
}
