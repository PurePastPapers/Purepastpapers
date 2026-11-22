// Source crops are grouped by booklet for lazy static hosting. Nothing is
// transcribed or recompressed: each asset retains its original lossless bytes.
// Catalogue crops are not lazy-loaded: their bytes are already in memory once the
// booklet catalogue arrives, and a lazy image with no intrinsic size can stay blank.
// A crop path names its subject slug: assets/<slug>/<PAPER>/<NAME>.webp is served
// from the catalogue data/<slug>-assets/<PAPER>.json (e.g. maths, biology).
import { html, isSafeUrl } from '../core/dom.js';
const PATH = /^assets\/([a-z]+)\/([A-Z0-9_]+)\/([A-Za-z0-9_]+\.webp)$/;
const bundles = new Map();
const urls = new Map();
const bytes = new Map();
const BUNDLE_CACHE_LIMIT = 32 * 1024 * 1024;
let bundleCacheSize = 0;
const BYTE_CACHE_LIMIT = 16 * 1024 * 1024;
let byteCacheSize = 0;
export function sourceImage(url, alt) {
  if (!url || !isSafeUrl(url)) return '';
  return html`<a href="${url}" target="_blank" rel="noopener" aria-label="Open ${alt} image at its original size">${PATH.test(url) ? html`<img data-math-image="${url}" alt="${alt}" />` : html`<img src="${url}" alt="${alt}" loading="lazy" />`}</a>`;
}
async function resolveAsset(path) {
  if (bytes.has(path)) {
    const cached = bytes.get(path);
    bytes.delete(path);
    bytes.set(path, cached);
    return cached;
  }
  const match = PATH.exec(path);
  if (!match) throw new Error('Invalid source-image reference');
  const [, slug, paper, name] = match;
  const key = `${slug}/${paper}`;
  let entry = cachedBundle(key);
  let bundle = await entry.promise;
  if (!bundle.assets[name]) {
    // A page left open across a deploy can hold the previous catalogue: fetch it afresh once.
    entry = bundles.get(key) && bundles.get(key) !== entry ? cachedBundle(key) : loadBundle(key, 'reload');
    bundle = await entry.promise;
  }
  if (bytes.has(path)) return bytes.get(path);
  const asset = bundle.assets[name];
  if (!asset?.base64) throw new Error('Source image is unavailable');
  const value = {data: Uint8Array.from(atob(asset.base64), char => char.charCodeAt(0)), mimeType: 'image/webp'};
  if (value.data.byteLength <= BYTE_CACHE_LIMIT) {
    bytes.set(path, value);
    byteCacheSize += value.data.byteLength;
    while (byteCacheSize > BYTE_CACHE_LIMIT) {
      const oldestPath = bytes.keys().next().value;
      byteCacheSize -= bytes.get(oldestPath).data.byteLength;
      bytes.delete(oldestPath);
    }
  }
  return value;
}
function cachedBundle(key) {
  const entry = bundles.get(key);
  if (!entry) return loadBundle(key, 'no-cache');
  bundles.delete(key);
  bundles.set(key, entry);
  return entry;
}

function removeBundle(key) {
  const entry = bundles.get(key);
  if (!entry) return;
  bundleCacheSize -= entry.size;
  bundles.delete(key);
}

function loadBundle(key, cache) {
  removeBundle(key);
  const [slug, paper] = key.split('/');
  const entry = { size: 0, promise: null };
  entry.promise = fetch(`data/${slug}-assets/${paper}.json`, { cache }).then(async response => {
    if (!response.ok) throw new Error('Source image bundle is unavailable');
    const bundle = await response.json();
    if (!bundle?.assets || typeof bundle.assets !== 'object') throw new Error('Source image bundle is invalid');
    if (bundles.get(key) === entry) {
      entry.size = Object.values(bundle.assets).reduce((size, asset) => size + 256 + (asset?.base64?.length || 0) * 2, 0);
      bundleCacheSize += entry.size;
      for (const [oldKey, oldEntry] of bundles) {
        if (bundleCacheSize <= BUNDLE_CACHE_LIMIT) break;
        if (oldKey !== key && oldEntry.size) removeBundle(oldKey);
      }
    }
    return bundle;
  }).catch(error => {
    if (bundles.get(key) === entry) removeBundle(key);
    throw error;
  });
  bundles.set(key, entry);
  return entry;
}

async function resolve(path) {
  if (urls.has(path)) return urls.get(path);
  const asset = await resolveAsset(path);
  const url = URL.createObjectURL(new Blob([asset.data], {type: asset.mimeType}));
  urls.set(path, url);
  return url;
}

/** Resolve a catalogue crop to its original bytes for generated documents. */
export async function sourceImageBytes(path) {
  const asset = await resolveAsset(path);
  return {data: asset.data.slice(), mimeType: asset.mimeType};
}
/** Resolve catalogue checksums without decoding the underlying images. */
export async function sourceImageChecksums(paths, { signal } = {}) {
  const result = new Map();
  const byBundle = new Map();
  for (const path of new Set(paths)) {
    result.set(path, null);
    const match = PATH.exec(path);
    if (!match) continue;
    const [, slug, paper, name] = match;
    const key = `${slug}/${paper}`;
    if (!byBundle.has(key)) byBundle.set(key, []);
    byBundle.get(key).push({ path, name });
  }
  for (const [key, entries] of byBundle) {
    signal?.throwIfAborted();
    try {
      const bundle = await cachedBundle(key).promise;
      for (const { path, name } of entries) {
        const checksum = bundle.assets[name]?.sha256;
        if (/^[a-f0-9]{64}$/i.test(checksum || '')) result.set(path, checksum);
      }
    } catch {
      // Unavailable catalogues remain distinguishable from verified assets.
    }
  }
  signal?.throwIfAborted();
  signal?.throwIfAborted();
  return result;
}

export function observeSourceImages(root = document) {
  const hydrate = () => {
    for (const image of root.querySelectorAll('img[data-math-image]')) {
      if (image.dataset.mathBound) continue;
      image.dataset.mathBound = 'true';
      resolve(image.dataset.mathImage).then(url => {
        image.src = url;
        if (image.parentElement?.tagName === 'A') image.parentElement.href = url;
      }).catch(() => {
        image.alt = `${image.alt}. Image unavailable; open the official source paper.`;
      });
    }
  };
  const observer = new MutationObserver(hydrate);
  observer.observe(root, {childList: true, subtree: true});
  hydrate();
  return () => observer.disconnect();
}
