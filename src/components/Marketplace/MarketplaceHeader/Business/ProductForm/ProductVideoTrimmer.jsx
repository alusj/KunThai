import VideoTrimmerScreen from "../../../../shared/VideoTrimmerScreen";
import { MAX_PRODUCT_VIDEO_MB, MAX_PRODUCT_VIDEO_SECONDS } from "./productVideoLimits";

// Thin wrapper around the shared trimmer with UrMall product limits.
export default function ProductVideoTrimmer({ file, onCancel, onComplete }) {
  return (
    <VideoTrimmerScreen
      file={file}
      onCancel={onCancel}
      onComplete={onComplete}
      maxSeconds={MAX_PRODUCT_VIDEO_SECONDS}
      maxMb={MAX_PRODUCT_VIDEO_MB}
      eyebrow="Trim product video"
    />
  );
}
