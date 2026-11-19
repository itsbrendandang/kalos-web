/**
 * Save a Blob as a file through an object URL and a temporary `<a download>`.
 * The file is downloaded, never opened as a page.
 */
export function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled, so the download is not cut off.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const saveText = (filename: string, text: string, type: string) => saveBlob(filename, new Blob([text], { type }));
