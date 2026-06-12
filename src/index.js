'use strict';

const fs = require('fs');
const path = require('path');

function lint(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const errors = [];
  const warnings = [];

  // Extract top-level keys
  const topLevelKeys = new Set();
  for (const line of text.split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)/);
    if (m) topLevelKeys.add(m[1]);
  }

  // Rule: missing-name
  if (!topLevelKeys.has('name')) {
    errors.push({ rule: 'missing-name', message: 'Workflow should have a top-level `name` field' });
  }

  // Rule: missing-on
  if (!topLevelKeys.has('on')) {
    errors.push({ rule: 'missing-on', message: 'Workflow must define trigger events (`on`)' });
  }

  // Rule: missing-jobs
  if (!topLevelKeys.has('jobs')) {
    errors.push({ rule: 'missing-jobs', message: 'Workflow must define at least one job' });
    return { file: filePath, errors, warnings };
  }

  // Rule: missing-permissions
  if (!topLevelKeys.has('permissions')) {
    warnings.push({ rule: 'missing-permissions', message: 'Workflow should declare explicit `permissions`' });
  }

  // Extract job IDs and their content
  const jobs = extractJobs(text);

  if (jobs.length === 0) {
    errors.push({ rule: 'missing-jobs', message: 'Workflow must define at least one job' });
    return { file: filePath, errors, warnings };
  }

  // Check each job
  for (const job of jobs) {
    // Rule: missing-runs-on
    if (!/^\s+runs-on:/m.test(job.block)) {
      errors.push({ rule: 'missing-runs-on', message: `job "${job.id}" must specify \`runs-on\`` });
    }

    // Rule: missing-timeout
    if (!/^\s+timeout-minutes:/m.test(job.block)) {
      warnings.push({ rule: 'missing-timeout', message: `job "${job.id}" should set \`timeout-minutes\`` });
    }

    // Rule: missing-name (job level)
    if (!/^\s+name:/m.test(job.block) && !topLevelKeys.has('name')) {
      warnings.push({ rule: 'missing-name', message: `job "${job.id}" should have a name field` });
    }

    // Rule: missing-steps
    const steps = extractSteps(job.block);
    if (steps.length === 0) {
      errors.push({ rule: 'missing-steps', message: `job "${job.id}" must have at least one step` });
      continue;
    }

    // Check each step
    for (let si = 0; si < steps.length; si++) {
      const step = steps[si];

      // Rule: unpinned-action
      const usesMatch = step.match(/uses:\s*['"]?([^\s'"]+)['"]?/);
      if (usesMatch) {
        const uses = usesMatch[1];
        const atIdx = uses.indexOf('@');
        if (atIdx !== -1) {
          const ref = uses.slice(atIdx + 1);
          if (!/^[0-9a-f]{40}$/i.test(ref)) {
            // Check outdated
            if (/actions\/checkout@(v1|v2)/.test(uses)) {
              errors.push({
                rule: 'checkout-v2',
                message: `step ${si + 1} in "${job.id}": ${uses} is outdated, use actions/checkout@v4 or pin to SHA`,
              });
            } else {
              warnings.push({
                rule: 'unpinned-action',
                message: `step ${si + 1} in "${job.id}": ${uses} should be pinned to a commit SHA`,
              });
            }
          }
        }
      }

      // Rule: shell-injection-risk
      const runMatch = step.match(/run:\s*\|?\s*([\s\S]*)/);
      if (runMatch && /\$\{\{/.test(step)) {
        warnings.push({
          rule: 'shell-injection-risk',
          message: `step ${si + 1} in "${job.id}": uses \${{ }} in \`run\` — potential shell injection risk`,
        });
      }

      // Rule: hardcoded-credentials
      if (/password|secret|token|api_key|access_key/i.test(step)) {
        const badPatterns = step.match(/(password|secret|token|api_key|access_key):\s*['"][^$][^'"]*['"]/gi);
        if (badPatterns) {
          errors.push({
            rule: 'hardcoded-credentials',
            message: `step ${si + 1} in "${job.id}": possible hardcoded credential`,
          });
        }
      }
    }
  }

  return { file: filePath, errors, warnings };
}

function extractJobs(text) {
  const jobs = [];
  const lines = text.split('\n');
  let inJobs = false;
  let currentJob = null;
  let jobBlock = [];

  for (const line of lines) {
    // Detect jobs: key
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }

    if (inJobs) {
      // New top-level key means we're out of jobs
      if (/^[a-zA-Z_][a-zA-Z0-9_-]*:\s*$/.test(line) && !/^\s/.test(line)) {
        if (currentJob) {
          jobs.push({ id: currentJob, block: jobBlock.join('\n') });
        }
        break;
      }

      // Job ID line: 2-space indent, key:
      const jobMatch = line.match(/^  ([a-zA-Z_][a-zA-Z0-9_-]*):\s*$/);
      if (jobMatch) {
        if (currentJob) {
          jobs.push({ id: currentJob, block: jobBlock.join('\n') });
        }
        currentJob = jobMatch[1];
        jobBlock = [line];
      } else if (currentJob) {
        jobBlock.push(line);
      }
    }
  }

  if (currentJob) {
    jobs.push({ id: currentJob, block: jobBlock.join('\n') });
  }

  return jobs;
}

function extractSteps(jobBlock) {
  const steps = [];
  const lines = jobBlock.split('\n');
  let inSteps = false;
  let currentStep = [];
  const stepIndent = '      '; // 6 spaces for step content (2 job + 4 steps + - )

  for (const line of lines) {
    // Detect steps: key
    if (/^\s{4}steps:\s*$/.test(line)) {
      inSteps = true;
      continue;
    }

    if (inSteps) {
      // New step starts with 6 spaces and "- "
      if (/^\s{6}- /.test(line)) {
        if (currentStep.length > 0) {
          steps.push(currentStep.join('\n'));
        }
        currentStep = [line];
      } else if (/^\s{8,}/.test(line) || line.trim() === '') {
        // Continuation of current step
        currentStep.push(line);
      } else if (!/^\s*$/.test(line)) {
        // Out of steps block
        if (currentStep.length > 0) {
          steps.push(currentStep.join('\n'));
          currentStep = [];
        }
        inSteps = false;
      }
    }
  }

  if (currentStep.length > 0) {
    steps.push(currentStep.join('\n'));
  }

  return steps;
}

function lintDir(dirPath) {
  const results = [];
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const file of files) {
    results.push(lint(path.join(dirPath, file)));
  }
  return results;
}

function formatResult(result) {
  const lines = [result.file];
  for (const e of result.errors) {
    lines.push(`  ERROR  ${e.rule.padEnd(22)} — ${e.message}`);
  }
  for (const w of result.warnings) {
    lines.push(`  WARN   ${w.rule.padEnd(22)} — ${w.message}`);
  }
  const total = result.errors.length + result.warnings.length;
  if (total > 0) {
    lines.push(`\n${total} issue${total !== 1 ? 's' : ''} (${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}, ${result.warnings.length} warning${result.warnings.length !== 1 ? 's' : ''})`);
  } else {
    lines.push('  ✓ No issues found');
  }
  return lines.join('\n');
}

module.exports = { lint, lintDir, formatResult };
