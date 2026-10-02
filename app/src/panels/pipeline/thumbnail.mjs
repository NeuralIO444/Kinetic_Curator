// #654 — a project may carry a small preview. Absent is fine. Reimport ignores it.
const CAP = 80_000;

export function attachThumbnail(doc, dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return doc;
  if (dataUrl.length > CAP) return doc;
  return { ...doc, thumbnail: dataUrl };
}

export function readThumbnail(doc) {
  const t = doc?.thumbnail;
  return typeof t === 'string' && t.startsWith('data:image/') && t.length <= CAP ? t : null;
}
