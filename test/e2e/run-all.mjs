// Runs every test/e2e/*.e2e.mjs (needs Google Chrome; starts the dev server if it is not running) one after another and exits non-zero if any fails. Usage: npm run test:e2e  (or: node test/e2e/run-all.mjs [name])
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const files = readdirSync(here).filter((f) => f.endsWith(".e2e.mjs") && (!only || f.startsWith(only))).sort();
let failed = 0;
for (const f of files) {
  console.log(`\n== ${f}`);
  const r = spawnSync(process.execPath, [join(here, f)], { stdio: "inherit" });
  if (r.status !== 0) { failed++; console.log(`!! ${f} failed (exit ${r.status})`); }
}
console.log(`\n${files.length - failed}/${files.length} e2e files passed`);
process.exit(failed ? 1 : 0);
