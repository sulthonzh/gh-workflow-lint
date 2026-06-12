'use strict';

const { lint, lintDir, formatResult } = require('../src/index');
const path = require('path');
const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

console.log('gh-workflow-lint tests\n');

// Good workflow
console.log('Good workflow:');
test('has no errors', () => {
  const r = lint(path.join(__dirname, 'fixtures/good.yml'));
  assert.strictEqual(r.errors.length, 0, `Unexpected errors: ${JSON.stringify(r.errors)}`);
});
test('has no warnings', () => {
  const r = lint(path.join(__dirname, 'fixtures/good.yml'));
  assert.strictEqual(r.warnings.length, 0, `Unexpected warnings: ${JSON.stringify(r.warnings)}`);
});

// Bad workflow
console.log('\nBad workflow:');
test('catches missing name', () => {
  const r = lint(path.join(__dirname, 'fixtures/bad.yml'));
  assert.ok(r.errors.some(e => e.rule === 'missing-name'));
});
test('catches checkout@v2 as outdated', () => {
  const r = lint(path.join(__dirname, 'fixtures/bad.yml'));
  assert.ok(r.errors.some(e => e.rule === 'checkout-v2'));
});
test('catches shell injection risk', () => {
  const r = lint(path.join(__dirname, 'fixtures/bad.yml'));
  assert.ok(r.warnings.some(w => w.rule === 'shell-injection-risk'));
});
test('catches missing timeout', () => {
  const r = lint(path.join(__dirname, 'fixtures/bad.yml'));
  assert.ok(r.warnings.some(w => w.rule === 'missing-timeout'));
});
test('catches missing permissions', () => {
  const r = lint(path.join(__dirname, 'fixtures/bad.yml'));
  assert.ok(r.warnings.some(w => w.rule === 'missing-permissions'));
});

// Edge cases
console.log('\nEdge cases:');
test('workflow with no jobs triggers error', () => {
  const r = lint(path.join(__dirname, 'fixtures/no-jobs.yml'));
  assert.ok(r.errors.some(e => e.rule === 'missing-jobs'));
});
test('job with no steps triggers error', () => {
  const r = lint(path.join(__dirname, 'fixtures/no-steps.yml'));
  assert.ok(r.errors.some(e => e.rule === 'missing-steps'));
});
test('lintDir returns array of results', () => {
  const results = lintDir(path.join(__dirname, 'fixtures'));
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
});
test('formatResult includes ERROR for issues', () => {
  const r = lint(path.join(__dirname, 'fixtures/bad.yml'));
  const out = formatResult(r);
  assert.ok(out.includes('ERROR'));
  assert.ok(out.includes('WARN'));
});
test('formatResult shows clean for no issues', () => {
  const r = lint(path.join(__dirname, 'fixtures/good.yml'));
  const out = formatResult(r);
  assert.ok(out.includes('No issues'));
});

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
