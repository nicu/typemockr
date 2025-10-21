import type {
  ASTEntity,
  ASTPropertyValue,
  ASTProperty,
  ASTArrayProperty,
} from "./ast-types";

export function extractTypeNameFromImportish(expr: string): string {
  // Handles import("...").TypeName or plain identifiers
  const complexImportMatch = expr.match(
    /import\([^)]+\)\.([A-Za-z_$][A-Za-z0-9_$]*)/
  );
  if (complexImportMatch && complexImportMatch[1]) return complexImportMatch[1];
  const match = expr.match(/\.([A-Za-z0-9_]+)$/);
  return match && match[1] ? match[1] : expr;
}

export function collectRefsFromProp(prop: ASTPropertyValue, acc: Set<string>) {
  switch (prop.type) {
    case "reference":
      if ((prop as any).value && (prop as any).value !== "__type") {
        acc.add(extractTypeNameFromImportish((prop as any).value));
      }
      return;
    case "union":
    case "intersection":
    case "array":
    case "tuple":
    case "record":
    case "promise":
      if (Array.isArray((prop as any).value)) {
        for (const v of (prop as any).value as any[])
          collectRefsFromProp(v, acc);
      }
      return;
    case "object":
      for (const p of (prop as any).value as any[])
        collectRefsFromProp(p as any, acc);
      return;
    case "typeOperator":
    case "mapped":
    case "conditional":
      collectRefsFromProp(
        (prop as any).value ??
          (prop as any).trueType ??
          (prop as any).falseType ??
          (prop as any).checkType ??
          (prop as any).extendsType,
        acc
      );
      return;
    default:
      return;
  }
}

export function buildAdjacency(
  entities: ASTEntity[]
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const addEdge = (from: string, to: string) => {
    if (!adj.has(from)) adj.set(from, new Set());
    if (from !== to) adj.get(from)!.add(to);
    else adj.get(from)!.add(to); // keep self-edge to detect self recursion
  };

  for (const e of entities) {
    const from = e.name;
    if (!adj.has(from)) adj.set(from, new Set());
    switch (e.type) {
      case "instance": {
        // properties
        for (const p of e.properties) {
          collectRefsFromProp(p as any, adj.get(from)!);
        }
        // inherits
        (e.inherits || []).forEach((base) => {
          const expr = (base as any).expr ?? base;
          const baseName = extractTypeNameFromImportish(expr);
          addEdge(from, baseName);
        });
        break;
      }
      case "union": {
        for (const v of e.values) {
          const refs = new Set<string>();
          collectRefsFromProp(v as any, refs);
          for (const r of refs) addEdge(from, r);
        }
        break;
      }
      case "alias": {
        for (const ent of e.entities) {
          const tn = extractTypeNameFromImportish(ent);
          addEdge(from, tn);
        }
        break;
      }
      case "array": {
        const refs = new Set<string>();
        collectRefsFromProp(e.value as any, refs);
        for (const r of refs) addEdge(from, r);
        break;
      }
      default:
        break;
    }
  }
  return adj;
}

export function computeSCC(adj: Map<string, Set<string>>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongconnect(v: string) {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const comp: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w) {
          onStack.delete(w);
          comp.push(w);
        }
      } while (w && w !== v);
      sccs.push(comp);
    }
  }

  for (const v of adj.keys()) {
    if (!indices.has(v)) strongconnect(v);
  }
  return sccs;
}

export function annotateEntityWithRecursion(
  entity: ASTEntity,
  adj: Map<string, Set<string>>,
  nodeToScc: Map<string, Set<string>>,
  reachableFrom: (node: string) => Set<string>
): ASTEntity {
  const scc = nodeToScc.get(entity.name) || new Set<string>();
  const hasSelfEdge = (adj.get(entity.name) || new Set()).has(entity.name);
  const inRecursion = scc.size > 1 || hasSelfEdge;
  const cycleGroup = inRecursion
    ? Array.from(scc.size ? scc : new Set([entity.name]))
    : undefined;

  function canLeadToRecursionFrom(typeName: string): boolean {
    if (!inRecursion) return false;
    const targetSet = scc.size ? scc : new Set([entity.name]);
    // direct in same SCC or reaches any target in SCC
    if (targetSet.has(typeName)) return true;
    const reach = reachableFrom(typeName);
    for (const t of targetSet) if (reach.has(t)) return true;
    return false;
  }

  function annotatePropValue(v: ASTPropertyValue): [ASTPropertyValue, boolean] {
    switch (v.type) {
      case "reference": {
        const typeName = extractTypeNameFromImportish((v as any).value);
        const leads = canLeadToRecursionFrom(typeName);
        const nv = leads ? { ...(v as any), recursiveEdge: true } : v;
        return [nv, leads];
      }
      case "array": {
        const [inner, innerLeads] = annotatePropValue((v as any).value[0]);
        const nv = { ...(v as any), value: [inner] } as ASTArrayProperty;
        return [nv as any, innerLeads];
      }
      case "tuple": {
        let anyLead = false;
        const newVals = (v as any).value.map((x: any) => {
          const [nx, l] = annotatePropValue(x);
          anyLead = anyLead || l;
          return nx;
        });
        return [{ ...(v as any), value: newVals } as any, anyLead];
      }
      case "union":
      case "intersection":
      case "record":
      case "promise": {
        let anyLead = false;
        const newVals = (v as any).value.map((x: any) => {
          const [nx, l] = annotatePropValue(x);
          anyLead = anyLead || l;
          return nx;
        });
        return [{ ...(v as any), value: newVals } as any, anyLead];
      }
      case "object": {
        let anyLead = false;
        const newProps = (v as any).value.map((p: any) => {
          const [np, l] = annotateProperty(p);
          anyLead = anyLead || l;
          return np;
        });
        return [{ ...(v as any), value: newProps } as any, anyLead];
      }
      case "typeOperator": {
        const [nv, l] = annotatePropValue((v as any).value);
        return [{ ...(v as any), value: nv } as any, l];
      }
      case "mapped": {
        const [nv, l] = annotatePropValue((v as any).value);
        return [{ ...(v as any), value: nv } as any, l];
      }
      case "conditional": {
        const [t1, l1] = annotatePropValue((v as any).checkType);
        const [t2, l2] = annotatePropValue((v as any).extendsType);
        const [t3, l3] = annotatePropValue((v as any).trueType);
        const [t4, l4] = annotatePropValue((v as any).falseType);
        return [
          {
            ...(v as any),
            checkType: t1,
            extendsType: t2,
            trueType: t3,
            falseType: t4,
          } as any,
          l1 || l2 || l3 || l4,
        ];
      }
      default:
        return [v, false];
    }
  }

  function annotateProperty(p: ASTProperty): [ASTProperty, boolean] {
    const { name, optional, docs, location } = p as any;
    const { type, ...rest } = p as any;
    // Rest is the underlying shape; rebuild via annotatePropValue
    const [nv, leads] = annotatePropValue(p as any);
    const np = { ...(nv as any), name, optional, docs, location } as any;
    if (leads) np.recursiveEdge = true;
    return [np, leads];
  }

  // Apply to entity
  const out: any = { ...entity };
  out.hasRecursion = inRecursion || undefined;
  out.cycleGroup = cycleGroup;

  switch (entity.type) {
    case "instance": {
      const newProps: any[] = [];
      for (const p of (entity as any).properties) {
        const [np] = annotateProperty(p as any);
        newProps.push(np);
      }
      out.properties = newProps;
      break;
    }
    case "union": {
      const vals: any[] = [];
      for (const v of (entity as any).values) {
        const [nv] = annotatePropValue(v as any);
        vals.push(nv);
      }
      out.values = vals;
      break;
    }
    case "array": {
      const [nv] = annotatePropValue((entity as any).value as any);
      out.value = nv;
      break;
    }
    default:
      break;
  }

  return out as ASTEntity;
}
