// Runs every test/*.test.mjs one after another and exits non-zero if any fails. Usage: npm test  (or: node test/run-all.mjs [name])
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const files = readdirSync(here).filter((f) => f.endsWith(".test.mjs") && (!only || f.startsWith(only))).sort();
let failed = 0, blocked = 0;
for (const f of files) {
  console.log(`\n== ${f}`);
  const r = spawnSync(process.execPath, [join(here, f)], { stdio: "inherit" });
  if (r.status === 77) { blocked++; console.log(`-- ${f} BLOCKED (a tool it needs is missing; not counted as a failure)`); }
  else if (r.status !== 0) { failed++; console.log(`!! ${f} failed (exit ${r.status})`); }
}
console.log(`\n${files.length - failed - blocked}/${files.length} test files passed${blocked ? `, ${blocked} blocked` : ""}`);
process.exit(failed ? 1 : 0);
