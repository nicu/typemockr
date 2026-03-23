import type {
  EntityNode,
  NormalizedProject,
  TypeNode,
} from "./types";

export function markRecursiveEntities(project: NormalizedProject) {
  const adjacency = buildEntityGraph(project);
  const recursiveIds = findRecursiveEntityIds(adjacency);

  for (const entity of project.entities) {
    entity.recursive = recursiveIds.has(entity.id);
  }
}

export function buildEntityGraph(
  project: NormalizedProject,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  for (const entity of project.entities) {
    adjacency.set(entity.id, collectEntityReferences(entity, project));
  }

  return adjacency;
}

function collectEntityReferences(
  entity: EntityNode,
  project: NormalizedProject,
): Set<string> {
  const references = new Set<string>();

  visitTypeNode(entity.type, (node) => {
    if (node.kind !== "reference" || node.genericParameter || !node.sourceFile) {
      return;
    }

    const target = project.entityBySourceAndName.get(
      `${node.sourceFile}::${node.name}`,
    );

    if (target) {
      references.add(target.id);
    }
  });

  return references;
}

function visitTypeNode(node: TypeNode, visit: (node: TypeNode) => void) {
  visit(node);

  switch (node.kind) {
    case "array":
      visitTypeNode(node.element, visit);
      return;
    case "tuple":
      node.elements.forEach((element) => visitTypeNode(element, visit));
      return;
    case "union":
      node.members.forEach((member) => visitTypeNode(member, visit));
      return;
    case "object":
      node.properties.forEach((property) => visitTypeNode(property.type, visit));
      if (node.indexSignature) {
        visitTypeNode(node.indexSignature.value, visit);
      }
      return;
    case "reference":
      node.typeArguments.forEach((argument) => visitTypeNode(argument, visit));
      return;
    case "enum":
    case "literal":
    case "scalar":
      return;
  }
}

function findRecursiveEntityIds(adjacency: Map<string, Set<string>>): Set<string> {
  let index = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const recursive = new Set<string>();

  const strongConnect = (node: string) => {
    indices.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of adjacency.get(node) ?? []) {
      if (!indices.has(target)) {
        strongConnect(target);
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node) ?? 0, lowLinks.get(target) ?? 0),
        );
      } else if (onStack.has(target)) {
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node) ?? 0, indices.get(target) ?? 0),
        );
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) {
      return;
    }

    const component: string[] = [];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        break;
      }

      onStack.delete(current);
      component.push(current);

      if (current === node) {
        break;
      }
    }

    if (component.length > 1) {
      component.forEach((item) => recursive.add(item));
      return;
    }

    const [only] = component;
    if (only && (adjacency.get(only)?.has(only) ?? false)) {
      recursive.add(only);
    }
  };

  for (const node of adjacency.keys()) {
    if (!indices.has(node)) {
      strongConnect(node);
    }
  }

  return recursive;
}
