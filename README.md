# gh-workflow-lint

Lint your GitHub Actions workflow files for common mistakes and best practices.

Zero dependencies. Runs anywhere Node.js does.

## Why

GitHub Actions workflows are YAML, and YAML is easy to get wrong. Missing required fields, shell injection risks, pinned vs unpinned actions, wrong trigger syntax — these bite you at the worst time (during a deploy).

This tool catches those issues before they hit your repo.

## Install

```bash
npm install -D gh-workflow-lint
```

## Usage

### CLI

```bash
# Lint a single workflow
npx gh-workflow-lint .github/workflows/ci.yml

# Lint all workflows
npx gh-workflow-lint .github/workflows/*.yml

# Strict mode (warnings become errors)
npx gh-workflow-lint --strict .github/workflows/ci.yml

# CI mode (exit 1 on any issue)
npx gh-workflow-lint --ci .github/workflows/
```

### Programmatic

```js
const { lint } = require('gh-workflow-lint');

const results = lint('.github/workflows/ci.yml');
// { file, errors: [...], warnings: [...] }
```

## Rules

| Rule | Severity | Description |
|------|----------|-------------|
| `missing-name` | error | Workflow or job should have a descriptive name |
| `missing-on` | error | Workflow must define trigger events |
| `missing-jobs` | error | Workflow must define at least one job |
| `missing-runs-on` | error | Every job must specify `runs-on` |
| `missing-steps` | error | Every job must have at least one step |
| `unpinned-action` | warning | Actions should use SHA pinning, not tags |
| `shell-injection-risk` | warning | Steps using `${{ }}` in `run` may be vulnerable |
| `missing-timeout` | warning | Jobs should set `timeout-minutes` |
| `missing-permissions` | warning | Workflows should declare explicit permissions |
| `checkout-v2` | warning | `actions/checkout@v2` is outdated, use v4 |
| `hardcoded-credentials` | error | No hardcoded secrets or tokens |
| `duplicate-job-id` | error | Job IDs must be unique within a workflow |

## Example Output

```
.github/workflows/ci.yml
  ERROR  missing-name          — Workflow should have a top-level `name` field
  WARN   unpinned-action       — actions/checkout@v4 should be pinned to a SHA
  WARN   missing-timeout       — job "build" should set timeout-minutes

3 issues (1 error, 2 warnings)
```

## License

MIT
