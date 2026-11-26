// Markup for the Flashcards home (subject tabs), the PurePastPapers sets screen and a
// PurePastPapers set page. flashcards.js owns the state and passes a plain model in.
// PurePastPapers sets are printed tiles with a P stamp; the student's own sets are
// handwritten, taped index cards, so the two never look alike.
import { html, raw } from '../../core/dom.js';
import { icon } from '../icons.js';
import { links } from '../../core/links.js';
import { patternMark } from '../patterns.js';
import { fmtDayMonth, fmtRelative } from '../../core/utils.js';

const n = (value) => Number(value || 0).toLocaleString('en-GB');
const plural = (count, word, many = `${word}s`) => `${n(count)} ${count === 1 ? word : many}`;
const TILTS = [1, 3, 2, 4];
const stamp = html`<span class="fc-stamp" aria-hidden="true">P</span>`;
const pattern = (subject) => patternMark(subject, 'fc-pat');

/** A small fan of patterned cards in the subjects' colours. */
function fan(subjects, size = '') {
  const pool = subjects.length ? subjects : [{ colour: '#f1cf63', id: 'biol' }, { colour: '#f2a37e', id: 'phys' }, { colour: '#9cc2e6', id: 'math' }];
  const cards = [0, 1, 2].map((index) => pool[index % pool.length]);
  return html`<span class="fc-fan ${size}" aria-hidden="true">${cards.map((subject) => html`<i style="--sc:${subject.colour}">${patternMark(subject, 'fc-pat')}</i>`)}</span>`;
}

function counts(deck) {
  return html`<div class="fc-counts" aria-label="Study counts">
    <span><b>${n(deck.due_count)}</b> due</span><span><b>${n(deck.new_count)}</b> new</span><span><b>${n(deck.learning_count)}</b> learning</span>
  </div>`;
}

function inPlayLine(info) {
  if (!info) return html`<p class="small muted fc-inplay">Working out your cards…</p>`;
  const share = info.total ? Math.round((100 * info.inPlay) / info.total) : 0;
  const label = info.choice.mode === 'all' ? 'every card in the set'
    : info.choice.mode === 'choose' ? 'from the spec points you chose' : 'from what you’ve learnt';
  return html`<div class="fc-inplay"><span class="fc-meter" aria-hidden="true"><i style="width:${share}%"></i></span>
    <p class="small"><b>${n(info.inPlay)}</b> of ${n(info.total)} cards ${label}</p></div>`;
}

/** Cards studied in a set: known (graduated to review) and still learning. */
function progressParts(deck) {
  const total = Number(deck.card_count) || 0;
  const studied = Math.min(total, Number(deck.studied_count) || 0);
  const known = Math.min(studied, Number(deck.known_count) || 0);
  const share = (value) => (total ? (100 * value) / total : 0);
  return { total, studied, known, learning: studied - known, left: total - studied, share };
}

function progressBar(parts) {
  return html`<span class="fc-prog__bar" role="img" aria-label="${n(parts.known)} known, ${n(parts.learning)} learning, ${n(parts.left)} to go">
    <i class="is-known" style="width:${parts.share(parts.known).toFixed(2)}%"></i><i class="is-learning" style="width:${parts.share(parts.learning).toFixed(2)}%"></i></span>`;
}

const progressKey = (parts) => html`<p class="fc-prog__key"><span><i class="is-known"></i>${n(parts.known)} known</span>
  <span><i class="is-learning"></i>${n(parts.learning)} learning</span><span><i></i>${n(parts.left)} to go</span></p>`;

/** "412 of 966 cards done" with a known / learning / to go bar. */
export function progressLine(deck, { key = true } = {}) {
  const parts = progressParts(deck);
  return html`<div class="fc-prog"><p class="small"><b>${n(parts.studied)}</b> of ${plural(parts.total, 'card')} done · ${Math.round(parts.share(parts.studied))}%</p>
    ${progressBar(parts)}${key ? progressKey(parts) : ''}</div>`;
}

/** The set page's "Your progress on this set" panel. */
function progressPanel(model, deck, info) {
  const parts = progressParts(deck);
  const history = model.progressFor(deck);
  const weeks = history?.weeks || [];
  const most = Math.max(1, ...weeks.map((week) => Number(week.reviews) || 0));
  const reviews = Number(history?.reviews) || 0;
  const remembered = reviews ? Math.round((100 * (Number(history.remembered) || 0)) / reviews) : null;
  const topics = (info?.topics || []).map((topic) => {
    const sum = (key) => topic.points.reduce((total, point) => total + (point[key] || 0), 0);
    return { title: topic.title, cards: sum('cards'), studied: Math.min(sum('cards'), sum('studied')), known: Math.min(sum('studied'), sum('known')) };
  }).filter((topic) => topic.cards);
  const row = (label, value) => html`<span class="muted">${label}</span><b>${value}</b>`;
  return html`<section class="card ruled fc-progress tilt-2" aria-labelledby="fc-progress-title"><i class="tape tape--l" aria-hidden="true"></i>
    <div class="card__head"><h2 class="card__title" id="fc-progress-title">Your progress on this set</h2>
      ${history?.added_at ? html`<span class="small muted">since you added it on ${fmtDayMonth(history.added_at)}</span>` : ''}</div>
    <div class="fc-progress__cols">
      <div><p class="fc-progress__big"><b>${n(parts.studied)}</b> <span class="muted">of ${plural(parts.total, 'card')} done</span></p>
        ${progressBar(parts)}${progressKey(parts)}
        <div class="fc-progress__rows">
          ${row('Reviews', history ? n(reviews) : '…')}
          ${row('Remembered', history ? (remembered == null ? '–' : html`${remembered}% <span class="small muted">rated Good or Easy</span>`) : '…')}
          ${row('Due now', n((deck.due_count || 0) + (deck.learning_count || 0)))}
          ${row('Last studied', history ? (history.last_review ? fmtRelative(history.last_review) : 'Not yet') : '…')}
        </div></div>
      <div><p class="small muted fc-progress__label">Reviews each week</p>
        ${weeks.length ? html`<div class="fc-spark" role="img" aria-label="${weeks.map((week) => `${fmtDayMonth(week.start)}: ${week.reviews}`).join(', ')}">
          ${weeks.map((week) => html`<i style="height:${((100 * (Number(week.reviews) || 0)) / most).toFixed(1)}%" title="Week of ${fmtDayMonth(week.start)}: ${plural(week.reviews, 'review')}"></i>`)}</div>
          <p class="fc-prog__key fc-spark__ends"><span>${fmtDayMonth(weeks[0].start)}</span><span>${fmtDayMonth(weeks[weeks.length - 1].start)}</span></p>`
          : html`<p class="small muted" role="status">${history?.failed ? 'Could not load your reviews.' : 'Loading…'}</p>`}</div>
      <div><p class="small muted fc-progress__label">Cards done by topic</p>
        ${topics.length ? html`<div class="fc-progress__topics">${topics.map((topic) => html`<span class="fc-progress__topic">${topic.title}</span>
          ${progressBar({ ...topic, learning: topic.studied - topic.known, left: topic.cards - topic.studied, share: (value) => (100 * value) / topic.cards })}
          <span class="small muted">${n(topic.studied)}/${n(topic.cards)}</span>`)}</div>`
          : html`<p class="small muted">${info ? 'This set’s cards are not tied to spec points.' : 'Loading…'}</p>`}</div>
    </div></section>`;
}

/** A PurePastPapers set the student has added. */
export function pppTile(model, deck, { index = 0, showSubject = false } = {}) {
  const subject = model.subjectFor(deck);
  const entry = model.entryFor(deck);
  const kind = entry?.deck_type || 'Set';
  const title = showSubject ? subject?.name || entry?.subject || deck.title : kind;
  return html`<article class="card fc-ppp tilt-${TILTS[index % 4]}" style="--sc:${subject?.colour || 'var(--line-strong)'}">
    <header class="fc-ppp__band">${pattern(subject)}<h3>${title}</h3>${stamp}</header>
    <div class="fc-ppp__body">
      ${showSubject ? html`<p class="fc-ppp__kind">${kind}</p>` : ''}
      <p class="small muted">PurePastPapers set${entry?.description ? ` · ${entry.description.replace(/\.$/, '').toLowerCase()}` : ''}</p>
      ${progressLine(deck)}
      ${counts(deck)}
      <footer class="fc-actions"><button class="btn btn--primary btn--sm" data-action="study" data-id="${deck.id}">${icon('play', { size: 14 })} Study</button>
        <button class="btn btn--sm" data-action="open-deck" data-id="${deck.id}">Choose cards</button>
        <button class="fc-more" data-action="set-menu" data-id="${deck.id}" aria-label="More options for ${deck.title}">⋯</button></footer>
    </div>
  </article>`;
}

/** One of the student's own sets. */
export function ownTile(model, deck, { index = 0, showSubject = false } = {}) {
  const subject = model.subjectFor(deck);
  const parent = deck.parent_id ? model.decks.find((item) => item.id === deck.parent_id) : null;
  return html`<article class="card ruled fc-own tilt-${TILTS[(index + 1) % 4]}"><i class="tape tape--c" aria-hidden="true"></i>
    <h3 class="fc-own__title">${deck.title}</h3>
    <p class="fc-own__by">made by you${showSubject && subject ? ` · ${subject.name}` : ''}${parent ? ` · inside ${parent.title}` : ''} · ${plural(deck.card_count || 0, 'card')}</p>
    ${progressLine(deck)}
    ${counts(deck)}
    <footer class="fc-actions"><button class="btn btn--primary btn--sm" data-action="study" data-id="${deck.id}">${icon('play', { size: 14 })} Study</button>
      <button class="btn btn--sm" data-action="open-deck" data-id="${deck.id}">Edit cards</button></footer>
  </article>`;
}

const addPppTile = (index, note, subjects) => html`<button type="button" class="fc-add fc-add--ppp tilt-${TILTS[index % 4]}" data-action="catalogue">
  ${fan(subjects, 'fc-fan--add')}<span class="fc-add__title">Add a PurePastPapers set</span><span class="small muted">${note}</span></button>`;

const makeOwnTile = (index, note, cloud) => html`<button type="button" class="card ruled fc-add fc-add--own tilt-${TILTS[index % 4]}" data-action="create-deck" ${cloud ? '' : raw('disabled')}>
  <span class="fc-add__plus" aria-hidden="true">+</span><span class="fc-own__title">Make your own set</span><span class="fc-own__by">${note}</span></button>`;

function learntSide(model, subject) {
  const topics = model.topicSummary(subject.id);
  return html`<aside class="card ruled fc-side tilt-2"><i class="tape tape--c" aria-hidden="true"></i>
    <h2 class="h3">What you’ve learnt</h2>
    <p class="fc-side__big">${n(topics.filter((topic) => topic.state === 'all').length)}<span class="small muted"> of ${n(topics.length)} topics ticked</span></p>
    <p class="small muted">Sets marked “Only what I’ve learnt” follow these. Tick more as you cover them in class.</p>
    <ul class="fc-side__list">${topics.map((topic) => html`<li class="${topic.state === 'none' ? 'is-off' : ''}"><span aria-hidden="true">${topic.state === 'all' ? '✓' : topic.state === 'part' ? '–' : '○'}</span>${topic.title}</li>`)}</ul>
    <a class="btn btn--sm" href="${links.subject(subject.id)}">Tick more topics</a>
  </aside>`;
}

function todaySide(model, decks) {
  const rows = decks.map((deck) => ({ deck, due: (deck.due_count || 0) + (deck.learning_count || 0), fresh: deck.new_count || 0 }))
    .filter((row) => row.due || row.fresh);
  const total = rows.reduce((sum, row) => sum + row.due, 0);
  return html`<aside class="card ruled fc-side tilt-2"><i class="tape tape--c" aria-hidden="true"></i>
    <h2 class="h3">Today</h2>
    <p class="fc-side__big">${n(total)}<span class="small muted"> cards due</span></p>
    ${rows.length ? html`<ul class="fc-side__list fc-side__list--due">${rows.map(({ deck, due, fresh }) => {
      const subject = model.subjectFor(deck);
      const label = deck.catalogue_id ? `${subject?.name || ''} ${model.entryFor(deck)?.deck_type || ''}`.trim() : deck.title;
      return html`<li><span class="fc-dot" style="--sc:${subject?.colour || 'var(--line-strong)'}" aria-hidden="true"></span>
        <button class="linkbtn" data-action="study" data-id="${deck.id}">${label}</button><span class="small muted">${due} due · ${fresh} new</span></li>`;
    })}</ul>` : html`<p class="small muted">Nothing due. Add a set or study new cards.</p>`}
  </aside>`;
}

/** Flashcards home: All and one tab per subject. */
export function homePage(model) {
  const { tab, subjects, decks } = model;
  const subject = subjects.find((item) => item.id === tab) || null;
  const inTab = (deck) => !subject || model.subjectFor(deck)?.id === subject.id;
  const ppp = decks.filter((deck) => deck.catalogue_id && inTab(deck));
  const own = decks.filter((deck) => !deck.catalogue_id && (subject ? model.subjectFor(deck)?.id === subject.id : true));
  const tabs = [{ id: 'all', name: 'All' }, ...subjects];
  return html`<header class="fc-head"><div><h1>Flashcards</h1><p class="hand">${subject ? 'cards for the spec points you’ve learnt' : 'all your sets in one place'}</p></div>
      <div class="fc-actions"><button class="btn" data-action="import" ${model.cloud ? '' : raw('disabled')}>${icon('upload', { size: 16 })} Import</button>
      <button class="btn btn--primary" data-action="create-deck" ${model.cloud ? '' : raw('disabled')}>${icon('plus', { size: 16 })} Make a set</button></div></header>
    ${model.cloud ? '' : html`<p class="banner banner--warn">Sign in to make, import and sync your own sets.</p>`}
    <nav class="fc-tabs" aria-label="Subjects">${tabs.map((item) => html`<button type="button" class="fc-tab ${model.hasSets(item.id) ? '' : 'is-empty'}" data-action="home-tab" data-id="${item.id}"
      aria-current="${item.id === (subject?.id || 'all') ? 'page' : 'false'}" style="--sc:${item.colour || 'var(--surface)'}">${item.name}</button>`)}</nav>
    <section class="fc-panel" style="--sc:${subject?.colour || 'var(--plane)'}">
      <div class="fc-panel__main">
        <section class="fc-block" aria-labelledby="fc-ppp-title">
          <div class="fc-sec">${fan(subject ? [subject] : subjects, 'fc-fan--sm')}<div><h2 id="fc-ppp-title">PurePastPapers sets${subject ? ` for ${subject.name}` : ''}</h2>
            <p class="small muted">Made by us from the ${subject ? `${subject.board} ${subject.code} ` : ''}specification. You only get cards from the spec points you’ve learnt.</p></div></div>
          <div class="fc-grid">${ppp.map((deck, index) => pppTile(model, deck, { index, showSubject: !subject }))}${addPppTile(ppp.length, subject ? `Sets made for ${subject.name}` : 'Sets for your subjects', subject ? [subject] : subjects)}</div>
        </section>
        <section class="fc-block" aria-labelledby="fc-own-title">
          <div class="fc-sec"><span class="fc-pen" aria-hidden="true">${icon('pencil', { size: 18 })}</span><div><h2 class="fc-own-heading" id="fc-own-title">Your own sets${subject ? ` for ${subject.name}` : ''}</h2>
            <p class="small muted">Cards you write or import from Anki or Quizlet.</p></div></div>
          <div class="fc-grid">${own.map((deck, index) => ownTile(model, deck, { index, showSubject: !subject }))}${makeOwnTile(own.length + 1, subject ? `Linked to ${subject.name}` : 'Write cards or import them', model.cloud)}</div>
        </section>
      </div>
      ${subject ? learntSide(model, subject) : todaySide(model, decks)}
    </section>
    <footer class="flashcards__guide-link"><button class="linkbtn" data-action="flashcards-guide">${icon('book')} How to use Flashcards</button></footer>`;
}

/** The PurePastPapers sets for the student's subjects. */
export function catalogueScreen(model) {
  const { subjects, catalogue } = model;
  const owned = new Map(model.decks.filter((deck) => deck.catalogue_id).map((deck) => [deck.catalogue_id, deck]));
  const groups = subjects.map((subject) => ({ subject, entries: catalogue.entries.filter((entry) => entry.subject_id === subject.id) }));
  const withSets = groups.filter((group) => group.entries.length);
  const without = groups.filter((group) => !group.entries.length).map((group) => group.subject.name);
  let index = 0;
  const tile = (entry, subject) => {
    const deck = owned.get(entry.id);
    const external = model.safeUrl(entry.sourceUrl);
    const canAdd = entry.entitled ?? catalogue.schoolEligible;
    const soon = !external && !entry.available;
    const action = external ? html`<a class="btn btn--sm" href="${external}" target="_blank" rel="noopener noreferrer">${icon('external', { size: 14 })} Get it from AnkiWeb</a>`
      : deck ? html`<span class="tag">In my sets ✓</span><button class="btn btn--sm" data-action="open-deck" data-id="${deck.id}">Open</button>`
      : soon ? html`<span class="tag">Coming soon</span>`
      : html`<button class="btn btn--primary btn--sm" data-action="add-catalogue" data-id="${entry.id}" ${!canAdd || model.adding ? raw('disabled') : ''}>${model.adding === entry.id ? 'Adding…' : canAdd ? '+ Add to my sets' : 'Access required'}</button>`;
    return html`<article class="card fc-ppp tilt-${TILTS[index++ % 4]} ${deck ? '' : 'fc-ppp--new'} ${soon ? 'fc-ppp--soon' : ''}" style="--sc:${subject.colour}">
      <header class="fc-ppp__band">${pattern(subject)}<h3>${entry.deck_type || entry.title}</h3>${stamp}</header>
      <div class="fc-ppp__body"><p class="small muted">${[entry.description?.replace(/\.$/, ''), entry.card_count ? plural(entry.card_count, 'card') : '', entry.qualification].filter(Boolean).join(' · ')}</p>
        ${deck ? inPlayLine(model.inPlayFor(deck)) : ''}
        <footer class="fc-actions">${action}</footer></div></article>`;
  };
  return html`<button class="linkbtn" data-action="back-decks">← Flashcards</button>
    <header class="fc-head"><div><h1>PurePastPapers sets</h1><p class="hand">made by us for your ${plural(subjects.length, 'subject')}</p></div>${fan(subjects, 'fc-fan--lg')}</header>
    ${!subjects.length ? html`<section class="card ruled fc-note tilt-2"><i class="tape tape--l" aria-hidden="true"></i><h2 class="h3">Add your subjects first</h2>
        <p class="small muted">Sets appear here for the subjects you study.</p><a class="btn btn--primary btn--sm" href="${links.subjects({ add: 1 })}">Add a subject</a></section>` : ''}
    ${withSets.map(({ subject, entries }) => html`<section class="fc-block">
      <div class="fc-subhead" style="--sc:${subject.colour}"><span class="fc-dot" aria-hidden="true"></span><h2>${subject.name}</h2><span class="small muted">${subject.board} ${subject.code} · ${plural(entries.length, 'set')}</span></div>
      <div class="fc-grid">${entries.map((entry) => tile(entry, subject))}</div></section>`)}
    ${without.length ? html`<section class="card ruled fc-note tilt-2"><i class="tape tape--l" aria-hidden="true"></i>
      <h2 class="h3">No sets yet for ${without.join(' or ')}</h2><p class="small muted">We’re adding more. In the meantime you can make your own set.</p>
      <button class="btn btn--sm" data-action="create-deck" ${model.cloud ? '' : raw('disabled')}>+ Make your own set</button></section>` : ''}
    ${subjects.length ? html`<p class="small muted">Only sets for your subjects are shown. Studying something else? Add it in <a href="${links.subjects()}">My subjects</a>.</p>` : ''}`;
}

/** A PurePastPapers set: which cards, spec points and a few cards. */
export function setPage(model, deck) {
  const subject = model.subjectFor(deck);
  const entry = model.entryFor(deck);
  const info = model.inPlayFor(deck);
  const choice = info?.choice || model.choiceFor(deck);
  const option = (mode, title, note, count) => html`<label class="fc-opt ${choice.mode === mode ? 'is-on' : ''}">
    <input type="radio" name="fc-which" value="${mode}" data-choice-mode ${choice.mode === mode ? raw('checked') : ''}>
    <span><b>${title}</b><span class="small muted">${note}</span></span><span class="fc-opt__n">${count == null ? '' : n(count)}</span></label>`;
  return html`<button class="linkbtn" data-action="back-decks">← Flashcards${subject ? ` · ${subject.name}` : ''}</button>
    <header class="card fc-sethead" style="--sc:${subject?.colour || 'var(--line-strong)'}">
      <div class="fc-sethead__band">${pattern(subject)}${stamp}<span>PurePastPapers · ${subject ? `${subject.name} · ${subject.board} ${subject.code}` : entry?.qualification || ''}</span>
        <button class="fc-more" data-action="set-menu" data-id="${deck.id}" aria-label="More options for ${deck.title}">⋯</button></div>
      <div class="fc-sethead__body">
        <div><h2 class="fc-sethead__title" tabindex="-1">${entry?.deck_type || deck.title}</h2>
          <p class="small muted">${entry?.description || ''} ${plural(deck.card_count || 0, 'card')} in the set.</p>
          <div class="fc-sethead__prog">${progressLine(deck, { key: false })}</div>
          <div class="fc-stats"><span><b>${n(deck.due_count)}</b>due</span><span><b>${n(deck.new_count)}</b>new</span><span><b>${n(deck.learning_count)}</b>learning</span><span><b data-in-play>${info ? n(info.inPlay) : '…'}</b>cards in play</span></div></div>
        <div class="fc-sethead__go"><button class="btn btn--primary fc-big" data-action="study" data-id="${deck.id}">${icon('play', { size: 16 })} Study now</button>
          <p class="small muted" data-apply-status role="status">${model.applyStatus || ''}</p></div>
      </div>
    </header>
    ${progressPanel(model, deck, info)}
    <div class="fc-setcols">
      <div class="fc-panel__main">
        <section class="card ruled fc-which" aria-labelledby="fc-which-title"><h2 class="h3" id="fc-which-title">Which cards do you want?</h2>
          <div class="fc-opts" role="radiogroup" aria-labelledby="fc-which-title">
            ${option('learnt', 'Only what I’ve learnt', 'Spec points you’ve ticked in My subjects. Updates when you tick more.', info?.counts.learnt)}
            ${option('all', 'Everything', 'Every card in the set', info?.counts.all)}
            ${option('choose', 'Choose spec points', 'Pick spec points for this set only', choice.mode === 'choose' ? info?.counts.choose : null)}
          </div>
          ${choice.mode !== 'all' && info?.general ? html`<label class="fc-check"><input type="checkbox" data-choice-general ${choice.general !== false ? raw('checked') : ''}>
            <span>Also include exam skills cards <span class="small muted">(command words, notation and practical skills: ${plural(info.general, 'card')} not tied to a spec point)</span></span></label>` : ''}
        </section>
        <section class="fc-block" aria-labelledby="fc-points-title">
          <div class="section-title"><h2 id="fc-points-title">${choice.mode === 'choose' ? 'Choose spec points' : 'Spec points'}</h2>
            ${choice.mode === 'learnt' && subject ? html`<a class="hand" href="${links.subject(subject.id)}">tick spec points in My subjects →</a>` : ''}</div>
          ${info ? pointList(model, info, choice) : html`<p class="small muted" role="status">Loading spec points…</p>`}
        </section>
      </div>
      <aside class="fc-block fc-samples" aria-labelledby="fc-cards-title">
        <div class="section-title"><h2 id="fc-cards-title">Cards</h2><button class="linkbtn small" data-action="browse-cards" data-id="${deck.id}">Browse all →</button></div>
        <div data-set-samples>${model.samples(deck)}</div>
        <p class="small muted">PurePastPapers sets can’t be edited.</p>
      </aside>
    </div>`;
}

function pointList(model, info, choice) {
  const choose = choice.mode === 'choose';
  return html`<div class="card fc-points">${info.topics.map((topic) => {
    const on = topic.points.filter((point) => point.on);
    const state = on.length === topic.points.length ? 'all' : on.length ? 'part' : 'none';
    const open = model.openTopics.has(topic.id) || (!model.openTopics.size && state === 'part');
    const cards = on.reduce((sum, point) => sum + point.cards, 0);
    const total = topic.points.reduce((sum, point) => sum + point.cards, 0);
    const lead = choose
      ? html`<input type="checkbox" data-choice-topic="${topic.id}" aria-label="${topic.title}" ${state === 'all' ? raw('checked') : ''} ${state === 'part' ? raw('data-part') : ''}>`
      : html`<span class="fc-tick" data-state="${state}" aria-hidden="true">${state === 'all' ? '✓' : state === 'part' ? '–' : ''}</span>`;
    return html`<details class="fc-topic" data-topic-id="${topic.id}" ${open ? raw('open') : ''}>
      <summary><span class="fc-topic__caret" aria-hidden="true">${icon('chevronRight', { size: 14 })}</span>${lead}<span class="fc-topic__t">${topic.title}</span>
        <span class="small muted">${on.length} of ${plural(topic.points.length, 'point')} · ${n(cards)} of ${plural(total, 'card')}</span></summary>
      <div class="fc-topic__pts">${topic.points.map((point) => html`<label class="fc-pt ${point.on ? '' : 'is-off'}">
        ${choose ? html`<input type="checkbox" data-choice-point="${point.id}" ${point.on ? raw('checked') : ''}>` : html`<span class="fc-tick" data-state="${point.on ? 'all' : 'none'}" aria-hidden="true">${point.on ? '✓' : ''}</span>`}
        <span class="fc-pt__code">${point.code}</span><span class="fc-pt__t">${point.title}</span><span class="small muted">${plural(point.cards, 'card')}</span></label>`)}</div>
    </details>`;
  })}</div>`;
}
