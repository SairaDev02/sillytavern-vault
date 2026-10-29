# The main-branch gate

This document is the authoritative description of the merge gate for `main`.
It describes the target state of the gate. It does not prove that the gate
works. The evidence log in section 8 records that proof.

## 1. What the gate is

The gate has three parts:

- Eleven required status check contexts. Six contexts prove the Node and npm
  matrix. One context proves the CodeQL analysis. One context proves the
  dependency review. Three contexts are the gate checks that this document
  describes.
- The `main-protection` ruleset. It blocks a force push to `main` and the
  deletion of `main`.
- The `main-merge-gate` ruleset. It requires a pull request, the eleven
  contexts, and a code-scanning result from the CodeQL tool for the high and
  critical security threshold.

A merge that does not satisfy every part cannot reach `main`. One exception
exists: an administrator can bypass `main-merge-gate` on a pull request.
Section 6 describes that exception.

The rules live in two files, because `bypass_actors` is a ruleset-level
property. The force-push and deletion rules must have no bypass actor. The merge
rules need the administrator bypass.

- `.github/rulesets/main-protection.json`
- `.github/rulesets/main-merge-gate.json`

The payload file is the source. Apply the payload file, then read the applied
rule back. Do not change a rule by hand without a matching payload change.

## 2. The eleven required contexts

| Context | Producing workflow | What it proves |
| --- | --- | --- |
| `runtime (node 24.15.0, npm latest 12)` | `CI` | The locked install, type check, tests, and build pass on the Node 24 floor with the latest npm 12. |
| `runtime (node 24.x latest, npm latest 12)` | `CI` | The same sequence passes on the latest Node 24 release with the latest npm 12. |
| `runtime (node 26.0.0, npm latest 12)` | `CI` | The same sequence passes on the Node 26 floor with the latest npm 12. |
| `runtime (node 26.x latest, npm latest 12)` | `CI` | The same sequence passes on the latest Node 26 release with the latest npm 12. |
| `runtime (node 24.15.0, npm 12.0.0)` | `CI` | The same sequence passes on the Node 24 floor with the npm 12 floor. |
| `runtime (node 26.0.0, npm 12.0.0)` | `CI` | The same sequence passes on the Node 26 floor with the npm 12 floor. |
| `analyze javascript-typescript` | `CodeQL` | The analysis job completed for the pull request commit. It does not prove a clean scan. Section 4 covers findings. |
| `review dependency changes` | `Dependency review` | The dependency review completed for the pull request commit. Section 4 covers the advisory threshold. |
| `gate (CI)` | `Gate` | Every job named in `.github/required-contexts.json` for `CI` concluded `success` on the pull request head commit. |
| `gate (CodeQL)` | `Gate` | The `CodeQL` job concluded `success` on the pull request head commit. |
| `gate (Dependency review)` | `Gate` | The `Dependency review` job concluded `success` on the pull request head commit. |

Each context must come from the GitHub Actions app. The payload pins that app
by `integration_id` 15368. A check from a different app does not satisfy the
rule.

Use the check run name exactly. Do not add the `workflow / job` prefix that the
pull request page shows. GitHub matches the `name` of the check run, and the
composed form never matches. A required context in the composed form therefore
blocks every pull request rather than gating the job that it names. Evidence
row 1 of section 8 records the readback that established this rule.

`.github/required-contexts.json` is the single source for the job names that
each gate check requires. The ruleset payload lists the contexts that the branch
rule enforces, and `tests/ci-gate.test.mjs` fails when the three sources
disagree: the job display names in `ci.yml`, `codeql.yml`, and
`dependency-review.yml`; the entries in `required-contexts.json`; and the contexts
in `main-merge-gate.json`. Change a job name in one place, and that test names the
others. It compares names as text, so a rename that leaves the old name in a
comment still passes. Treat the test as a trip wire, and read the real names back
from a pull request as section 7 step 2 says.

## 3. The fail-closed transport

### 3.1 Why a required job is not sufficient

GitHub reports a skipped job to a required status check as a success. See
[Status checks](https://docs.github.com/en/pull-requests/reference/status-checks).
A skipped required job therefore does not block a merge. A required job inside
the pull request workflow cannot be the safeguard, because the pull request
controls its own workflow file. The pull request can skip the job, weaken it, or
delete it.

The safeguard is a separate workflow, `Gate`. It runs on the `workflow_run`
event. GitHub always takes such a workflow from the default branch:

- The workflow file must exist on the default branch.
- `GITHUB_REF` is the default branch.
- `GITHUB_SHA` is the last commit on the default branch.

See
[Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).

A pull request cannot skip, weaken, or rewrite a workflow that it does not
control. The `Gate` workflow checks out the default branch and runs
`scripts/ci-gate.mjs` from that checkout. It never runs the pull request code,
and it never reads the pull request lockfile.

### 3.2 What the verifier does

The verifier reads the triggering run and the conclusions of its jobs and
steps. It then publishes one check run on the pull request head commit, with
these values:

- The name `gate (<workflow name>)`, for example `gate (CI)`.
- The conclusion `success` or `failure`.
- A summary with a table of each expected job and its conclusion.

A job that the gate does not require is ignored. The summary lists it as
ignored.

The verifier publishes no check when the commit belongs to no open pull
request, for example a push to `main`. Nothing needs a gate in that case.

A `pull_request` run that resolves to no pull request is the exception. The
verifier then publishes a `failure` check, because a silent absence would leave
the pull request blocked with no diagnosis. That case is reachable for a fork
pull request, where the commit-to-pull-request lookup can miss.

### 3.3 What each result does

| Result of the triggering run, job, or step | Gate result |
| --- | --- |
| `success` | The gate can pass. Every other rule must pass too. |
| `failure` | `failure` |
| `skipped` | `failure` |
| `cancelled` | `failure` |
| `timed_out` | `failure` |
| `action_required` | `failure` |
| `stale` | `failure` |
| `neutral` | `failure` |
| A required job name is absent | `failure` |
| A required job name occurs more than once | `failure` |
| A step in a required job is `failure`, `cancelled`, `timed_out`, `action_required`, or `stale` | `failure` |
| No gate check exists for the commit | The merge stays blocked, because a required context is absent. |

The step rule catches a `continue-on-error` step. Such a step can fail while
the job conclusion stays `success`.

The verifier fails closed on its own input too:

- A missing entry for the workflow in `.github/required-contexts.json` is an
  error. An empty list is an error.
- An unreadable file, a failed API request, or invalid JSON is an error.
- After an error, the verifier publishes a `failure` check when it knows the
  head commit. It never exits with success after an error.

### 3.4 The verifier needs its own gate

The `Gate` workflow cannot check itself. Its own behaviour is limited by four
rules:

- The three `gate (...)` contexts are required. If the `Gate` workflow is
  skipped, disabled, deleted, or broken, no check exists, and the merge stays
  blocked.
- The verifier always comes from the default branch. A pull request cannot
  change the code that judges it.
- A change to the verifier needs a human approval before the merge. Section 6
  gives the definition of the verifier.
- The administrator bypass is available only on a pull request. Section 6
  gives the limits of that bypass.

## 4. Findings thresholds

The analysis result and the findings are different conditions. A successful
CodeQL analysis is not a clean scan.

### 4.1 CodeQL

The `code_scanning` rule in `main-merge-gate.json` has these parameters:

- `security_alerts_threshold: high_or_higher`
- `alerts_threshold: none`

The effect is:

- A high or critical **security** finding on the pull request blocks the
  normal merge.
- A medium or low security finding is advisory.
- A non-security finding is advisory.

A suspected false positive needs a human decision. The human authorizes the
dismissal of the pull request alert, and writes the reason on the alert. Then
verify the effect on mergeability. Do not assume that a recorded dismissal
changes the merge result.

A genuine high or critical finding stays blocking. Only the administrator
bypass in section 6 can merge it.

### 4.2 Dependency review

The `Dependency review` workflow uses `fail-on-severity: high`. The effect is:

- A newly introduced high or critical advisory fails the review.
- The review is not a full audit. An existing advisory does not fail it.

There is no routine exception. If you think that the review reported a false
positive, fix the finding or wait for an upstream fix. Only the administrator
bypass in section 6 can merge it.

## 5. Merge policy

- Every change reaches `main` through a pull request. The `pull_request` rule
  blocks a direct push.
- No second reviewer is required by default. The ruleset sets
  `required_approving_review_count` to 0. This keeps the process small.
- The existing merge methods stay available: merge, squash, and rebase.
- The head commit must be up to date with `main`.
  `strict_required_status_checks_policy` is `true`. A result for an old base
  does not authorize the merge.
- The required checks must belong to the current head commit of the pull
  request. A new push needs new results.
- A stale result does not authorize the merge.

## 6. Exceptional access

The `main-merge-gate` ruleset has one bypass actor: the repository
administrator role, with `bypass_mode: pull_request`.

### 6.1 The bypass works on a pull request only

The bypass works on a pull request. A direct push does not use it. A bypass
still produces a pull request record, and the pull request holds the reason.

`actor_id` 5 is the `RepositoryRole` for the repository administrator. Read it
back rather than take the number on trust. `GET .../rulesets/<id>` reports
`"current_user_can_bypass": "pull_requests_only"` for an administrator, and
`"never"` when the caller has no bypass actor. Evidence row 20 of section 8
records that readback for both rulesets.

### 6.2 A human authorizes every bypass

An agent must obtain human authorization before every bypass. Put the reason on
the pull request before the merge. A bypass without a recorded reason is a
process defect, even when the merge succeeds.

### 6.3 The limit is procedural

Credentials are shared. The platform cannot tell a human from an agent. The
human authorization rule is therefore procedural, not a platform identity
boundary. Treat every bypass as a human decision, and record it.

### 6.4 Force push and deletion stay blocked

The `main-protection` ruleset has no bypass actor. For every actor, including an
administrator, a force push to `main` and the deletion of `main` stay blocked.
The pull-request-only bypass does not permit either action.

An exceptional repair of `main` needs an explicit change to the
`main-protection` ruleset. Do not treat a bypass as permission to repair the
branch.

### 6.5 A change to the gate needs a human approval

A human must approve the merge of a pull request that changes a required-check
definition or a threshold. The definition of the gate is:

- `.github/workflows/gate.yml`
- `scripts/ci-gate.mjs`
- `.github/required-contexts.json`
- `.github/rulesets/main-protection.json`
- `.github/rulesets/main-merge-gate.json`
- the `fail-on-severity` input in `.github/workflows/dependency-review.yml`

Shared credentials make this rule procedural too. An agent must ask before it
merges a change to one of these files.

## 7. Bootstrap sequence

The bootstrap protects the first runtime and CI pull request before its normal
merge. Do the steps in this order.

1. Merge the gate pull request. It adds the verifier, the `Gate` workflow, the
   required job names, and the two ruleset payloads. Merge it before any ruleset
   exists, so that no check blocks it.
2. Open a probe pull request. Let the `CI`, `CodeQL`, and `Dependency review`
   workflows complete on it. Read the real job names and the real `gate (...)`
   check names from that pull request.
3. Compare the names that you read with `.github/required-contexts.json` and
   with the eleven contexts in `main-merge-gate.json`. Compare the check run
   `name` values, not the `workflow / job` form that the page shows. Correct
   every difference in a new pull request. Do not guess a name.
4. Apply `main-protection`, then `main-merge-gate`, from the payload files. A
   human authorizes this step. Record the ruleset readback in the evidence log.
5. Read the applied rules back. Confirm the eleven contexts, the strict policy,
   the code-scanning tool, and the bypass mode.
6. Merge the runtime and CI pull request through the gate. This merge is the
   first proof of the normal path. Do not use a bypass for it.

### 7.1 The trust boundary

Step 1 contains the trust boundary. The gate pull request is the prerequisite
trusted component. A human must review it, because no rule can check it: it
defines what the gate accepts. Every later change to the files in section 6.5
is a change to that trusted component. Section 6.5 requires a human approval
for such a change.

The rules are applied only after step 2. A rule that names a context which does
not exist keeps a pull request blocked until the context appears. Read the real
names first.

## 8. Evidence log

Add one row for each verification. Do not add a row for a plan. Use the
evidence class to show what the row proves:

- **live PR**: an observed result on a real pull request in this repository.
- **disposable equivalent**: an observed result on a throwaway repository or
  branch, used where a test on `main` is unsafe.
- **readback only**: the configuration, without an observed pull request
  result.

A row records one observation. The rollout of 2026-10-29 appears below.

| Date | Target (repo@sha / PR #) | Context or rule | Expected | Observed | Evidence class (live PR / disposable equivalent / readback only) |
| --- | --- | --- | --- | --- | --- |
| 2026-10-29 | `sillytavern-vault@88552f0`, PR #47 | The eleven contexts, read from the commit | Eleven names, all from app 15368 | Eleven names; the six runtime jobs and the three `gate (...)` checks from app 15368, plus `analyze javascript-typescript` and `review dependency changes` | readback only |
| 2026-10-29 | PR #47 | All eleven contexts on one commit, base up to date | Merge permitted | `CLEAN` / `MERGEABLE`; six jobs resolved v24.15.0 with npm 12.2.1, v24.22.1 with 12.2.1, v26.0.0 with 12.2.1, v26.12.1 with 12.2.1, v24.15.0 with 12.0.0, v26.0.0 with 12.0.0 | live PR |
| 2026-10-29 | PR #47, ruleset `main-merge-gate` id 26121638 | An extra context that never reports | Merge blocked | `BLOCKED` with every real check green | live ruleset |
| 2026-10-29 | PR #48 `d291d73` | A required runtime job skipped by `if: ${{ false }}` | Blocked, and the leaf check must not satisfy the gate by itself | Leaf `skipped`, run conclusion `success`, `gate (CI)` failure naming the skipped job, merge `BLOCKED` | live PR |
| 2026-10-29 | PR #48 `d291d73`, `gate (CI)` removed from the ruleset | The same skipped job with no gate check required | Merge permitted, which is the defect that the gate exists to close | `UNSTABLE`: merge allowed, with only the non-required `gate (CI)` failing | live ruleset |
| 2026-10-29 | PR #48 `f3d79a3` | A failing step inside a job with `continue-on-error: true` | Blocked | Leaf `failure`; `gate (CI)` failure names the job and the failing step | live PR |
| 2026-10-29 | PR #48 `403ec22` | A required job deleted from the workflow | Blocked | Context absent; `gate (CI)` reports the job as missing from the run; merge `BLOCKED` | live PR |
| 2026-10-29 | PR #48 `db57b91` | A required job hung past the observation window, then the run cancelled | Blocked, first pending then cancelled | Pending: leaf `pending` and no `gate (CI)` check at all, merge `BLOCKED`. After cancel: run, job, and step all `cancelled`, `gate (CI)` failure, merge `BLOCKED` | live PR |
| 2026-10-29 | PR #48 `9b9e2af` | A new high dependency advisory (`lodash` 4.17.20) | Dependency review fails and the merge is blocked | `review dependency changes` failure and `gate (Dependency review)` failure; merge `BLOCKED` | live PR |
| 2026-10-29 | PR #48 `9b9e2af` | CodeQL findings | Blocked by the finding, not by the analysis | `analyze javascript-typescript` success; `CodeQL` findings check failure, 2 critical and 1 high; merge `BLOCKED` | live PR |
| 2026-10-29 | PR #48 `59acee1` | One medium security finding only | Advisory, merge permitted | `CodeQL` findings check success, 1 medium; merge `CLEAN` | live PR |
| 2026-10-29 | PR #50 `dfd6cc5` | One critical finding on a current base | Blocked | `CodeQL` findings check failure; merge `BLOCKED` | live PR |
| 2026-10-29 | PR #50, alert 9 | Authorised dismissal with a written reason on the alert | Record the real effect on mergeability | `BLOCKED` to `CLEAN` within about 30 seconds; the `CodeQL` check run on the head commit stayed `failure`, so the rule evaluates alert state, not the check run | live PR |
| 2026-10-29 | PR #49 `0dc7033` | Out-of-date base | Blocked | `BEHIND`; a plain merge was refused with "the head branch is not up to date with the base branch" | live PR |
| 2026-10-29 | PR #49, reason on the PR | Administrator pull-request-only bypass | Merge permitted, and separate from normal blocking | Merged with administrator privileges while `BEHIND`; authorisation and reason recorded on the PR | live PR |
| 2026-10-29 | PR #51 `81cb220` to `f4d97e3` | Results for an older commit | A new commit is not authorised by the old results | `CLEAN` on `81cb220`; `BLOCKED` on `f4d97e3` while its own checks ran | live PR |
| 2026-10-29 | `main-gate-probe`, disposable, `protected-test` | `non_fast_forward` | Force push rejected; an ordinary push allowed | Ordinary push succeeded; `git push --force` rejected with "push declined due to repository rule violations"; branch unchanged | disposable equivalent |
| 2026-10-29 | `main-gate-probe`, disposable, `protected-test` | `deletion` | Branch deletion rejected | `git push origin --delete protected-test` rejected with the same message; the branch still exists | disposable equivalent |
| 2026-10-29 | `sillytavern-vault@main` | CodeQL findings in the verifier itself | Advisory at the agreed threshold | Two `js/file-access-to-http` alerts, security severity `medium`, state `open` on `scripts/ci-gate.mjs`; they do not block, and they are not suppressed | readback only |
| 2026-10-29 | `sillytavern-vault@main` | Rulesets `main-protection` id 26121627 and `main-merge-gate` id 26121638 | The payloads from this repository | `main-protection`: `deletion`, `non_fast_forward`, no bypass actor, `current_user_can_bypass` `never`. `main-merge-gate`: `pull_request`, `required_status_checks` with eleven contexts, `code_scanning` CodeQL `high_or_higher` and `none`, bypass `RepositoryRole` 5 `pull_request`, `current_user_can_bypass` `pull_requests_only` | readback only |
| 2026-10-29 | PR #53 `e8b30db`, the `Gate` workflow disabled | The safeguard's own absence | Merge blocked with every leaf check green | Eight leaf checks `success`, no `gate (...)` check on the commit, merge `BLOCKED` | live PR |
| 2026-10-29 | PR #53 `ebc403d`, the `Gate` workflow re-enabled | Partial reporting by the safeguard | Blocked until the last gate check reports | `gate (CI)` and `gate (Dependency review)` `success` while `gate (CodeQL)` was still absent: merge `BLOCKED`. With all three: `CLEAN` | live PR |
| 2026-10-29 | `sillytavern-vault@40875186545` and the merged `main` run | The `dist` artifact | Still produced, with the same name, path, and retention | Artifact `dist`, path `dist/`, 38618 bytes on both runs, retention 7 days (`expires_at` seven days after creation). The bytes were not compared, so identical contents are not claimed | live PR |
| 2026-10-29 | Windows 11, node v24.15.0 with npm 12.2.1 | The launcher at the Node 24 floor | Builds and serves, HTTP 200 | `node scripts/start.mjs --force --no-open` built the bundle and served HTTP 200 on `localhost` and `[::1]` | live local |
| 2026-10-29 | Windows 11, node v26.0.0 with npm 12.2.1 | The launcher at the Node 26 floor | Builds and serves, HTTP 200 | The same result as the Node 24 floor | live local |
| 2026-10-29 | npm 12.2.0, a package outside the repository | An unapproved install script | Blocked and warned, and the install does not fail | `npm install` exit code **0**, measured directly rather than through a pipeline; four `npm warn install-scripts` lines; `npm install-scripts ls` reports `1 package has install scripts blocked because they are not covered by allowScripts: esbuild@0.25.12 (postinstall: node install.js)` | live local |
| 2026-10-29 | The repository install, npm 12.2.0 | The approved build dependency | The version-specific approval allows the script, and the script really runs | `npm install-scripts ls` reports `No packages with unreviewed install scripts`; `npm ci --foreground-scripts` prints `npm notice run esbuild@0.25.12 postinstall` and `npm notice run node install.js`, which is lifecycle execution rather than a present binary; `npm ci` exit code **0**, measured directly. A bump to another version would no longer match `allowScripts.esbuild@0.25.12` | live local |

### 8.1 What the log does not prove

These cases are unverified as of 2026-10-29. Do not treat them as passing.

- **A fork pull request.** The repository owner cannot fork the repository, and
  no second identity was available. The `workflow_run` behaviour for a fork, and
  the GitHub approval for a fork workflow, are unproven here. If the
  commit-to-pull-request lookup misses there, the verifier now publishes a
  `failure` check, so the pull request stays blocked and the reason is visible.
- **A Dependabot pull request.** No Dependabot pull request was produced in this
  window. Its restricted permissions, and the effect of the labels that
  `.github/dependabot.yml` names but the repository does not define, are
  unproven here.
- **A `neutral` job conclusion.** A GitHub Actions job cannot conclude
  `neutral`. `continue-on-error` was observed instead, and it produced a
  `failure` job conclusion (section 8 above). The verifier also treats
  `neutral` as `failure`, and a unit test covers that value.
- **A destructive probe against the real `main`.** The rules were proven on a
  disposable repository. A force push to, or a deletion of, the real `main` was
  not attempted by design.
