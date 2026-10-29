/**
 * Behaviour tests for the fail-closed check gate (scripts/ci-gate.mjs).
 *
 * GitHub reports a skipped required job as a success, so the gate reads the
 * conclusions of the triggering run's jobs and steps and publishes its own
 * check. These tests pin the fail-closed rules and the CLI transport.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  decideNoPullRequest,
  evaluateRun,
  loadWorkflowExpectations,
} from '../scripts/ci-gate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'ci-gate.mjs');

const EXPECTED = ['runtime (node 24, npm 12)', 'runtime (node 26, npm 12)'];

/** Work this fixture declares as required in every expected job. */
const REQUIRED_STEPS = ['Run tests'];

function step(name, conclusion) {
  return { name, conclusion };
}

function job(name, conclusion, steps = []) {
  return { name, conclusion, steps };
}

function allPassingJobs() {
  return [
    job('runtime (node 24, npm 12)', 'success', [step('Run tests', 'success')]),
    job('runtime (node 26, npm 12)', 'success', [step('Run tests', 'success')]),
  ];
}

function evaluate(overrides = {}) {
  return evaluateRun({
    workflowName: 'CI',
    shortSha: 'abc1234',
    run: { name: 'CI', conclusion: 'success', head_sha: 'abc1234deadbeef' },
    jobs: allPassingJobs(),
    expectedJobNames: EXPECTED,
    requiredStepNames: REQUIRED_STEPS,
    ...overrides,
  });
}

describe('evaluateRun', () => {
  it('passes when the run and every expected job completed successfully', () => {
    const result = evaluate();

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.conclusion).toBe('success');
  });

  it('fails a job with a failure conclusion', () => {
    const jobs = allPassingJobs();
    jobs[0] = job('runtime (node 24, npm 12)', 'failure', [step('Run tests', 'failure')]);

    const result = evaluate({ jobs });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/runtime \(node 24, npm 12\)[\s\S]*failure/);
  });

  it('fails a skipped job even though GitHub reports it as a success', () => {
    const jobs = allPassingJobs();
    jobs[1] = job('runtime (node 26, npm 12)', 'skipped', [step('Run tests', 'skipped')]);

    const result = evaluate({ jobs });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/runtime \(node 26, npm 12\)[\s\S]*skipped/);
  });

  it('fails a cancelled job', () => {
    const jobs = allPassingJobs();
    jobs[0] = job('runtime (node 24, npm 12)', 'cancelled', [step('Run tests', 'cancelled')]);

    const result = evaluate({ jobs });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/cancelled/);
  });

  it('fails a neutral job', () => {
    const jobs = allPassingJobs();
    jobs[0] = job('runtime (node 24, npm 12)', 'neutral', [step('Run tests', 'success')]);

    const result = evaluate({ jobs });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/neutral/);
  });

  it('fails when an expected job is missing from the run', () => {
    const result = evaluate({ jobs: [allPassingJobs()[0]] });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/runtime \(node 26, npm 12\)[\s\S]*missing/);
  });

  it('fails when an expected job appears more than once', () => {
    const jobs = [...allPassingJobs(), job('runtime (node 24, npm 12)', 'success')];

    const result = evaluate({ jobs });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/runtime \(node 24, npm 12\)[\s\S]*more than once/);
  });

  it('fails when the run conclusion is failure even though every job succeeded', () => {
    const result = evaluate({ run: { name: 'CI', conclusion: 'failure', head_sha: 'abc1234' } });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/run conclusion/i);
  });

  it('fails when the run conclusion is missing', () => {
    expect(evaluate({ run: { name: 'CI', head_sha: 'abc1234' } }).ok).toBe(false);
  });

  it('fails a job masked as success that contains a failed step (continue-on-error)', () => {
    const jobs = allPassingJobs();
    jobs[1] = job('runtime (node 26, npm 12)', 'success', [
      step('Run tests', 'success'),
      step('Run optional check', 'failure'),
    ]);

    const result = evaluate({ jobs });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/optional check[\s\S]*failure/);
  });

  it('fails a job that contains a neutral step', () => {
    const jobs = allPassingJobs();
    jobs[1] = job('runtime (node 26, npm 12)', 'success', [
      step('Run tests', 'success'),
      step('Run optional check', 'neutral'),
    ]);

    const result = evaluate({ jobs });

    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toMatch(/optional check[\s\S]*neutral/);
  });

  it('fails when a required step is skipped inside a successful job', () => {
    const jobs = allPassingJobs();
    jobs[0] = job('runtime (node 24, npm 12)', 'success', [step('Run tests', 'skipped')]);

    const result = evaluate({ jobs });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/required step "Run tests"[\s\S]*skipped/);
  });

  it('fails when a required step is absent from a successful job', () => {
    const jobs = allPassingJobs();
    jobs[1] = job('runtime (node 26, npm 12)', 'success', [
      step('Upload the production bundle', 'success'),
    ]);

    const result = evaluate({ jobs });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/required step "Run tests"[\s\S]*missing/);
  });

  it('fails when a required step appears more than once', () => {
    const jobs = allPassingJobs();
    jobs[0] = job('runtime (node 24, npm 12)', 'success', [
      step('Run tests', 'success'),
      step('Run tests', 'success'),
    ]);

    const result = evaluate({ jobs });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/required step "Run tests"[\s\S]*more than once/);
  });

  it('fails when no required steps are declared', () => {
    const result = evaluate({ requiredStepNames: [] });

    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toMatch(/no required step names/i);
  });

  it('passes when a step the gate does not declare is skipped', () => {
    // The conditional artifact upload may legitimately skip; declaring it would
    // turn every ordinary pull request red.
    const jobs = allPassingJobs();
    jobs[0] = job('runtime (node 24, npm 12)', 'success', [
      step('Run tests', 'success'),
      step('Upload the production bundle', 'skipped'),
    ]);

    expect(evaluate({ jobs }).ok).toBe(true);
  });

  it('ignores jobs that are not required, and lists them in the summary', () => {
    const jobs = [...allPassingJobs(), job('another workflow job', 'failure', [])];

    const result = evaluate({ jobs });

    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/Ignored jobs/);
    expect(result.summary).toMatch(/another workflow job/);
  });

  it('formats the check name from the workflow name', () => {
    expect(evaluate().checkName).toBe('gate (CI)');
    expect(evaluate({ workflowName: 'Dependency review' }).checkName).toBe(
      'gate (Dependency review)',
    );
  });

  it('summarises every expected job with its conclusion', () => {
    const jobs = allPassingJobs();
    jobs[0] = job('runtime (node 24, npm 12)', 'skipped', []);

    const { summary } = evaluate({ jobs });

    expect(summary).toMatch(/\| Expected job \| Conclusion \|/);
    expect(summary).toMatch(/\| runtime \(node 24, npm 12\) \| skipped \|/);
    expect(summary).toMatch(/\| runtime \(node 26, npm 12\) \| success \|/);
  });
});

describe('loadWorkflowExpectations', () => {
  const parsed = {
    CI: { jobs: ['runtime (node 24, npm 12)'], requiredSteps: ['Run tests'] },
    'Dependency review': {
      jobs: ['review dependency changes'],
      requiredSteps: ['Review dependency changes'],
    },
  };

  it('returns the job names and the required steps for a known workflow', () => {
    expect(loadWorkflowExpectations(parsed, 'Dependency review')).toEqual({
      jobNames: ['review dependency changes'],
      requiredSteps: ['Review dependency changes'],
    });
  });

  it('throws for an unknown workflow instead of treating it as nothing to check', () => {
    expect(() => loadWorkflowExpectations(parsed, 'Unknown workflow')).toThrow(/Unknown workflow/);
  });

  it('throws when the workflow declares no job names', () => {
    expect(() => loadWorkflowExpectations({ CI: { jobs: [], requiredSteps: ['Run tests'] } }, 'CI'))
      .toThrow(/CI/);
  });

  it('throws when the workflow declares no required steps', () => {
    expect(() =>
      loadWorkflowExpectations({ CI: { jobs: ['runtime (node 24, npm 12)'], requiredSteps: [] } }, 'CI'),
    ).toThrow(/CI/);
  });

  it('throws for the bare job-name list the file used to hold', () => {
    expect(() => loadWorkflowExpectations({ CI: ['runtime (node 24, npm 12)'] }, 'CI')).toThrow(
      /requiredSteps/,
    );
  });

  it('throws when a required step is not a name', () => {
    expect(() =>
      loadWorkflowExpectations({ CI: { jobs: ['runtime (node 24, npm 12)'], requiredSteps: [''] } }, 'CI'),
    ).toThrow(/CI/);
  });
});

// -------------------------------------------------------------------- CLI

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((close) => close()));
});

function eventPayload(overrides = {}) {
  return {
    workflow_run: {
      id: 4242,
      name: 'CI',
      conclusion: 'success',
      head_sha: 'abc1234deadbeef',
      pull_requests: [{ number: 7 }],
      ...overrides,
    },
  };
}

function passingJobPages() {
  return [
    [
      {
        name: 'runtime (node 24, npm 12)',
        conclusion: 'success',
        steps: [{ name: 'Run tests', conclusion: 'success' }],
      },
      {
        name: 'runtime (node 26, npm 12)',
        conclusion: 'success',
        steps: [{ name: 'Run tests', conclusion: 'success' }],
      },
    ],
  ];
}

/** Minimal stand-in for the GitHub REST API, answering from fixed pages. */
async function startStubApi({ jobPages = passingJobPages(), associatedPulls = [] } = {}) {
  const state = { requests: [], checkRuns: [] };

  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const url = new URL(req.url, 'http://stub.local');
    state.requests.push({ method: req.method, pathname: url.pathname, body });
    const json = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };

    if (req.method === 'GET' && url.pathname === '/repos/x/y/actions/runs/4242/jobs') {
      const page = Number(url.searchParams.get('page') ?? '1');
      return json(200, { total_count: jobPages.flat().length, jobs: jobPages[page - 1] ?? [] });
    }
    if (req.method === 'GET' && /^\/repos\/x\/y\/commits\/[^/]+\/pulls$/.test(url.pathname)) {
      return json(200, associatedPulls);
    }
    if (req.method === 'POST' && url.pathname === '/repos/x/y/check-runs') {
      state.checkRuns.push(JSON.parse(body));
      return json(201, { id: 1 });
    }
    return json(404, { message: 'not found' });
  });

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  servers.push(() => new Promise((done) => server.close(done)));
  return { state, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

/** Runs the CLI with only the environment the gate reads. */
function runCli({ env = {}, cwd = ROOT } = {}) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [SCRIPT], {
      cwd,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => done({ code, stdout, stderr }));
  });
}

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'ci-gate-'));
}

async function tempEventFile(payload) {
  const path = join(await tempDir(), 'event.json');
  await writeFile(path, JSON.stringify(payload), 'utf8');
  return path;
}

/** A contexts file that matches the fixture jobs above. */
async function tempContextsFile() {
  const path = join(await tempDir(), 'required-contexts.json');
  await writeFile(
    path,
    JSON.stringify({
      CI: { jobs: EXPECTED, requiredSteps: REQUIRED_STEPS },
      'Dependency review': {
        jobs: ['review dependency changes'],
        requiredSteps: ['Review dependency changes'],
      },
    }),
    'utf8',
  );
  return path;
}

describe('decideNoPullRequest', () => {
  it('stays silent for a push that has no pull request', () => {
    expect(decideNoPullRequest({ event: 'push', pullNumbers: [] }).post).toBe(false);
    expect(decideNoPullRequest({ event: 'push', pullNumbers: [null] }).post).toBe(false);
  });

  it('fails closed when a pull request run resolves to no pull request', () => {
    const decision = decideNoPullRequest({ event: 'pull_request', pullNumbers: [null] });

    expect(decision.post).toBe(true);
    expect(decision.reason).toMatch(/fails closed/i);
  });

  it('posts when a pull request resolves', () => {
    expect(decideNoPullRequest({ event: 'pull_request', pullNumbers: [42] }).post).toBe(true);
  });
});

/** Every job name the repository's contexts file declares, in file order. */
function jobNamesOf(parsed) {
  return Object.values(parsed).flatMap((entry) => entry.jobs);
}

describe('the repository required contexts', () => {
  it('lists the six CI jobs, the CodeQL job, and the dependency-review job', async () => {
    const parsed = JSON.parse(
      await readFile(join(ROOT, '.github', 'required-contexts.json'), 'utf8'),
    );

    const ci = loadWorkflowExpectations(parsed, 'CI');
    expect(ci.jobNames).toHaveLength(6);
    expect(ci.jobNames).toContain('runtime (node 24.15.0, npm latest 12)');
    expect(ci.jobNames).toContain('runtime (node 26.0.0, npm 12.0.0)');
    expect(ci.requiredSteps).toEqual([
      'Install dependencies',
      'Type-check',
      'Run the test suite',
      'Build the production bundle',
    ]);
    expect(loadWorkflowExpectations(parsed, 'CodeQL')).toEqual({
      jobNames: ['analyze javascript-typescript'],
      requiredSteps: ['Initialize CodeQL', 'Analyze'],
    });
    expect(loadWorkflowExpectations(parsed, 'Dependency review')).toEqual({
      jobNames: ['review dependency changes'],
      requiredSteps: ['Review dependency changes'],
    });
  });

  it('declares only steps that its own workflow file really runs', async () => {
    const parsed = JSON.parse(
      await readFile(join(ROOT, '.github', 'required-contexts.json'), 'utf8'),
    );
    const files = {
      CI: 'ci.yml',
      CodeQL: 'codeql.yml',
      'Dependency review': 'dependency-review.yml',
    };

    for (const [workflow, file] of Object.entries(files)) {
      const text = await readFile(join(ROOT, '.github', 'workflows', file), 'utf8');
      for (const name of loadWorkflowExpectations(parsed, workflow).requiredSteps) {
        expect(text).toContain(`name: ${name}`);
      }
    }
  });

  it('ties ci.yml, required-contexts.json, and the ruleset payload together', async () => {
    const ci = await readFile(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const parsed = JSON.parse(
      await readFile(join(ROOT, '.github', 'required-contexts.json'), 'utf8'),
    );
    const ruleset = JSON.parse(
      await readFile(join(ROOT, '.github', 'rulesets', 'main-merge-gate.json'), 'utf8'),
    );

    const codeql = await readFile(join(ROOT, '.github', 'workflows', 'codeql.yml'), 'utf8');
    const dependencyReview = await readFile(
      join(ROOT, '.github', 'workflows', 'dependency-review.yml'),
      'utf8',
    );

    const statusChecks = ruleset.rules.find((rule) => rule.type === 'required_status_checks');
    const contexts = statusChecks.parameters.required_status_checks.map((entry) => entry.context);

    // Every CI job the gate expects must exist in ci.yml under that exact name.
    for (const name of loadWorkflowExpectations(parsed, 'CI').jobNames) {
      expect(ci).toContain(`name: ${name}`);
      expect(contexts).toContain(name);
    }
    // The other two source workflows declare the job names the gate expects.
    for (const name of loadWorkflowExpectations(parsed, 'CodeQL').jobNames) {
      expect(codeql).toContain(name);
    }
    for (const name of loadWorkflowExpectations(parsed, 'Dependency review').jobNames) {
      expect(dependencyReview).toContain(name);
    }
    // Every expected job of every workflow must be a required context.
    for (const name of jobNamesOf(parsed)) expect(contexts).toContain(name);
    // The three gate checks are required and named after their source workflow.
    for (const workflow of Object.keys(parsed)) expect(contexts).toContain(`gate (${workflow})`);
    // Every required context must come from the GitHub Actions app.
    for (const entry of statusChecks.parameters.required_status_checks) {
      expect(entry.integration_id).toBe(15368);
    }
    expect(contexts).toHaveLength(11);
  });

  it('does not repeat a job name across workflows', async () => {
    const parsed = JSON.parse(
      await readFile(join(ROOT, '.github', 'required-contexts.json'), 'utf8'),
    );
    const all = jobNamesOf(parsed);

    expect(new Set(all).size).toBe(all.length);
  });
});

describe('ci-gate CLI', () => {
  it('publishes a failure check when a pull request run resolves no pull request', async () => {
    const api = await startStubApi({ associatedPulls: [] });
    const eventPath = await tempEventFile(eventPayload({ event: 'pull_request', pull_requests: [] }));
    const contextsPath = await tempContextsFile();

    const result = await runCli({
      env: {
        GITHUB_TOKEN: 'placeholder-not-a-real-token',
        GITHUB_REPOSITORY: 'x/y',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_API_URL: api.baseUrl,
        REQUIRED_CONTEXTS_FILE: contextsPath,
      },
    });

    expect(result.code).toBe(1);
    expect(api.state.checkRuns).toHaveLength(1);
    expect(api.state.checkRuns[0]).toMatchObject({
      name: 'gate (CI)',
      conclusion: 'failure',
      head_sha: 'abc1234deadbeef',
    });
    expect(api.state.checkRuns[0].output.summary).toMatch(/could not resolve the pull request/i);
  });

  it('publishes no check for a push that has no pull request', async () => {
    const api = await startStubApi({ associatedPulls: [] });
    const eventPath = await tempEventFile(eventPayload({ event: 'push', pull_requests: [] }));
    const contextsPath = await tempContextsFile();

    const result = await runCli({
      env: {
        GITHUB_TOKEN: 'placeholder-not-a-real-token',
        GITHUB_REPOSITORY: 'x/y',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_API_URL: api.baseUrl,
        REQUIRED_CONTEXTS_FILE: contextsPath,
      },
    });

    expect(result.code).toBe(0);
    expect(api.state.checkRuns).toHaveLength(0);
  });

  it('exits 1 with a clear message when GITHUB_TOKEN is absent', async () => {
    const eventPath = await tempEventFile(eventPayload());
    const contextsPath = await tempContextsFile();

    const result = await runCli({
      env: {
        GITHUB_REPOSITORY: 'x/y',
        GITHUB_EVENT_PATH: eventPath,
        REQUIRED_CONTEXTS_FILE: contextsPath,
        DRY_RUN: '1',
      },
    });

    expect(result.code).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/GITHUB_TOKEN/);
  });

  it('exits 1 with a clear message when the event file is missing', async () => {
    const result = await runCli({
      env: {
        GITHUB_TOKEN: 'placeholder-not-a-real-token',
        GITHUB_REPOSITORY: 'x/y',
        GITHUB_EVENT_PATH: join(tmpdir(), 'ci-gate-does-not-exist', 'event.json'),
      },
    });

    expect(result.code).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/event/i);
  });

  it('publishes a successful gate check and exits 0 when every job succeeded', async () => {
    const api = await startStubApi();
    const eventPath = await tempEventFile(eventPayload());
    const contextsPath = await tempContextsFile();

    const result = await runCli({
      env: {
        GITHUB_TOKEN: 'placeholder-not-a-real-token',
        GITHUB_REPOSITORY: 'x/y',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_API_URL: api.baseUrl,
        REQUIRED_CONTEXTS_FILE: contextsPath,
      },
    });

    expect(result.code).toBe(0);
    expect(api.state.checkRuns).toHaveLength(1);
    const posted = api.state.checkRuns[0];
    expect(posted.name).toBe('gate (CI)');
    expect(posted.head_sha).toBe('abc1234deadbeef');
    expect(posted.status).toBe('completed');
    expect(posted.conclusion).toBe('success');
    expect(posted.output.summary).toMatch(/\| Expected job \| Conclusion \|/);
  });

  it('publishes a failing gate check and exits 1 when a required job was skipped', async () => {
    const api = await startStubApi({
      jobPages: [
        [
          {
            name: 'runtime (node 24, npm 12)',
            conclusion: 'success',
            steps: [{ name: 'Run tests', conclusion: 'success' }],
          },
          {
            name: 'runtime (node 26, npm 12)',
            conclusion: 'skipped',
            steps: [{ name: 'Run tests', conclusion: 'skipped' }],
          },
        ],
      ],
    });
    const eventPath = await tempEventFile(eventPayload());
    const contextsPath = await tempContextsFile();

    const result = await runCli({
      env: {
        GITHUB_TOKEN: 'placeholder-not-a-real-token',
        GITHUB_REPOSITORY: 'x/y',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_API_URL: api.baseUrl,
        REQUIRED_CONTEXTS_FILE: contextsPath,
      },
    });

    expect(result.code).toBe(1);
    expect(api.state.checkRuns).toHaveLength(1);
    expect(api.state.checkRuns[0].conclusion).toBe('failure');
    expect(api.state.checkRuns[0].output.summary).toMatch(/skipped/);
  });

  it('publishes a failing check and exits 1 when a required step was skipped', async () => {
    // The job concludes success, so only the declared step can catch this.
    const api = await startStubApi({
      jobPages: [
        [
          {
            name: 'runtime (node 24, npm 12)',
            conclusion: 'success',
            steps: [{ name: 'Run tests', conclusion: 'skipped' }],
          },
          {
            name: 'runtime (node 26, npm 12)',
            conclusion: 'success',
            steps: [{ name: 'Run tests', conclusion: 'success' }],
          },
        ],
      ],
    });
    const eventPath = await tempEventFile(eventPayload());
    const contextsPath = await tempContextsFile();

    const result = await runCli({
      env: {
        GITHUB_TOKEN: 'placeholder-not-a-real-token',
        GITHUB_REPOSITORY: 'x/y',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_API_URL: api.baseUrl,
        REQUIRED_CONTEXTS_FILE: contextsPath,
      },
    });

    expect(result.code).toBe(1);
    expect(api.state.checkRuns).toHaveLength(1);
    expect(api.state.checkRuns[0].conclusion).toBe('failure');
    expect(api.state.checkRuns[0].output.summary).toMatch(/required step "Run tests"/);
  });

  it('fetches every page of jobs', async () => {
    const api = await startStubApi({
      jobPages: [
        [
          {
            name: 'runtime (node 24, npm 12)',
            conclusion: 'success',
            steps: [{ name: 'Run tests', conclusion: 'success' }],
          },
        ],
        [
          {
            name: 'runtime (node 26, npm 12)',
            conclusion: 'success',
            steps: [{ name: 'Run tests', conclusion: 'success' }],
          },
        ],
      ],
    });
    const eventPath = await tempEventFile(eventPayload());
    const contextsPath = await tempContextsFile();

    const result = await runCli({
      env: {
        GITHUB_TOKEN: 'placeholder-not-a-real-token',
        GITHUB_REPOSITORY: 'x/y',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_API_URL: api.baseUrl,
        REQUIRED_CONTEXTS_FILE: contextsPath,
      },
    });

    expect(result.code).toBe(0);
    expect(api.state.checkRuns[0].conclusion).toBe('success');
    expect(api.state.requests.filter((request) => request.pathname.endsWith('/jobs'))).toHaveLength(
      2,
    );
  });

  it('publishes no check and exits 0 when the commit belongs to no pull request', async () => {
    const api = await startStubApi({ associatedPulls: [] });
    const eventPath = await tempEventFile(eventPayload({ pull_requests: [] }));
    const contextsPath = await tempContextsFile();

    const result = await runCli({
      env: {
        GITHUB_TOKEN: 'placeholder-not-a-real-token',
        GITHUB_REPOSITORY: 'x/y',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_API_URL: api.baseUrl,
        REQUIRED_CONTEXTS_FILE: contextsPath,
      },
    });

    expect(result.code).toBe(0);
    expect(api.state.checkRuns).toHaveLength(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/no open pull request/i);
  });

  it('reports an unreachable API, publishes no check, and exits 1', async () => {
    const eventPath = await tempEventFile(eventPayload());
    const contextsPath = await tempContextsFile();
    const api = await startStubApi();

    const result = await runCli({
      env: {
        GITHUB_TOKEN: 'placeholder-not-a-real-token',
        GITHUB_REPOSITORY: 'x/y',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_API_URL: `${api.baseUrl}/wrong-prefix`,
        REQUIRED_CONTEXTS_FILE: contextsPath,
      },
    });

    expect(result.code).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/404|failed|error/i);
  });
});
