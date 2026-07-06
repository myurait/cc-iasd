import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { initProjectContext } from '../lib/gitops.js';
import { append, readAll } from '../lib/journal.js';
import { derive } from '../lib/state.js';
import { contentHash } from '../lib/hash.js';
import { Refusal } from '../lib/refuse.js';
import * as authoring from '../lib/commands/authoring.js';

const { _internal } = authoring;

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-auth-'));
  initProjectContext(root);
  // 既定 config を置く（doc_lang / checks_allowlist を明示）。
  fs.writeFileSync(
    path.join(root, 'cc-iasd.yaml'),
    'doc_lang: Japanese\ndev_lang: TypeScript\nchecks_allowlist: ["npm ", "npx ", "node ", "git "]\n'
  );
  return root;
}

function args(root, positional, flags = {}) {
  return { command: positional[0] === undefined ? '' : undefined, positional, flags, root, jsonMode: true };
}

// ミリ秒境界を跨がせて ULID の時系列順を保証する（同一 ms 内は乱数順で非単調なため）。
// 実運用では各 event は別コマンド起動で発生し ms が異なる。テストでは raw append を
// 連続実行するため、各 append 前に ms を進めて derive の畳み込み順を決定論化する。
function tickMs() {
  const start = Date.now();
  while (Date.now() === start) {
    /* busy-wait 1ms */
  }
}

// ヘルパ: authored ファイルを直接書く（scaffold 後の編集を模す）。
function writeFile(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

// ヘルパ: review record event を journal に直接記録（humans.js は別担当のため）。
function recordReview(root, subject, gate, body) {
  tickMs();
  append(root, {
    type: 'review.recorded',
    subject,
    actor: { kind: 'agent' },
    data: { gate },
    payload: { path: `evidence/reviews/${subject.replace(':', '-')}-${gate}.json`, sha256: contentHash(body) },
  });
}

function approveVision(root, visionRef) {
  // vision draft -> approved を transitioned で直接記録（decide 相当の効果を模す）。
  tickMs();
  append(root, {
    type: 'transitioned',
    subject: visionRef,
    actor: { kind: 'human' },
    data: { from: 'draft', to: 'approved', guard_results: [] },
  });
}

function openGap(root, gid, target, { blocking = true, kind = 'needs-human-decision', route = 'none' } = {}) {
  tickMs();
  append(root, {
    type: 'gap.opened',
    subject: `gap:${gid}`,
    actor: { kind: 'agent' },
    data: { kind, route, blocking, target },
  });
}

function closeGap(root, gid, to = 'closed') {
  tickMs();
  append(root, {
    type: 'gap.closed',
    subject: `gap:${gid}`,
    actor: { kind: 'agent' },
    data: { to },
  });
}

const SPEC_BODY = (visionRef = 'vision:v001') => `---
id: s001
refs:
  - upstream ${visionRef}
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

const VISION_BODY = `---
id: v001
refs: []
---

# vision: core

## Target Experience
利用者は CSV を得られる。

## Non-Goals
PDF は扱わない。

## Boundaries
infra には触れない。

## Capabilities
- export

## Human Decision Points
文字コード。
`;

// ------------------------------------------------------------------
// new
// ------------------------------------------------------------------
test('new spec は sNNN 連番の scaffold を生成し created event を記録', () => {
  const root = tmpRoot();
  const r = _internal.cmdNew({ positional: ['spec', 'csv export'], root });
  assert.equal(r.id, 's001');
  assert.equal(r.subject, 'spec:s001');
  assert.ok(fs.existsSync(path.join(root, r.path)));
  const events = readAll(root);
  assert.equal(events.filter((e) => e.type === 'created' && e.subject === 'spec:s001').length, 1);
  // frontmatter の id が埋まっている
  const body = fs.readFileSync(path.join(root, r.path), 'utf8');
  assert.match(body, /id: s001/);
});

test('new は種別ごとに連番を独立採番し vision/campaign も生成', () => {
  const root = tmpRoot();
  _internal.cmdNew({ positional: ['spec', 'a'], root });
  const s2 = _internal.cmdNew({ positional: ['spec', 'b'], root });
  assert.equal(s2.id, 's002');
  const v = _internal.cmdNew({ positional: ['vision', 'core'], root });
  assert.equal(v.id, 'v001');
  const c = _internal.cmdNew({ positional: ['campaign', 'reporting'], root });
  assert.equal(c.id, 'c001');
});

test('new は kind 不正 / slug 欠落で拒否（exit2 相当の Refusal）', () => {
  const root = tmpRoot();
  assert.throws(() => _internal.cmdNew({ positional: ['bogus', 'x'], root }), Refusal);
  assert.throws(() => _internal.cmdNew({ positional: ['spec'], root }), Refusal);
});

// ------------------------------------------------------------------
// spec ready: 拒否 -> gap 解消 -> 成立 の系列
// ------------------------------------------------------------------
test('spec ready: blocking gap open で拒否 -> gap close で成立', () => {
  const root = tmpRoot();
  // scaffold（journal に created を作る）
  _internal.cmdNew({ positional: ['spec', 'csv-export'], root });
  _internal.cmdNew({ positional: ['vision', 'core'], root });
  // authored 本文を確定
  writeFile(root, 'specs/s001-csv-export/spec.md', SPEC_BODY());
  writeFile(root, 'vision/v001-core.md', VISION_BODY);
  // 上流 vision approve
  approveVision(root, 'vision:v001');
  // gate=spec review（現在 hash 刻印）
  recordReview(root, 'spec:s001', 'spec', SPEC_BODY());
  // blocking gap を開く
  openGap(root, 'g001', 'spec:s001', { blocking: true });

  // 1) blocking gap open のまま ready -> 拒否
  assert.throws(
    () => _internal.cmdSpecReady({ positional: ['ready', 's001'], root }),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.ok(e.missing.some((m) => m.input === 'no-blocking-gap'));
      assert.ok(e.next.length > 0);
      return true;
    }
  );
  // journal に transitioned(spec->ready) が無いこと
  assert.equal(
    readAll(root).filter((e) => e.type === 'transitioned' && e.subject === 'spec:s001').length,
    0
  );

  // 2) gap を close
  closeGap(root, 'g001', 'closed');

  // 3) ready 成立
  const r = _internal.cmdSpecReady({ positional: ['ready', 's001'], root });
  assert.equal(r.to, 'ready');
  const snap = derive(readAll(root));
  assert.equal(snap.nodes['spec:s001'].status, 'ready');
});

test('spec ready: vision 未 approved で拒否 -> approve で解消', () => {
  const root = tmpRoot();
  _internal.cmdNew({ positional: ['spec', 'csv-export'], root });
  _internal.cmdNew({ positional: ['vision', 'core'], root });
  writeFile(root, 'specs/s001-csv-export/spec.md', SPEC_BODY());
  writeFile(root, 'vision/v001-core.md', VISION_BODY);
  recordReview(root, 'spec:s001', 'spec', SPEC_BODY());

  // vision 未 approved -> 拒否
  assert.throws(
    () => _internal.cmdSpecReady({ positional: ['ready', 's001'], root }),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'upstream-vision'));
      return true;
    }
  );
  approveVision(root, 'vision:v001');
  const r = _internal.cmdSpecReady({ positional: ['ready', 's001'], root });
  assert.equal(r.to, 'ready');
});

test('spec ready: review record 欠落で拒否、stale review でも拒否', () => {
  const root = tmpRoot();
  _internal.cmdNew({ positional: ['spec', 'csv-export'], root });
  _internal.cmdNew({ positional: ['vision', 'core'], root });
  writeFile(root, 'specs/s001-csv-export/spec.md', SPEC_BODY());
  writeFile(root, 'vision/v001-core.md', VISION_BODY);
  approveVision(root, 'vision:v001');

  // review record なし -> 拒否
  assert.throws(
    () => _internal.cmdSpecReady({ positional: ['ready', 's001'], root }),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'spec-review'));
      return true;
    }
  );

  // 別 hash（編集後を模す）で review 記録 -> stale で拒否
  recordReview(root, 'spec:s001', 'spec', SPEC_BODY() + '\n編集済み\n');
  assert.throws(
    () => _internal.cmdSpecReady({ positional: ['ready', 's001'], root }),
    (e) => {
      const m = e.missing.find((x) => x.input === 'spec-review');
      assert.ok(m && /stale/.test(m.detail));
      return true;
    }
  );
});

test('spec ready: allowlist 外 Checks は拒否、decision 承認で通過', () => {
  const root = tmpRoot();
  const specWithBadCheck = SPEC_BODY().replace('"npm test"', '"rm -rf /"');
  _internal.cmdNew({ positional: ['spec', 'csv-export'], root });
  _internal.cmdNew({ positional: ['vision', 'core'], root });
  writeFile(root, 'specs/s001-csv-export/spec.md', specWithBadCheck);
  writeFile(root, 'vision/v001-core.md', VISION_BODY);
  approveVision(root, 'vision:v001');
  recordReview(root, 'spec:s001', 'spec', specWithBadCheck);

  // allowlist 外 -> 拒否
  assert.throws(
    () => _internal.cmdSpecReady({ positional: ['ready', 's001'], root }),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'checks-allowlist'));
      return true;
    }
  );

  // spec の checks を承認する decision を decided で記録
  append(root, { type: 'created', subject: 'decision:d001', actor: { kind: 'agent' } });
  tickMs();
  append(root, {
    type: 'decision.recorded',
    subject: 'decision:d001',
    actor: { kind: 'human' },
    refs: [{ rel: 'approves', to: 'spec:s001' }],
  });
  const r = _internal.cmdSpecReady({ positional: ['ready', 's001'], root });
  assert.equal(r.to, 'ready');
});

test('spec ready: draft でない spec は拒否', () => {
  const root = tmpRoot();
  _internal.cmdNew({ positional: ['spec', 'x'], root });
  _internal.cmdNew({ positional: ['vision', 'core'], root });
  writeFile(root, 'specs/s001-x/spec.md', SPEC_BODY());
  writeFile(root, 'vision/v001-core.md', VISION_BODY);
  approveVision(root, 'vision:v001');
  recordReview(root, 'spec:s001', 'spec', SPEC_BODY());
  _internal.cmdSpecReady({ positional: ['ready', 's001'], root }); // -> ready
  assert.throws(() => _internal.cmdSpecReady({ positional: ['ready', 's001'], root }), Refusal);
});

// ------------------------------------------------------------------
// campaign launch
// ------------------------------------------------------------------
const CHARTER_BODY = `---
id: c001
refs:
  - covers spec:s001
---

# charter: reporting

## UX Outcome
レポートを得る。

## Coverage
spec:s001 を covers。

## Depends On
なし。

## Stop Conditions
budget 超過で停止。

## Risk Tiers
low。

## Non-Regression Focus
既存 export を壊さない。

## Cross-Checks
全体整合。
`;

function makeReadySpec(root) {
  _internal.cmdNew({ positional: ['spec', 'csv-export'], root });
  _internal.cmdNew({ positional: ['vision', 'core'], root });
  writeFile(root, 'specs/s001-csv-export/spec.md', SPEC_BODY());
  writeFile(root, 'vision/v001-core.md', VISION_BODY);
  approveVision(root, 'vision:v001');
  recordReview(root, 'spec:s001', 'spec', SPEC_BODY());
  _internal.cmdSpecReady({ positional: ['ready', 's001'], root });
}

test('campaign launch: coverage spec が ready でなければ拒否、ready 後に成立', () => {
  const root = tmpRoot();
  // spec は draft のまま
  _internal.cmdNew({ positional: ['spec', 'csv-export'], root });
  _internal.cmdNew({ positional: ['vision', 'core'], root });
  writeFile(root, 'specs/s001-csv-export/spec.md', SPEC_BODY());
  writeFile(root, 'vision/v001-core.md', VISION_BODY);
  _internal.cmdNew({ positional: ['campaign', 'reporting'], root });
  writeFile(root, 'campaigns/c001-reporting/charter.md', CHARTER_BODY);
  recordReview(root, 'campaign:c001', 'launch', CHARTER_BODY);

  // coverage spec が draft -> 拒否
  assert.throws(
    () => _internal.cmdCampaign({ positional: ['launch', 'c001'], root }),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'coverage-ready'));
      return true;
    }
  );

  // spec を ready に
  approveVision(root, 'vision:v001');
  recordReview(root, 'spec:s001', 'spec', SPEC_BODY());
  _internal.cmdSpecReady({ positional: ['ready', 's001'], root });

  // まだ campaign launch は review が古い可能性はない（charter 未編集）-> 成立
  const r = _internal.cmdCampaign({ positional: ['launch', 'c001'], root });
  assert.equal(r.to, 'active');
});

test('campaign launch: launch review 欠落で拒否', () => {
  const root = tmpRoot();
  makeReadySpec(root);
  _internal.cmdNew({ positional: ['campaign', 'reporting'], root });
  writeFile(root, 'campaigns/c001-reporting/charter.md', CHARTER_BODY);
  // review なし
  assert.throws(
    () => _internal.cmdCampaign({ positional: ['launch', 'c001'], root }),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'launch-review'));
      return true;
    }
  );
});

test('campaign launch: charter 欄欠落で拒否', () => {
  const root = tmpRoot();
  makeReadySpec(root);
  _internal.cmdNew({ positional: ['campaign', 'reporting'], root });
  const broken = CHARTER_BODY.replace(/## Risk Tiers[\s\S]*?## Non-Regression Focus/, '## Non-Regression Focus');
  writeFile(root, 'campaigns/c001-reporting/charter.md', broken);
  recordReview(root, 'campaign:c001', 'launch', broken);
  assert.throws(
    () => _internal.cmdCampaign({ positional: ['launch', 'c001'], root }),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'charter-sections'));
      return true;
    }
  );
});

// ------------------------------------------------------------------
// campaign close
// ------------------------------------------------------------------
function launchCampaign(root) {
  makeReadySpec(root);
  _internal.cmdNew({ positional: ['campaign', 'reporting'], root });
  writeFile(root, 'campaigns/c001-reporting/charter.md', CHARTER_BODY);
  recordReview(root, 'campaign:c001', 'launch', CHARTER_BODY);
  _internal.cmdCampaign({ positional: ['launch', 'c001'], root });
}

// accepted run を journal に直接構成する（run.js は別担当）。
function makeAcceptedRun(root, rid, campaign, task) {
  tickMs();
  append(root, {
    type: 'created',
    subject: `run:${rid}`,
    actor: { kind: 'agent' },
    data: { type: 'normal', campaign, task },
  });
  tickMs();
  append(root, {
    type: 'transitioned',
    subject: `run:${rid}`,
    actor: { kind: 'agent' },
    data: { from: 'verified', to: 'accepted', guard_results: [] },
  });
}

test('campaign close: run 未受入 / report 欠落で拒否 -> 揃えて成立', () => {
  const root = tmpRoot();
  launchCampaign(root);

  // run なし -> 拒否
  assert.throws(
    () => _internal.cmdCampaign({ positional: ['close', 'c001'], root }),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'runs-accepted'));
      return true;
    }
  );

  // accepted run（task T001 消化）を作る
  makeAcceptedRun(root, 'r-1-csv', 'c001', 'T001');
  // completion review
  recordReview(root, 'campaign:c001', 'completion', CHARTER_BODY);

  // completion report がまだ無い -> 拒否
  assert.throws(
    () => _internal.cmdCampaign({ positional: ['close', 'c001'], root }),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'completion-report'));
      return true;
    }
  );

  // report を置く
  writeFile(root, 'campaigns/c001-reporting/report.md', '# report: c001\n完了。\n');

  const r = _internal.cmdCampaign({ positional: ['close', 'c001'], root });
  assert.equal(r.to, 'closed');
  const snap = derive(readAll(root));
  assert.equal(snap.nodes['campaign:c001'].status, 'closed');
});

test('campaign close: open gap が残ると拒否', () => {
  const root = tmpRoot();
  launchCampaign(root);
  makeAcceptedRun(root, 'r-1-csv', 'c001', 'T001');
  recordReview(root, 'campaign:c001', 'completion', CHARTER_BODY);
  writeFile(root, 'campaigns/c001-reporting/report.md', '# report\n');
  openGap(root, 'g009', 'campaign:c001', { blocking: false, route: 'vision' });
  assert.throws(
    () => _internal.cmdCampaign({ positional: ['close', 'c001'], root }),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'gaps-terminal'));
      return true;
    }
  );
  // routed にすれば通る
  closeGap(root, 'g009', 'routed');
  const r = _internal.cmdCampaign({ positional: ['close', 'c001'], root });
  assert.equal(r.to, 'closed');
});

// ------------------------------------------------------------------
// retire
// ------------------------------------------------------------------
test('retire: ノードを retired に遷移させファイルは移動しない', () => {
  const root = tmpRoot();
  const created = _internal.cmdNew({ positional: ['spec', 'x'], root });
  const before = fs.existsSync(path.join(root, created.path));
  const r = _internal.cmdRetire({ positional: ['spec:s001'], root });
  assert.equal(r.to, 'retired');
  // ファイルは残っている
  assert.equal(fs.existsSync(path.join(root, created.path)), before);
  const snap = derive(readAll(root));
  assert.equal(snap.nodes['spec:s001'].status, 'retired');
});

test('retire: 存在しない ref / ref 形式不正で拒否', () => {
  const root = tmpRoot();
  assert.throws(() => _internal.cmdRetire({ positional: ['spec:sZZZ'], root }), Refusal);
  assert.throws(() => _internal.cmdRetire({ positional: ['bogus'], root }), Refusal);
});

// ------------------------------------------------------------------
// dispatcher run() の JSON 出力
// ------------------------------------------------------------------
test('run() は jsonMode で JSON を stdout に出す', async () => {
  const root = tmpRoot();
  const r = await authoring.run({ command: 'new', positional: ['spec', 'json test'], flags: {}, root, jsonMode: true });
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'spec');
});
