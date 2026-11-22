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
  if (!bundles.has(key)) bundles.set(key, fetch(`data/${slug}-assets/${paper}.json`, {cache: 'no-cache'}).then(async response => {
    if (!response.ok) throw new Error('Source image bundle is unavailable');
    return response.json();
  }).catch(error => { bundles.delete(key); throw error; }));
  let bundle = await bundles.get(key);
  if (!bundle.assets[name]) {
    // A page left open across a deploy can hold the previous catalogue: fetch it afresh once.
    bundles.set(key, fetch(`data/${slug}-assets/${paper}.json`, {cache: 'reload'}).then(response => {
      if (!response.ok) throw new Error('Source image bundle is unavailable');
      return response.json();
    }).catch(error => { bundles.delete(key); throw error; }));
    bundle = await bundles.get(key);
  }
  const asset = bundle.assets[name];
  if (!asset || !asset.base64) throw new Error('Source image is unavailable');
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
