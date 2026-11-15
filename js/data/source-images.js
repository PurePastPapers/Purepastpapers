// Source crops are grouped by booklet for lazy static hosting. Nothing is
// transcribed or recompressed: each asset retains its original lossless bytes.
import { html, isSafeUrl } from '../core/dom.js';
const PATH = /^assets\/maths\/([A-Z0-9_]+)\/([A-Za-z0-9_]+\.webp)$/;
const bundles = new Map();
const urls = new Map();
export function sourceImage(url, alt) {
  if (!url || !isSafeUrl(url)) return '';
  return html`<a href="${url}" target="_blank" rel="noopener" aria-label="Open ${alt} image at its original size">${PATH.test(url) ? html`<img data-math-image="${url}" alt="${alt}" loading="lazy" />` : html`<img src="${url}" alt="${alt}" loading="lazy" />`}</a>`;
}
async function resolve(path) {
  if (urls.has(path)) return urls.get(path);
  const match = PATH.exec(path);
  if (!match) throw new Error('Invalid source-image reference');
  const [, paper, name] = match;
  if (!bundles.has(paper)) bundles.set(paper, fetch(`data/maths-assets/${paper}.json`).then(async response => {
    if (!response.ok) throw new Error('Source image bundle is unavailable');
    return response.json();
  }));
  const bundle = await bundles.get(paper);
  const asset = bundle.assets[name];
  if (!asset || !asset.base64) throw new Error('Source image is unavailable');
  const bytes = Uint8Array.from(atob(asset.base64), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], {type: 'image/webp'}));
  urls.set(path, url);
  return url;
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
