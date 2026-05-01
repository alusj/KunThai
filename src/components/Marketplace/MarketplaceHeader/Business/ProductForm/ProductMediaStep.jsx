import ProductFormField from "./ProductFormField";
import ProductFormInput from "./ProductFormInput";

export default function ProductMediaStep({ productForm }) {
  const { form, errors, updateSection } = productForm;

  return (
    <div className="space-y-5">
      <ProductFormField label="Cover image" error={errors.coverImage}>
        <ProductFormInput
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0] || null;
            updateSection("media", { coverImageFile: file, coverImageName: file?.name || "" });
          }}
        />
        {form.media.coverImageUrl ? (
          <p className="mt-2 text-xs font-bold text-gray-500">
            Current cover is saved. Upload a new image only if you want to replace it.
          </p>
        ) : null}
      </ProductFormField>

      <ProductFormField label="Extra images up to 6">
        <ProductFormInput
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files || []).slice(0, 6);
            updateSection("media", { extraImageFiles: files });
          }}
        />
      </ProductFormField>

      <ProductFormField label="Short product video">
        <ProductFormInput
          type="file"
          accept="video/*"
          onChange={(event) => {
            const file = event.target.files?.[0] || null;
            updateSection("media", { videoFile: file, videoName: file?.name || "" });
          }}
        />
      </ProductFormField>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm font-medium text-gray-600">
        <p>Cover: {form.media.coverImageName || "Not selected"}</p>
        <p className="mt-1">
          Extra images: {form.media.extraImageFiles.length || form.media.extraImageUrls?.length || 0}
        </p>
        <p className="mt-1">Video: {form.media.videoName || "Not selected"}</p>
      </div>
    </div>
  );
}
