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
 * The core (`evaluateRun`, `loadWorkflowExpectations`) is pure. The CLI reads
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
  'neutral',
]);

/** A run has far fewer pages than this. Exceeding it means the API misbehaved. */
const MAX_JOB_PAGES = 20;

// ------------------------------------------------------------------ core

/**
 * Render a conclusion for a log line or the summary table. A missing value is
 * `none`, and the failure lines quote the value so that an empty string stays
 * visible next to a real one.
 */
function formatConclusion(value, { quote = false } = {}) {
  if (value === undefined || value === null || value === '') return 'none';
  return quote ? `"${value}"` : String(value);
}

const describeConclusion = (value) => formatConclusion(value, { quote: true });
const tableConclusion = (value) => formatConclusion(value);

/**
 * Decide the gate result from a completed workflow run.
 *
 * Every rule fails closed: an unexpected shape, a missing conclusion, a skipped
 * job, a declared step that is missing or did not conclude `success`, or a
 * failed step inside a job that reports success all block the merge.
 *
 * @returns {{ ok: boolean, conclusion: 'success'|'failure', checkName: string,
 *   title: string, summary: string, failures: string[] }}
 */
export function evaluateRun({
  workflowName,
  shortSha,
  run,
  jobs,
  expectedJobNames,
  requiredStepNames,
}) {
  const checkName = `gate (${workflowName})`;
  const failures = [];
  const jobList = Array.isArray(jobs) ? jobs : [];
  const expected = Array.isArray(expectedJobNames) ? expectedJobNames : [];
  const requiredSteps = Array.isArray(requiredStepNames) ? requiredStepNames : [];

  const runConclusion = run?.conclusion ?? null;
  if (runConclusion !== 'success') {
    failures.push(
      `the run conclusion is ${describeConclusion(runConclusion)}; the gate requires "success"`,
    );
  }
  if (expected.length === 0) {
    failures.push('no expected job names were supplied, so the gate cannot fail closed');
  }
  if (requiredSteps.length === 0) {
    // Without a declared step, a job that skips its test or analysis step still
    // concludes `success`, and the gate would accept it.
    failures.push('no required step names were supplied, so the gate cannot fail closed');
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

    // A job can keep its `success` conclusion while the step that carries the
    // required work is skipped, renamed, or deleted, and a pull request owns its
    // workflow file. Only the declared steps prove the work ran.
    for (const match of matches) {
      const steps = Array.isArray(match?.steps) ? match.steps : [];

      for (const required of requiredSteps) {
        const found = steps.filter((candidate) => candidate?.name === required);
        if (found.length === 0) {
          failures.push(
            `the required step ${describeConclusion(required)} is missing from the ` +
              `expected job "${name}"`,
          );
          continue;
        }
        if (found.length > 1) {
          failures.push(
            `the required step ${describeConclusion(required)} appears more than once ` +
              `(${found.length} times) in the expected job "${name}"; the gate needs exactly one`,
          );
        }
        for (const foundStep of found) {
          if (foundStep?.conclusion !== 'success') {
            failures.push(
              `the required step ${describeConclusion(required)} in the expected job ` +
                `"${name}" concluded ${describeConclusion(foundStep?.conclusion)}; ` +
                'the gate requires "success"',
            );
          }
        }
      }

      // An undeclared step can still fail while the job conclusion stays
      // `success`, for example a `continue-on-error` step. A skipped undeclared
      // step is allowed: the conditional artifact upload is one.
      for (const step of steps) {
        if (requiredSteps.includes(step?.name)) continue;
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
    `**Required steps:** ${requiredSteps.map((step) => `\`${step}\``).join(', ')} ` +
      '(each must conclude `success` in every listed job)',
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
 * Validate one list of display names inside a workflow entry.
 *
 * Throws instead of returning an empty list: "nothing to check" must never look
 * like "everything passed".
 */
function readNameList(value, workflowName, key) {
  if (!Array.isArray(value)) {
    throw new Error(
      `The required contexts entry for the workflow "${workflowName}" has no "${key}" list.`,
    );
  }
  if (value.length === 0) {
    throw new Error(
      `The "${key}" list for the workflow "${workflowName}" is empty. ` +
        'An empty list cannot fail closed.',
    );
  }
  for (const name of value) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(
        `The "${key}" list for the workflow "${workflowName}" ` +
          'contains a value that is not a name.',
      );
    }
  }
  return value;
}

/**
 * Read the expected job display names and the required step names for one
 * workflow.
 *
 * The required steps are the work whose execution the job conclusion cannot
 * prove: a pull request can give `Run the test suite` an `if:` that skips it,
 * and the job still concludes `success`.
 *
 * @returns {{ jobNames: string[], requiredSteps: string[] }}
 */
export function loadWorkflowExpectations(parsedJson, workflowName) {
  if (parsedJson === null || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
    throw new Error('The required contexts file must contain a JSON object.');
  }
  if (!Object.hasOwn(parsedJson, workflowName)) {
    throw new Error(
      `The required contexts file has no entry for the workflow "${workflowName}". ` +
        'Add one, with the job display names and the required step names, or the gate ' +
        'cannot fail closed.',
    );
  }
  const entry = parsedJson[workflowName];
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(
      `The required contexts entry for the workflow "${workflowName}" is not an object ` +
        'with "jobs" and "requiredSteps".',
    );
  }
  return {
    jobNames: readNameList(entry.jobs, workflowName, 'jobs'),
    requiredSteps: readNameList(entry.requiredSteps, workflowName, 'requiredSteps'),
  };
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

async function readWorkflowExpectations(contextsPath, workflowName) {
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
  return loadWorkflowExpectations(parsed, workflowName);
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
 * Decide whether a run needs a check on a pull request.
 *
 * A push to the default branch has no pull request, so there is nothing to gate
 * and the gate stays silent. A `pull_request` run must resolve to a pull
 * request: when it does not, the gate fails closed instead of leaving the pull
 * request blocked with no diagnosis. That case is reachable for a fork pull
 * request, where the commit-to-pull-request lookup can miss.
 *
 * @returns {{ post: boolean, reason: string }}
 */
export function decideNoPullRequest({ event, pullNumbers }) {
  const found = Array.isArray(pullNumbers) && pullNumbers.some((number) => number);
  if (found) return { post: true, reason: 'a pull request was resolved' };
  const fromPullRequest = event === 'pull_request' || event === 'pull_request_target';
  return fromPullRequest
    ? {
        post: true,
        reason:
          'the run belongs to a pull request, but no pull request resolved for its head commit. ' +
          'The gate fails closed so that the missing result is visible.',
      }
    : { post: false, reason: 'the run is a push without a pull request, so there is nothing to gate' };
}

/**
 * Resolve the pull request whose head is this commit.
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
  const decision = decideNoPullRequest({ event: run.event, pullNumbers: [pullNumber] });
  if (!decision.post) {
    log(
      `No open pull request is associated with commit ${state.headSha}. ` +
        `${decision.reason}. The gate publishes no check run.`,
    );
    return 0;
  }
  if (pullNumber === null) {
    warn(`The gate cannot resolve a pull request: ${decision.reason}`);
    await publishCheck({
      ok: false,
      title: `${state.checkName} could not resolve a pull request`,
      summary:
        'The gate failed closed because it could not resolve the pull request for ' +
        `commit \`${state.headSha}\`. ${decision.reason}`,
    });
    return 1;
  }
  log(`The commit belongs to pull request #${pullNumber}.`);

  const { jobNames, requiredSteps } = await readWorkflowExpectations(
    contextsPath,
    workflowName,
  );
  log(
    `Loaded ${jobNames.length} expected job name(s) and ${requiredSteps.length} required ` +
      `step(s) for "${workflowName}" from ${contextsPath}.`,
  );

  const jobs = await fetchRunJobs(run.id);
  const result = evaluateRun({
    workflowName,
    shortSha: state.headSha.slice(0, 7),
    run,
    jobs,
    expectedJobNames: jobNames,
    requiredStepNames: requiredSteps,
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
