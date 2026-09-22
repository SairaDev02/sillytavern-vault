#!/usr/bin/env node
/**
 * start.mjs — one-command launcher for the Character Gallery web app.
 *
 *   npm start                 build (only if stale) and serve the production bundle
 *   npm start -- --dev        run the Vite dev server with HMR instead
 *   npm start -- --port 8080  use a specific port
 *   npm start -- --host       expose on the LAN
 *   npm start -- --force      rebuild even when dist/ is up to date
 *   npm start -- --no-build   serve the existing dist/ as-is
 *   npm start -- --no-open    don't open the browser
 *
 * No extra dependencies: it uses Vite's Node API (build + preview), which is
 * already installed as a devDependency.
 */

import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const DIST_INDEX = join(DIST, 'index.html');
const DEFAULT_PREVIEW_PORT = 4173;
const DEFAULT_DEV_PORT = 5173;

/** Sources that invalidate a previous build when they change. */
const SOURCE_TARGETS = [
  'index.html',
  'package.json',
  'svelte.config.js',
  'tsconfig.json',
  'vite.config.ts',
  'public',
  'src',
];

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = {
    dev: false,
    host: false,
    open: true,
    force: false,
    build: true,
    port: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--dev':
      case '-d':
        opts.dev = true;
        break;
      case '--host':
        opts.host = true;
        break;
      case '--no-open':
        opts.open = false;
        break;
      case '--open':
        opts.open = true;
        break;
      case '--force':
        opts.force = true;
        break;
      case '--no-build':
        opts.build = false;
        break;
      case '--port':
      case '-p': {
        const value = argv[++i];
        const port = Number.parseInt(value ?? '', 10);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          fail(`Invalid port: ${value ?? '(missing)'}`);
        }
        opts.port = port;
        break;
      }
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        fail(`Unknown option: ${arg} (try --help)`);
    }
  }

  if (opts.port === undefined) {
    opts.port = opts.dev ? DEFAULT_DEV_PORT : DEFAULT_PREVIEW_PORT;
  }
  return opts;
}

function printUsage() {
  console.log(`
Start the Character Gallery web app.

  npm start                    build if needed, then serve dist/ (production)
  npm start -- --dev           dev server with hot reload
  npm start -- --port 8080     custom port
  npm start -- --host          also listen on the local network
  npm start -- --force         always rebuild before serving
  npm start -- --no-build      serve the current dist/ without checking it
  npm start -- --no-open       do not open a browser

Options: --dev --port <n> --host --force --no-build --no-open --help

Notes:
  * Characters are stored per-browser in IndexedDB, keyed to the origin
    (scheme + host + port). Keep the port stable to keep seeing the same data.
  * The page must be opened over http:// (or https://), never file://.
`);
}

function fail(message) {
  console.error(`\n  ✖ ${message}\n`);
  process.exit(1);
}

// ------------------------------------------------------------ build checks

async function newestMtime(target) {
  let info;
  try {
    info = await stat(target);
  } catch {
    return 0;
  }
  if (!info.isDirectory()) return info.mtimeMs;

  let newest = info.mtimeMs;
  const entries = await readdir(target, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === '.DS_Store' || entry.name.endsWith('.log')) continue;
    try {
      const fileInfo = await stat(join(entry.parentPath ?? target, entry.name));
      if (fileInfo.mtimeMs > newest) newest = fileInfo.mtimeMs;
    } catch {
      /* ignore files that vanish mid-scan */
    }
  }
  return newest;
}

async function buildState() {
  if (!existsSync(DIST_INDEX)) return { stale: true, reason: 'dist/ has not been built yet' };

  const distTime = await newestMtime(DIST);
  let newestSource = 0;
  let newestName = '';
  for (const target of SOURCE_TARGETS) {
    const full = join(ROOT, target);
    const time = await newestMtime(full);
    if (time > newestSource) {
      newestSource = time;
      newestName = target;
    }
  }

  if (newestSource > distTime) {
    return { stale: true, reason: `${newestName} changed after the last build` };
  }
  return { stale: false, reason: 'up to date' };
}

function stamp() {
  return new Date().toTimeString().slice(0, 8);
}

// ------------------------------------------------------------------ servers

async function runDevServer(opts) {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: ROOT,
    server: {
      port: opts.port,
      host: opts.host ? true : undefined,
      open: opts.open,
      strictPort: false,
    },
  });
  await server.listen();
  console.log(`\n[${stamp()}] Dev server ready — press Ctrl+C to stop.\n`);
  printUrls(server, opts);
  attachShutdown(() => server.close());
}

async function runProductionServer(opts) {
  const { build, preview } = await import('vite');

  if (opts.build) {
    const state = await buildState();
    if (opts.force || state.stale) {
      const why = opts.force ? 'requested with --force' : state.reason;
      console.log(`\n[${stamp()}] Building production bundle (${why})...\n`);
      await build({ root: ROOT, logLevel: 'info' });
    } else {
      console.log(`\n[${stamp()}] dist/ is ${state.reason} — skipping build.`);
    }
  }

  if (!existsSync(DIST_INDEX)) {
    fail('dist/index.html is missing. Run without --no-build to create it.');
  }

  const server = await preview({
    root: ROOT,
    logLevel: 'warn',
    preview: {
      port: opts.port,
      host: opts.host ? true : undefined,
      open: opts.open,
      strictPort: false,
    },
  });

  console.log(`\n[${stamp()}] Serving production build — press Ctrl+C to stop.\n`);
  printUrls(server, opts);
  attachShutdown(() => server.httpServer.close());
}

function printUrls(server, opts) {
  const urls = server.resolvedUrls ?? {};
  for (const url of urls.local ?? []) console.log(`  ➜  Local:    ${url}`);
  for (const url of urls.network ?? []) console.log(`  ➜  Network:  ${url}`);
  if (!opts.host) console.log('  ➜  Network:  not shared (pass --host to expose)');
  console.log('');
}

function attachShutdown(close) {
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    console.log(`\n[${stamp()}] Shutting down...`);
    await close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// --------------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!existsSync(join(ROOT, 'node_modules'))) {
    fail('node_modules/ is missing. Run `npm install` first.');
  }
  if (!existsSync(join(ROOT, 'index.html'))) {
    fail(`index.html not found in ${ROOT}. Run this from the project directory.`);
  }

  if (opts.dev) {
    await runDevServer(opts);
  } else {
    await runProductionServer(opts);
  }
}

main().catch((error) => {
  console.error(`\n  ✖ Startup failed: ${error?.message ?? error}\n`);
  process.exit(1);
});
