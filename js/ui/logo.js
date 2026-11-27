// The PPP logo mark: three overlapping serif Ps (traced from the approved logo artwork).
// The shape uses currentColor, so it takes the ink colour in light and dark mode, and it is
// always decorative: pair it with a text label (the brand link carries its own aria-label).
import { raw } from '../core/dom.js';

import { PPP_PATH, PPP_VIEWBOX } from '../core/brand-mark.js';

export { PPP_PATH, PPP_VIEWBOX };

/** The triple-P mark as inline SVG, wrapped in a span with the given class. */
export const pppMark = (className = '') =>
  raw(`<span class="ppp-mark ${className}" aria-hidden="true"><svg viewBox="${PPP_VIEWBOX}" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${PPP_PATH}"/></svg></span>`);
