// Tiny markup → HTML converter used by the seed files, so question text can be
// written compactly and still produce clean `question_html` / `mark_scheme_html`.
//
// Inline:  x^2  e^{2x}  H_{2}O  {{a|b}} (fraction)  **bold**  `code`
// Blocks (one per line):
//   (a) part text [3]        question part with its marks
//   text :: M1 A1            mark-scheme line with mark codes in the right column
//   - bullet                 list item
//   > quoted line            extract, source text or poem (consecutive lines join)
//   | a | b |                table row (first row is the header)
//   ~~~ ... ~~~              code block
// Real content can skip all of this and store hand-written HTML or image URLs.

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inline(source) {
  const codes = [];
  let s = escapeHtml(source).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(
    /\{\{((?:[^{}|]|\{[^{}]*\})*)\|((?:[^{}|]|\{[^{}]*\})*)\}\}/g,
    '<span class="frac"><span class="frac__n">$1</span><span class="frac__d">$2</span></span>',
  );
  s = s.replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>').replace(/\^([A-Za-z0-9])/g, '<sup>$1</sup>');
  s = s.replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

function splitTail(line) {
  let text = line;
  let codes = null;
  let marks = null;
  let m = text.match(/^(.*?)\s*::\s*(.+)$/);
  if (m) [, text, codes] = m;
  m = text.match(/^(.*?)\s*\[(\d+)\]$/);
  if (m) [, text, marks] = m;
  return { text, codes, marks };
}

function tail({ codes, marks }) {
  if (marks) return `<span class="q-marks">(${marks})</span>`;
  if (codes) return `<span class="ms-codes">${escapeHtml(codes)}</span>`;
  return '';
}

export function toHtml(source) {
  const lines = String(source ?? '').replace(/\r/g, '').trim().split('\n');
  const out = [];
  let list = null;
  let table = null;
  let quote = null;
  let code = null;

  const flush = () => {
    if (list) out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
    if (quote) out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
    quote = null;
    if (table) {
      const [head, ...rows] = table;
      const cells = (row, tag) => row.map((cell) => `<${tag}>${inline(cell)}</${tag}>`).join('');
      out.push(
        `<table class="q-table"><thead><tr>${cells(head, 'th')}</tr></thead>` +
          `<tbody>${rows.map((row) => `<tr>${cells(row, 'td')}</tr>`).join('')}</tbody></table>`,
      );
    }
    list = null;
    table = null;
  };

  for (const rawLine of lines) {
    if (rawLine.trim() === '~~~') {
      if (code) {
        out.push(`<pre class="q-code"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = null;
      } else {
        flush();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(rawLine);
      continue;
    }
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith('> ')) {
      if (list || table) flush();
      (quote ??= []).push(line.slice(2));
      continue;
    }
    if (line.startsWith('- ')) {
      if (table || quote) flush();
      (list ??= []).push(line.slice(2));
      continue;
    }
    if (line.startsWith('|') && line.endsWith('|')) {
      if (list || quote) flush();
      (table ??= []).push(line.slice(1, -1).split('|').map((cell) => cell.trim()));
      continue;
    }
    flush();
    const part = line.match(/^\(([a-z]|[ivx]{1,4})\)\s+(.*)$/);
    if (part) {
      const parsed = splitTail(part[2]);
      const sub = /^[ivx]+$/.test(part[1]) ? ' q-part--sub' : ''; // (i), (ii), (iii)… are sub-parts
      out.push(
        `<div class="q-part${sub}"><span class="q-part__label">(${part[1]})</span>` +
          `<div class="q-part__body">${inline(parsed.text)}</div>${tail(parsed)}</div>`,
      );
      continue;
    }
    const parsed = splitTail(line);
    out.push(
      parsed.codes || parsed.marks
        ? `<div class="q-line"><div class="q-line__text">${inline(parsed.text)}</div>${tail(parsed)}</div>`
        : `<p>${inline(parsed.text)}</p>`,
    );
  }
  flush();
  return out.join('\n');
}
