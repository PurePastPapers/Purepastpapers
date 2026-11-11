// Marking providers. Phase 1 uses self-marking: the student compares their answer with
// the mark scheme and enters the marks. Phase 4 adds an AI provider behind the same
// interface, so the session view never needs to know which one produced a mark.
//
// Provider interface:
//   id, label
//   async mark({ question, answerText, marksAwarded }) → { marks_awarded, max_marks, feedback, marked_by }

import { isEnabled } from '../config/phases.js';
import { clamp } from '../core/utils.js';

export const selfMarkProvider = {
  id: 'self',
  label: 'Self-marking',
  async mark({ question, marksAwarded }) {
    return {
      marks_awarded: clamp(Math.round(Number(marksAwarded) || 0), 0, question.marks),
      max_marks: question.marks,
      feedback: null,
      marked_by: 'self',
    };
  },
};

/**
 * PHASE 4 PLACEHOLDER. Implement `mark` to send `answerText` and the question's mark scheme
 * to the marking service and return awarded marks plus feedback (method/accuracy marks for
 * STEM, level-of-response and AO marks for essays). Then enable `aiMarking` in phases.js.
 */
export const aiMarkProvider = {
  id: 'ai',
  label: 'AI marking',
  async mark() {
    throw new Error('AI marking arrives in Phase 4.');
  },
};

export const getMarkingProvider = () => (isEnabled('aiMarking') ? aiMarkProvider : selfMarkProvider);
