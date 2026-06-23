type PhotoRecord = Record<string, unknown>;

function addPhotoValue(value: unknown, photos: string[]) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed && !photos.includes(trimmed)) photos.push(trimmed);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(item => addPhotoValue(item, photos));
    return;
  }

  if (value && typeof value === "object") {
    const photo = value as PhotoRecord;
    addPhotoValue(photo.base64 ?? photo.photoBase64 ?? photo.data, photos);
  }
}

/**
 * Supports the original driver payload and the common two-photo payload shapes.
 * New clients should send `photoBase64s: [firstPhoto, secondPhoto]`.
 */
export function extractDeliveryPhotoBase64s(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];

  const payload = body as PhotoRecord;
  const photos: string[] = [];

  [
    payload.photoBase64,
    payload.photoBase64s,
    payload.photosBase64,
    payload.photos,
    payload.photoBase64Second,
    payload.photoBase64_2,
    payload.secondPhotoBase64,
    payload.photoBase642,
    payload.photo2Base64,
    payload.secondPhoto,
    payload.photo2,
  ].forEach(value => addPhotoValue(value, photos));

  return photos.slice(0, 2);
}

export function getPodPhotoUrls(event: {
  podFileUrl?: string | null;
  podFileUrl2?: string | null;
}): string[] {
  return [event.podFileUrl, event.podFileUrl2].filter(
    (url): url is string => typeof url === "string" && url.length > 0
  );
}

export function getProofPhotoUrls(delivery: {
  proofPhotoUrl?: string | null;
  proofPhotoUrl2?: string | null;
}): string[] {
  return [delivery.proofPhotoUrl, delivery.proofPhotoUrl2].filter(
    (url): url is string => typeof url === "string" && url.length > 0
  );
}
