interface PodOwnerNode {
  id: string;
  person_id: string;
  parent_id: string | null;
  end_date: Date | null;
}

/**
 * Get all descendant owner IDs from a set of root IDs.
 * Only walks active children (end_date = null) by default.
 */
export function getDescendantOwnerIds(
  rootIds: string[],
  allOwners: PodOwnerNode[],
  activeOnly = true
): string[] {
  const result: string[] = [...rootIds];
  const queue = [...rootIds];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = allOwners.filter(
      (o) =>
        o.parent_id === currentId &&
        (!activeOnly || o.end_date === null)
    );
    for (const child of children) {
      if (!result.includes(child.id)) {
        result.push(child.id);
        queue.push(child.id);
      }
    }
  }

  return result;
}

export interface TreeNode {
  id: string;
  person_id: string;
  parent_id: string | null;
  name: string;
  start_date: string;
  end_date: string | null;
  person?: { id: string; name: string; employee_code: string };
  children: TreeNode[];
  pods?: any[];
}

/**
 * Build a nested tree from a flat list of pod owners.
 */
export function buildTree(owners: any[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const owner of owners) {
    map.set(owner.id, { ...owner, children: [] });
  }

  for (const owner of owners) {
    const node = map.get(owner.id)!;
    if (owner.parent_id && map.has(owner.parent_id)) {
      map.get(owner.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Detect if setting newParentId on nodeId would create a cycle.
 */
export function detectCycle(
  nodeId: string,
  newParentId: string | null,
  allOwners: PodOwnerNode[]
): boolean {
  if (!newParentId) return false;
  if (newParentId === nodeId) return true;

  // Walk up from newParentId — if we reach nodeId, it's a cycle
  let current: string | null = newParentId;
  const visited = new Set<string>();

  while (current) {
    if (current === nodeId) return true;
    if (visited.has(current)) return false; // already a cycle in data, but not caused by us
    visited.add(current);
    const parent = allOwners.find((o) => o.id === current);
    current = parent?.parent_id ?? null;
  }

  return false;
}
