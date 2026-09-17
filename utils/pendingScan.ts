// Single source of truth for the image handed from an upload page to its result page.
//
// Two problems this replaces:
//   1. /upload-media wrote "pendingRoadScan" while /report-damage wrote
//      "upload_image_base64", and the result component only ever read the second,
//      so the two flows behaved differently for no reason.
//   2. A raw phone photo base64-encodes to well over the ~5 MB localStorage
//      quota, so setItem threw and the user got an alert telling them to find a
//      smaller image. Downscaling first makes that essentially impossible.

const IMAGE_KEY = 'oasys.pendingScan.image';
const NAME_KEY = 'oasys.pendingScan.filename';

/** Longest edge, in pixels, of the image sent for analysis. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export interface PendingScan {
  image: string;
  filename: string;
}

/**
 * Downscale to MAX_EDGE and re-encode as JPEG.
 *
 * The backend warps to a 700x700 bird's-eye view anyway, so anything larger is
 * bytes we pay for twice (localStorage, then the request body) and never use.
 */
function downscaleToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not prepare the image for upload.'));
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That file could not be read as an image.'));
    };

    img.src = objectUrl;
  });
}

/** Prepare and stash an uploaded file. Returns the data URL for preview. */
export async function savePendingScan(file: File): Promise<string> {
  const dataUrl = await downscaleToDataUrl(file);

  try {
    localStorage.setItem(IMAGE_KEY, dataUrl);
    localStorage.setItem(NAME_KEY, file.name);
  } catch {
    throw new Error(
      'Your browser ran out of space for this image. Try a smaller photo.'
    );
  }

  return dataUrl;
}

export function readPendingScan(): PendingScan | null {
  try {
    const image = localStorage.getItem(IMAGE_KEY);
    if (!image) return null;
    return { image, filename: localStorage.getItem(NAME_KEY) ?? 'road-image.jpg' };
  } catch {
    return null;
  }
}

export function clearPendingScan(): void {
  try {
    localStorage.removeItem(IMAGE_KEY);
    localStorage.removeItem(NAME_KEY);
  } catch {
    // Private-mode browsers can throw here; nothing to clean up if so.
  }
}
