import { createQuestionPdf } from '../../js/engine/test-pdf-render.js';

self.onmessage = async ({ data }) => {
  try {
    const pdf = await createQuestionPdf({
      title: 'Worker image test',
      compact: true,
      groups: [{
        localNumber: '1',
        blocks: [
          { type: 'image', data: data.image, mimeType: 'image/png', alt: 'Worker fixture' },
          { type: 'html', html: 'a<sup>3</sup>' },
        ],
      }],
    });
    const bytes = await pdf.arrayBuffer();
    self.postMessage(bytes, [bytes]);
  } catch (error) {
    self.postMessage({ error: error?.message || 'Worker PDF failed' });
  }
};
