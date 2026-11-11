// DOM helpers. Views build markup with the `html` tagged template, which escapes every
// interpolated value unless it is already-safe markup (another html`` result or raw()).

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);

class SafeHtml {
  constructor(markup) {
    this.markup = markup;
  }

  toString() {
    return this.markup;
  }
}

/** Marks a string as trusted markup. Only use with content you built or sanitised yourself. */
export const raw = (markup) => new SafeHtml(String(markup ?? ''));

// null/undefined render as nothing; booleans render as "true"/"false" so they can be used
// directly in attributes (aria-pressed="${isOn}"). Use a ternary for conditional markup.
function render(value) {
  if (value == null) return '';
  if (value instanceof SafeHtml) return value.markup;
  if (Array.isArray(value)) return value.map(render).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

export function setHtml(element, content) {
  element.innerHTML = render(content);
  return element;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Delegated event listener. Returns a function that removes it. */
export function on(root, type, selector, handler, options) {
  const listener = (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, listener, options);
  return () => root.removeEventListener(type, listener, options);
}

// ── sanitising question / mark-scheme HTML ──
// Content comes from data files and content packs. It is treated as untrusted markup:
// only formatting tags survive, and no scripts, event handlers or javascript: URLs.

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'SUB', 'SUP', 'SPAN', 'DIV', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY',
  'TR', 'TH', 'TD', 'CAPTION', 'IMG', 'CODE', 'PRE', 'H3', 'H4', 'H5', 'BLOCKQUOTE', 'HR', 'SMALL', 'FIGURE', 'FIGCAPTION',
]);
const DROPPED_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TEMPLATE', 'SVG', 'MATH', 'FORM']);
const ALLOWED_ATTRIBUTES = {
  '*': ['class', 'title', 'lang'],
  IMG: ['src', 'alt', 'width', 'height'],
  TD: ['colspan', 'rowspan'],
  TH: ['colspan', 'rowspan', 'scope'],
};

export function isSafeUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/^(https?:|data:image\/(png|jpe?g|gif|webp);)/i.test(value)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('//'); // relative paths only
}

export function sanitizeHtml(dirty) {
  const template = document.createElement('template');
  template.innerHTML = String(dirty ?? '');
  const walk = (parent) => {
    for (const node of [...parent.childNodes]) {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName.toUpperCase();
      if (DROPPED_WITH_CONTENT.has(tag)) {
        node.remove();
        continue;
      }
      walk(node);
      if (!ALLOWED_TAGS.has(tag)) {
        node.replaceWith(...node.childNodes); // keep the text, drop the tag
        continue;
      }
      for (const attribute of [...node.attributes]) {
        const allowed = ALLOWED_ATTRIBUTES['*'].includes(attribute.name) || (ALLOWED_ATTRIBUTES[tag] || []).includes(attribute.name);
        if (!allowed || (attribute.name === 'src' && !isSafeUrl(attribute.value))) node.removeAttribute(attribute.name);
      }
    }
  };
  walk(template.content);
  return raw(template.innerHTML);
}

// ── files ──

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const readFileText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsText(file);
  });
