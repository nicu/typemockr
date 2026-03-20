// AST type definitions for TypeScript structure parsing

export type ASTPrimitiveProperty = {
  type: 'primitive';
  value: 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'any' | 'unknown' | 'date' | 'object';
};

export type ASTConstantProperty = {
  type: 'constant';
  value: string | number | boolean;
};

export type ASTUnionProperty = {
  type: 'union';
  value: Array<ASTPropertyValue>;
};

export type ASTIntersectionProperty = {
  type: 'intersection';
  value: Array<ASTPropertyValue>;
};

export type ASTArrayProperty = {
  type: 'array';
  value: Array<ASTPropertyValue>;
};

export type ASTTupleProperty = {
  type: 'tuple';
  value: Array<ASTPropertyValue>;
};

export type ASTObjectProperty = {
  type: 'object';
  value: Array<ASTProperty>;
};

export type ASTRecordProperty = {
  type: 'record';
  value: Array<ASTPropertyValue>;
};

export type ASTIndexSignatureProperty = {
  type: 'indexSignature';
  keyType: ASTPropertyValue;
  valueType: ASTPropertyValue;
};

export type ASTFunctionProperty = {
  type: 'function';
  value: ASTPropertyValue;
};

export type ASTPromiseProperty = {
  type: 'promise';
  value: Array<ASTPropertyValue>;
};

export type ASTReferenceProperty = {
  type: 'reference';
  value: string;
  location?: { file: string; line: number };
  // True if this reference is on a path that leads back to the owning entity (directly or indirectly)
  recursiveEdge?: boolean;
};

export type ASTTypeOperatorProperty = {
  type: 'typeOperator';
  operator: 'keyof' | 'unique' | 'readonly';
  value: ASTPropertyValue;
};

export type ASTMappedProperty = {
  type: 'mapped';
  parameter: string;
  constraint: ASTPropertyValue;
  value: ASTPropertyValue;
};

export type ASTConditionalProperty = {
  type: 'conditional';
  checkType: ASTPropertyValue;
  extendsType: ASTPropertyValue;
  trueType: ASTPropertyValue;
  falseType: ASTPropertyValue;
};

export type ASTEnumProperty = {
  type: 'enum';
  values: Array<string | number>;
};

export type ASTPropertyValue =
  | ASTPrimitiveProperty
  | ASTConstantProperty
  | ASTUnionProperty
  | ASTIntersectionProperty
  | ASTArrayProperty
  | ASTTupleProperty
  | ASTObjectProperty
  | ASTRecordProperty
  | ASTIndexSignatureProperty
  | ASTFunctionProperty
  | ASTPromiseProperty
  | ASTReferenceProperty
  | ASTTypeOperatorProperty
  | ASTMappedProperty
  | ASTConditionalProperty
  | ASTEnumProperty;

export type ASTProperty = ASTPropertyValue & {
  name: string;
  optional: boolean;
  docs?: string;
  location?: { file: string; line: number };
  // True if this property (possibly through nested values) leads back to the owning entity
  recursiveEdge?: boolean;
};

export type ASTGenericParameter = {
  name: string;
  constraint?: ASTPropertyValue;
  default?: ASTPropertyValue;
};

export type ASTEntityInstance = {
  name: string;
  type: 'instance';
  // Distinguish runtime-bearing classes from type-only interfaces
  instanceKind?: 'class' | 'interface';
  properties: Array<ASTProperty>;
  // Updated: each inherited entry now carries the original inheritance expression (expr),
  // optional location info and the fully-resolved list of properties aggregated from
  // the target parent (including transitive parents). This allows the generator to
  // compose default values for parent props at generation time.
  inherits?: Array<{
    // original inheritance expression as emitted by the parser (e.g. 'import("...").Base<T>')
    expr: string;
    // optional source location of the referenced parent type
    location?: { file: string; line: number };
    // aggregated properties from the parent type(s)
    properties?: Array<ASTProperty>;
  }>;
  isExported: boolean;
  generics?: ASTGenericParameter[];
  docs?: string;
  location?: { file: string; line: number };
  // True if this entity is part of a recursion cycle (self-recursive or in an SCC > 1)
  hasRecursion?: boolean;
  // Names of all entities in the same recursion cycle group (SCC), including self when applicable
  cycleGroup?: string[];
};

export type ASTEntityUnion = {
  name: string;
  type: 'union';
  values: Array<ASTPropertyValue>;
  isExported: boolean;
  docs?: string;
  location?: { file: string; line: number };
  hasRecursion?: boolean;
  cycleGroup?: string[];
};

export type ASTEntityAlias = {
  name: string;
  type: 'alias';
  entities: Array<string>;
  isExported: boolean;
  docs?: string;
  location?: { file: string; line: number };
  hasRecursion?: boolean;
  cycleGroup?: string[];
};

export type ASTEntityArray = {
  name: string;
  type: 'array';
  value: ASTArrayProperty;
  isExported: boolean;
  docs?: string;
  location?: { file: string; line: number };
  hasRecursion?: boolean;
  cycleGroup?: string[];
};

export type ASTEntityPrimitive = {
  name: string;
  type: 'primitive';
  value: ASTPrimitiveProperty;
  isExported: boolean;
  docs?: string;
  location?: { file: string; line: number };
  hasRecursion?: boolean;
  cycleGroup?: string[];
};

export type ASTEntityConstant = {
  name: string;
  type: 'constant';
  value: ASTPropertyValue;
  isExported: boolean;
  docs?: string;
  location?: { file: string; line: number };
  hasRecursion?: boolean;
  cycleGroup?: string[];
};

export type ASTEntityEnum = {
  name: string;
  type: 'enum';
  values: Array<string | number>;
  isExported: boolean;
  docs?: string;
  location?: { file: string; line: number };
  hasRecursion?: boolean;
  cycleGroup?: string[];
};

export type ASTEntityPlaceholder = {
  name: string;
  type: 'placeholder';
  isExported: boolean;
  docs?: string;
  location?: { file: string; line: number };
  hasRecursion?: boolean;
  cycleGroup?: string[];
};

export type ASTEntity =
  | ASTEntityInstance
  | ASTEntityUnion
  | ASTEntityAlias
  | ASTEntityArray
  | ASTEntityPrimitive
  | ASTEntityConstant
  | ASTEntityEnum
  | ASTEntityPlaceholder;
