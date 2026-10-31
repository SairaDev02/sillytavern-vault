## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, worked through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use the default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Grilling

When asked to grill a plan, decision, or issue, use the available grilling skill and:

- Investigate facts in the code, documentation, and issue tracker. Distinguish current behavior from proposed changes; ask the user for decisions, not facts you can check.
- Ask all independent, unblocked decisions in numbered batches, with a reasoned recommendation for each. Defer dependent questions until their prerequisites are settled.
- When no decisions remain, summarize the agreed choices and obtain the user's confirmation. Agreement on requirements does not authorize implementation, ticket publication, issue closure, or repository settings changes; proceed only when the user has authorized the action.

### Ticket decomposition

When `/to-tickets` publishes tickets from a spec or parent issue, link each ticket to that parent as a **native GitHub sub-issue** in the same run; a `## Parent` line in the body is not the link. Add it with `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`, the child's database id from `gh api repos/<owner>/<repo>/issues/<n> --jq .id`, then read the parent's `.../sub_issues` list to confirm.

### Browser validation

Use [Playwright CLI](https://github.com/microsoft/playwright-cli) for browser interaction, selector inspection, screenshots, and end-to-end flow validation. Consult `playwright-cli --help` and the upstream documentation before browser work.

### Deletion

Delete by explicit path, one named target at a time — never a recursive delete (`rm -rf`, `Remove-Item -Recurse`); when a whole tree must go, name its entries instead.

### To-Do list

Keep the To-Do list current on multi-step work; a one-shot edit skips it.

- One item per outcome you can call done ("tests green", "the scene plays"), not per activity ("explore the loader").
- Move an item to `in_progress` as you start it, and to `completed` the moment its outcome holds — never batched to the end.
- A task discovered mid-work gets its own item; one that stops mattering is deleted.

### Temporary files, assets, prototypes

Scratch goes in the gitignored **`.pi-tmp/`** and is deleted before the work is declared done.

### Subagents

Spawn a subagent when the work splits into independent branches — parallel reads, a research question, an isolated review — or when a step needs a context of its own. Single-pass work stays in this conversation.

Make the task self-contained: the outcome it produces, the constraints, and where the result goes; the child cannot see this conversation.

Every child runs on DeepSeek V4.1 Flash (`opencode-go/deepseek-v4.1-flash`), and no other model: pass `model: "opencode-go/deepseek-v4.1-flash"` and `thinking: "high"` on every `subagent` call, and keep `model` out of `.pi/agents/` files, where a `locked: model` would refuse this call's override.

Select the child's tools by role, smallest set first, through `subagent_type` — the installed `@gotgenes/pi-subagents` takes no per-call tool list:

- **Research, review, verification** — the built-in `Explore` or `Plan`, which hold the read-only set (`read`, `grep`, `find`, `ls`) plus `bash` restricted to reads by their prompt; read-only keeps a checker reporting findings rather than patching what it checks.
- **Implementation** — the built-in `general-purpose`, which holds every tool.

A role needing a set narrower than a built-in's — `edit` and `write` without a shell, say — gets a `.pi/agents/<role>.md` with an explicit `tools` list.

Read the child's report and inspect the artefacts it points to before trusting it: a child's completion is not verification.

### End-of-task report

End every implementation task with a short report in your reply to the user, in three parts:

- **What landed** — the files or areas, named by the behaviour they add.
- **Validation** — the exact commands run and the result you observed.
- **What remains** — deferrals, residuals, and the next slice, if any.