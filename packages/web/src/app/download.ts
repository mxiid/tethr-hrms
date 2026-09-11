// Browser-side file downloads shared by finance surfaces (PDFs, CSV advice).

export const downloadBase64File = (
  filename: string,
  base64: string,
  mime = 'application/pdf',
): void => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  // The anchor must be in the document for the click to trigger a download in
  // all browsers (detached clicks are ignored by headless Chromium).
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

export const downloadCsvFile = (filename: string, contents: string): void => {
  downloadBase64File(filename, btoa(contents), 'text/csv;charset=utf-8');
};
