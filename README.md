# TypeMockr

This repository generates TypeScript mock factories from types.

## Configuration

Create a `typemockr.json` in the root of your project (the project that installs this package) to configure generation. Supported fields:

- `include`: array of glob paths to input source files (same as before)
- `baseDir`: array of base directory prefixes to strip when computing output paths
- `outDir`: output directory for generated mocks
- `mappings`: optional object that maps faker generator expression strings to arrays of dotted property path patterns. Keys are generator expressions and values are arrays of path patterns (generator -> [patterns]).
- `mappingProvider`: optional path to a module that exports a mapping provider function (signature: `(type, path, context?) => string | undefined | null`). Use this when you prefer to keep mapping logic in code or share mappings across projects.

  Examples:
  Minimal configuration (no mappings):

  ```json
  {
    "include": ["src/**/*.ts"],
    "baseDir": ["src/"],
    "outDir": "src/$mock"
  }
  ```

  Provide mappings inline in `typemockr.json` (note the expected shape: generator -> patterns):

  ```json
  {
    "include": ["src/**/*.ts"],
    "baseDir": ["src/"],
    "outDir": "src/$mock",
    "mappings": {
      "*.id": "faker.string.uuid()",
      "*firstName*": "faker.person.firstName()",
      "*.recipientName": "faker.person.fullName()"
    }
  }
  ```

  Or use a `mappingProvider` that points to a JS/TS module (example: `mappings/provider.js`):

  ```json
  {
    "include": ["src/**/*.ts"],
    "baseDir": ["src/"],
    "outDir": "src/$mock",
    "mappingProvider": "./mappings/provider.js"
  }
  ```

  Example provider:

  ```js
  // mappings/provider.js
  const mappings = [
    ["*.id", "faker.string.uuid()"],
    ["*firstName*", "faker.person.firstName()"],
    ["*.recipientName", "faker.person.fullName()"],
    ["*", "faker.lorem.word()"],
  ];

  function keyToRegExp(key) {
    // escape regex special chars except *
    const escaped = key.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");
    const regexStr = "^" + escaped.replace(/\*/g, ".*") + "$";
    return new RegExp(regexStr);
  }

  module.exports = function mappingProvider(type, path, _context) {
    for (const [key, generator] of mappings) {
      const re = keyToRegExp(key);
      if (re.test(path)) return generator;
    }

    return undefined;
  };
  ```

  Note: If both `mappings` and `mappingProvider` are present, the runtime `mappingProvider` is consulted first. If it returns a non-null/undefined string for a given property, that value will be used. Inline `mappings` are used as a fallback when the provider returns `undefined`/`null` or is not provided.
