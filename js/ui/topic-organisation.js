import {html} from '../core/dom.js';

export function topicOrganisationControl(value, {available = false, name = 'topic-organisation'} = {}) {
  if (!available) return '';
  return html`<fieldset class="field"><legend class="field__label">Topic numbering</legend>
    <div class="topic-choices">${[['textbook', 'Textbook chapters'], ['official', 'Official specification']].map(([id, label]) => html`
      <label class="check checkpoint"><input type="radio" name="${name}" data-topic-organisation="${id}" value="${id}" ${value === id ? 'checked' : ''} /><span>${label}</span></label>`)}</div>
  </fieldset>`;
}
