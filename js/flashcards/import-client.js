export function parseImport(input, { onProgress, signal } = {}) {
  // Small text exports can finish before starting a worker and transferring a message.
  const smallText = input.source === 'csv' ? input.file.size <= 16_384
    : input.source === 'quizlet' && input.text.length <= 16_384;
  if (typeof Worker === 'undefined' || smallText) {
    return import('./import.js').then(async ({ parseAnkiPackage, parseCsv, parseQuizlet }) => {
      signal?.throwIfAborted();
      if (input.source === 'anki') return parseAnkiPackage(input.file, { onProgress });
      if (input.source === 'csv') return parseCsv(await input.file.text(), input.options);
      return parseQuizlet(input.text, input.options);
    });
  }

  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const worker = new Worker(new URL('./import-worker.js', import.meta.url), { type: 'module' });
    function finish(callback, value) {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      callback(value);
    }
    function abort() { finish(reject, signal.reason); }
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.progress) onProgress?.(data.progress);
      else if (data.error) finish(reject, new Error(data.error));
      else finish(resolve, data.parsed);
    };
    worker.onerror = () => finish(reject, new Error('The import reader could not start. Reload and try again.'));
    worker.onmessageerror = () => finish(reject, new Error('The import preview could not be read. Try again.'));
    try { worker.postMessage(input); } catch (error) { finish(reject, error); }
  });
}
