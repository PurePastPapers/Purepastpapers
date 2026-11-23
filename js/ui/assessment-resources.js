import { html, isSafeUrl } from '../core/dom.js';

export function assessmentResourceLinks(paper, { review = false, className = 'btn' } = {}) {
  return (paper?.assessment_resources || [])
    .filter(resource => (resource.kind === 'transcript') === review && isSafeUrl(resource.url))
    .map(({ label, url }) => html`<a class="${className}" href="${url}" target="_blank" rel="noopener">${label}</a>`);
}
