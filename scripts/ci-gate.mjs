#!/usr/bin/env node
/**
 * ci-gate.mjs — the fail-closed required-check gate.
 *
 * Why this exists: GitHub reports a *skipped* Actions job to the branch rule as
 * a success. A required leaf job, or an aggregate job inside the pull request's
 * own workflow, therefore cannot prove that the required work ran. This script
 * runs from a separate `workflow_run` workflow, which GitHub always executes
 * from the default branch, so a pull request cannot skip, weaken, or rewrite
 * it. The script reads the triggering run's job and step conclusions and then
 * publishes the required check on the pull request head commit.
 *
 * The core (`evaluateRun`, `loadExpectedContexts`) is pure. The CLI reads
 * `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and `GITHUB_EVENT_PATH`, and optionally
 * `REQUIRED_CONTEXTS_FILE` and `DRY_RUN`.
 *
 * No dependencies: Node built-ins and the global `fetch` only.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2022-11-28';
const DEFAULT_CONTEXTS_FILE = '.github/required-contexts.json';
const DEFAULT_API_URL = 'https://api.github.com';

/** Steps with these conclusions mean the job did not do what it claims to do. */
const BLOCKING_STEP_CONCLUSIONS = new Set([
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'stale',
]);

/** A run has far fewer pages than this. Exceeding it means the API misbehaved. */
const MAX_JOB_PAGES = 20;

// ------------------------------------------------------------------ core

function describeConclusion(value) {
  return value === undefined || value === null || value === '' ? 'none' : `"${value}"`;
}

/** The summary table shows the plain value; the failure lines quote it. */
function tableConclusion(value) {
  return value === undefined || value === null || value === '' ? 'none' : String(value);
}

/**
 * Decide the gate result from a completed workflow run.
 *
 * Every rule fails closed: an unexpected shape, a missing conclusion, a skipped
 * job, or a failed step inside a job that reports success all block the merge.
 *
 * @returns {{ ok: boolean, conclusion: 'success'|'failure', checkName: string,
 *   title: string, summary: string, failures: string[] }}
 */
export function evaluateRun({ workflowName, shortSha, run, jobs, expectedJobNames }) {
  const checkName = `gate (${workflowName})`;
  const failures = [];
  const jobList = Array.isArray(jobs) ? jobs : [];
  const expected = Array.isArray(expectedJobNames) ? expectedJobNames : [];

  const runConclusion = run?.conclusion ?? null;
  if (runConclusion !== 'success') {
    failures.push(
      `the run conclusion is ${describeConclusion(runConclusion)}; the gate requires "success"`,
    );
  }
  if (expected.length === 0) {
    failures.push('no expected job names were supplied, so the gate cannot fail closed');
  }

  const rows = [];
  for (const name of expected) {
    const matches = jobList.filter((candidate) => candidate?.name === name);
    if (matches.length === 0) {
      rows.push([name, 'not present']);
      failures.push(`the expected job "${name}" is missing from the run`);
      continue;
    }
    if (matches.length > 1) {
      rows.push([name, tableConclusion(matches[0]?.conclusion)]);
      failures.push(
        `the expected job "${name}" appears more than once ` +
          `(${matches.length} times); the gate needs exactly one`,
      );
    } else {
      const conclusion = matches[0]?.conclusion ?? null;
      rows.push([name, tableConclusion(conclusion)]);
      if (conclusion !== 'success') {
        failures.push(
          `the expected job "${name}" concluded ${describeConclusion(conclusion)}; ` +
            'the gate requires "success"',
        );
      }
    }

    // A `continue-on-error` step can leave the job conclusion at "success".
    for (const match of matches) {
      for (const step of Array.isArray(match?.steps) ? match.steps : []) {
        if (BLOCKING_STEP_CONCLUSIONS.has(step?.conclusion)) {
          failures.push(
            `the expected job "${name}" has the step ${describeConclusion(step?.name)} ` +
              `with conclusion ${describeConclusion(step?.conclusion)}`,
          );
        }
      }
    }
  }

  const ignoredNames = [];
  for (const candidate of jobList) {
    const name = typeof candidate?.name === 'string' ? candidate.name : '(unnamed job)';
    if (!expected.includes(name) && !ignoredNames.includes(name)) ignoredNames.push(name);
  }

  const header = [
    `**Workflow:** ${workflowName ? `\`${workflowName}\`` : '(unknown)'}` +
      `${shortSha ? ` at \`${shortSha}\`` : ''}`,
    `**Run conclusion:** ${describeConclusion(runConclusion)} (required: \`success\`)`,
    '',
    '| Expected job | Conclusion |',
    '| --- | --- |',
    ...rows.map(([name, conclusion]) => `| ${name} | ${conclusion} |`),
    '',
    ignoredNames.length > 0
      ? `Ignored jobs (not required by this gate): ` +
        `${ignoredNames.map((name) => `\`${name}\``).join(', ')}`
      : 'Ignored jobs (not required by this gate): none',
  ];

  if (failures.length > 0) {
    header.push('', '**Failures**', ...failures.map((reason) => `- ${reason}`));
  }

  const ok = failures.length === 0;
  return {
    ok,
    conclusion: ok ? 'success' : 'failure',
    checkName,
    title: `${checkName} ${ok ? 'passed' : 'failed'}${shortSha ? ` on ${shortSha}` : ''}`,
    summary: header.join('\n'),
    failures,
  };
}

/**
 * Read the expected job display names for one workflow.
 *
 * Throws instead of returning an empty list: "no expectations" must never look
 * like "everything passed".
 */
export function loadExpectedContexts(parsedJson, workflowName) {
  if (parsedJson === null || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
    throw new Error('The required contexts file must contain a JSON object.');
  }
  if (!Object.hasOwn(parsedJson, workflowName)) {
    throw new Error(
      `The required contexts file has no entry for the workflow "${workflowName}". ` +
        'Add one, with the job display names that must succeed, or the gate cannot fail closed.',
    );
  }
  const names = parsedJson[workflowName];
  if (!Array.isArray(names)) {
    throw new Error(
      `The required contexts entry for the workflow "${workflowName}" is not a list of job names.`,
    );
  }
  if (names.length === 0) {
    throw new Error(
      `The required contexts entry for the workflow "${workflowName}" is empty. ` +
        'An empty list cannot fail closed.',
    );
  }
  for (const name of names) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(
        `The required contexts entry for the workflow "${workflowName}" ` +
          'contains a value that is not a job name.',
      );
    }
  }
  return names;
}

// ------------------------------------------------------------------- cli

/** Values the CLI learns as it runs. The error path reads them. */
const state = {
  apiUrl: DEFAULT_API_URL,
  repo: undefined,
  token: undefined,
  headSha: undefined,
  checkName: 'gate',
  dryRun: false,
};

function log(message) {
  console.log(message);
}

function warn(message) {
  console.error(message);
}

function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `${name} is not set. The gate needs it to read the run's jobs and to publish the check run.`,
    );
  }
  return value;
}

async function fetchJson(url, { method = 'GET', body } = {}) {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${state.token}`,
    'x-github-api-version': API_VERSION,
    'user-agent': 'ci-gate',
  };
  if (body !== undefined) headers['content-type'] = 'application/json';

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    // Node hides the socket error in `cause`; the cause is what a CI log needs.
    const cause = error?.cause?.message ?? error?.message ?? error;
    throw new Error(`${method} ${url} failed: ${cause}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${method} ${url} returned HTTP ${response.status}: ${text.slice(0, 500)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${method} ${url} returned a response that is not JSON.`);
  }
}

async function readEvent(eventPath) {
  let text;
  try {
    text = await readFile(eventPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Cannot read the event file at "${eventPath}": ${error?.message ?? error}. ` +
        'The gate needs the workflow_run payload.',
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`The event file at "${eventPath}" is not JSON.`);
  }
}

async function readRequiredContexts(contextsPath, workflowName) {
  let text;
  try {
    text = await readFile(contextsPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Cannot read the required contexts file at "${contextsPath}": ${error?.message ?? error}`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`The required contexts file at "${contextsPath}" is not JSON.`);
  }
  return loadExpectedContexts(parsed, workflowName);
}

async function fetchRunJobs(runId) {
  const jobs = [];
  let totalCount = null;

  for (let page = 1; page <= MAX_JOB_PAGES; page += 1) {
    const payload = await fetchJson(
      `${state.apiUrl}/repos/${state.repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}`,
    );
    const pageJobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
    if (typeof payload?.total_count === 'number') totalCount = payload.total_count;
    jobs.push(...pageJobs);
    log(`Read ${pageJobs.length} job(s) from page ${page}.`);
    if (pageJobs.length === 0) break;
    if (totalCount !== null && jobs.length >= totalCount) break;
    if (page === MAX_JOB_PAGES) {
      throw new Error(`The run has more than ${MAX_JOB_PAGES} pages of jobs. The gate stops.`);
    }
  }

  return jobs;
}

/**
 * Resolve the pull request whose head is this commit. A push to the default
 * branch has no such pull request, and there is nothing to gate.
 */
async function resolvePullRequestNumber(workflowRun) {
  const fromEvent = Array.isArray(workflowRun?.pull_requests) ? workflowRun.pull_requests : [];
  const eventPull = fromEvent.find((pull) => pull?.number);
  if (eventPull) return eventPull.number;

  const pulls = await fetchJson(
    `${state.apiUrl}/repos/${state.repo}/commits/${state.headSha}/pulls`,
  );
  const openPull = (Array.isArray(pulls) ? pulls : []).find(
    (pull) => pull?.state === 'open' && pull?.number,
  );
  return openPull?.number ?? null;
}

async function publishCheck({ ok, title, summary }) {
  const payload = {
    name: state.checkName,
    head_sha: state.headSha,
    status: 'completed',
    conclusion: ok ? 'success' : 'failure',
    output: { title, summary },
  };

  if (state.dryRun) {
    log(
      `DRY_RUN is set. The gate would publish this check run:\n` +
        JSON.stringify(payload, null, 2),
    );
    return;
  }

  await fetchJson(`${state.apiUrl}/repos/${state.repo}/check-runs`, {
    method: 'POST',
    body: payload,
  });
  log(`Published the check run "${state.checkName}" with conclusion "${payload.conclusion}".`);
}

async function main() {
  state.token = requireEnv('GITHUB_TOKEN');
  state.repo = requireEnv('GITHUB_REPOSITORY');
  const eventPath = requireEnv('GITHUB_EVENT_PATH');
  const contextsPath = process.env.REQUIRED_CONTEXTS_FILE || DEFAULT_CONTEXTS_FILE;
  if (process.env.GITHUB_API_URL) state.apiUrl = process.env.GITHUB_API_URL.replace(/\/+$/, '');
  state.dryRun = process.env.DRY_RUN === '1';

  const event = await readEvent(eventPath);
  const run = event?.workflow_run;
  if (!run || typeof run !== 'object') {
    throw new Error(
      'The event file has no workflow_run object. The gate only runs on workflow_run events.',
    );
  }
  if (typeof run.head_sha !== 'string' || run.head_sha === '') {
    throw new Error('The workflow_run payload has no head_sha. The gate cannot publish a check.');
  }
  if (!Number.isInteger(run.id)) {
    throw new Error('The workflow_run payload has no run id. The gate cannot read the run jobs.');
  }

  state.headSha = run.head_sha;
  const workflowName = typeof run.name === 'string' && run.name !== '' ? run.name : null;
  state.checkName = `gate (${workflowName ?? 'unknown workflow'})`;
  log(
    `Gate for the "${workflowName ?? 'unknown workflow'}" workflow, ` +
      `run ${run.id}, commit ${state.headSha}.`,
  );

  const pullNumber = await resolvePullRequestNumber(run);
  if (pullNumber === null) {
    log(
      `No open pull request is associated with commit ${state.headSha}. ` +
        'This is a push without a pull request, so there is nothing to gate. ' +
        'The gate publishes no check run.',
    );
    return 0;
  }
  log(`The commit belongs to pull request #${pullNumber}.`);

  const expectedJobNames = await readRequiredContexts(contextsPath, workflowName);
  log(
    `Loaded ${expectedJobNames.length} expected job name(s) for "${workflowName}" ` +
      `from ${contextsPath}.`,
  );

  const jobs = await fetchRunJobs(run.id);
  const result = evaluateRun({
    workflowName,
    shortSha: state.headSha.slice(0, 7),
    run,
    jobs,
    expectedJobNames,
  });

  log(result.summary);
  await publishCheck({ ok: result.ok, title: result.title, summary: result.summary });

  if (!result.ok) {
    warn(`The gate blocked pull request #${pullNumber}: ${result.failures.length} failure(s).`);
    return 1;
  }
  log(`The gate passed pull request #${pullNumber}.`);
  return 0;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  const normalise = (path) =>
    process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  return normalise(entry) === normalise(self);
}

if (invokedDirectly()) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch(async (error) => {
      const message = error?.message ?? String(error);
      warn(`\n  ✖ ${message}\n`);

      // Never exit 0 on an internal error: publish a blocking check when we can.
      if (state.token && state.repo && state.headSha) {
        try {
          await publishCheck({
            ok: false,
            title: `${state.checkName} could not complete`,
            summary:
              'The gate failed closed because of an internal error:\n\n' +
              `    ${message}\n\n` +
              'A broken verifier must not look like a pass.',
          });
        } catch (publishError) {
          warn(
            `  ✖ Cannot publish the failure check run: ${publishError?.message ?? publishError}`,
          );
        }
      } else {
        warn('  ✖ No head commit is known, so the gate cannot publish a failure check run.');
      }
      process.exit(1);
    });
}
