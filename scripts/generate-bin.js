#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "dist", "bin");
const outFile = path.join(outDir, "typemockr");
const cjsEntry = path.join(__dirname, "..", "dist", "cjs", "index.js");

const contents = `#!/usr/bin/env node
"use strict";

// Generated wrapper to load the CommonJS build for typemockr
const path = require("path");
const fs = require("fs");

const cjs = path.join(__dirname, '..', 'cjs', 'index.js');

if (!fs.existsSync(cjs)) {
  console.error("\\n[ typemockr ]: built files not found. Please run npm run build before using the CLI.\\n");
  process.exit(1);
}

try {
  require(cjs);
} catch (err) {
  console.error("[ typemockr ]: failed to start CLI:", err);
  process.exit(1);
}
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, contents, { mode: 0o755 });
console.log("Generated", outFile);
