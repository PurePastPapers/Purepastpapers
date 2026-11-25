const LOGICAL_WIDTH = 1000;
const ADDED_HEIGHT = 360;
const STARTING_HEIGHT = 900;
const MAX_WRITING_HEIGHT = ADDED_HEIGHT * 12;
// Use bounded backing canvases so adding writing space never reduces the
// resolution of the ink above it on high-density displays.
const MAX_CANVAS_EDGE = 3072;
const MAX_CANVAS_AREA = 4_000_000;
const PEN_THICKNESS_KEY = 'ppp:practice:pen-thickness';
let penThickness;
try { penThickness = localStorage.getItem(PEN_THICKNESS_KEY); } catch { /* private storage may be unavailable */ }
if (!Number.isInteger(Number(penThickness)) || Number(penThickness) < 1 || Number(penThickness) > 12) penThickness = '3';
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

const midpoint = (first, second) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

function drawStroke(tiles, stroke, start = 0, finished = true) {
  const { points } = stroke;
  if (!points.length) return;
  for (const { context, top, bottom } of tiles) {
    if (!context) continue;
    const inTile = (first, second = first, third = second) =>
      Math.min(first.y, second.y, third.y) - stroke.width <= bottom &&
      Math.max(first.y, second.y, third.y) + stroke.width >= top;
    context.save();
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const widthAt = point => stroke.width * (0.45 + point.pressure * 0.55);
    if (start === 0 && inTile(points[0])) {
      context.beginPath();
      context.arc(points[0].x, points[0].y, widthAt(points[0]) / 2, 0, Math.PI * 2);
      context.fill();
    }
    for (let index = Math.max(1, start); index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      const from = index === 1 ? previous : midpoint(points[index - 2], previous);
      const to = midpoint(previous, point);
      if (!inTile(from, previous, to)) continue;
      context.lineWidth = widthAt(previous);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.quadraticCurveTo(previous.x, previous.y, to.x, to.y);
      context.stroke();
    }
    if (finished && points.length > 1) {
      const last = points.at(-1);
      const from = midpoint(points.at(-2), last);
      if (inTile(from, last)) {
        context.lineWidth = widthAt(last);
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(last.x, last.y);
        context.stroke();
      }
    }
    context.restore();
  }
}

function drawSection(surface, activeStroke) {
  const { area, section, tiles } = surface;
  const { width, height } = area.getBoundingClientRect();
  if (!width || !height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_EDGE / width);
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  const tileLimit = Math.min(MAX_CANVAS_EDGE, Math.floor(MAX_CANVAS_AREA / pixelWidth));
  const count = Math.ceil(pixelHeight / tileLimit);
  while (tiles.length > count) tiles.pop().canvas.remove();
  for (let index = 0; index < count; index += 1) {
    if (!tiles[index]) {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      area.append(canvas);
      tiles.push({ canvas });
    }
    const tile = tiles[index];
    const offset = index * tileLimit;
    const rows = Math.min(tileLimit, pixelHeight - offset);
    const { canvas } = tile;
    canvas.style.top = `${offset / pixelHeight * 100}%`;
    canvas.style.height = `${rows / pixelHeight * 100}%`;
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== rows) canvas.height = rows;
    tile.top = offset * section.height / pixelHeight;
    tile.bottom = (offset + rows) * section.height / pixelHeight;
    const context = canvas.getContext('2d');
    tile.context = context;
    if (!context) continue;
    context.setTransform(pixelWidth / section.width, 0, 0, pixelHeight / section.height, 0, -offset);
    context.clearRect(0, tile.top, section.width, tile.bottom - tile.top);
  }
  for (const stroke of section.strokes) drawStroke(tiles, stroke, 0, stroke !== activeStroke);
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
  let saveState = 'Ready to write';
  let drawingMode = 'pen';
  let allowTouchDrawing = false;
  let colorInput;
  let widthInput;
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

  const emit = () => {
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
  const redraw = () => surfaces.forEach(surface => drawSection(surface, active?.stroke));
  const renderSections = () => {
    sectionsHost.replaceChildren();
    surfaces.length = 0;
    for (let index = 0; index < ink.sections.length; index += 1) {
      const section = ink.sections[index];
      const area = document.createElement('div');
      area.className = 'ink-editor__canvas';
      area.style.aspectRatio = `${section.width} / ${section.height}`;
      area.setAttribute('role', 'img');
      area.setAttribute('aria-label', `Handwriting area ${index + 1}`);
      area.dataset.sectionId = section.id;
      const surface = { area, section, tiles: [] };
      if (!readOnly) attachPointerHandlers(surface);
      sectionsHost.append(area);
      surfaces.push(surface);
    }
    redraw();
  };

  const pointFromEvent = (event, rect, section) => {
    return {
      x: Math.max(0, Math.min(section.width, Math.round((event.clientX - rect.left) / rect.width * section.width * 10) / 10)),
      y: Math.max(0, Math.min(section.height, Math.round((event.clientY - rect.top) / rect.height * section.height * 10) / 10)),
      pressure: event.pointerType === 'pen' && Number.isFinite(event.pressure) && event.pressure > 0
        ? Math.max(0.1, Math.min(1, Math.round(event.pressure * 100) / 100)) : 0.5,
    };
  };
  const startStroke = ({ area, section, tiles }, event) => {
    if (active) return null;
    const rect = area.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const stroke = {
      id: crypto.randomUUID(),
      tool: drawingMode,
      color: drawingMode === 'eraser' ? '#ffffff' : colorInput.value,
      width: Number(penThickness),
      points: [pointFromEvent(event, rect, section)],
    };
    const current = { pointerId: event.pointerId, area, stroke };
    active = current;
    section.strokes.push(stroke);
    drawStroke(tiles, stroke, 0, false);
    current.move = (samples) => {
      if (active !== current) return;
      const start = stroke.points.length;
      for (const sample of samples) {
        if (stroke.points.length >= MAX_POINTS_PER_STROKE) break;
        const point = pointFromEvent(sample, rect, section);
        const last = stroke.points.at(-1);
        if (last.x !== point.x || last.y !== point.y) stroke.points.push(point);
      }
      drawStroke(tiles, stroke, start, false);
    };
    current.finish = (cancelled) => {
      if (active !== current) return;
      active = null;
      if (cancelled && stroke.points.length === 1) {
        section.strokes.pop();
        drawSection({ area, section, tiles });
        return;
      }
      drawStroke(tiles, stroke, stroke.points.length);
      emit();
    };
    return current;
  };
  const attachPointerHandlers = (surface) => {
    const { area } = surface;
    // iPad can deliver a native touch gesture alongside Pencil pointer events.
    // Cancel it at the writing surface on every contact, including after pen-up.
    area.style.touchAction = 'none';
    const preventCanvasPan = (event) => {
      if (event.cancelable) event.preventDefault();
    };
    area.addEventListener('touchstart', preventCanvasPan, { passive: false });
    area.addEventListener('touchmove', preventCanvasPan, { passive: false });
    area.addEventListener('pointerdown', (event) => {
      if (active || (event.pointerType === 'touch' && !allowTouchDrawing) || event.button !== 0) return;
      event.preventDefault();
      try { area.setPointerCapture(event.pointerId); } catch { /* synthetic events have no native capture */ }
      startStroke(surface, event);
    });
    area.addEventListener('pointermove', (event) => {
      if (active?.pointerId !== event.pointerId || active.area !== area) return;
      event.preventDefault();
      active.move(pencilSamples(event));
    });
    const finish = (event, cancelled = false) => {
      if (active?.pointerId !== event.pointerId || active.area !== area) return;
      active.finish(cancelled);
      if (area.hasPointerCapture(event.pointerId)) area.releasePointerCapture(event.pointerId);
    };
    area.addEventListener('pointerup', (event) => {
      if (active?.pointerId === event.pointerId && active.area === area) active.move([event]);
      finish(event);
    });
    area.addEventListener('pointercancel', (event) => finish(event, true));
    area.addEventListener('lostpointercapture', (event) => finish(event, true));
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
    widthInput.value = penThickness;
    widthInput.addEventListener('input', () => {
      penThickness = widthInput.value;
      for (const control of document.querySelectorAll('.ink-editor__thickness')) control.value = penThickness;
      try { localStorage.setItem(PEN_THICKNESS_KEY, penThickness); } catch { /* remember until reload */ }
    });
    widthInput.className = 'ink-editor__thickness';
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
    finishStroke() { active?.finish(false); },
    restoreValue(value) {
      if (active || history.length !== 1 || ink.sections.some(section => section.strokes.length)) return false;
      ink = normalizeInk(value, readOnly);
      history[0] = structuredClone(ink);
      renderSections();
      return true;
    },
    startPencilStroke(event) {
      const first = surfaces[0];
      return !readOnly && first ? startStroke(first, event) : null;
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
    if (!cancelled) {
      if (stroke) stroke.move([next]);
      else if (samples.length < MAX_POINTS_PER_STROKE) samples.push(next);
    }
    stroke?.finish(cancelled);
    lifetime.abort();
  };
  listen('pointerup', finish);
  listen('pointercancel', finish);
  listen('lostpointercapture', (next) => { if (next.target === captureTarget) finish(next); });
  return {
    attach(editor) {
      if (cancelled && !samples.length) return;
      stroke = editor.startPencilStroke(event);
      stroke?.move(samples);
      if (ended) stroke?.finish(cancelled);
    },
    cancel() { lifetime.abort(); stroke?.finish(true); },
  };
}

/** Draws stored strokes without controls for marking and history views. */
export function renderInkPreview(container, value) {
  return createInkEditor(container, { value, readOnly: true });
}
