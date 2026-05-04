# 03. project-context アーキテクチャ

作成日: 2026-05-04  
状態: 統合整理版 v0.1

---

## 1. 基本構造

ledger の基本構造は次である。

```text
project-context/
  runtime/
  rules/
  user/
  ops/
  src/
```

`project-context` は ledger が所有する開発文脈である。`src/` は成果物 project の root である。

---

## 2. 推奨ディレクトリ構造

```text
project-context/
  runtime/
    cc-iasd.yaml
    lock.json
    framework-version.md
    plugins/
      spec-kit.yaml
      cc-sdd.yaml
      bmad.yaml
    adapters/
      src-worktree.yaml
      git.yaml
      agent-runtime.yaml
    commands/
      init.md
      run-milestone.md
      escalate.md
      report.md

  rules/
    policies/
      autonomy-policy.md
      escalation-policy.md
      evidence-policy.md
      language-policy.md
      testing-policy.md
    roles/
      planning-lead.md
      worker.md
      reviewer.md
      auditor.md
    templates/
      escalation-packet.md
      completion-report.md
      review-report.md
      role-handoff.md
    checklists/
      reviewer-checklist.md
      auditor-checklist.md

  user/
    product-intent.md
    constraints.md
    decisions.md
    preferences.md
    scratch.md

  ops/
    ideal/
      ideal-experience.md
      product-charter.md
    features/
      index.md
      backlog.md
      epics/
      supporting/
    roadmaps/
      <roadmap-id>.md
    specs/
      <spec-id>/
        requirements.md
        plan.md
        tasks.md
    milestones/
      <milestone-id>/
        status.md
        escalation.md
        completion-report.md
        evidence.md
        planning-package.md
        reviews/
          review_<timestamp>_<scope>.md
    logs/
      log_<timestamp>.md
    decisions.md
    evidence-index.md
    knowledge.md

  src/
    package.json
    composer.json
    go.mod
    app/
    tests/
```

実際の `ops/specs/` 構造は Spec Kit の生成物に合わせる。ledger は Spec Kit の構造を壊さない。

---

## 3. runtime/

`runtime/` は、framework provenance と adapter 設定を持つ。

```text
runtime/ の責務:
- ledger profile version
- framework lock
- plugin 定義
- adapter 設定
- command 定義
- project-context の実行設定
```

### 3.1 lock.json

`lock.json` は、project-context 作成時点の ledger / plugin / template の状態を記録する。

```json
{
    "cc_iasd_version": "0.1.0",
  "created_at": "2026-05-04",
  "spec_kernel": "spec-kit",
  "implementation_plugin": "cc-sdd-or-compatible",
  "src_root": "src",
  "profile": "default"
}
```

### 3.2 plugins/

plugins は、正本 framework への委譲設定を持つ。

```text
plugins/spec-kit.yaml:
  spec / plan / tasks の kernel 設定

plugins/cc-sdd.yaml:
  autonomous implementation loop の委譲設定

plugins/bmad.yaml:
  role / planning 補助を使う場合の設定
```

MVP では plugin 実装は最小でよい。最初は設定ファイルと設計上の差し替え点だけで成立させる。

---

## 4. rules/

`rules/` は、cc-iasd の恒常的な制約レイヤーである。

### 4.1 rules/policies/

```text
rules/policies/
  autonomy-policy.md
  escalation-policy.md
  evidence-policy.md
  language-policy.md
  testing-policy.md
```

ここには、自走範囲、停止条件、証跡要件、言語、テストなどの安定的な制約を置く。

### 4.2 rules/roles/

```text
rules/roles/
  planning-lead.md
  worker.md
  reviewer.md
  auditor.md
```

role は人格設定ではなく、責務、権限、入力文脈、出力成果物を定義する operation unit である。

### 4.3 rules/templates/ and rules/checklists/

```text
rules/templates/
  escalation-packet.md
  completion-report.md
  review-report.md
  role-handoff.md

rules/checklists/
  reviewer-checklist.md
  auditor-checklist.md
```

template と checklist は role output を evidence に接続するための安定的な形式を定義する。

---

## 5. user/

`user/` は、人間が与えた入力と判断を置く領域である。

```text
user/
  product-intent.md
  constraints.md
  decisions.md
  preferences.md
  scratch.md
```

ledger はこの領域を勝手に上書きしない。AI が整理する場合も、提案として扱い、人間判断を経て反映する。

---

## 6. ops/

`ops/` は、開発進行と証跡のトランザクション性レイヤーである。

### 6.1 ops/ideal/

```text
ops/ideal/
  ideal-experience.md
  product-charter.md
```

`ops/ideal/` は、`user/` の入力を開発判断に使える形へ正規化した正本を置く。ユーザー入力そのものではなく、Planning Lead や Reviewer が参照する開発運営上の正本である。

### 6.2 ops/features/

```text
ops/features/
  index.md
  backlog.md
  epics/
  supporting/
```

`ops/features/` は、ideal と roadmap の間に置く feature planning layer である。ChatLobby の旧 ledger 運用では backlog が早期に肥大化し、単独ファイルでは管理不能になった。そのため、MVP から index、backlog、epics、supporting を分ける。

```text
index.md:
  ideal pillar と epics / supporting features の対応を示す planning index

backlog.md:
  active roadmap 外の deferred request ledger

epics/:
  ideal pillar に紐づく大きな機能領域

supporting/:
  roadmap 候補または blocker 解消に使う具体寄りの feature
```

roadmap は `ops/features/` の情報を入力にして作る。roadmap 外の要望や将来構想を roadmap 本体へ直接混ぜない。

### 6.3 ops/roadmaps/

```text
ops/roadmaps/
  <roadmap-id>.md
```

`ops/roadmaps/` は、ideal をどの順序で実現へ近づけるかを定義する計画正本である。milestone は roadmap の一部を実行可能な自走単位に切り出したものであり、roadmap 自体を AI が勝手に変更してはならない。

### 6.4 ops/specs/

`ops/specs/` は Spec Kit の正本領域である。

```text
ops/specs/<spec-id>/
  requirements.md
  plan.md
  tasks.md
```

ledger は `requirements / plan / tasks` を独自に二重管理しない。

```text
ledger が行うこと:
- 対象 spec の解決
- tasks と milestone の対応付け
- implementation plugin への委譲
- evidence への参照追加

ledger が行わないこと:
- Spec Kit の requirements を別形式で再定義する
- tasks.md を別正本に複製する
- BMAD 側の task と Spec Kit 側の task を並列正本にする
```

### 6.5 ops/milestones/

milestone ごとの進捗、evidence、review、escalation、completion report を置く。

```text
ops/milestones/<milestone-id>/
  status.md
  evidence.md
  planning-package.md
  reviews/
    review_<timestamp>_<scope>.md
  escalation.md
  completion-report.md
```

`planning-package.md` は milestone 固有の補助文書である。原則として `ops/specs/<spec-id>/plan.md` が plan の正本であり、`planning-package.md` は milestone の scope、pilot 方針、validation scenario、未解決判断をまとめる補助文書として扱う。

review は原則として milestone 配下に置く。review は completion 判定、残リスク、implementation response plan、follow-up review と強く結びつくため、global review store ではなく `ops/milestones/<milestone-id>/reviews/` を正本配置とする。

milestone に紐づかない project-context 初期化、rules 変更、runtime adapter 変更、repo 全体監査などの review は、専用 milestone として `ops/milestones/project-context/reviews/` に置く。`ops/reviews/` は原則作らない。

### 6.6 ops/logs/

```text
ops/logs/
  log_<timestamp>.md
```

`ops/logs/` は project-context 全体の時系列作業台帳である。logs は milestone をまたぐ準備作業、設計判断、方針変更、初期化、環境確認も記録するため global に置く。

### 6.7 ops/evidence-index.md

`ops/evidence-index.md` は、spec、milestone、review、escalation、completion report への索引である。巨大ログではなく、正本成果物を後から追える evidence bridge として扱う。

---

## 7. src/

`src/` は成果物 project root である。

```text
src/ に置くもの:
- application code
- tests
- package manager files
- build config
- lint config
- runtime config
```

ledger は `src/` 内の技術スタックを一律に規定しない。

```text
src/ の例:
- PHP / Laravel project
- Node / TypeScript project
- Go project
- C# CLI project
- existing repository checkout
```

---

## 8. src isolation adapter

多くの coding agent や framework は、現在 directory を project root とみなす。ledger では実装対象 root が `src/` であるため、adapter が必要になる。

```text
src isolation adapter の責務:
- 実装対象 root が src/ であることを agent に伝える
- build / test / lint を src/ 内で実行する
- spec / evidence は project-context 側に残す
- commit / diff 対象をどう扱うかを設定する
```

MVP では、adapter は複雑な実装ではなく、明示的な設定・プロンプト・コマンド規約として定義すればよい。

---

## 9. Git 管理単位

Git 管理単位は未決である。

主な選択肢は次である。

```text
A. project-context 全体を 1 repository とする
B. src/ を成果物 repository とし、project-context は別 repository とする
C. project-context repository の submodule / worktree として src/ を扱う
```

MVP では A が最も単純である。ただし、成果物 project に ledger の痕跡を残さない目的を強く取る場合、B または C が候補になる。

---

## 10. 最小構成

MVP の最小構成は次である。

```text
project-context/
  runtime/
    lock.json
    cc-iasd.yaml

  rules/
    policies/
    roles/
    templates/

  user/
    product-intent.md
    constraints.md
    decisions.md
    scratch.md

  ops/
    ideal/
    features/
    roadmaps/
    specs/
    milestones/
    logs/
    evidence-index.md

  src/
```

この段階では、plugin の完全実装、multi-runtime adapter、Git 分離、複雑な update mechanism は不要である。
