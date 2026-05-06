[English](README.md) | 日本語

# cc-iasd

cc-iasd は、AI 駆動開発のための project-context framework です。

Codex、Claude Code、cc-sdd のような実装エージェントを置き換えるものではありません。それらの外側で、制約、ユーザー入力、理想状態、features、ロードマップ、仕様、マイルストーン、logs、証跡、エスカレーション、完了報告を管理する project-context を作ります。

## 基本構造

```text
project-context/
  runtime/   # cc-iasd 設定、lock、adapter、生成物
  rules/     # 安定的な policy、role、template、checklist
  user/      # 人間が書いた意図、制約、判断、好み
  product/   # ideal、spec などの product 正本
  ops/       # scopes、cycles、evidence
  reference/ # 正本ではない参照資料
  src/       # 成果物 project root
```

基本の流れは次です。

```text
user input
  -> product/ideal
  -> ops/scopes/features
  -> ops/scopes/roadmaps
  -> product/specs
  -> ops/scopes/milestones
  -> ops/cycles
  -> ops/evidence
```

## インストール

project-context root で npx から実行します。

```bash
npx cc-iasd@latest init --doc-lang Japanese --dev-lang TypeScript
npx cc-iasd@latest doctor
npx cc-iasd@latest feature add feature-a --kind epic --summary "Add a core feature" --pillar "Core experience"
npx cc-iasd@latest roadmap add roadmap-a --summary "First roadmap" --goal "Ship the first usable flow"
npx cc-iasd@latest spec add spec-a --summary "Define the first implementation slice"
npx cc-iasd@latest milestone add milestone-a --summary "First milestone" --feature feature-a --roadmap roadmap-a --spec spec-a --tasks spec-a
npx cc-iasd@latest run cycle milestone-a
npx cc-iasd@latest review add milestone-a --type light --summary "Review implementation result" --result "No blocking findings"
npx cc-iasd@latest escalate milestone-a
npx cc-iasd@latest report milestone-a
npx cc-iasd@latest view evidence
npx cc-iasd@latest view current
npx cc-iasd@latest view scope milestone-a
npx cc-iasd@latest log event --summary "Updated project context"
npx cc-iasd@latest product outdate spec spec-a
npx cc-iasd@latest ops archive roadmap roadmap-a
```

このリポジトリからローカルに確認する場合は次です。

```bash
node bin/cc-iasd.js init /tmp/my-project-context --doc-lang Japanese --dev-lang TypeScript
node bin/cc-iasd.js doctor /tmp/my-project-context
node bin/cc-iasd.js feature add feature-a --kind epic --summary "Add a core feature" --pillar "Core experience" --root /tmp/my-project-context
node bin/cc-iasd.js roadmap add roadmap-a --summary "First roadmap" --goal "Ship the first usable flow" --root /tmp/my-project-context
node bin/cc-iasd.js spec add spec-a --summary "Define the first implementation slice" --root /tmp/my-project-context
node bin/cc-iasd.js milestone add milestone-a --summary "First milestone" --feature feature-a --roadmap roadmap-a --spec spec-a --tasks spec-a --root /tmp/my-project-context
node bin/cc-iasd.js run cycle milestone-a --root /tmp/my-project-context
node bin/cc-iasd.js review add milestone-a --type light --summary "Review implementation result" --result "No blocking findings" --root /tmp/my-project-context
node bin/cc-iasd.js escalate milestone-a --root /tmp/my-project-context
node bin/cc-iasd.js report milestone-a --root /tmp/my-project-context
node bin/cc-iasd.js view evidence --root /tmp/my-project-context
node bin/cc-iasd.js view current --root /tmp/my-project-context
node bin/cc-iasd.js view scope milestone-a --root /tmp/my-project-context
node bin/cc-iasd.js log event --summary "Updated project context" --root /tmp/my-project-context
node bin/cc-iasd.js product outdate spec spec-a --root /tmp/my-project-context
node bin/cc-iasd.js ops archive roadmap roadmap-a --root /tmp/my-project-context
```

## `init` が作る構成

```text
runtime/
  cc-iasd.yaml
  lock.json

rules/
  policies/
  roles/
  templates/
  project-policies.md

user/
  product-intent.md
  constraints.md
  decisions.md
  preferences.md
  scratch.md

ops/
  scopes/
    features/
      archived/
    roadmaps/
      archived/
    milestones/
      archived/
  cycles/
    archived/
  evidence/
    logs/
      archived/
    reviews/
      archived/
    reports/
      archived/

reference/
  INDEX.md

src/
  README.md
```

## 現在の状態

このリポジトリは `myurait/ledger-flow` からの移行初期段階です。

現在の npm CLI は、新しい product / ops / reference 構造の作成と検査に加え、feature、roadmap、spec、cycle、review、report、escalation、log、view、product outdate、ops archive の各コマンドに対応しています。

## ライセンス

MIT
