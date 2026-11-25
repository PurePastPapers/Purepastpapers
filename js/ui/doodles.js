// Small hand-drawn doodles (inline SVG). Lines use currentColor (the ink colour), paper uses the
// card surface, so they work in light and dark mode. Purely decorative: always aria-hidden.
import { raw } from '../core/dom.js';

const PAPER = 'style="fill:var(--surface)"';
const TAPE = 'style="fill:var(--tape)"';
const svg = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${body}</svg>`;

const ART = {
  papers: svg(64, 64, `<path d="M18 12l26-3 4 38-27 4z" fill="#f6e7c9"/><path d="M12 16l27-2 3 39-28 2z" ${PAPER}/><path d="M18 26l16-1M18.5 32l17-1M19 38l12-.6"/><path d="M33 46l3 3 6-8" stroke="#5f9e6e"/>`),
  practice: svg(64, 64, `<circle cx="31" cy="36" r="19" ${PAPER}/><path d="M31 21a15 15 0 0 1 15 15H31z" fill="#f3a37f" stroke="none" opacity=".6"/><path d="M27 12h9M31.5 12v5M47 20l3-3"/><path d="M31 36l-1-11M31 36l8 5"/>`),
  flashcards: svg(64, 64, `<path d="M10 22l20-8 9 26-20 8z" fill="#9cc3e6"/><path d="M20 16l21-3 4 28-21 3z" fill="#c7b6ec"/><path d="M30 14h22v29H30z" fill="#f3a37f"/><circle cx="41" cy="28.5" r="5"/>`),
  hub: svg(64, 64, `<path d="M9 52h47"/><path d="M14 52V38h8v14" fill="#9cc3e6"/><path d="M27 52V28h8v24" fill="#8fcaa0"/><path d="M40 52V17h8v35" fill="#f1cf63"/><path d="M44 8l1.5 3 3.3.4-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.4z" fill="#f1cf63" stroke-width="1.6"/>`),
  subjects: svg(64, 64, `<path d="M10 52h46"/><path d="M13 52V18h9v34" fill="#9cc3e6"/><path d="M22 52V24h8v28" fill="#f3a37f"/><path d="M30 52V14h10v38" fill="#f1cf63"/><path d="M41 51l7-30 8 2-7 30" fill="#8fcaa0"/><path d="M15 24h5M32 20h6"/>`),
  flame: svg(46, 56, `<path d="M23 52c-11 0-17-8-15-18 2-8 9-11 8-21 7 4 10 10 9 16 3-2 4-5 4-8 6 6 8 13 7 18-1 8-6 13-13 13z" fill="#f3a37f"/><path d="M23 48c-5 0-7-4-6-8 1-3 4-5 4-9 4 3 7 7 7 11 0 4-2 6-5 6z" fill="#f1cf63"/>`),
  paperclip: svg(34, 78, `<path d="M12 50V12a6 6 0 0 1 12 0v46a10 10 0 0 1-20 0V18" stroke="#8a95a1" stroke-width="3"/>`),
  blankPaper: svg(70, 62, `<path d="M8 6h30l8 8v42H8z" ${PAPER}/><path d="M38 6v8h8"/><path d="M15 26h22M15 34h18M15 42h12" stroke-dasharray="3 4"/><g transform="rotate(35 52 34)"><path d="M46 14h12v34l-6 8-6-8z" fill="#f1cf63"/><path d="M46 48h12"/></g>`),
  desk: svg(520, 380, `
    <g transform="rotate(-8 150 200)"><rect x="60" y="70" width="200" height="260" rx="4" ${PAPER}/><path d="M85 110h120M85 135h150M85 160h130M85 185h150M85 210h90"/><path d="M85 250h60" stroke="#c0453a"/><circle cx="210" cy="270" r="22" stroke="#c0453a"/><path d="M200 270l7 7 13-14" stroke="#c0453a"/><rect x="120" y="58" width="80" height="20" stroke="none" ${TAPE}/></g>
    <g transform="rotate(6 330 190)"><rect x="250" y="90" width="190" height="250" rx="4" ${PAPER}/><path d="M270 120h150" stroke="#e5a9a9"/><path d="M272 150h140M272 175h120M272 200h145M272 225h100"/><path d="M274 296c6-14 10 4 14-4s6-10 10 0 6 2 10-4 7 8 11 2M330 300l4-12M342 300h10M366 300c2-10 8-10 10 0" /><rect x="305" y="78" width="80" height="20" stroke="none" ${TAPE}/></g>
    <g transform="rotate(-32 420 300)"><path d="M330 300h150l20 8-20 8H330z" fill="#f1cf63"/><rect x="312" y="300" width="18" height="16" fill="#f3a3b8"/><path d="M480 300v16"/></g>
    <g transform="translate(20 260) rotate(-14)"><rect x="0" y="0" width="56" height="74" rx="5" fill="#9cc3e6"/><rect x="18" y="-6" width="56" height="74" rx="5" fill="#c7b6ec" transform="rotate(12 46 30)"/><rect x="34" y="-8" width="56" height="74" rx="5" fill="#f3a37f" transform="rotate(24 62 30)"/></g>`),
};

/** A doodle by name, wrapped in a span with the given class. */
export const doodle = (name, className = '') => raw(`<span class="doodle ${className}" aria-hidden="true">${ART[name] || ''}</span>`);
