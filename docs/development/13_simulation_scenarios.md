# 13. Simulation Scenario Tests

作成日: 2026-05-09  
状態: 初期テスト手順

---

## 1. この文書の目的

この文書は、cc-iasd の artifact 境界、cycle の進み方、未実装 artifact の扱い、feedback の漏れ方を確認するための再利用可能なシミュレーションテスト手順を定義する。

ここにある内容は、シミュレーションの方向性を決定するための要件定義ではない。cc-iasd の governance framework が、複合機能、未決定事項、debt、spec への戻し、実行単位の境界を扱えるかを確認するための結合テスト手順である。

この文書で固定するものは、入力シナリオ、実行手順、観察観点、判定観点である。シミュレーション中に実際に作成される artifact の一覧や具体的な分割結果は、テストの出力結果として観察する。

---

## 2. Scenario Test A: Rich Memo Web App

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

### 2.2 テスト目的

このテストでは、次を観察する。

```text
観察対象:
- product 正本から scope / spec / execution boundary へ分解される粒度
- spec-local plan が、上位の進行計画や runtime state と衝突しないか
- execution boundary が、実装単位として過不足なく機能するか
- 複数 execution cycle をまとめる未実装 artifact が必要になるか
- cycle feedback が、どの責務の文書へ移管されるべきか
- debt や follow-up を二重管理せず、単一の所有先に分類できるか
```

### 2.3 実行環境

```text
作業ディレクトリ:
  /tmp/cc-iasd-rich-memo-sim

前提:
  cc-iasd の現行 CLI を使う
  実装コードは書かない
  artifact は実行結果として観察する
```

### 2.4 実行手順

この手順では、artifact の具体的な ID や個数を先に固定しない。実行者は、想定プロダクトを入力として読み、cc-iasd の現行コマンドで必要な artifact を作成する。

記録するもの:

```text
- 実際に実行したコマンド
- 作成された artifact
- 途中で既存 artifact では不足した箇所
- 手書きまたは暫定で補った artifact
- 実行後に見直した分解
```

初期化する。

```bash
node bin/cc-iasd.js init /tmp/cc-iasd-rich-memo-sim --doc-lang Japanese --dev-lang TypeScript --force
node bin/cc-iasd.js doctor /tmp/cc-iasd-rich-memo-sim
```

product 入力を作成する。

```text
product 正本には、2.1 の想定プロダクトを一つの体験入力として記述する。
```

scope / progression / spec を作成する。

```bash
node bin/cc-iasd.js feature add <feature-id> --kind <kind> --summary <summary> --pillar <pillar> --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js roadmap add <roadmap-id> --summary <summary> --goal <goal> --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js spec add <spec-id> --summary <summary> --root /tmp/cc-iasd-rich-memo-sim
```

execution boundary を作成する。

```bash
node bin/cc-iasd.js milestone add <milestone-id> \
  --summary <summary> \
  --feature <feature-id> \
  --roadmap <roadmap-id> \
  --spec <spec-id> \
  --tasks <spec-id> \
  --root /tmp/cc-iasd-rich-memo-sim
```

execution cycle、review、report を実行する。

```bash
node bin/cc-iasd.js run cycle <milestone-id> --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js review add <milestone-id> --type <type> --summary <summary> --result <result> --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js report <milestone-id> --root /tmp/cc-iasd-rich-memo-sim
```

検査する。

```bash
node bin/cc-iasd.js doctor /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js view current --root /tmp/cc-iasd-rich-memo-sim
node bin/cc-iasd.js view evidence --root /tmp/cc-iasd-rich-memo-sim
```

---

## 3. 観察手順

### 3.1 作成された artifact の観察

実行後に、作成された artifact を列挙する。

観察するもの:

```text
- product 正本として何が作られたか
- scope artifact として何が作られたか
- spec artifact として何が作られたか
- execution boundary として何が作られたか
- runtime I/O として何が作られたか
- evidence として何が作られたか
- 未実装 artifact の代替物として何が作られたか
```

ここでは、期待一覧と実出力を一致させることを目的にしない。実出力が、cc-iasd の責務境界に照らして説明可能かを確認する。

### 3.2 product 正本

`product/ideal/<ideal-id>.md` には、プロダクトの目標体験を書く。

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

このテストでは、WYSIWYG editor、dashboard、external API、AI adapter、MCP、schedule、SP、notification を一つの体験入力として扱う。

### 3.3 scope 分解

scope 分解では、プロダクト入力がどの粒度へ分解されたかを観察する。

観察するもの:

```text
- scope が大きすぎて実行境界を曖昧にしていないか
- scope が細かすぎて上位文脈を失っていないか
- debt / refactor / research が feature 名に押し込まれていないか
- backlog は詳細本文ではなく参照と routing 状態に留まっているか
```

debt を受ける artifact が作られた場合、それはテスト出力として記録する。あらかじめ特定の artifact 名や個数を正解として固定しない。

### 3.4 progression plan

progression plan では、複数の実行境界の順序と依存関係が表現できるかを観察する。

観察するもの:

```text
- 実行順序が product 正本や spec と矛盾していないか
- 実行状態や runtime output を保持していないか
- 途中で新しい scope や spec が必要になった場合の扱いが説明できるか
```

### 3.5 spec

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

### 3.6 execution boundary

execution boundary は必須の実行境界として使う。現行実装では milestone がこれに対応する。

execution boundary に書くもの:

```text
- Linked Feature
- Linked Roadmap
- Linked Spec
- Linked Tasks
- Included / Excluded
- Human Decisions Required
- Autonomous Proceed Status
```

execution boundary に書かないもの:

```text
- 実行ログ
- handoff
- debt backlog
- spec detail
- review body
```

### 3.7 未実装 artifact

CLI 未実装の artifact が必要になった場合は、次のルールで扱う。

```text
1. まず、なぜ既存 artifact では不足するのかを記録する
2. 次に、暫定 artifact を手書きで作る場合は temporary / experimental であることを明記する
3. その artifact が受け持つ責務と、受け持たない責務を記録する
4. runtime I/O、実装証跡、source code change を直接受け取らせない
5. 実行後、正式 artifact として昇格すべきか、既存 artifact に吸収すべきかを評価する
```

複数 cycle をまとめる artifact が必要になった場合に観察するもの:

```text
- 複数 execution boundary の進行条件
- 自動進行してよい範囲
- 人間判断で停止すべき条件
- aggregate report が必要な理由
- runtime I/O を持たずに orchestration だけを表現できるか
```

この節は、campaign を先に正解として固定しない。未実装 artifact の必要性を観察するための手順である。

### 3.8 runtime cycle

runtime cycle は runtime I/O の唯一の単位である。

runtime cycle に書くもの:

```text
state:
  result、open items、review evidence、remaining risk

handoff:
  runtime に渡す入力packet

knowledge:
  cycle-local な観察、promotion candidates
```

---

## 4. Feedback と Debt Routing の観察

このテストで観察する中心は、runtime cycle の feedback が cycle 内に閉じないことである。

観察する feedback の例:

```text
- 実装中に判明した設計不足
- acceptance criteria の不足
- contract / data model の不足
- test strategy の不足
- user decision が必要な未決定事項
- 実行境界の切り直しが必要な作業
- 将来対応でよいが忘れてはならない debt
```

routing rule は次である。

```text
runtime feedback
  -> runtime-local open item
  -> classified
  -> exactly one owner
```

owner の分類観点:

```text
- その cycle 内で閉じるもの
- product / spec 正本へ戻すもの
- scope backlog へ参照として残すもの
- 人間判断として提示するもの
- review finding として記録するもの
- completion / progress report に載せるもの
```

禁止すること:

```text
- feedback を runtime cycle に閉じ込めて死蔵する
- backlog に詳細本文を集約して肥大化させる
- 正本と backlog に同じ内容を二重記載する
- owner のない TBD を残す
- 状況に応じて判断する、という未分類のまま残す
```

---

## 5. 判定観点

このテストで確認する原則:

```text
Only cycle owns runtime I/O.
An orchestration artifact may coordinate multiple cycles, but must not receive runtime output directly.
An execution boundary bounds execution, but does not store execution state.
Backlog may reference debt, but should not duplicate spec detail.
Spec receives feedback only when behavior, contract, data model, acceptance criteria, or task breakdown changes.
```

判定時に確認する点:

```text
- 作成された artifact が、事前想定ではなく実行結果として説明できるか
- 未実装 artifact が、temporary / experimental として扱われているか
- runtime I/O が cycle 以外へ漏れていないか
- feedback が exactly one owner へ分類されているか
- evidence / review / report が実行証跡として追跡できるか
- context 肥大化を起こす artifact が作られていないか
```

---

## 6. テスト完了条件

このテストは、次を満たせば完了とする。

```text
- cc-iasd doctor が通る
- view current で product / scope / cycle / evidence が追える
- view evidence で milestone -> cycle -> review/report の関係が追える
- 未実装 artifact を使った場合、その必要性と責務境界が説明されている
- feedback / debt が exactly one owner に分類されている
- 作成された artifact 一覧が、テスト出力として別途記録されている
```

---

## 7. 保存済み実行例

このシナリオの初回実行結果は、作業時点では次に保存した。

```text
/tmp/cc-iasd-rich-memo-sim/SIMULATION_OVERVIEW.md
```

ただし `/tmp` は永続保存先ではない。再利用する場合は、この文書の手順に従って新しい project-context を作成する。
