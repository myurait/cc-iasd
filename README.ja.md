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
  ops/       # ideal、features、roadmap、spec、milestone、logs、evidence、report
  src/       # 成果物 project root
```

基本の流れは次です。

```text
user input
  -> ops/ideal
  -> ops/features
  -> ops/roadmaps
  -> ops/specs
  -> ops/milestones
  -> evidence / escalation / completion report
```

## インストール

project-context root で npx から実行します。

```bash
npx cc-iasd@latest init --doc-lang Japanese --dev-lang TypeScript
npx cc-iasd@latest doctor
npx cc-iasd@latest run milestone mvp-001
npx cc-iasd@latest report mvp-001
```

このリポジトリからローカルに確認する場合は次です。

```bash
node bin/cc-iasd.js init /tmp/my-project-context --doc-lang Japanese --dev-lang TypeScript
node bin/cc-iasd.js doctor /tmp/my-project-context
node bin/cc-iasd.js run milestone mvp-001 --root /tmp/my-project-context
node bin/cc-iasd.js report mvp-001 --root /tmp/my-project-context
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
  ideal/
  features/
    index.md
    backlog.md
    epics/
    supporting/
  roadmaps/
  specs/
  milestones/
    project-context/
      reviews/
  logs/
  decisions.md
  evidence-index.md
  knowledge.md

src/
  README.md
```

## 現在の状態

このリポジトリは `myurait/ledger-flow` からの移行初期段階です。

現在の npm CLI は project-context 初期化、構造検査、最小 milestone handoff 生成、completion report 生成に対応しています。escalation、evidence maintenance の各コマンドは今後実装対象です。

## ライセンス

MIT
