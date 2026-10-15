// Bundles the command line (src/cli/main.ts + the real model code) into one runnable file.
// Usage: node scripts/build-cli.mjs [out.mjs]   (default: dist-cli/rea-starnote.mjs)
import { build } from "esbuild";
import { chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = process.argv[2] ?? join(root, "dist-cli/rea-starnote.mjs");
await build({
  entryPoints: [join(root, "src/cli/main.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "error",
});
chmodSync(outfile, 0o755);
