(() => {
  const BUCKET = "ivenue-images";
  const MAX_BYTES = 5 * 1024 * 1024;
  const TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ]);

  function validate(file) {
    if (!file) throw new Error("Choose an image to upload.");
    if (!TYPES.has(file.type))
      throw new Error("Choose a JPG, PNG, or WebP image.");
    if (file.size > MAX_BYTES)
      throw new Error("Images must be 5 MB or smaller.");
  }

  function preview(file) {
    validate(file);
    return URL.createObjectURL(file);
  }

  async function upload(file, folder) {
    validate(file);
    const client = window.supabaseClient;
    const session = await window.authApi?.getSession();
    if (!client || !session?.user) throw new Error("Please sign in to upload an image.");
    const extension = TYPES.get(file.type);
    const name = `${crypto.randomUUID()}.${extension}`;
    const path = `${folder}/${name}`;
    const { error } = await client.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(error.message || "Image upload failed.");
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("The uploaded image URL could not be created.");
    return { path, publicUrl: data.publicUrl };
  }

  window.iVenueImageUpload = Object.freeze({ BUCKET, MAX_BYTES, validate, preview, revoke: URL.revokeObjectURL.bind(URL), upload });
})();
