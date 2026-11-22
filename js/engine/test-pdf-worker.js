import { createCombinedPdf, createMarkSchemePdf, createQuestionPdf } from './test-pdf-render.js';

const generators = { question: createQuestionPdf, scheme: createMarkSchemePdf, combined: createCombinedPdf };

self.addEventListener('message', async ({ data }) => {
  try {
    const blob = await generators[data.kind](data.options, {
      onProgress: progress => self.postMessage({ progress }),
    });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: error.message || 'Could not render the PDF.' });
  }
});
