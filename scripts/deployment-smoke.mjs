import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const envPath = resolve(process.argv[2] || ".env.deploy");

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[line.slice(0, separator).trim()] = value;
  }
  return values;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

function assetPaths(html) {
  const paths = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/gi)) {
    const path = match[1];
    if (path.startsWith("/")) paths.add(path);
  }
  return [...paths];
}

async function probe(name, host, titleFragment, expectedOrigins) {
  const origin = `https://${host}`;
  const result = { name, origin, pass: false, checks: [], blocker: null };
  try {
    const health = await fetchWithTimeout(`${origin}/healthz`, { headers: { Accept: "text/plain" } });
    const healthText = await health.text();
    result.checks.push({ id: "healthz", pass: health.ok && healthText.trim() === "ok", status: health.status, body: healthText.trim() });

    const page = await fetchWithTimeout(origin, { headers: { Accept: "text/html" } });
    const html = await page.text();
    const originAgentCluster = page.headers.get("origin-agent-cluster");
    result.checks.push({ id: "https_page", pass: page.ok && page.url.startsWith("https://"), status: page.status, finalUrl: page.url });
    result.checks.push({ id: "title", pass: html.toLowerCase().includes(titleFragment.toLowerCase()), expectedFragment: titleFragment });
    result.checks.push({ id: "app_mount", pass: html.includes('id="app"') || html.includes("id='app'") });
    result.checks.push({ id: "nosniff_header", pass: page.headers.get("x-content-type-options") === "nosniff", value: page.headers.get("x-content-type-options") });
    result.checks.push({
      id: "origin_agent_cluster_header",
      pass: originAgentCluster?.trim() === "?1",
      expected: "?1",
      value: originAgentCluster,
      consequence: "WebMCP registerTool/getTools reject non-origin-keyed documents with SecurityError.",
    });

    const assets = [];
    for (const path of assetPaths(html)) {
      const response = await fetchWithTimeout(`${origin}${path}`);
      const body = await response.text();
      assets.push({ path, status: response.status, body });
      result.checks.push({ id: `asset_${path}`, pass: response.ok, status: response.status });
    }
    const compiledText = assets.map((asset) => asset.body).join("\n");
    result.checks.push({
      id: "no_localhost_in_production_assets",
      pass: !compiledText.includes("http://localhost:") && !compiledText.includes("http://127.0.0.1:"),
    });
    for (const expectedOrigin of expectedOrigins) {
      result.checks.push({
        id: `compiled_origin_${new URL(expectedOrigin).hostname}`,
        pass: compiledText.includes(expectedOrigin),
        expectedOrigin,
      });
    }

    result.pass = result.checks.every((check) => check.pass);
  } catch (error) {
    result.blocker = error instanceof Error ? error.message : "HTTPS probe failed";
  }
  return result;
}

const env = parseEnv(await readFile(envPath, "utf8"));
const relayOrigin = env.RELAY_HOST ? `https://${env.RELAY_HOST}` : null;
const shelterOrigin = env.SHELTER_HOST ? `https://${env.SHELTER_HOST}` : null;
const transitOrigin = env.TRANSIT_HOST ? `https://${env.TRANSIT_HOST}` : null;
const supplyOrigin = env.SUPPLY_HOST ? `https://${env.SUPPLY_HOST}` : null;

const targets = [
  ["relay", env.RELAY_HOST, "Relay", [shelterOrigin, transitOrigin, supplyOrigin].filter(Boolean)],
  ["shelter", env.SHELTER_HOST, "Shelter Grid", relayOrigin ? [relayOrigin] : []],
  ["transit", env.TRANSIT_HOST, "Transit Ops", relayOrigin ? [relayOrigin] : []],
  ["supply", env.SUPPLY_HOST, "Supply Hub", relayOrigin ? [relayOrigin] : []],
];

const probes = [];
for (const [name, host, title, expectedOrigins] of targets) {
  probes.push(host
    ? await probe(name, host, title, expectedOrigins)
    : { name, origin: null, pass: false, blocker: `Missing ${name.toUpperCase()} host` });
}

const report = {
  schema: "relay.deployment-smoke.v2",
  executedAt: new Date().toISOString(),
  evidenceType: "deployed-four-origin-http-and-origin-isolation-smoke",
  pass: probes.every((probeResult) => probeResult.pass),
  probes,
  nextGate: "Open the Relay origin in a fresh ChatGPT built-in browser context and call relay_diagnose_webmcp with executeReadProbes=true.",
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
