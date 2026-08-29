import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { promises as dns } from "node:dns";

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
  schema: "relay.deploy-preflight.v1",
  checkedAt: new Date().toISOString(),
  envPath,
  requireDns,
  pass: false,
  urls: {},
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

  const requiredFiles = [
    "compose.yaml",
    "deploy/Dockerfile",
    "deploy/Caddyfile",
    "deploy/nginx.conf",
    "deploy/entrypoint.sh",
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
