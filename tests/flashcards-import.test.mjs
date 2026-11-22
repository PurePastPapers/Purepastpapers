import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseAnkiPackage, parseCsv, parseQuizlet, sanitizeImportedHtml } from '../js/flashcards/import.js';

const makeFile = async path => new Blob([await readFile(new URL(path, import.meta.url))]);

test('CSV parses quoted commas, escaped quotes, and multiline fields with mapped columns', () => {
  const result = parseCsv('Prompt,Response,Tags\n"Which, cell?","A ""membrane"" controls movement.\nIt is selective.",biology cell', {
    front: 0, back: 1, tags: 2, header: true
  });
  assert.equal(result.notes.length, 1);
  assert.equal(result.notes[0].front, 'Which, cell?');
  assert.equal(result.notes[0].back, 'A "membrane" controls movement.\nIt is selective.');
  assert.deepEqual(result.notes[0].tags, ['biology', 'cell']);
  assert.deepEqual(result.errors, []);
});

test('CSV reports invalid rows and retains a first data row when header is false', () => {
  const result = parseCsv('first,answer\n,missing front\nsecond,answer', { front: 0, back: 1, header: false });
  assert.equal(result.notes.length, 2);
  assert.deepEqual(result.errors, [{ row: 2, reason: 'Front is empty.' }]);
});

test('Quizlet tab export creates cards and describes malformed rows', () => {
  const result = parseQuizlet('Term one\tDefinition one\nmalformed\nTerm two\tDefinition two');
  assert.equal(result.notes.length, 2);
  assert.deepEqual(result.errors, [{ row: 2, reason: 'Expected a term and definition separated by a tab.' }]);
});

test('imported HTML drops active content and only retains known private media markers', () => {
  const html = sanitizeImportedHtml('<p onclick="go()">Text</p><script>alert(1)</script><img src="photo.png"><img src="https://bad.test/x.png"><a href="javascript:alert(1)">x</a>', new Set(['photo.png']));
  assert.match(html, /<p>Text<\/p>/);
  assert.match(html, /data-flashcard-name="photo.png"/);
  assert.doesNotMatch(html, /script|onclick|bad\.test|javascript:/i);
});

test('Anki APKG reads notes, reverse and cloze cards, subdecks, suspension, and review-history disclosure', async () => {
  const result = await parseAnkiPackage(await makeFile('./fixtures/flashcards/anki-compatible.apkg'));
  assert.equal(result.notes.length, 2);
  const basic = result.notes.find(note => note.type === 'basic');
  assert.deepEqual(basic.cards.map(card => card.variant), ['forward', 'reverse']);
  assert.equal(basic.cards[1].suspended, true);
  assert.equal(basic.cards[1].deck, 'Default');
  assert.equal(basic.cards[0].deck, 'Biology::Cells');
  assert.equal(basic.front, 'What controls movement?');
  assert.equal(basic.cards[1].front, 'Cell membrane');
  const cloze = result.notes.find(note => note.type === 'cloze');
  assert.deepEqual(cloze.cards.map(card => card.variant), ['cloze:1', 'cloze:2']);
  assert.match(cloze.cards[0].front, /\[\.\.\.\]/);
  assert.equal(cloze.cards[1].back, 'Extra fact');
  assert.equal(result.scheduling, true);
  assert.ok(result.warnings.some(warning => warning.includes('fresh FSRS')));
});

test('official Anki 26.9 APKG fixtures import modern protobuf and legacy media layouts', async () => {
  for (const filename of ['anki-actual-modern.apkg', 'anki-actual-legacy.apkg']) {
    const result = await parseAnkiPackage(await makeFile(`./fixtures/flashcards/${filename}`));
    assert.equal(result.notes.length, 3);
    assert.equal(result.notes.reduce((count, note) => count + note.cards.length, 0), 5);
    assert.equal(result.scheduling, true);
    assert.equal(result.media.get('tiny.png')?.type, 'image/png');
    assert.equal(result.media.get('tone.mp3')?.type, 'audio/mpeg');
    const mediaNote = result.notes.find(note => note.front.includes('tiny.png'));
    assert.match(mediaNote.front, /data-flashcard-name="tiny\.png"/);
    assert.match(mediaNote.front, /data-flashcard-name="tone\.mp3"/);
    const suspended = result.notes.flatMap(note => note.cards).find(card => card.suspended);
    assert.ok(suspended);
    // Modern packages store the hierarchy with \x1f; both layouts must keep Parent::Child.
    assert.deepEqual(result.decks.map(deck => deck.name).sort(), ['Biology', 'Biology::Cells', 'Biology::Reproduction', 'Default']);
    assert.deepEqual([...new Set(result.notes.flatMap(note => note.cards.map(card => card.deck)))].sort(), ['Biology::Cells', 'Biology::Reproduction']);
    const reverse = result.notes.flatMap(note => note.cards).find(card => card.variant === 'reverse');
    assert.equal(reverse.front, 'Cell membrane');
    const cloze = result.notes.find(note => note.type === 'cloze');
    assert.deepEqual(cloze.cards.map(card => card.variant), ['cloze:1', 'cloze:2']);
    assert.equal(suspended.variant, 'forward');
  }
});

test('Quizlet import can use the definition as the front before committing', () => {
  const text = 'Mitochondrion\tReleases energy in respiration\nRibosome\tSite of protein synthesis';
  const termFirst = parseQuizlet(text);
  const swapped = parseQuizlet(text, { front: 'definition' });
  assert.equal(termFirst.front, 'term');
  assert.equal(swapped.front, 'definition');
  assert.deepEqual(swapped.notes.map(note => [note.front, note.back]), [
    ['Releases energy in respiration', 'Mitochondrion'],
    ['Site of protein synthesis', 'Ribosome'],
  ]);
  // Each orientation is a different card, so the swapped import is not a duplicate.
  assert.notEqual(swapped.notes[0].cards[0].sourceKey, termFirst.notes[0].cards[0].sourceKey);
  assert.throws(() => parseQuizlet(text, { front: 'back' }), /term or the definition/);
});

test('CSV with Windows line endings keeps one newline inside a quoted field', () => {
  const result = parseCsv('Front,Back\r\n"Q","Line one\r\nLine two"\r\n', { front: 0, back: 1, header: true });
  assert.equal(result.notes[0].back, 'Line one\nLine two');
  const unix = parseCsv('Front,Back\n"Q","Line one\nLine two"\n', { front: 0, back: 1, header: true });
  assert.equal(result.notes[0].key, unix.notes[0].key, 'line endings do not change duplicate detection');
});
