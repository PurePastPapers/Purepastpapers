import { html } from '../core/dom.js';
import * as api from '../data/api.js';

export function inkPreview(attemptId, partId) {
  return attemptId ? html`<details class="fold" data-ink-preview="${attemptId}" data-ink-part="${partId}">
    <summary>Handwritten answer</summary><div data-ink-preview-body></div>
  </details>` : '';
}

export function bindInkPreviews(root) {
  for (const node of root.querySelectorAll('[data-ink-preview]')) {
    node.addEventListener('toggle', async () => {
      if (!node.open || !node.isConnected || node.dataset.loading || node.dataset.ready) return;
      const owner = api.currentUser()?.user_id;
      const body = node.querySelector('[data-ink-preview-body]');
      node.dataset.loading = 'true';
      body.textContent = 'Loading handwriting…';
      try {
        const [record, editor] = await Promise.all([
          api.loadInk(node.dataset.inkPreview, node.dataset.inkPart), import('./ink-editor.js'),
        ]);
        if (!node.isConnected || api.currentUser()?.user_id !== owner) return;
        if (record) {
          body.textContent = '';
          await editor.renderInkPreview(body, record);
          node.dataset.ready = 'true';
        } else body.textContent = 'Handwriting is unavailable on this device.';
      } catch {
        body.textContent = 'Handwriting could not be loaded. Reopen this section to try again.';
      } finally {
        delete node.dataset.loading;
      }
    });
  }
}
