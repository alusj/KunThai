import supabase from "../../Backend/lib/supabaseClient";

export const TRANSPORT_PUBLIC_MEDIA_BUCKET = "transport-public-media";
export const TRANSPORT_VERIFICATION_DOCUMENTS_BUCKET = "transport-verification-documents";

function safePathPart(value = "file") {
  return String(value)
    .normalize("NFKD")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "file";
}

export function getTransportUploadFile(value) {
  if (typeof File === "undefined") return null;
  if (value instanceof File) return value;
  return value?.file instanceof File ? value.file : null;
}

export function getTransportUploadName(value) {
  if (typeof value === "string") return value;
  return value?.fileName || value?.name || getTransportUploadFile(value)?.name || "";
}

export function getTransportUploadUrl(value) {
  if (!value || typeof value === "string") return "";
  return value.publicUrl || value.fileUrl || value.url || "";
}

export async function uploadTransportPublicImage({ file, ownerUserId, scope = "fleet", label = "image" }) {
  if (!file || !ownerUserId) return "";
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error(`${label} must be an image file.`);
  }

  const path = [
    safePathPart(ownerUserId),
    safePathPart(scope),
    `${Date.now()}-${safePathPart(label)}-${safePathPart(file.name)}`,
  ].join("/");
  const { error } = await supabase.storage.from(TRANSPORT_PUBLIC_MEDIA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message || `Unable to upload ${label}.`);

  const { data } = supabase.storage.from(TRANSPORT_PUBLIC_MEDIA_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

export async function uploadTransportVerificationDocument({ file, ownerUserId, scope = "registration", label = "document" }) {
  if (!file || !ownerUserId) return null;

  const path = [
    safePathPart(ownerUserId),
    safePathPart(scope),
    `${Date.now()}-${safePathPart(label)}-${safePathPart(file.name)}`,
  ].join("/");
  const { error } = await supabase.storage.from(TRANSPORT_VERIFICATION_DOCUMENTS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message || `Unable to upload ${label}.`);

  return {
    fileName: file.name || label,
    bucket: TRANSPORT_VERIFICATION_DOCUMENTS_BUCKET,
    path,
    contentType: file.type || "application/octet-stream",
    visibility: "admin",
  };
}

export function toStoredTransportUpload(value, publicUrl = "") {
  const fileName = getTransportUploadName(value);
  const fileUrl = publicUrl || getTransportUploadUrl(value);
  if (!fileName && !fileUrl) return "";
  return fileUrl ? { fileName, fileUrl, visibility: "passenger" } : fileName;
}
