// Same shape as a typemockr 0.1.x provider: ESM syntax, (type, path, context).
const mappings = [
  ["*.id", "faker.string.uuid()"],
  ["*.email", "faker.internet.email()"],
];

export function mappingProvider(type, path, context) {
  if (type === "string" && /\.\$type$/.test(path) && context?.sourceFile && context.entityName) {
    return `"Acme.${context.entityName}"`;
  }

  for (const [pattern, generator] of mappings) {
    const re = new RegExp(`^${pattern.replace(/[.$]/g, "\\$&").replace(/\*/g, ".*")}$`);
    if (re.test(path)) return generator;
  }

  return undefined;
}
