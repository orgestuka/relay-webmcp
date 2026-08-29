import { writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const releaseSha = String(process.argv[2] ?? "").trim().toLowerCase();
const validSha = /^[a-f0-9]{40}$/.test(releaseSha) && !/^0+$/.test(releaseSha);
if (!validSha) {
  throw new Error("Release manifest generation requires a non-zero 40-character Git commit SHA.");
}

const applications = [
  ["relay-command", "Relay Command"],
  ["shelter-grid", "Shelter Grid"],
  ["transit-ops", "Transit Ops"],
  ["supply-hub", "Supply Hub"],
];

const manifests = [];
for (const [app, title] of applications) {
  const dist = resolve("apps", app, "dist");
  await access(resolve(dist, "index.html"), constants.R_OK);
  const manifest = {
    schema: "relay.release.v1",
    app,
    title,
    sha: releaseSha,
  };
  const path = resolve(dist, "release.json");
  await writeFile(path, `${JSON.stringify(manifest)}\n`, "utf8");
  manifests.push({ app, path, sha: releaseSha });
}

console.log(JSON.stringify({
  ok: true,
  releaseSha,
  manifests,
}, null, 2));
