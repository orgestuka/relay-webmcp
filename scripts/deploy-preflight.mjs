import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { promises as dns } from "node:dns";
import { execFileSync } from "node:child_process";

const envPath = resolve(process.argv[2] || ".env.deploy");
const requireDns = process.argv.includes("--dns");

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Invalid environment line: ${rawLine}`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function validHostname(value) {
  if (typeof value !== "string" || value.length < 4 || value.length > 253) return false;
  if (value.includes("://") || /[\s/?#:@]/.test(value)) return false;
  const labels = value.split(".");
  return labels.length >= 2 && labels.every((label) =>
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

function validReleaseSha(value) {
  return /^[a-f0-9]{40}$/.test(String(value ?? "")) && !/^0+$/.test(String(value));
}

async function fileExists(path) {
  try {
    await access(resolve(path), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveHostname(hostname) {
  try {
    const records = await dns.resolveAny(hostname);
    return { ok: records.length > 0, records };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "DNS resolution failed" };
  }
}

const result = {
  schema: "relay.deploy-preflight.v2",
  checkedAt: new Date().toISOString(),
  envPath,
  requireDns,
  pass: false,
  urls: {},
  releaseSha: null,
  currentGitSha: null,
  checks: [],
  blockers: [],
};

try {
  const env = parseEnv(await readFile(envPath, "utf8"));
  const hostKeys = ["RELAY_HOST", "SHELTER_HOST", "TRANSIT_HOST", "SUPPLY_HOST"];
  const hosts = hostKeys.map((key) => ({ key, value: env[key] }));

  for (const { key, value } of hosts) {
    const valid = validHostname(value);
    result.checks.push({ id: `hostname_${key.toLowerCase()}`, pass: valid, value: value ?? null });
    if (!valid) result.blockers.push(`${key} must be a real hostname without scheme, path or port.`);
    if (value && /(^|\.)example\.(com|org|net)$|(^|\.)example$|\.invalid$/i.test(value)) {
      result.blockers.push(`${key} still contains a documentation placeholder.`);
    }
    if (value && /(^|\.)(localhost|local)$/i.test(value)) {
      result.blockers.push(`${key} cannot be localhost for ChatGPT validation.`);
    }
  }

  const definedHosts = hosts.map(({ value }) => value).filter(Boolean);
  const unique = new Set(definedHosts);
  const distinct = unique.size === hostKeys.length;
  result.checks.push({ id: "four_distinct_origins", pass: distinct, values: definedHosts });
  if (!distinct) result.blockers.push("Relay Command and all three providers require four distinct hostnames.");

  const emailPass = typeof env.ACME_EMAIL === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ACME_EMAIL);
  result.checks.push({ id: "acme_email", pass: emailPass, value: env.ACME_EMAIL ?? null });
  if (!emailPass) result.blockers.push("ACME_EMAIL must be a valid operational email address.");

  result.releaseSha = String(env.RELAY_RELEASE_SHA ?? "").trim().toLowerCase() || null;
  const releaseShaPass = validReleaseSha(result.releaseSha);
  result.checks.push({
    id: "release_sha",
    pass: releaseShaPass,
    value: result.releaseSha,
    instruction: "Set RELAY_RELEASE_SHA=$(git rev-parse HEAD) from the exact clean branch checkout being deployed.",
  });
  if (!releaseShaPass) result.blockers.push("RELAY_RELEASE_SHA must be a non-zero 40-character Git commit SHA.");

  try {
    result.currentGitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      cwd: process.cwd(),
    }).trim().toLowerCase();
    const cleanStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      encoding: "utf8",
      cwd: process.cwd(),
    }).trim();
    const cleanPass = cleanStatus === "";
    result.checks.push({ id: "clean_checkout", pass: cleanPass, status: cleanStatus });
    if (!cleanPass) result.blockers.push("Deployment preflight requires a clean Git checkout.");

    const checkoutMatch = releaseShaPass && result.releaseSha === result.currentGitSha;
    result.checks.push({
      id: "release_sha_matches_checkout",
      pass: checkoutMatch,
      releaseSha: result.releaseSha,
      currentGitSha: result.currentGitSha,
    });
    if (!checkoutMatch) result.blockers.push("RELAY_RELEASE_SHA does not match git rev-parse HEAD for this checkout.");
  } catch (error) {
    result.blockers.push(`Unable to verify deployment Git provenance: ${error instanceof Error ? error.message : "git failure"}.`);
  }

  const requiredFiles = [
    "compose.yaml",
    "deploy/Dockerfile",
    "deploy/Caddyfile",
    "deploy/nginx.conf",
    "deploy/entrypoint.sh",
    "scripts/write-release-manifests.mjs",
    "scripts/security-headers-check.mjs",
  ];
  for (const path of requiredFiles) {
    const present = await fileExists(path);
    result.checks.push({ id: `file_${path.replaceAll(/[/.]/g, "_")}`, pass: present, path });
    if (!present) result.blockers.push(`Missing deployment file: ${path}`);
  }

  if (definedHosts.length === hostKeys.length) {
    result.urls = {
      relay: `https://${env.RELAY_HOST}`,
      shelter: `https://${env.SHELTER_HOST}`,
      transit: `https://${env.TRANSIT_HOST}`,
      supply: `https://${env.SUPPLY_HOST}`,
      relayReleaseManifest: `https://${env.RELAY_HOST}/release.json`,
      relayDirectDiagnostic: `https://${env.RELAY_HOST}/?direct=1`,
      relayProofHarness: `https://${env.RELAY_HOST}/?proof=1`,
    };
  }

  if (requireDns && definedHosts.length === hostKeys.length) {
    for (const hostname of definedHosts) {
      const resolution = await resolveHostname(hostname);
      result.checks.push({ id: `dns_${hostname}`, hostname, ...resolution });
      if (!resolution.ok) result.blockers.push(`DNS does not currently resolve for ${hostname}.`);
    }
  }

  result.pass = result.blockers.length === 0 && result.checks.every((check) => check.pass !== false);
} catch (error) {
  result.blockers.push(error instanceof Error ? error.message : "Deployment preflight failed");
}

console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
