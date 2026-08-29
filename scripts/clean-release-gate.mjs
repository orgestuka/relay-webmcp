import { spawnSync } from "node:child_process";
import process from "node:process";

const forwarded = process.argv.slice(2);
if (forwarded.some((argument) => argument === "--full" || argument === "--dns" || argument === "--env")) {
  console.error("check:clean-release is a source-gate compatibility entry point. Use npm run gate:release -- --env .env.deploy for deployment.");
  process.exitCode = 2;
} else {
  const result = spawnSync(process.execPath, ["scripts/release-gate.mjs", ...forwarded], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[Relay clean-release compatibility] ${result.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
