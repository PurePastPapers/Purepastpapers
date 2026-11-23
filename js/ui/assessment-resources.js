import { html, isSafeUrl } from '../core/dom.js';

export function assessmentResourceLinks(paper, { review = false, className = 'btn' } = {}) {
  return (paper?.assessment_resources || [])
    .filter(resource => (resource.kind === 'transcript') === review && isSafeUrl(resource.url))
    .map(({ label, url }) => html`<a class="${className}" href="${url}" target="_blank" rel="noopener">${label}</a>`);
}

export function installAssessmentAudioBounds(root = document) {
  let active;
  const removed = new MutationObserver(() => {
    if (!active?.isConnected) {
      active?.pause();
      active = null;
      removed.disconnect();
    }
  });
  root.addEventListener('play', ({ target }) => {
    if (!target.matches?.('audio[data-assessment-audio]')) return;
    if (active && active !== target) active.pause();
    active = target;
    removed.observe(root, { childList: true, subtree: true });
  }, true);
  root.addEventListener('pause', ({ target }) => {
    if (active !== target || !target.paused) return;
    active = null;
    removed.disconnect();
  }, true);

  function enforce(event) {
    const audio = event.target;
    if (!audio.matches?.('audio[data-clip-start]') || audio.readyState < 1) return;
    const start = Number(audio.dataset.clipStart);
    const end = audio.dataset.clipEnd === '' ? Infinity : Number(audio.dataset.clipEnd);
    if (audio.currentTime + 0.05 < start) audio.currentTime = start;
    if (audio.currentTime < end) return;
    if (event.type !== 'play') audio.pause();
    audio.currentTime = start;
  }
  for (const event of ['play', 'seeking', 'timeupdate']) root.addEventListener(event, enforce, true);
}
