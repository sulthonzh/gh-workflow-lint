#!/usr/bin/env node
'use strict';

const { lint, lintDir, formatResult } = require('./index');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const ci = args.includes('--ci');
const targets = args.filter(a => !a.startsWith('--'));

if (targets.length === 0) {
  console.error('Usage: gh-workflow-lint [--strict] [--ci] <file|dir> [file|dir ...]');
  process.exit(1);
}

let totalErrors = 0;
let totalWarnings = 0;

for (const target of targets) {
  const full = path.resolve(target);
  let results;

  if (fs.statSync(full).isDirectory()) {
    results = lintDir(full);
  } else {
    results = [lint(full)];
  }

  for (const r of results) {
    console.log(formatResult(r));
    console.log();
    totalErrors += r.errors.length;
    totalWarnings += r.warnings.length;
  }
}

if (strict) totalErrors += totalWarnings;

if (ci && totalErrors > 0) {
  console.log(`❌ ${totalErrors} error(s) found (CI mode)`);
  process.exit(1);
} else if (totalErrors === 0 && totalWarnings === 0) {
  console.log('✓ All workflows clean');
  process.exit(0);
} else {
  console.log(`Found ${totalErrors} error(s), ${totalWarnings} warning(s)`);
  process.exit(totalErrors > 0 ? 1 : 0);
}
