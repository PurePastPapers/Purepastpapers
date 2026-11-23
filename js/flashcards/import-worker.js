// Parsing and decompression stay off the UI thread, including SQLite/WASM work.
import { parseAnkiPackage, parseCsv, parseQuizlet } from './import.js';

self.onmessage = async ({ data: { source, file, text, options } }) => {
  let lastUpdate = 0;
  function onProgress(progress) {
    const now = performance.now();
    if (progress.stage !== 'reading' || progress.loaded === progress.total || now - lastUpdate >= 120) {
      lastUpdate = now;
      self.postMessage({ progress });
    }
  }

  try {
    const parsed = source === 'anki'
      ? await parseAnkiPackage(file, { onProgress })
      : source === 'csv'
        ? parseCsv(await file.text(), options)
        : parseQuizlet(text, options);
    self.postMessage({ parsed });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
