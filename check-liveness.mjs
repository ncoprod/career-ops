#!/usr/bin/env node

/**
 * check-liveness.mjs — Playwright job link liveness checker
 *
 * Tests whether job posting URLs are still active or have expired.
 * Uses the same detection logic as scan.md step 7.5.
 * Zero agent API tokens - pure Playwright.
 *
 * Usage:
 *   node check-liveness.mjs <url1> [url2] ...
 *   node check-liveness.mjs --file urls.txt
 *
 * Exit code: 0 if all active, 1 if any expired or uncertain
 */

import { chromium } from 'playwright';
import { readFile } from 'fs/promises';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

const EXPIRED_PATTERNS = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,           // Greenhouse: "The job you are looking for is no longer open."
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i, // Workday /job/ 404
  /\d+\s+jobs?\s+found/i,           // Workday: landed on listing page ("663 JOBS FOUND") instead of a specific job
  /search for jobs page is loaded/i, // Workday SPA indicator for listing page
  /diese stelle (ist )?(nicht mehr|bereits) besetzt/i,
  /offre (expirée|n'est plus disponible)/i,
];

// URL patterns that indicate an ATS has redirected away from the job (closed/expired)
const EXPIRED_URL_PATTERNS = [
  /[?&]error=true/i,   // Greenhouse redirect on closed jobs
];

const APPLY_PATTERNS = [
  /\bapply\b/i,          // catches "Apply", "Apply Now", "Apply for this Job"
  /\bsolicitar\b/i,
  /\bbewerben\b/i,
  /\bpostuler\b/i,
  /submit application/i,
  /easy apply/i,
  /start application/i,  // Ashby
  /ich bewerbe mich/i,   // German Greenhouse
];

// Below this length the page is probably just nav/footer (closed ATS page)
const MIN_CONTENT_CHARS = 300;

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length);
    return isPrivateIpv4(mappedIpv4);
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // RFC4193 unique local
  if (/^fe[89ab]/.test(normalized)) return true; // link-local fe80::/10
  return false;
}

function isBlockedIpAddress(hostname) {
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) return isPrivateIpv4(hostname);
  if (ipVersion === 6) return isPrivateIpv6(hostname);
  return false;
}

async function resolveHostAddresses(hostname) {
  try {
    const records = await dnsLookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    return [];
  }
}

export async function validatePublicHttpUrl(rawUrl, resolveHost = resolveHostAddresses) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `blocked URL protocol: ${parsed.protocol}` };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    isBlockedIpAddress(host) ||
    host.includes(':')
  ) {
    return { ok: false, reason: `blocked non-public host: ${host}` };
  }

  // Resolve DNS before navigation to prevent aliases like 127.0.0.1.nip.io
  // from bypassing host-based checks.
  const resolvedAddresses = await resolveHost(host);
  if (resolvedAddresses.length === 0) {
    return { ok: false, reason: `blocked unresolved host: ${host}` };
  }
  for (const address of resolvedAddresses) {
    if (isBlockedIpAddress(address)) {
      return { ok: false, reason: `blocked resolved non-public ip: ${address}` };
    }
  }

  return { ok: true, url: parsed.toString() };
}

async function checkUrl(page, url) {
  try {
    const validation = await validatePublicHttpUrl(url);
    if (!validation.ok) {
      return { result: 'expired', reason: validation.reason };
    }

    const response = await page.goto(validation.url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const status = response?.status() ?? 0;
    if (status === 404 || status === 410) {
      return { result: 'expired', reason: `HTTP ${status}` };
    }

    // Give SPAs (Ashby, Lever, Workday) time to hydrate
    await page.waitForTimeout(2000);

    // Check if the ATS redirected to an error/listing page (e.g. Greenhouse ?error=true)
    const finalUrl = page.url();
    for (const pattern of EXPIRED_URL_PATTERNS) {
      if (pattern.test(finalUrl)) {
        return { result: 'expired', reason: `redirect to ${finalUrl}` };
      }
    }

    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');

    // Apply button is the strongest positive signal — check it first.
    // This short-circuits before expired patterns that can appear on active pages
    // (e.g. Workday's split-view layout shows "N JOBS FOUND" even on active job pages).
    if (APPLY_PATTERNS.some(p => p.test(bodyText))) {
      return { result: 'active', reason: 'apply button detected' };
    }

    for (const pattern of EXPIRED_PATTERNS) {
      if (pattern.test(bodyText)) {
        return { result: 'expired', reason: `pattern matched: ${pattern.source}` };
      }
    }

    if (bodyText.trim().length < MIN_CONTENT_CHARS) {
      return { result: 'expired', reason: 'insufficient content — likely nav/footer only' };
    }

    return { result: 'uncertain', reason: 'content present but no apply button found' };

  } catch (err) {
    return { result: 'expired', reason: `navigation error: ${err.message.split('\n')[0]}` };
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node check-liveness.mjs <url1> [url2] ...');
    console.error('       node check-liveness.mjs --file urls.txt');
    process.exit(1);
  }

  let urls;
  if (args[0] === '--file') {
    const text = await readFile(args[1], 'utf-8');
    urls = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  } else {
    urls = args;
  }

  console.log(`Checking ${urls.length} URL(s)...\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let active = 0, expired = 0, uncertain = 0;

  // Sequential — project rule: never Playwright in parallel
  for (const url of urls) {
    const { result, reason } = await checkUrl(page, url);
    const icon = { active: '✅', expired: '❌', uncertain: '⚠️' }[result];
    console.log(`${icon} ${result.padEnd(10)} ${url}`);
    if (result !== 'active') console.log(`           ${reason}`);
    if (result === 'active') active++;
    else if (result === 'expired') expired++;
    else uncertain++;
  }

  await browser.close();

  console.log(`\nResults: ${active} active  ${expired} expired  ${uncertain} uncertain`);
  if (expired > 0 || uncertain > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
