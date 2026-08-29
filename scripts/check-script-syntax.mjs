import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const SCRIPT_ROOT = resolve(ROOT, "scripts");

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(path);
  }
  return files;
}

const files = (await collect(SCRIPT_ROOT)).sort();
const checks = files.map((absolutePath) => {
  const path = relative(ROOT, absolutePath);
  const result = spawnSync(process.execPath, ["--check", absolutePath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return {
    path,
    pass: result.status === 0 && !result.error,
    exitCode: result.status,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    error: result.error?.message ?? null,
  };
});

const report = {
  schema: "relay.script-syntax-gate.v1",
  checkedAt: new Date().toISOString(),
  pass: checks.length > 0 && checks.every((check) => check.pass),
  scriptCount: checks.length,
  checks,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
