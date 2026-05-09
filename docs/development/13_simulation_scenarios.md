# 13. Simulation Scenarios

作成日: 2026-05-09  
状態: 初期シナリオ

---

## 1. この文書の目的

この文書は、cc-iasd の artifact 境界、cycle の進み方、campaign の粒度、debt の漏れ方を検証するための再利用可能なシミュレーションシナリオを定義する。

ここにあるシナリオは、実装コードを書くための要件定義ではない。cc-iasd の governance framework が、複合機能、debt、spec への戻し、milestone/cycle/campaign の境界を扱えるかを確認するための検証素材である。

---

## 2. Scenario A: Rich Memo Web App

### 2.1 想定プロダクト

WYSIWYG を持つリッチなメモ Web アプリ。

主要機能:

- WYSIWYG editor
- dashboard
- external API
- AI agent adapter
- MCP support
- schedule feature
- smartphone support
- notification delivery

### 2.2 シミュレーション目的

このシナリオでは、次を観察する。

```text
観察対象:
- product/ideal から feature / roadmap / spec / milestone へ落ちる粒度
- plan.md が spec-local implementation plan として機能するか
- milestone が必須の実行境界として機能するか
- campaign が複数 cycle の進行 envelope として過剰でないか
- cycle feedback がどの artifact へ漏れるか
- debt を feature backlog と spec で二重管理せずに扱えるか
```

### 2.3 セットアップ手順

```bash
rm -rf /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js init /tmp/cc-iasd-rich-memo-sim --doc-lang Japanese --dev-lang TypeScript --force
node bin/cc-iasd.js doctor /tmp/cc-iasd-rich-memo-sim
```

### 2.4 作成する主要 artifact

```text
product/ideal/rich-note-experience.md

ops/scopes/features/
  editor-workspace.md
  integration-surface.md
  scheduled-mobile-delivery.md
  platform-debt.md

ops/scopes/roadmaps/
  roadmap-mvp.md

product/specs/
  wysiwyg-editor-dashboard/
  external-api-ai-mcp/
  schedule-mobile-notifications/
  platform-debt-hardening/

ops/scopes/milestones/
  m001-editor-dashboard.md
  m002-api-ai-mcp.md
  m003-schedule-mobile-notify.md
  m004-debt-hardening.md

ops/campaigns/
  campaign_20260509_rich-note-mvp/
    plan.md
    state.md
    queue.md
    aggregate-report.md

ops/cycles/
  cycle_<timestamp>_m001-editor-dashboard/
  cycle_<timestamp>_m002-api-ai-mcp/
  cycle_<timestamp>_m003-schedule-mobile-notify/
  cycle_<timestamp>_m004-debt-hardening/
```

`ops/campaigns/` は現時点では CLI 未実装である。そのため、このシナリオでは手書き artifact として作る。

### 2.5 CLI 実行例

```bash
node bin/cc-iasd.js feature add editor-workspace \
  --kind epic \
  --summary "WYSIWYG memo editor and dashboard workspace" \
  --pillar "Rich note experience" \
  --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js feature add integration-surface \
  --kind epic \
  --summary "External API, AI agent adapter, and MCP surface" \
  --pillar "Automation boundary" \
  --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js feature add scheduled-mobile-delivery \
  --kind epic \
  --summary "Scheduling, smartphone support, and notification delivery" \
  --pillar "Reliable follow-up" \
  --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js feature add platform-debt \
  --kind supporting \
  --summary "Cross-cutting debt and hardening work discovered during cycles" \
  --pillar "Operational sustainability" \
  --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js roadmap add roadmap-mvp \
  --summary "Rich memo MVP roadmap" \
  --goal "Ship a coherent editor-first product with bounded automation" \
  --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js spec add wysiwyg-editor-dashboard \
  --summary "Create the editor shell, rich note model, and dashboard read model" \
  --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js spec add external-api-ai-mcp \
  --summary "Define external API, AI agent adapter, and MCP boundaries" \
  --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js spec add schedule-mobile-notifications \
  --summary "Define scheduling, smartphone workflow, and notification delivery" \
  --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js spec add platform-debt-hardening \
  --summary "Track hardening specs promoted from cycle feedback" \
  --root /tmp/cc-iasd-rich-memo-sim
```

milestone 作成:

```bash
node bin/cc-iasd.js milestone add m001-editor-dashboard \
  --summary "Editor and dashboard execution boundary" \
  --feature editor-workspace \
  --roadmap roadmap-mvp \
  --spec wysiwyg-editor-dashboard \
  --tasks wysiwyg-editor-dashboard \
  --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js milestone add m002-api-ai-mcp \
  --summary "Integration surface execution boundary" \
  --feature integration-surface \
  --roadmap roadmap-mvp \
  --spec external-api-ai-mcp \
  --tasks external-api-ai-mcp \
  --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js milestone add m003-schedule-mobile-notify \
  --summary "Schedule mobile notification execution boundary" \
  --feature scheduled-mobile-delivery \
  --roadmap roadmap-mvp \
  --spec schedule-mobile-notifications \
  --tasks schedule-mobile-notifications \
  --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js milestone add m004-debt-hardening \
  --summary "Promoted debt and hardening execution boundary" \
  --feature platform-debt \
  --roadmap roadmap-mvp \
  --spec platform-debt-hardening \
  --tasks platform-debt-hardening \
  --root /tmp/cc-iasd-rich-memo-sim
```

cycle / review / report:

```bash
node bin/cc-iasd.js run cycle m001-editor-dashboard --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js run cycle m002-api-ai-mcp --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js run cycle m003-schedule-mobile-notify --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js run cycle m004-debt-hardening --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js review add m001-editor-dashboard --type light --summary "Review editor simulation boundary" --result "passed-with-simulation-assumptions" --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js review add m002-api-ai-mcp --type light --summary "Review integration simulation boundary" --result "passed-with-contract-parity-debt" --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js review add m003-schedule-mobile-notify --type light --summary "Review schedule mobile notification boundary" --result "passed-with-provider-assumption" --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js review add m004-debt-hardening --type light --summary "Review debt ownership normalization" --result "passed" --root /tmp/cc-iasd-rich-memo-sim

node bin/cc-iasd.js report m001-editor-dashboard --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js report m002-api-ai-mcp --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js report m003-schedule-mobile-notify --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js report m004-debt-hardening --root /tmp/cc-iasd-rich-memo-sim
```

検査:

```bash
node bin/cc-iasd.js doctor /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js view current --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js view evidence --root /tmp/cc-iasd-rich-memo-sim
```

---

## 3. Artifact 記述例

### 3.1 ideal

`product/ideal/rich-note-experience.md` には、プロダクトの目標体験を書く。

記述するもの:

```text
- Source Inputs
- Target Experience
- Non Goals
- Product Principles
- Success Signals
- Constraints
- Open Questions
```

このシナリオでは、WYSIWYG editor、dashboard、external API、AI adapter、MCP、schedule、SP、notification を一つの体験として扱う。

### 3.2 feature

このシナリオでは、feature を次の4つに分ける。

```text
editor-workspace:
  WYSIWYG editor、note model、dashboard

integration-surface:
  external API、AI agent adapter、MCP

scheduled-mobile-delivery:
  schedule、SP workflow、notification

platform-debt:
  cycle feedback から promoted された debt / hardening
```

`platform-debt` は、現行設計の範囲内で debt を受けるための supporting feature である。

重要なのは、debt の詳細本文を feature backlog に持たせすぎないことである。feature backlog は参照とrouting状態に留め、詳細は必要に応じて spec へ移す。

### 3.3 roadmap

`ops/scopes/roadmaps/roadmap-mvp.md` には、MVP の実現順序を書く。

このシナリオでは次の順序にする。

```text
1. m001-editor-dashboard
2. m002-api-ai-mcp
3. m003-schedule-mobile-notify
4. m004-debt-hardening
```

roadmap は実行状態やcycle feedbackを持たない。

### 3.4 spec

spec は `product/specs/<spec-id>/` に置く。

各 spec は次を持つ。

```text
spec.md
plan.md
research.md
data-model.md
contracts/README.md
tasks.md
```

`plan.md` は spec-local implementation plan とする。roadmap、milestone queue、campaign progression、cycle state、runtime handoff、execution evidence は入れない。

### 3.5 milestone

milestone は必須の実行境界として使う。

milestone に書くもの:

```text
- Linked Feature
- Linked Roadmap
- Linked Spec
- Linked Tasks
- Included / Excluded
- Human Decisions Required
- Autonomous Proceed Status
```

milestone に書かないもの:

```text
- 実行ログ
- handoff
- debt backlog
- spec detail
- review body
```

### 3.6 campaign

campaign は現時点では未実装であり、このシナリオでは手書きする。

campaign に書くもの:

```text
- milestone queue
- allowed scope
- automatic progression conditions
- mandatory stop conditions
- report conditions
- aggregate report
```

campaign に書かないもの:

```text
- runtime handoff
- implementation evidence body
- source code changes
```

campaign は runtime I/O を持たない。runtime I/O は cycle に閉じる。

### 3.7 cycle

cycle は runtime I/O の唯一の単位である。

cycle に書くもの:

```text
state.md:
  result、open items、review evidence、remaining risk

handoff.md:
  runtime に渡す入力packet

knowledge.md:
  cycle-local な観察、promotion candidates
```

---

## 4. Cycle Feedback と Debt Routing

このシナリオで観察する中心は、cycle feedback が cycle 内に閉じないことである。

例:

```text
m001:
  editor recovery tests
  serialization migration risk

m002:
  API/MCP contract parity tests
  AI write confirmation UX

m003:
  mobile viewport regression
  failed notification evidence mapping
```

routing rule:

```text
cycle feedback
  -> cycle open item
  -> classified
  -> exactly one owner artifact
```

owner artifact 候補:

```text
cycle-local
feature backlog reference
product/specs/<spec-id>
user/decisions.md candidate
review finding
report item
```

禁止すること:

```text
- debt を cycle に閉じ込めて死蔵する
- debt を feature backlog に全文管理して肥大化させる
- debt を spec と backlog に二重記載する
- owner のない TBD を残す
```

---

## 5. シナリオから得た設計示唆

有効だった原則:

```text
Only cycle owns runtime I/O.
Campaign orchestrates cycle progression, but does not receive runtime output directly.
Milestone bounds execution, but does not store execution state.
Feature backlog may reference debt, but should not duplicate spec detail.
Spec receives debt only when behavior, contract, data model, acceptance criteria, or task breakdown changes.
```

再検討が必要な点:

```text
- feature という名前は debt / refactor / research を扱うには狭い
- campaign / cycle の語感はまだ重い
- campaign artifact を正式導入するなら、context肥大化を抑える view が必要
- completion report は生成直後の要約が粗く、実運用では追記規律が必要
```

---

## 6. シナリオ完了条件

このシナリオは、次を満たせば完了とする。

```text
- cc-iasd doctor が通る
- view current で product / scope / cycle / evidence が追える
- view evidence で milestone -> cycle -> review/report の関係が追える
- campaign aggregate report が progression rationale を持つ
- debt が exactly one owner artifact に分類されている
```

---

## 7. 保存済み実行例

このシナリオの初回実行結果は、作業時点では次に保存した。

```text
/tmp/cc-iasd-rich-memo-sim/SIMULATION_OVERVIEW.md
```

ただし `/tmp` は永続保存先ではない。再利用する場合は、この文書の手順に従って新しい project-context を作成する。
