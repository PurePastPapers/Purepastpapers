// Index over specification trees (sections → topics → spec points).
//
// Questions are tagged with spec point ids, but a tag may also name a whole topic
// (the PRD's own example crosses over to "EDX_MATH_PURE_TRIG"). `expand` turns any
// mix of ids into the set of leaf spec points they require, which is what the
// learned-topics gate and the mastery analytics work on.

export function createSpecIndex() {
  const nodes = new Map(); // id → node
  const subjects = new Map(); // subject_id → { spec, leaves }

  function add(spec) {
    if (!spec || subjects.has(spec.subject_id)) return;
    const subjectLeaves = [];
    for (const section of spec.sections || []) {
      const sectionNode = {
        id: section.id, type: 'section', title: section.title, code: '', kind: 'section',
        subject_id: spec.subject_id, parent: null, children: [], leaves: [],
      };
      nodes.set(section.id, sectionNode);
      for (const topic of section.topics || []) {
        const topicNode = {
          id: topic.id, type: 'topic', title: topic.title, code: topic.code || '', kind: topic.kind || 'topic',
          subject_id: spec.subject_id, parent: section.id, children: [], leaves: [],
        };
        nodes.set(topic.id, topicNode);
        sectionNode.children.push(topic.id);
        const points = topic.points || [];
        if (!points.length) topicNode.leaves.push(topic.id); // a topic with no points is itself selectable
        for (const point of points) {
          nodes.set(point.id, {
            id: point.id, type: 'point', title: point.title, code: point.code || '', kind: point.kind || topicNode.kind,
            tier: point.tier || null, subject_id: spec.subject_id, parent: topic.id, children: [], leaves: [point.id],
          });
          topicNode.children.push(point.id);
          topicNode.leaves.push(point.id);
        }
        sectionNode.leaves.push(...topicNode.leaves);
      }
      subjectLeaves.push(...sectionNode.leaves);
    }
    subjects.set(spec.subject_id, { spec, leaves: subjectLeaves });
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

  return {
    add,
    get,
    has: (id) => nodes.has(id),
    leavesOf,
    expand,
    topicOf,
    lineage,
    label,
    subjectOf: (id) => nodes.get(id)?.subject_id || null,
    subjectLeaves: (subjectId) => subjects.get(subjectId)?.leaves || [],
    spec: (subjectId) => subjects.get(subjectId)?.spec || null,
    hasSubject: (subjectId) => subjects.has(subjectId),
  };
}
