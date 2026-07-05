/**
 * Firebase Storage now requires the paid Blaze plan just to turn on, even though its free
 * usage quotas didn't change — so photos are stored directly as compressed data URLs inside
 * Firestore documents instead, keeping this app on the free Spark plan with no credit card.
 *
 * Firestore caps a single document at ~1 MiB, so images are downscaled and JPEG-compressed
 * client-side (in the browser, before ever reaching the network) until comfortably under
 * that limit. This trades away full camera resolution for zero cost — the result is still
 * clear enough to document what happened on a failed step.
 */
const MAX_DATA_URL_LENGTH = 500_000; // ~375 KB raw, leaving headroom in the 1 MiB document cap

export async function compressImageToDataUrl(file, { maxDimension = 900 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let quality = 0.7;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_DATA_URL_LENGTH && quality > 0.2) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}
