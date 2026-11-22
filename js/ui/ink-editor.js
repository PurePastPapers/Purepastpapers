const LOGICAL_WIDTH = 1000;
const ADDED_HEIGHT = 360;
const STARTING_HEIGHT = 900;
const MAX_WRITING_HEIGHT = ADDED_HEIGHT * 12;
const MAX_CANVAS_EDGE = 4096;
const MAX_POINTS_PER_STROKE = 5000;

function newSection() {
  return { id: crypto.randomUUID(), width: LOGICAL_WIDTH, height: STARTING_HEIGHT, strokes: [] };
}

const writingHeight = sections => sections.reduce((total, section) => total + section.height * LOGICAL_WIDTH / section.width, 0);

function normalizeInk(value, readOnly) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.sections)) {
    return { ...(value || {}), schemaVersion: 1, sections: [newSection()] };
  }
  const sections = value.sections.map((section) => ({
    id: typeof section.id === 'string' ? section.id : crypto.randomUUID(),
    width: Number.isFinite(section.width) && section.width > 0 ? section.width : LOGICAL_WIDTH,
    height: Number.isFinite(section.height) && section.height > 0 ? section.height : ADDED_HEIGHT,
    strokes: Array.isArray(section.strokes) ? section.strokes.map((stroke) => ({
      id: typeof stroke.id === 'string' ? stroke.id : crypto.randomUUID(),
      tool: stroke.tool === 'eraser' ? 'eraser' : 'pen',
      color: typeof stroke.color === 'string' ? stroke.color : '#172554',
      width: Number(stroke.width) || 3,
      points: Array.isArray(stroke.points) ? stroke.points.map((point) => ({
        x: Math.max(0, Math.min(Number(section.width) || LOGICAL_WIDTH, Number(point.x) || 0)),
        y: Math.max(0, Math.min(Number(section.height) || ADDED_HEIGHT, Number(point.y) || 0)),
        pressure: Math.max(0, Math.min(1, Number(point.pressure ?? 0.5))),
      })) : [],
    })) : [],
  }));
  const last = sections.at(-1);
  if (last && !readOnly) {
    last.height += Math.max(0, STARTING_HEIGHT - writingHeight(sections)) * last.width / LOGICAL_WIDTH;
  }
  return { ...value, schemaVersion: 1, sections: sections.length ? sections : [newSection()] };
}

function drawStroke(context, stroke, start = 0) {
  if (stroke.points.length <= start) return;
  context.save();
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (start === 0) {
    const point = stroke.points[0];
    const radius = stroke.width * (0.45 + point.pressure * 0.55) / 2;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  }
  for (let index = Math.max(1, start); index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const point = stroke.points[index];
    context.lineWidth = stroke.width * (0.45 + point.pressure * 0.55);
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
  }
  context.restore();
}

function drawSection(canvas, section) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  // Keep tall answers within Safari’s canvas size limits.
  const dpr = Math.min(3, window.devicePixelRatio || 1, MAX_CANVAS_EDGE / Math.max(rect.width, rect.height));
  const pixelWidth = Math.max(1, Math.floor(rect.width * dpr));
  const pixelHeight = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext('2d');
  context.setTransform(pixelWidth / section.width, 0, 0, pixelHeight / section.height, 0, 0);
  context.clearRect(0, 0, section.width, section.height);
  for (const stroke of section.strokes) drawStroke(context, stroke);
}

function addControl(parent, label, control) {
  const wrapper = document.createElement('label');
  wrapper.className = 'ink-editor__control';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(text, control);
  parent.append(wrapper);
  return control;
}

/** Mounts a compact vector handwriting editor. `onChange` receives a full immutable snapshot. */
export function createInkEditor(container, { value, onChange = () => {}, readOnly = false, controlsBelow = false } = {}) {
  let ink = normalizeInk(value, readOnly);
  let active = null;
  let saveState = 'Saved on this device';
  let drawingMode = 'pen';
  let allowTouchDrawing = false;
  const history = [structuredClone(ink)];
  let historyIndex = 0;

  container.replaceChildren();
  const root = document.createElement('section');
  root.className = `ink-editor${readOnly ? ' ink-editor--readonly' : ''}`;
  root.setAttribute('aria-label', readOnly ? 'Handwritten answer' : 'Handwritten answer editor');
  const toolbar = document.createElement('div');
  toolbar.className = 'ink-editor__toolbar';
  const sectionsHost = document.createElement('div');
  sectionsHost.className = 'ink-editor__sections';
  root.append(...(controlsBelow ? [sectionsHost, toolbar] : [toolbar, sectionsHost]));
  const status = document.createElement('span');
  status.className = 'ink-editor__status';
  status.setAttribute('role', 'status');
  const surfaces = [];

  const emit = (state = 'Saved on this device') => {
    saveState = state;
    status.textContent = saveState;
    const snapshot = structuredClone(ink);
    onChange(snapshot);
    history.splice(historyIndex + 1);
    history.push(snapshot);
    if (history.length > 60) history.shift();
    historyIndex = history.length - 1;
    updateHistoryControls();
  };

  let undoButton;
  let redoButton;
  const updateHistoryControls = () => {
    if (undoButton) undoButton.disabled = readOnly || historyIndex <= 0;
    if (redoButton) redoButton.disabled = readOnly || historyIndex >= history.length - 1;
  };
  const redraw = () => surfaces.forEach(({ canvas, section }) => drawSection(canvas, section));
  const renderSections = () => {
    sectionsHost.replaceChildren();
    surfaces.length = 0;
    for (let index = 0; index < ink.sections.length; index += 1) {
      const section = ink.sections[index];
      const canvas = document.createElement('canvas');
      canvas.className = 'ink-editor__canvas';
      canvas.style.aspectRatio = `${section.width} / ${section.height}`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Handwriting area ${index + 1}`);
      canvas.dataset.sectionId = section.id;
      if (!readOnly) attachPointerHandlers(canvas, section);
      sectionsHost.append(canvas);
      surfaces.push({ canvas, section });
    }
    redraw();
  };

  const pointFromEvent = (event, rect, section) => {
    return {
      x: Math.max(0, Math.min(section.width, ((event.clientX - rect.left) / rect.width) * section.width)),
      y: Math.max(0, Math.min(section.height, ((event.clientY - rect.top) / rect.height) * section.height)),
      pressure: event.pointerType === 'pen' && Number.isFinite(event.pressure) && event.pressure > 0
        ? Math.max(0.1, Math.min(1, event.pressure)) : 0.5,
    };
  };
  const startStroke = (canvas, section, event) => {
    if (active) return null;
    const rect = canvas.getBoundingClientRect();
    const stroke = {
      id: crypto.randomUUID(),
      tool: drawingMode,
      color: drawingMode === 'eraser' ? '#ffffff' : colorInput.value,
      width: Number(widthInput.value),
      points: [pointFromEvent(event, rect, section)],
    };
    const current = { pointerId: event.pointerId, canvas };
    active = current;
    section.strokes.push(stroke);
    drawStroke(canvas.getContext('2d'), stroke);
    current.move = (samples) => {
      if (active !== current) return;
      const start = stroke.points.length;
      for (const sample of samples) {
        if (stroke.points.length >= MAX_POINTS_PER_STROKE) break;
        stroke.points.push(pointFromEvent(sample, rect, section));
      }
      drawStroke(canvas.getContext('2d'), stroke, start);
    };
    current.finish = (cancelled) => {
      if (active !== current) return;
      active = null;
      if (cancelled) {
        section.strokes.pop();
        drawSection(canvas, section);
      } else emit();
    };
    return current;
  };
  const attachPointerHandlers = (canvas, section) => {
    canvas.addEventListener('pointerdown', (event) => {
      if (active || (event.pointerType === 'touch' && !allowTouchDrawing) || event.button !== 0) return;
      event.preventDefault();
      try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic events have no native capture */ }
      startStroke(canvas, section, event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (active?.pointerId !== event.pointerId || active.canvas !== canvas) return;
      event.preventDefault();
      active.move(pencilSamples(event));
    });
    const finish = (event, cancelled = false) => {
      if (active?.pointerId !== event.pointerId || active.canvas !== canvas) return;
      active.finish(cancelled);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener('pointerup', (event) => finish(event));
    canvas.addEventListener('pointercancel', (event) => finish(event, true));
    canvas.addEventListener('lostpointercapture', (event) => finish(event, true));
  };

  const undo = () => {
    if (active || historyIndex <= 0) return;
    historyIndex -= 1;
    ink = structuredClone(history[historyIndex]);
    renderSections();
    onChange(structuredClone(ink));
    updateHistoryControls();
  };
  const redo = () => {
    if (active || historyIndex >= history.length - 1) return;
    historyIndex += 1;
    ink = structuredClone(history[historyIndex]);
    renderSections();
    onChange(structuredClone(ink));
    updateHistoryControls();
  };

  if (!readOnly) {
    colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#172554';
    colorInput.setAttribute('aria-label', 'Pen colour');
    addControl(toolbar, 'Colour', colorInput);
    widthInput = document.createElement('input');
    widthInput.type = 'range';
    widthInput.min = '1';
    widthInput.max = '12';
    widthInput.value = '3';
    widthInput.setAttribute('aria-label', 'Pen thickness');
    addControl(toolbar, 'Thickness', widthInput);
    const button = (label, action, parent = toolbar) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'button button--secondary button--small';
      element.textContent = label;
      element.addEventListener('click', action);
      parent.append(element);
      return element;
    };
    const modeButton = button('Eraser', () => {
      drawingMode = drawingMode === 'eraser' ? 'pen' : 'eraser';
      modeButton.textContent = drawingMode === 'eraser' ? 'Pen' : 'Eraser';
      modeButton.setAttribute('aria-pressed', String(drawingMode === 'eraser'));
    });
    modeButton.setAttribute('aria-pressed', 'false');
    const touchButton = button('Touch drawing off', () => {
      allowTouchDrawing = !allowTouchDrawing;
      touchButton.textContent = allowTouchDrawing ? 'Touch drawing on' : 'Touch drawing off';
      touchButton.setAttribute('aria-pressed', String(allowTouchDrawing));
    });
    touchButton.setAttribute('aria-pressed', 'false');
    undoButton = button('Undo', undo);
    redoButton = button('Redo', redo);
    button('Clear answer', () => {
      if (active) return;
      ink = { ...ink, schemaVersion: 1, sections: [newSection()] };
      renderSections();
      emit();
    });
    const addSpaceButton = button('Add writing space', () => {
      if (active) return;
      const addedHeight = Math.min(ADDED_HEIGHT, MAX_WRITING_HEIGHT - writingHeight(ink.sections));
      if (addedHeight <= 0) {
        status.textContent = 'Maximum writing space reached';
        return;
      }
      const section = ink.sections.at(-1);
      section.height += addedHeight * section.width / LOGICAL_WIDTH;
      renderSections();
      emit();
    }, root);
    addSpaceButton.className = 'btn btn--sm ink-editor__add-space';
  }

  if (typeof colorInput === 'undefined') { var colorInput; var widthInput; }
  toolbar.append(status);
  container.append(root);
  status.textContent = readOnly ? 'Handwritten answer' : saveState;
  renderSections();
  updateHistoryControls();

  const resizeObserver = new ResizeObserver(redraw);
  resizeObserver.observe(root);
  const onResize = () => redraw();
  window.addEventListener('resize', onResize, { passive: true });

  return {
    startPencilStroke(event) {
      const first = surfaces[0];
      return !readOnly && first ? startStroke(first.canvas, first.section, event) : null;
    },
    getValue: () => structuredClone(ink),
    setSaveState(state) { saveState = state; status.textContent = state; },
    destroy() {
      active?.finish(true);
      resizeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      container.replaceChildren();
    },
  };
}

function pencilSamples(event) {
  const coalesced = event.getCoalescedEvents?.();
  return coalesced?.length ? coalesced : [event];
}

/** Keeps the first stroke when Practice swaps a textarea for a handwriting editor. */
export function transferPencilStroke(event, captureTarget) {
  event.preventDefault();
  const lifetime = new AbortController();
  const samples = [];
  let stroke;
  let ended = false;
  let cancelled = false;
  try { captureTarget.setPointerCapture(event.pointerId); } catch { /* document listeners also cover events outside the field */ }
  const listen = (type, handler) => document.addEventListener(type, (next) => {
    if (next.pointerId === event.pointerId) handler(next);
  }, { capture: true, signal: lifetime.signal });
  listen('pointermove', (next) => {
    next.preventDefault();
    const points = pencilSamples(next);
    if (stroke) stroke.move(points);
    else samples.push(...points.slice(0, MAX_POINTS_PER_STROKE - samples.length));
  });
  const finish = (next) => {
    ended = true;
    cancelled = next.type !== 'pointerup';
    stroke?.finish(cancelled);
    lifetime.abort();
  };
  listen('pointerup', finish);
  listen('pointercancel', finish);
  listen('lostpointercapture', (next) => { if (next.target === captureTarget) finish(next); });
  return {
    attach(editor) {
      if (cancelled) return;
      stroke = editor.startPencilStroke(event);
      stroke?.move(samples);
      if (ended) stroke?.finish(false);
    },
    cancel() { lifetime.abort(); stroke?.finish(true); },
  };
}

/** Draws stored strokes without controls for marking and history views. */
export function renderInkPreview(container, value) {
  return createInkEditor(container, { value, readOnly: true });
}
