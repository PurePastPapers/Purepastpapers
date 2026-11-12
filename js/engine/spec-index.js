// Index over specification trees (sections → topics → spec points).
//
// Questions are tagged with spec point ids, but a tag may also name a whole topic
// (the PRD's own example crosses over to "EDX_MATH_PURE_TRIG"). `expand` turns any
// mix of ids into the set of leaf spec points they require, which is what the
// learned-topics gate and the mastery analytics work on.

export function createSpecIndex() {
  const nodes = new Map(); // id → node
  const subjects = new Map(); // subject_id → { spec, leaves, positions, nodes }

  function add(spec) {
    if (!spec || subjects.has(spec.subject_id)) return;
    // A verified board order can override a tree grouped by paper. It must be an
    // exact leaf-id permutation: never guess order by parsing display codes.
    if (spec.point_order !== undefined) {
      const authored = [];
      for (const section of spec.sections || []) {
        for (const topic of section.topics || []) {
          if (topic.points?.length) authored.push(...topic.points.map((point) => point.id));
          else authored.push(topic.id);
        }
      }
      const known = new Set(authored);
      if (!Array.isArray(spec.point_order) || spec.point_order.length !== authored.length ||
          new Set(spec.point_order).size !== authored.length || spec.point_order.some((id) => !known.has(id))) {
        throw new TypeError(`point_order must list every leaf exactly once for ${spec.subject_id}.`);
      }
    }
    const subjectLeaves = [];
    const subjectNodes = [];
    for (const section of spec.sections || []) {
      const sectionNode = {
        id: section.id, type: 'section', title: section.title, code: section.code || '', kind: 'section',
        subject_id: spec.subject_id, parent: null, children: [], leaves: [],
      };
      nodes.set(section.id, sectionNode);
      subjectNodes.push(sectionNode);
      for (const topic of section.topics || []) {
        const topicNode = {
          id: topic.id, type: 'topic', title: topic.title, code: topic.code || '', kind: topic.kind || 'topic',
          subject_id: spec.subject_id, parent: section.id, children: [], leaves: [],
        };
        nodes.set(topic.id, topicNode);
        subjectNodes.push(topicNode);
        sectionNode.children.push(topic.id);
        const points = topic.points || [];
        if (!points.length) topicNode.leaves.push(topic.id); // a topic with no points is itself selectable
        for (const point of points) {
          const pointNode = {
            id: point.id, type: 'point', title: point.title, code: point.code || '', kind: point.kind || topicNode.kind,
            tier: point.tier || null, subject_id: spec.subject_id, parent: topic.id, children: [], leaves: [point.id],
          };
          nodes.set(point.id, pointNode);
          subjectNodes.push(pointNode);
          topicNode.children.push(point.id);
          topicNode.leaves.push(point.id);
        }
        sectionNode.leaves.push(...topicNode.leaves);
      }
      subjectLeaves.push(...sectionNode.leaves);
    }
    const leaves = spec.point_order ? [...spec.point_order] : subjectLeaves;
    subjects.set(spec.subject_id, {
      spec, leaves, positions: new Map(leaves.map((id, index) => [id, index])), nodes: subjectNodes,
    });
  }

  const get = (id) => nodes.get(id) || null;

  /** Leaf spec points covered by an id. Unknown ids are treated as a leaf, so they still gate. */
  const leavesOf = (id) => nodes.get(id)?.leaves || [id];

  function expand(ids) {
    const leaves = new Set();
    for (const id of ids || []) for (const leaf of leavesOf(id)) leaves.add(leaf);
    return leaves;
  }

  function topicOf(id) {
    const node = nodes.get(id);
    if (!node) return null;
    if (node.type === 'topic') return node;
    return node.type === 'point' ? nodes.get(node.parent) || null : null;
  }

  /** The node itself plus its ancestors (point → topic → section). */
  function lineage(id) {
    const chain = [];
    for (let node = nodes.get(id); node; node = node.parent ? nodes.get(node.parent) : null) chain.push(node);
    return chain;
  }

  function label(id, { code = true } = {}) {
    const node = nodes.get(id);
    if (!node) return id;
    return code && node.code ? `${node.code} ${node.title}` : node.title;
  }

  /** Inclusive range in explicit point_order, or authored order when absent.
   * A starting topic/section starts at its first leaf; an ending one includes its
   * last leaf. Unknown, foreign-subject, empty and reversed endpoints fail closed.
   */
  function range(subjectId, fromId, toId) {
    const subject = subjects.get(subjectId);
    const from = nodes.get(fromId);
    const to = nodes.get(toId);
    if (!subject || from?.subject_id !== subjectId || to?.subject_id !== subjectId) return new Set();
    let start = Infinity;
    let end = -Infinity;
    for (const id of from.leaves) start = Math.min(start, subject.positions.get(id) ?? Infinity);
    for (const id of to.leaves) end = Math.max(end, subject.positions.get(id) ?? -Infinity);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return new Set();
    return new Set(subject.leaves.slice(start, end + 1));
  }

  return {
    add,
    get,
    has: (id) => nodes.has(id),
    leavesOf,
    expand,
    topicOf,
    lineage,
    label,
    range,
    subjectOf: (id) => nodes.get(id)?.subject_id || null,
    subjectLeaves: (subjectId) => subjects.get(subjectId)?.leaves || [],
    subjectNodes: (subjectId) => subjects.get(subjectId)?.nodes || [],
    spec: (subjectId) => subjects.get(subjectId)?.spec || null,
    hasSubject: (subjectId) => subjects.has(subjectId),
  };
}
