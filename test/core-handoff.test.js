import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesize, extractSection } from '../lib/handoff.js';

const SPEC = `---
id: s001
refs: []
---
# spec: csv-export

## Requirements
CSV を出力できること。

## Acceptance
行数が一致する。

## Surfaces
\`\`\`text
write: ["src/api/export/**"]
forbid: ["src/**/infra/**"]
\`\`\`

## Checks
- id: test ; run: "npm test" ; cwd: src/api ; expect: { exit: 0 }

## Tasks
- T001 実装
`;

const CHARTER = `---
id: c001
refs: []
---
# charter: reporting

## Risk Tiers
low: 可逆・surface 内。

## Non-Regression Focus
既存 export を壊さない。

## Stop Conditions
budget 超過で停止。
`;

const VISION = `---
id: v001
refs: []
---
# vision: core

## Boundaries
infra には触れない。
`;

const ROLE = '# worker\nrun handoff / run return のみ。';

test('全上流が揃えば ok:true で handoff を合成', () => {
  const r = synthesize({
    spec: SPEC,
    charter: CHARTER,
    vision: VISION,
    roleCard: ROLE,
    runId: 'r-1-x',
    tasks: ['T001'],
    repos: { api: 'abc123' },
    decisions: [],
  });
  assert.equal(r.ok, true);
  assert.match(r.markdown, /## Requirements/);
  assert.match(r.markdown, /CSV を出力/);
  assert.match(r.markdown, /## Exit Protocol/);
  assert.match(r.markdown, /api: base=abc123/);
  assert.match(r.markdown, /## Worker Role Card/);
});

test('spec の必須セクション欠落で ok:false + missing 列挙', () => {
  const brokenSpec = SPEC.replace(/## Acceptance[\s\S]*?## Surfaces/, '## Surfaces');
  const r = synthesize({
    spec: brokenSpec,
    charter: CHARTER,
    vision: VISION,
    roleCard: ROLE,
    runId: 'r-1',
    tasks: ['T001'],
  });
  assert.equal(r.ok, false);
  assert.ok(r.missing.some((m) => m.input === 'spec.Acceptance'));
});

test('空セクション（コメントのみ）は欠落扱い', () => {
  const emptySpec = SPEC.replace('CSV を出力できること。', '<!-- 未記入 -->');
  const r = synthesize({
    spec: emptySpec,
    charter: CHARTER,
    vision: VISION,
    roleCard: ROLE,
    runId: 'r-1',
    tasks: ['T001'],
  });
  assert.equal(r.ok, false);
  assert.ok(r.missing.some((m) => m.input === 'spec.Requirements'));
});

test('charter/vision 欠落で missing 列挙', () => {
  const r = synthesize({ spec: SPEC, roleCard: ROLE, runId: 'r-1', tasks: ['T001'] });
  assert.equal(r.ok, false);
  const inputs = r.missing.map((m) => m.input);
  assert.ok(inputs.includes('charter'));
  assert.ok(inputs.includes('vision'));
});

test('roleCard 欠落で missing', () => {
  const r = synthesize({ spec: SPEC, charter: CHARTER, vision: VISION, runId: 'r-1', tasks: ['T001'] });
  assert.equal(r.ok, false);
  assert.ok(r.missing.some((m) => m.input === 'roleCard'));
});

test('adhoc run は spec 不要、goal/check で合成', () => {
  const r = synthesize({
    adhoc: { goal: '500 エラー修正', check: 'npm test' },
    roleCard: ROLE,
    runId: 'r-adhoc',
    repos: { api: 'abc' },
  });
  assert.equal(r.ok, true);
  assert.match(r.markdown, /500 エラー修正/);
  assert.match(r.markdown, /npm test/);
});

test('spike run は check なしでも合成できる（notes/report 存在確認）', () => {
  const r = synthesize({
    adhoc: { goal: '調査' },
    spike: true,
    roleCard: ROLE,
    runId: 'r-spike',
  });
  assert.equal(r.ok, true);
});

test('extractSection は存在しないセクションで null', () => {
  assert.equal(extractSection(SPEC, 'Nonexistent'), null);
  assert.match(extractSection(SPEC, 'Requirements'), /CSV/);
});
