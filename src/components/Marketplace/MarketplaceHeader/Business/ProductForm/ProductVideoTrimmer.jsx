import VideoTrimmerScreen from "../../../../shared/VideoTrimmerScreen";
import { MAX_PRODUCT_VIDEO_MB, MAX_PRODUCT_VIDEO_SECONDS } from "./productVideoLimits";
import { useI18n, t } from "../../../../../i18n";

// Thin wrapper around the shared trimmer with UrMall product limits. Trimming
// is instant like Explore: a video within the size limit is kept whole and only
// the chosen start..end plays.
export default function ProductVideoTrimmer({ file, onCancel, onComplete }) {
  useI18n();
  return (
    <VideoTrimmerScreen
      file={file}
      onCancel={onCancel}
      onComplete={onComplete}
      maxSeconds={MAX_PRODUCT_VIDEO_SECONDS}
      maxMb={MAX_PRODUCT_VIDEO_MB}
      eyebrow={t("urmall.biz.pform.trimVideo")}
      instantRange
    />
  );
}
