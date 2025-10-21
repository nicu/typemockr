export type Config = {
  projectRootDir: string;
  include: string[];
  baseDir: string[];
  outDir?: string;
  // Output format: 'ts' emits TypeScript mocks (.mock.ts). 'jsdoc' emits JS files with JSDoc typedefs (.mock.js)
  format?: "ts" | "jsdoc";
  mappings?: Record<string, string[]>;
  // Optional path (relative to project root) to a module that exports a mapping provider function
  // Signature: (type: string, path: string, _context?: any) => string | undefined
  mappingProvider?: string;
};

export type RawConfig = {
  include?: string[];
  baseDir?: string[];
  outDir?: string;
  format?: "ts" | "jsdoc";
  mappings?: Record<string, string[]>;
  mappingProvider?: string;
};
