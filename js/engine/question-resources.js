export function officialResourceUrl(value) {
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export function questionResourceUrl(resource) {
  const url = officialResourceUrl(resource?.url);
  if (!url || resource.kind !== 'audio' || !Number.isFinite(resource.start_seconds)) return url;
  const playback = new URL(url);
  const end = Number.isFinite(resource.end_seconds) ? `,${resource.end_seconds}` : '';
  playback.hash = `t=${resource.start_seconds}${end}`;
  return playback.href;
}
