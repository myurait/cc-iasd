import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseCapabilities,
  isCapabilityRef,
  frontmatterCovers,
  visionCapabilities,
  coverSources,
  coverageMatrix,
} from '../lib/covers.js';
import { derive } from '../lib/state.js';
import { run as views } from '../lib/commands/views.js';
import { write } from '../lib/writePath.js';

// --- tmp project-context ------------------------------------------------
function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-iasd-covers-'));
  fs.mkdirSync(path.join(root, 'journal'), { recursive: true });
  return root;
}
function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

// derive の畳み込み順序を固定するため、単調増加 id で event を直接書く。
let seqCounter = 0;
function put(root, subject, type, extra = {}) {
  seqCounter += 1;
  const rec = {
    id: String(seqCounter).padStart(26, '0'),
    ts: new Date().toISOString(),
    actor: extra.actor || { kind: 'cli' },
    type,
    subject,
  };
  if (extra.data !== undefined) rec.data = extra.data;
  if (extra.payload !== undefined) rec.payload = extra.payload;
  if (extra.refs !== undefined) rec.refs = extra.refs;
  write(root, path.join('journal', `${rec.id}.json`), JSON.stringify(rec, null, 2) + '\n');
  return rec.id;
}

// authored payload を配置する。
function seedVision(root, id, capabilitiesBody) {
  const body = `---\nid: ${id}\nrefs: []\n---\n\n# vision: ${id}\n\n## Capabilities\n\n${capabilitiesBody}\n`;
  write(root, path.join('vision', `${id}-slug.md`), body);
}
function seedSpec(root, id, frontmatter = 'refs: []') {
  const body = `---\nid: ${id}\n${frontmatter}\n---\n\n# spec: ${id}\n`;
  write(root, path.join('specs', `${id}-slug`, 'spec.md'), body);
}
function seedCampaign(root, id, frontmatter = 'refs: []') {
  const body = `---\nid: ${id}\n${frontmatter}\n---\n\n# charter: ${id}\n`;
  write(root, path.join('campaigns', `${id}-slug`, 'charter.md'), body);
}

async function callViews(command, opts) {
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => {
    chunks.push(String(s));
    return true;
  };
  let result;
  try {
    result = await views({ command, positional: [], flags: {}, jsonMode: true, ...opts });
  } finally {
    process.stdout.write = orig;
  }
  return { result, stdout: chunks.join('') };
}

// ======================================================================
// parseCapabilities
// ======================================================================

test('parseCapabilities: - [ ] cap-<slug>: 説明 を抽出する', () => {
  const body = [
    '## Capabilities',
    '',
    '- [ ] cap-export: CSV エクスポート',
    '- [x] cap-import: インポート（提供済み）',
    '- [ ] cap-search: 検索',
  ].join('\n');
  const caps = parseCapabilities(body);
  assert.deepEqual(
    caps.map((c) => c.id),
    ['cap-export', 'cap-import', 'cap-search']
  );
  assert.equal(caps[0].checked, false);
  assert.equal(caps[0].desc, 'CSV エクスポート');
  assert.equal(caps[1].checked, true);
});

test('parseCapabilities: checkbox なし / 説明なしの後方互換記法も拾う', () => {
  const body = '## Capabilities\n\n- cap-alpha\n* cap-beta: 説明あり\n';
  const caps = parseCapabilities(body);
  assert.deepEqual(
    caps.map((c) => c.id),
    ['cap-alpha', 'cap-beta']
  );
  assert.equal(caps[0].desc, '');
});

test('parseCapabilities: cap- で始まらない行・コメントは無視する', () => {
  const body = [
    '## Capabilities',
    '',
    '<!-- 記入例 -->',
    '- これは capability ではない',
    '- [ ] export: cap- 接頭辞が無いので対象外',
    '- [ ] cap-real: 対象',
  ].join('\n');
  const caps = parseCapabilities(body);
  assert.deepEqual(
    caps.map((c) => c.id),
    ['cap-real']
  );
});

test('parseCapabilities: Capabilities 節が無ければ空配列', () => {
  assert.deepEqual(parseCapabilities('# vision\n\n## Boundaries\n\nx\n'), []);
});

test('parseCapabilities: 同一 id は先勝ちで重複排除', () => {
  const body = '## Capabilities\n\n- [ ] cap-x: 1\n- [x] cap-x: 2\n';
  const caps = parseCapabilities(body);
  assert.equal(caps.length, 1);
  assert.equal(caps[0].desc, '1');
});

// ======================================================================
// isCapabilityRef
// ======================================================================

test('isCapabilityRef: cap-<slug> は真、artifact ref は偽', () => {
  assert.equal(isCapabilityRef('cap-export'), true);
  assert.equal(isCapabilityRef('cap-a.b-c'), true);
  assert.equal(isCapabilityRef('spec:s001'), false);
  assert.equal(isCapabilityRef('campaign:c001'), false);
  assert.equal(isCapabilityRef('export'), false);
  assert.equal(isCapabilityRef(''), false);
  assert.equal(isCapabilityRef(null), false);
});

// ======================================================================
// frontmatterCovers
// ======================================================================

test('frontmatterCovers: { rel: covers, to: cap-x } 記法', () => {
  const text = '---\nid: s001\nrefs:\n  - { rel: covers, to: cap-export }\n  - { rel: upstream, to: vision:v001 }\n---\n';
  assert.deepEqual(frontmatterCovers(text), ['cap-export']);
});

test('frontmatterCovers: 文字列 / 単一キー記法', () => {
  const t1 = '---\nrefs:\n  - covers cap-a\n---\n';
  const t2 = '---\nrefs:\n  - covers: cap-b\n---\n';
  assert.deepEqual(frontmatterCovers(t1), ['cap-a']);
  assert.deepEqual(frontmatterCovers(t2), ['cap-b']);
});

test('frontmatterCovers: map の配列記法 covers: [x, y]', () => {
  const text = '---\nrefs:\n  covers: [cap-a, cap-b]\n---\n';
  assert.deepEqual(frontmatterCovers(text), ['cap-a', 'cap-b']);
});

test('frontmatterCovers: frontmatter 無しは空', () => {
  assert.deepEqual(frontmatterCovers('# spec\nno frontmatter\n'), []);
});

// ======================================================================
// visionCapabilities（journal + authored 本文の突合）
// ======================================================================

test('visionCapabilities: vision 本文の Capabilities を集約する', () => {
  const root = makeRoot();
  try {
    put(root, 'vision:v001', 'created');
    seedVision(root, 'v001', '- [ ] cap-export: CSV\n- [ ] cap-search: 検索');
    const snapshot = derive([{ id: '1', type: 'created', subject: 'vision:v001', actor: { kind: 'cli' } }]);
    const caps = visionCapabilities(root, snapshot);
    assert.deepEqual(caps.order, ['cap-export', 'cap-search']);
    assert.equal(caps.byId['cap-export'].vision, 'vision:v001');
  } finally {
    cleanup(root);
  }
});

test('visionCapabilities: 複数 vision は id 昇順で先勝ち', () => {
  const root = makeRoot();
  try {
    seedVision(root, 'v001', '- [ ] cap-shared: from v001');
    seedVision(root, 'v002', '- [ ] cap-shared: from v002\n- [ ] cap-only2: 固有');
    const snapshot = derive([
      { id: '1', type: 'created', subject: 'vision:v001', actor: { kind: 'cli' } },
      { id: '2', type: 'created', subject: 'vision:v002', actor: { kind: 'cli' } },
    ]);
    const caps = visionCapabilities(root, snapshot);
    assert.equal(caps.byId['cap-shared'].vision, 'vision:v001'); // 先勝ち
    assert.equal(caps.byId['cap-only2'].vision, 'vision:v002');
  } finally {
    cleanup(root);
  }
});

// ======================================================================
// coverSources（journal 一次 / frontmatter 二次）
// ======================================================================

test('coverSources: journal 導出 refs の covers を一次情報源として拾う', () => {
  const root = makeRoot();
  try {
    // spec ノードの refs に journal 由来の covers を持たせる。
    const events = [
      { id: '1', type: 'created', subject: 'spec:s001', actor: { kind: 'cli' } },
      {
        id: '2',
        type: 'transitioned',
        subject: 'spec:s001',
        actor: { kind: 'cli' },
        data: { from: 'draft', to: 'ready' },
        refs: [{ rel: 'covers', to: 'cap-export' }],
      },
    ];
    const snapshot = derive(events);
    const { byCap, all } = coverSources(root, snapshot);
    assert.deepEqual(byCap['cap-export'], [{ ref: 'spec:s001', source: 'journal' }]);
    assert.equal(all.length, 1);
  } finally {
    cleanup(root);
  }
});

test('coverSources: frontmatter の covers を二次情報源として補う', () => {
  const root = makeRoot();
  try {
    seedSpec(root, 's002', 'refs:\n  - { rel: covers, to: cap-search }');
    const snapshot = derive([{ id: '1', type: 'created', subject: 'spec:s002', actor: { kind: 'cli' } }]);
    const { byCap } = coverSources(root, snapshot);
    assert.deepEqual(byCap['cap-search'], [{ ref: 'spec:s002', source: 'frontmatter' }]);
  } finally {
    cleanup(root);
  }
});

test('coverSources: 同一 (ref, cap) は journal を優先し frontmatter を重複追加しない', () => {
  const root = makeRoot();
  try {
    // journal に covers を持つ spec の本文にも同じ covers を宣言。
    seedSpec(root, 's001', 'refs:\n  - { rel: covers, to: cap-export }');
    const events = [
      { id: '1', type: 'created', subject: 'spec:s001', actor: { kind: 'cli' } },
      {
        id: '2',
        type: 'transitioned',
        subject: 'spec:s001',
        actor: { kind: 'cli' },
        data: { from: 'draft', to: 'ready' },
        refs: [{ rel: 'covers', to: 'cap-export' }],
      },
    ];
    const snapshot = derive(events);
    const { byCap } = coverSources(root, snapshot);
    assert.equal(byCap['cap-export'].length, 1);
    assert.equal(byCap['cap-export'][0].source, 'journal');
  } finally {
    cleanup(root);
  }
});

test('coverSources: campaign の covers も拾い、spec:<id> への covers は capability 扱いしない', () => {
  const root = makeRoot();
  try {
    // campaign が cap への covers（capability 被覆）と spec への covers（artifact coverage）両方を持つ。
    const events = [
      {
        id: '1',
        type: 'created',
        subject: 'campaign:c001',
        actor: { kind: 'cli' },
        refs: [
          { rel: 'covers', to: 'cap-export' },
          { rel: 'covers', to: 'spec:s001' },
        ],
      },
    ];
    const snapshot = derive(events);
    const { byCap, all } = coverSources(root, snapshot);
    assert.deepEqual(byCap['cap-export'], [{ ref: 'campaign:c001', source: 'journal' }]);
    // spec:s001 への covers は capability 被覆に含まれない。
    assert.ok(!all.some((c) => c.to === 'spec:s001'));
  } finally {
    cleanup(root);
  }
});

// ======================================================================
// coverageMatrix（突合の統合）
// ======================================================================

test('coverageMatrix: カバー済み / 未カバー を突合する', () => {
  const root = makeRoot();
  try {
    seedVision(root, 'v001', '- [ ] cap-export: CSV\n- [ ] cap-search: 検索');
    // s001 が cap-export を journal covers。cap-search は誰もカバーしない。
    const events = [
      { id: '1', type: 'created', subject: 'vision:v001', actor: { kind: 'cli' } },
      { id: '2', type: 'created', subject: 'spec:s001', actor: { kind: 'cli' } },
      {
        id: '3',
        type: 'transitioned',
        subject: 'spec:s001',
        actor: { kind: 'cli' },
        data: { from: 'draft', to: 'ready' },
        refs: [{ rel: 'covers', to: 'cap-export' }],
      },
    ];
    const snapshot = derive(events);
    const m = coverageMatrix(root, snapshot);
    const exp = m.capabilities.find((c) => c.id === 'cap-export');
    const srch = m.capabilities.find((c) => c.id === 'cap-search');
    assert.equal(exp.covered, true);
    assert.deepEqual(exp.covered_by, [{ ref: 'spec:s001', source: 'journal' }]);
    assert.equal(srch.covered, false);
    assert.deepEqual(m.uncovered, ['cap-search']);
  } finally {
    cleanup(root);
  }
});

test('coverageMatrix: vision 未宣言の cap-id への covers は orphan として列挙', () => {
  const root = makeRoot();
  try {
    seedVision(root, 'v001', '- [ ] cap-export: CSV');
    const events = [
      { id: '1', type: 'created', subject: 'vision:v001', actor: { kind: 'cli' } },
      {
        id: '2',
        type: 'created',
        subject: 'spec:s001',
        actor: { kind: 'cli' },
        refs: [{ rel: 'covers', to: 'cap-ghost' }],
      },
    ];
    const snapshot = derive(events);
    const m = coverageMatrix(root, snapshot);
    assert.deepEqual(m.uncovered, ['cap-export']);
    assert.deepEqual(m.orphan_covers, [{ ref: 'spec:s001', to: 'cap-ghost', source: 'journal' }]);
  } finally {
    cleanup(root);
  }
});

test('coverageMatrix: Capabilities 宣言が無ければ capabilities 空・uncovered 空', () => {
  const root = makeRoot();
  try {
    const snapshot = derive([]);
    const m = coverageMatrix(root, snapshot);
    assert.deepEqual(m.capabilities, []);
    assert.deepEqual(m.uncovered, []);
    assert.deepEqual(m.orphan_covers, []);
  } finally {
    cleanup(root);
  }
});

// ======================================================================
// views: status --plan の capability 射影
// ======================================================================

test('status --plan: capability カバレッジを射影し未カバーを可視化する', async () => {
  const root = makeRoot();
  try {
    seedVision(root, 'v001', '- [ ] cap-export: CSV\n- [ ] cap-search: 検索');
    put(root, 'vision:v001', 'created');
    put(root, 'spec:s001', 'created');
    put(root, 'spec:s001', 'transitioned', {
      data: { from: 'draft', to: 'ready' },
      refs: [{ rel: 'covers', to: 'cap-export' }],
    });

    const { result, stdout } = await callViews('status', {
      positional: [],
      flags: { plan: true },
      root,
      jsonMode: false,
    });
    assert.equal(result.view, 'plan');
    const exp = result.capabilities.find((c) => c.id === 'cap-export');
    assert.equal(exp.covered, true);
    assert.deepEqual(result.uncovered_capabilities, ['cap-search']);
    // 人間可読出力に未カバー行が現れる。
    assert.match(stdout, /\[x\] cap-export/);
    assert.match(stdout, /\[ \] cap-search\s+<- \(未カバー\)/);
  } finally {
    cleanup(root);
  }
});

test('status --plan: orphan covers を可視化する', async () => {
  const root = makeRoot();
  try {
    seedVision(root, 'v001', '- [ ] cap-export: CSV');
    put(root, 'vision:v001', 'created');
    put(root, 'spec:s001', 'created', { refs: [{ rel: 'covers', to: 'cap-ghost' }] });

    const { result } = await callViews('status', {
      positional: [],
      flags: { plan: true },
      root,
      jsonMode: true,
    });
    assert.deepEqual(result.orphan_covers, [{ ref: 'spec:s001', to: 'cap-ghost', source: 'journal' }]);
  } finally {
    cleanup(root);
  }
});

test('status --plan: 既存の plan_gaps / campaigns 射影を壊さない', async () => {
  const root = makeRoot();
  try {
    put(root, 'gap:g001', 'gap.opened', {
      data: { kind: 'candidate', blocking: false, route: 'vision', target: 'vision:v001' },
    });
    put(root, 'campaign:c001', 'created', { refs: [{ rel: 'covers', to: 'spec:s001' }] });

    const { result } = await callViews('status', {
      positional: [],
      flags: { plan: true },
      root,
      jsonMode: true,
    });
    assert.deepEqual(result.plan_gaps.map((g) => g.id), ['g001']);
    assert.equal(result.campaigns.length, 1);
    // capabilities 節が併存する。
    assert.ok(Array.isArray(result.capabilities));
  } finally {
    cleanup(root);
  }
});

// ======================================================================
// views: report campaign の coverage 概況
// ======================================================================

test('report campaign: completion 欄に coverage 概況を機械記入する', async () => {
  const root = makeRoot();
  try {
    seedVision(root, 'v001', '- [ ] cap-export: CSV\n- [ ] cap-search: 検索');
    seedCampaign(root, 'c001', 'refs:\n  - { rel: covers, to: cap-export }');
    put(root, 'vision:v001', 'created');
    // c001 が cap-export を covers（frontmatter 二次）。cap-search は未カバー。
    put(root, 'campaign:c001', 'created');

    const { result } = await callViews('report', {
      positional: ['campaign:c001'],
      root,
      jsonMode: true,
    });
    const cs = result.tool_owned.coverage_summary;
    assert.ok(cs, 'coverage_summary が存在する');
    assert.equal(cs.total, 2);
    assert.equal(cs.covered, 1);
    assert.deepEqual(cs.uncovered, ['cap-search']);
    assert.deepEqual(cs.covered_by_this_campaign, ['cap-export']);

    // report.md に coverage 概況行が焼かれている。
    const body = fs.readFileSync(path.join(root, 'out', 'c001', 'report.md'), 'utf8');
    assert.match(body, /coverage 概況:\s+1\/2 capability/);
    assert.match(body, /未カバー capability:\s+cap-search/);
  } finally {
    cleanup(root);
  }
});

test('report run: coverage_summary は付かない（capability は spec/campaign 単位）', async () => {
  const root = makeRoot();
  try {
    put(root, 'run:r-1', 'created', { data: { type: 'normal' } });
    const { result } = await callViews('report', {
      positional: ['run:r-1'],
      root,
      jsonMode: true,
    });
    assert.equal(result.tool_owned.coverage_summary, undefined);
  } finally {
    cleanup(root);
  }
});
