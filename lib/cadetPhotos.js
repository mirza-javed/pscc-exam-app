const CADET_PHOTO_ROOT = "/cadet-photos";

export function normalizeCadetKitNo(kitNo) {
  const value = String(kitNo ?? "").trim();
  if (!value) return "";

  const normalized = /^\d+\.0+$/.test(value) ? value.replace(/\.0+$/, "") : value;
  return /^\d+$/.test(normalized) ? normalized : "";
}

export function getCadetPhotoPath(kitNo) {
  const normalizedKitNo = normalizeCadetKitNo(kitNo);
  return normalizedKitNo ? `${CADET_PHOTO_ROOT}/${normalizedKitNo}.webp` : null;
}

export function getCadetPhotoAlt(name, kitNo) {
  const normalizedKitNo = normalizeCadetKitNo(kitNo);
  const cadetName = String(name ?? "").trim() || "Cadet";
  return normalizedKitNo
    ? `${cadetName}, Kit No ${normalizedKitNo}`
    : `${cadetName} profile photo`;
}

async function blobToDataUri(blob) {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Unable to read cadet photo."));
      reader.readAsDataURL(blob);
    });
  }

  const buffer = globalThis.Buffer;
  if (buffer) {
    const bytes = await blob.arrayBuffer();
    return `data:${blob.type || "image/webp"};base64,${buffer.from(bytes).toString("base64")}`;
  }

  throw new Error("No supported image reader is available.");
}

export async function loadCadetPhotoDataUri(kitNo, fetchImpl = globalThis.fetch) {
  const photoPath = getCadetPhotoPath(kitNo);
  if (!photoPath || typeof fetchImpl !== "function") return null;

  try {
    const response = await fetchImpl(photoPath);
    if (!response?.ok) return null;
    const blob = await response.blob();
    if (!blob?.type?.startsWith("image/")) return null;
    return await blobToDataUri(blob);
  } catch (error) {
    console.warn(`Cadet photo unavailable for Kit No ${normalizeCadetKitNo(kitNo) || "unknown"}:`, error);
    return null;
  }
}
