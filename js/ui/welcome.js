// Optional quick tour opened from the landing page’s “How it works” section.

import { links } from '../core/links.js';
import { icon } from './icons.js';

const TILES = [
  {
    ic: 'sliders',
    title: 'Practice',
    text: 'Find single questions on the topics you’ve learned. Filter by topic, difficulty and year, answer, then mark yourself with the mark scheme.',
    where: 'Practice → Individual questions',
  },
  {
    ic: 'stopwatch',
    title: 'Test builder',
    text: 'Choose how long you have, the difficulty and your topics. We build a timed mini-paper from real exam questions.',
    where: 'Practice → Build a test',
  },
  {
    ic: 'user',
    title: 'Free account',
    text: 'Optional: you can browse and practise without one. It saves your subjects, topics and marks. Three quick steps: your details, the code we email you, then pick your subjects.',
    where: 'Sign up, top right',
  },
];

let open = null;

/** Opens the popup. `navigate` is the router's navigate, used by "Create a free account". */
export function openWelcome({ navigate } = {}) {
  if (open) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'modal welcome';
  dialog.setAttribute('aria-labelledby', 'welcome-title');
  dialog.innerHTML = `<i class="tape welcome__tape" aria-hidden="true"></i><div class="modal__box">
    <header class="modal__head"><div><h2 class="modal__title" id="welcome-title">Welcome to PurePastPapers</h2>
      <p class="hand welcome__sub">three things to know before you start</p></div>
      <button type="button" class="btn btn--sm" data-welcome-close>Close</button></header>
    <div class="modal__body"><ol class="welcome__grid">${TILES.map(
      (tile, index) => `<li class="card ruled welcome__tile tilt-${[3, 2, 4][index]}">
        <span class="welcome__num" aria-hidden="true">${index + 1}</span><i class="tape tape--c" aria-hidden="true"></i>
        <span class="welcome__ic" aria-hidden="true">${icon(tile.ic, { size: 22 })}</span>
        <h3>${tile.title}</h3><p>${tile.text}</p>
        <p class="welcome__where">Find it: <span>${tile.where}</span></p></li>`,
    ).join('')}</ol></div>
    <footer class="modal__foot"><p class="welcome__note">Reopen this tour from <b>How it works</b>.</p>
      <span class="welcome__btns"><button type="button" class="btn btn--ghost" data-welcome-close>Just browse</button>
      <button type="button" class="btn btn--primary" data-welcome-signup>Create a free account</button></span></footer></div>`;

  const close = () => dialog.close();
  dialog.addEventListener('close', () => {
    dialog.remove();
    open = null;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close(); // backdrop
    if (event.target.closest('[data-welcome-close]')) close();
    if (event.target.closest('[data-welcome-signup]')) {
      close();
      if (navigate) navigate('/signup');
      else location.hash = links.signup();
    }
  });
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector('[data-welcome-signup]')?.focus();
  open = dialog;
}

/** Closes the popup if it is open (for example once the visitor signs in). */
export function closeWelcome() {
  open?.close();
}
