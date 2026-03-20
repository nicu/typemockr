function generateRegexp(text: string) {
  const escaped = text.replace(/\./g, "\\.").replace(/\*/g, ".*?");
  return new RegExp(`^${escaped}$`, "i");
}

export function defineCategories(categories: Record<string, Array<string>>) {
  const matchers: Array<[RegExp, string]> = [];

  for (const [key, value] of Object.entries(categories)) {
    value.forEach((expression) => {
      matchers.push([generateRegexp(expression), key]);
    });
  }

  return function inferCategory(path: string) {
    return matchers.find(([expression]) => expression.test(path))?.[1];
  };
}

/**
 * Build a matcher that maps a dotted path (e.g. Entity.prop.sub) to a faker generator string,
 * based on wildcard expressions provided in a config object.
 *
 * Example input:
 * {
 *   "faker.internet.email()": ["*email*.address", "*.*email*.address", "*.*email"]
 * }
 */
export function defineGeneratorMatchers(
  mapping: Record<string, Array<string>>
) {
  const matchers: Array<[RegExp, string]> = [];

  for (const [generator, patterns] of Object.entries(mapping)) {
    patterns.forEach((pattern) => {
      matchers.push([generateRegexp(pattern), generator]);
    });
  }

  return function inferGenerator(path: string): string | undefined {
    return matchers.filter(([re]) => re.test(path)).at(0)?.[1];
  };
}
