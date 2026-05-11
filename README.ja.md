[English](README.md) | 日本語

# cc-iasd

cc-iasd は、AI 駆動開発のための project-context framework です。

Codex、Claude Code のような実装エージェントを置き換えるものではありません。それらの外側で、制約、ユーザー入力、理想状態、features、ロードマップ、仕様、campaign、run、logs、証跡、エスカレーション、完了報告を管理する project-context を作ります。

## 実行ハーネスとしての目的

cc-iasd は、人間の意図を境界づけられた AI 実行作業へ変換するための実行ハーネスです。

cc-iasd の目的は、自律実装が product intent から逸脱することを防ぐことです。作業が run に到達する前に、意図されたユーザー体験、想定機能の coverage、優先度、実装 scope、影響面、人間判断へ戻すべき事項を明確にし、AI エージェントが別の product を作り始めない状態を作ります。

この harness は次を目的とします。

- ユーザーが意図していない機能を作らせない
- task 分解の過程で想定機能を失わせない
- ideal、feature、spec、campaign、run を通じて機能の重要度を維持する
- 実行前に想定変更面と関連影響面を定義する
- infrastructure、cost、security、product value に関わる判断を早期に人間へ戻す
- 各 run を検証可能な小さく厳密な単位にする
- ユーザー体験への直接影響を campaign 単位でまとめる

## 基本構造

```text
project-context/
  runtime/   # cc-iasd 設定、lock、adapter、生成物
  rules/     # 安定的な policy、role、template、checklist
  user/      # 人間が書いた意図、制約、判断、好み
  product/   # ideal、spec などの product 正本
  ops/       # scopes、execution、evidence
  reference/ # 正本ではない参照資料
  src/       # 成果物 project root。cc-iasd runtime や spec は置かない
```

基本の流れは次です。

```text
user input
  -> product/ideal
  -> ops/scopes/features
  -> ops/scopes/roadmaps
  -> product/specs
  -> ops/execution/campaigns
  -> ops/execution/runs
  -> ops/evidence
```

## インストール

project-context root で npx から実行します。

```bash
npx cc-iasd@latest init --doc-lang Japanese --dev-lang TypeScript
npx cc-iasd@latest doctor
npx cc-iasd@latest ideal add i001-core --summary "Core product ideal"
# 続行前に product/ideal/i001-core.md の authored section を執筆します。
npx cc-iasd@latest feature add f001-feature-a --kind epic --summary "Add a core feature" --pillar "Core experience"
npx cc-iasd@latest roadmap add r001-first-roadmap --summary "First roadmap" --goal "Ship the first usable flow"
npx cc-iasd@latest spec add s001-first-slice --summary "Define the first implementation slice"
npx cc-iasd@latest campaign add c001-first-campaign --summary "First campaign" --roadmap r001-first-roadmap --spec s001-first-slice --tasks s001-first-slice
npx cc-iasd@latest run start c001-first-campaign
npx cc-iasd@latest open-item add <run-id> --kind follow-up --summary "Follow-up item"
npx cc-iasd@latest open-item resolve <run-id> oi-001 --resolution resolved --summary "Handled in this run"
npx cc-iasd@latest campaign mark-run c001-first-campaign <run-id> --status completed
npx cc-iasd@latest review add <run-id> --type light --summary "Review implementation result" --result "No blocking findings"
npx cc-iasd@latest escalate <run-id>
npx cc-iasd@latest report <run-id>
npx cc-iasd@latest reference add note planning-note --summary "Planning note"
npx cc-iasd@latest view evidence
npx cc-iasd@latest view current
npx cc-iasd@latest view run <run-id>
npx cc-iasd@latest log event --summary "Updated project context"
npx cc-iasd@latest product outdate spec s001-first-slice
npx cc-iasd@latest ops archive roadmap r001-first-roadmap
```

このリポジトリからローカルに確認する場合は次です。

```bash
node bin/cc-iasd.js init /tmp/my-project-context --doc-lang Japanese --dev-lang TypeScript
node bin/cc-iasd.js doctor /tmp/my-project-context
node bin/cc-iasd.js ideal add i001-core --summary "Core product ideal" --root /tmp/my-project-context
# 続行前に product/ideal/i001-core.md の authored section を執筆します。
node bin/cc-iasd.js feature add f001-feature-a --kind epic --summary "Add a core feature" --pillar "Core experience" --root /tmp/my-project-context
node bin/cc-iasd.js roadmap add r001-first-roadmap --summary "First roadmap" --goal "Ship the first usable flow" --root /tmp/my-project-context
node bin/cc-iasd.js spec add s001-first-slice --summary "Define the first implementation slice" --root /tmp/my-project-context
node bin/cc-iasd.js campaign add c001-first-campaign --summary "First campaign" --roadmap r001-first-roadmap --spec s001-first-slice --tasks s001-first-slice --root /tmp/my-project-context
node bin/cc-iasd.js run start c001-first-campaign --root /tmp/my-project-context
node bin/cc-iasd.js open-item add <run-id> --kind follow-up --summary "Follow-up item" --root /tmp/my-project-context
node bin/cc-iasd.js open-item resolve <run-id> oi-001 --resolution resolved --summary "Handled in this run" --root /tmp/my-project-context
node bin/cc-iasd.js campaign mark-run c001-first-campaign <run-id> --status completed --root /tmp/my-project-context
node bin/cc-iasd.js review add <run-id> --type light --summary "Review implementation result" --result "No blocking findings" --root /tmp/my-project-context
node bin/cc-iasd.js escalate <run-id> --root /tmp/my-project-context
node bin/cc-iasd.js report <run-id> --root /tmp/my-project-context
node bin/cc-iasd.js reference add note planning-note --summary "Planning note" --root /tmp/my-project-context
node bin/cc-iasd.js view evidence --root /tmp/my-project-context
node bin/cc-iasd.js view current --root /tmp/my-project-context
node bin/cc-iasd.js view run <run-id> --root /tmp/my-project-context
node bin/cc-iasd.js log event --summary "Updated project context" --root /tmp/my-project-context
node bin/cc-iasd.js product outdate spec s001-first-slice --root /tmp/my-project-context
node bin/cc-iasd.js ops archive roadmap r001-first-roadmap --root /tmp/my-project-context
```

## `init` が作る構成

```text
runtime/
  cc-iasd.yaml
  lock.json
  profile.md
  plugins.yaml
  adapters/

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
  execution/
    campaigns/
      archived/
    runs/
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

## `src/` の扱い

`src/` には成果物 project を配置します。

単一のリポジトリを扱う場合は、対象リポジトリを `src/` に clone するか、既存 checkout を `src/` にエイリアスしてください。

複数リポジトリを扱う場合は、`src/` 配下に横並びで clone してください。

```text
src/
  app-repository/
  api-repository/
  shared-library/
```

`src/` は成果物のための清潔な境界です。cc-iasd が管理する spec、runtime、run state、evidence、report、policy は `src/` の外側に置きます。cc-iasd は `src/` 配下の成果物 project に対して command を実行できますが、cc-iasd 所有 artifact を成果物 project 内に置くことを前提にしてはいけません。

AI agent は `src/` 配下ではファイルを作成・編集できます。`src/` の外側では、cc-iasd-managed artifact の新規作成は `cc-iasd` command または明示的人間操作で行い、AI agent は command が作成した artifact の authored content section を執筆します。

## 現在の状態

現在の npm CLI は、product / ops / reference 構造の作成と検査に加え、ideal、feature、roadmap、spec、campaign、run、open item、review、report、escalation、log、view、reference、product outdate、ops archive の各コマンドに対応しています。

## ライセンス

MIT
