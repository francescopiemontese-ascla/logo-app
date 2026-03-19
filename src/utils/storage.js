// Storage abstraction: R2 (web) or local dataUrl (Tauri / fallback)
// Detects environment and uses the appropriate backend.

let _isTauri = null;

async function isTauri() {
  if (_isTauri !== null) return _isTauri;
  try {
    await import('@tauri-apps/api/core');
    _isTauri = true;
  } catch {
    _isTauri = false;
  }
  return _isTauri;
}

/**
 * Upload a file and return a URL to access it.
 * - Tauri: stores as data URL (local, returned as-is)
 * - Web: uploads to R2 via /api/upload, returns /api/file/... URL
 *
 * @param {File|Blob} file - The file to upload
 * @param {string} [fileName] - Optional filename
 * @returns {Promise<string>} URL or data URL
 */
export async function uploadFile(file, fileName) {
  if (await isTauri()) {
    // Desktop: keep as data URL (stored in SQLite)
    return blobToDataUrl(file);
  }

  // Web: upload to R2
  try {
    const formData = new FormData();
    const f = file instanceof File ? file : new File([file], fileName || 'file.bin', { type: file.type });
    formData.append('file', f);

    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed: ${res.status}`);
    }

    const data = await res.json();
    return data.url; // e.g. /api/file/logos/1234.png
  } catch (err) {
    console.warn('R2 upload failed, falling back to data URL:', err.message);
    // Fallback: store as data URL in IndexedDB
    return blobToDataUrl(file);
  }
}

/**
 * Delete a file from storage.
 * - Tauri: no-op (data URL is in SQLite, deleted with the row)
 * - Web: DELETE /api/file/:key
 */
export async function deleteFile(url) {
  if (await isTauri()) return;
  if (!url || !url.startsWith('/api/file/')) return;

  try {
    await fetch(url, { method: 'DELETE' });
  } catch (err) {
    console.warn('Failed to delete file from R2:', err.message);
  }
}

/**
 * Check if a URL is an R2 URL (vs data URL)
 */
export function isR2Url(url) {
  return url && url.startsWith('/api/file/');
}

// --- Helpers ---

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
