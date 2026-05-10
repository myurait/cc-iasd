# 12. cc-iasd Role 設計方針

作成日: 2026-05-04  
状態: 追加整理版 v0.1

---

## 1. この文書の目的

この文書は、最近の「cc-iasd Role パッケージ調査」で得た前提をもとに、cc-iasd における role 設計を再整理するためのものである。

調査上の前提は次である。

```text
前提:
cc-iasd がそのまま正本として採用できる、独立した role パッケージ群は現時点では存在しない。
```

ここでいう role パッケージとは、次のような単位で独立配布され、cc-iasd に部分採択できるものを指す。

```text
対象にしていた role パッケージ:
- reviewer role
- auditor role
- planner role
- architect role
- devil's advocate role
- security reviewer role
- code quality reviewer role
- documentation reviewer role
- test reviewer role
- requirements reviewer role
- implementation reviewer role
```

調査結果として、これらを cc-iasd の role 定義としてそのまま採用できる単一リポジトリは見つからない、という前提を置く。

したがって、cc-iasd は role 本体を自前で設計する必要がある。ただし、単なるハンドメイドの role プロンプト集として作るべきではない。

この文書の目的は、次を明確にすることである。

```text
この文書で整理すること:
- cc-iasd が role を独自実装すべき理由
- 参考にするべき既存リポジトリ / 仕様 / フレームワーク
- role 定義に取り込むべきデファクトな方法論
- cc-iasd における role の責務境界
- role 定義ソースと runtime prompt の分離
- context / authority / tool / output の分離方針
- 初期実装に含める role と後段に回す role
```

---

## 2. 結論

cc-iasd の role は、既存の role prompt をコピーして作るのではなく、次のように設計する。

```text
cc-iasd role
  = source-defined operational role
  + runtime-specific compiled agent prompt
  + workflow / task dependency
  + tool permission boundary
  + context packet contract
  + output / evidence contract
```

つまり、cc-iasd における role は「人格」ではなく、project-context 内での責務分離単位である。

```text
role の本質:
- 何を判断してよいか
- 何を判断してはいけないか
- どの入力だけを受け取るか
- どの成果物を出すか
- どの evidence を残すか
- どの tool を使ってよいか
- どの条件で Planning Lead または人間判断へ戻すか
```

したがって、cc-iasd role は次のように扱う。

```text
採用方針:
- role の中身は cc-iasd が独自定義する
- role 定義方式は Claude Code Subagents / BMAD / AGENTS.md / SuperClaude から方法論を取り込む
- role は source YAML / source markdown で定義し、runtime 向け prompt に compile する
- Claude Code subagent 形式は主要な compile target とする
- BMAD 的な agent + workflow + task 分離を role 設計の中核参照とする
- AGENTS.md は project-wide instruction として扱い、role の代替にはしない
- SuperClaude は command / persona / mode / agent の分離方法を参照する
```

---

## 3. 参考にするべきリポジトリ・仕様・設計方式

### 3.1 AGENTS.md

AGENTS.md は、AI coding agent に project-specific instructions を与えるための標準的な Markdown 形式である。

参照元:

```text
https://agents.md/
https://github.com/agentsmd/agents.md
```

AGENTS.md から取り込むべき考え方は次である。

```text
取り込むべき点:
- agent 向け instruction を README から分離する
- project root に予測可能な instruction file を置く
- build / test / lint / style / security consideration を明示する
- monorepo や subproject では近い instruction を優先する
- 人間向け説明と agent 向け実行指示を分ける
```

ただし、AGENTS.md は role 定義の正本ではない。

```text
AGENTS.md の限界:
- project-wide instruction であり、role ごとの責務境界ではない
- reviewer / auditor / planner の独立した authority を表現しにくい
- tool permission や output contract を role 単位で制御しにくい
- Planning Lead / Worker / Auditor の分離は主眼ではない
```

cc-iasd での位置づけは次である。

```text
cc-iasd における AGENTS.md:
- runtime adapter が参照する project-wide instruction
- 実行 runtime 用補助文書
- role prompt の代替ではない
- role が参照する共通制約の一部
```

### 3.2 Claude Code Subagents

Claude Code Subagents は、role 定義の runtime target として最も直接的に利用しやすい。

参照元:

```text
https://docs.claude.com/en/docs/claude-code/subagents
https://docs.claude.com/en/docs/agent-sdk/subagents
```

Claude Code Subagents から取り込むべき点は次である。

```text
取り込むべき点:
- role ごとに独立した context window を持つ
- role ごとに system prompt を分離する
- role ごとに tool access を制限できる
- project-level subagent と user-level subagent を分けられる
- name / description / tools / model / prompt を明示する
- description によって自動委譲の判断材料を与える
```

Claude Code Subagents の基本形は次である。

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep
model: sonnet
---

You are a code reviewer...
```

cc-iasd は、この形式を手書きの正本にはしない。

cc-iasd 側では、より抽象度の高い role source を持ち、Claude Code Subagent は compile target とする。

```text
cc-iasd role source
  -> claude-code subagent markdown
  -> codex instruction adapter
  -> future runtime adapter
```

理由は、cc-iasd が Claude Code 専用フレームワークにならないようにするためである。

### 3.3 BMAD Method

BMAD Method は、role 設計の方法論として最も重要な参照元である。

参照元:

```text
https://docs.bmad-method.org/reference/agents/
https://docs.bmad-method.org/explanation/agents/
https://docs.bmad-method.org/how-to/customize-bmad/
https://github.com/bmadcode/BMAD-METHOD
```

BMAD から取り込むべき点は次である。

```text
取り込むべき点:
- agent を persona だけでなく workflow entrypoint として定義する
- agent source を YAML として管理し、runtime markdown へ compile する
- role / identity / communication style / core principles を分ける
- agent が workflow / task / template を参照する
- command menu により agent の実行可能範囲を明示する
- customization を正本から分離し、更新耐性を持たせる
```

特に重要なのは、BMAD では agent がロジックを直接すべて抱え込むのではなく、workflow や task を参照する点である。

cc-iasd でも、role にすべての手順を詰め込まない。

```text
避けるべき構成:
- Planning Lead prompt に全workflowを書く
- Reviewer prompt に全review checklistを書く
- Auditor prompt に全audit policyを書く
- Worker prompt にproject全規約を読ませる
```

cc-iasd で採用する構成は次である。

```text
採用する構成:
role
  -> workflow を参照する
  -> task を参照する
  -> checklist を参照する
  -> template を参照する
  -> output contract に従って結果を返す
```

### 3.4 SuperClaude Framework

SuperClaude は、Claude Code を構造化された開発プラットフォームに近づける configuration framework である。

参照元:

```text
https://github.com/SuperClaude-Org/SuperClaude_Framework
https://superclaude.org/
```

SuperClaude から取り込むべき点は次である。

```text
取り込むべき点:
- command と agent / persona / mode を分ける
- domain expert agent を文脈設定として扱う
- agent は別モデルや別プロセスではなく、behavioral context として扱える
- command-agent mapping を持つ
- document-only command と execution command を分ける
- orchestration / discovery / implementation / quality の処理カテゴリを分ける
```

ただし、SuperClaude をそのまま cc-iasd の role 正本にするべきではない。

```text
SuperClaude を正本にしない理由:
- Claude Code 拡張としての色が強い
- cc-iasd の project-context / src isolation / evidence bridge と直接一致しない
- agent 名や command 体系をそのまま取り込むと責務が衝突する
- cc-iasd は spec profile / implementation runtime / evidence model との統合が必要である
```

cc-iasd での位置づけは次である。

```text
cc-iasd における SuperClaude:
- role / command / mode の分離方式の参照元
- role を behavioral context として扱う実装例
- specialist agent の粒度設計の参考
- 直接採用対象ではない
```

### 3.5 OpenAI Codex / AGENTS.md 運用

Codex は repository 内の AGENTS.md により、コードベースの移動方法、テストコマンド、標準的な作業規約を誘導できる。

参照元:

```text
https://openai.com/index/introducing-codex/
https://help.openai.com/en/articles/11096431-openai-codex-cli-getting-started
https://github.com/openai/codex/blob/main/docs/agents_md.md
```

Codex / AGENTS.md 運用から取り込むべき点は次である。

```text
取り込むべき点:
- repo 内に agent 向け instructions を置く
- build / lint / test の実行方法を明示する
- agent の作業結果は terminal log / test output / diff で検証する
- agent が迷わないように project conventions を明文化する
```

ただし、Codex の AGENTS.md も role パッケージではない。

```text
Codex AGENTS.md の位置づけ:
- Worker や implementation runtime へ渡す repo-level instruction
- role の authority / context / output contract の代替ではない
- cc-iasd role source から生成される runtime adapter の補助対象
```

---

## 4. 採用しない方がよいもの

### 4.1 任意の role prompt 集

GitHub 上には、reviewer、planner、architect、security reviewer などの名前を持つ prompt 集が存在し得る。しかし、それらを cc-iasd role として採用するのは避ける。

理由は次である。

```text
採用しない理由:
- prompt の品質が検証しにくい
- version / changelog / compatibility が不明確
- context 境界が定義されていない
- tool permission が定義されていない
- output contract がない
- evidence model と接続されていない
- cc-iasd の campaign/run autonomy と接続されていない
```

cc-iasd では role prompt の文章そのものより、role を成立させる構造を重視する。

### 4.2 包括的 multi-agent framework の丸ごと採用

MetaGPT、ChatDev、BMAD、SuperClaude などは、role / workflow / command / artifact をそれぞれ持つ。

これらを丸ごと採用すると、cc-iasd の正本割り当てと衝突する。

```text
衝突する領域:
- spec / plan / tasks の正本
- workflow の主導権
- role の命名体系
- review / audit の成果物形式
- escalation の責任者
- project-context の所有者
```

cc-iasd の方針は、フレームワークを丸ごと入れることではない。

```text
cc-iasd の方針:
- Spec Kit は spec-driven artifact vocabulary の参照元として扱う
- implementation runtime は task implementation loop の委譲先として扱う
- BMAD は role / SOP methodology の参照元として扱う
- SuperClaude は command / persona / mode 分離の参照元として扱う
- role 本体は cc-iasd が自前で source-defined に設計する
```

---

## 5. cc-iasd role の設計原則

### 5.1 role は人格ではなく責務境界である

cc-iasd role は、AI に雰囲気を与えるための persona ではない。

```text
role が定義するもの:
- responsibility
- authority
- forbidden actions
- input context
- output artifact
- evidence requirement
- escalation condition
- tool boundary
```

人格要素は、必要なら communication style として最小限に留める。

```text
避ける:
- 過剰なキャラクター設定
- 架空の肩書きに依存した能力定義
- 「優秀な〜として振る舞え」だけの定義
- 曖昧な「ベストプラクティス」要求
```

### 5.2 role source と runtime prompt を分ける

cc-iasd は、Claude Code Subagent 用 Markdown を直接正本にしない。

正本は role source とする。

```text
role source:
  cc-iasd が所有する抽象 role 定義

runtime prompt:
  Claude Code / Codex / その他 runtime に渡すための生成物
```

推奨構造は次である。

```text
project-context/
  rules/
    roles/
      source/
        planning-lead.role.yaml
        worker.role.yaml
        code-reviewer.role.yaml
        auditor.role.yaml
    workflows/
      plan-campaign.md
      implement-task.md
      review-change.md
      audit-evidence.md
    checklists/
      code-review.md
      test-review.md
      security-review.md
    templates/
      review-report.md
      audit-finding.md
      role-handoff.md

  runtime/
    generated/
      claude-code/
        planning-lead.md
        worker.md
        code-reviewer.md
        auditor.md
      codex/
        AGENTS.role-notes.md
```

`runtime/generated/` は生成物であり、正本ではない。

### 5.3 role は workflow / task / checklist を参照する

role prompt にすべての手順を埋め込むと、更新が困難になり、各 role 間で手順が重複する。

cc-iasd では、role と workflow を分ける。

```text
role:
  誰が、何を、どの権限で行うか

workflow:
  どの順序で作業するか

task:
  具体的に何を実行するか

checklist:
  検査観点

template:
  出力形式
```

この分離は、BMAD の agent / workflow / task / template 分離を参照する。

### 5.4 role ごとに context を制限する

role 分離の目的は、名前を増やすことではない。

重要なのは、各 role に渡す context を制限することである。

```text
context 分離の目的:
- Worker に全体方針判断をさせない
- Reviewer に実装者の思考過程を過剰に読ませない
- Auditor に修正実行権限を持たせない
- Planning Lead に個別実装の詳細を抱え込ませない
- Devil's Advocate に成果物の最終決裁をさせない
```

role ごとの context は `Context Packet` として明示する。

```text
Role Context Packet:
- role_id
- invocation_reason
- scope
- allowed_sources
- excluded_sources
- input_artifacts
- expected_output
- evidence_required
- escalation_conditions
```

### 5.5 role ごとに tool permission を制限する

role は、使える tool も分ける。

command visibility は、role に渡す CLI surface を制限するための定義である。

ここでの visibility は、role runtime に見せる command を意味する。bootstrap 用 command や人間判断を前提にする command は、role-visible command として扱わない。

| Command | Role-visible to | Generated or updated artifact |
| --- | --- | --- |
| `cc-iasd init` | none | project-context scaffold: `product/`, `ops/`, `rules/`, `runtime/`, `user/`, `reference/`, `src/` |
| `cc-iasd profile update` | none | `runtime/profile.md`, `runtime/plugins.yaml`, `runtime/adapters/README.md`, `runtime/adapters/role-runtime.md` |
| `cc-iasd doctor` | Ideal Interviewer, Feature Scope Designer, Spec Designer, Design Reviewer, Planning Lead, Compliance Auditor | no artifact; readiness check only |
| `cc-iasd view current` | Ideal Interviewer, Feature Scope Designer, Spec Designer, Design Reviewer, Planning Lead | stdout only; no canonical artifact |
| `cc-iasd view scope <id>` | Design Reviewer, Planning Lead, Devil's Advocate | stdout only; scope boundary review view |
| `cc-iasd view run <id>` | Planning Lead, Worker, Compliance Auditor, Code Quality Auditor, Devil's Advocate | stdout only; run-local context view |
| `cc-iasd view evidence` | Planning Lead, Compliance Auditor, Devil's Advocate | stdout only; evidence overview view |
| `cc-iasd ideal add <id>` | Ideal Interviewer | `product/ideal/<ideal-id>.md`, `ops/evidence/logs/log_<timestamp>_ideal-add.md` |
| `cc-iasd product outdate ideal <id>` | Ideal Interviewer | move `product/ideal/<ideal-id>.md` to `product/ideal/outdated/<ideal-id>.md`, create log |
| `cc-iasd feature add <id>` | Feature Scope Designer | `ops/scopes/features/<feature-id>.md`, create log |
| `cc-iasd roadmap add <id>` | Planning Lead | `ops/scopes/roadmaps/<roadmap-id>.md`, create log |
| `cc-iasd spec add <id>` | Spec Designer | `product/specs/<spec-id>/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/README.md`, `tasks.md`, create log |
| `cc-iasd product outdate spec <id>` | Planning Lead | move `product/specs/<spec-id>/` to `product/specs/outdated/<spec-id>/`, create log |
| `cc-iasd campaign add <id>` | Planning Lead | `ops/execution/campaigns/<campaign-id>/plan.md`, `state.md`, `queue.md`, `aggregate-report.md`, create log |
| `cc-iasd run start <id>` | Planning Lead | `ops/execution/runs/<run-id>/plan.md`, `handoff.md`, `state.md`, `open-items.md`, `knowledge.md`; update campaign queue; create log |
| `cc-iasd open-item add <run-id>` | Worker | update `ops/execution/runs/<run-id>/open-items.md`, create log |
| `cc-iasd open-item resolve <run-id> <item-id>` | Planning Lead | update `ops/execution/runs/<run-id>/open-items.md`, create log |
| `cc-iasd review add <scope-id>` | Design Reviewer, Compliance Auditor, Code Quality Auditor, Devil's Advocate | `ops/evidence/reviews/review_<timestamp>_<summary>.md`, create log |
| `cc-iasd report <scope-ref>` | Planning Lead | `ops/evidence/reports/report_<timestamp>_<scope-id>.md`, create log |
| `cc-iasd escalate <scope-ref>` | Planning Lead | `ops/evidence/reports/escalation_<timestamp>_<scope-id>.md`, create log |
| `cc-iasd campaign mark-run <campaign-id> <run-id>` | Planning Lead | update campaign queue, campaign state, run state, create log |
| `cc-iasd log event` | Planning Lead | `ops/evidence/logs/log_<timestamp>_<type>.md` |
| `cc-iasd reference add historical\|external\|note <id>` | Planning Lead | `reference/historical-documents/<id>.md`, `reference/external/<id>.md`, or `reference/notes/<id>.md`; update `reference/INDEX.md`; create log |
| `cc-iasd ops archive <layer> <id>` | Planning Lead | move ops artifact to the target layer's `archived/` directory, create log |

```text
例:
Planning Lead:
  read docs, write planning docs, generate escalation/report

Worker:
  read specs, edit src, run tests, write implementation notes

Reviewer:
  read diff, read relevant specs, run read-only checks, write review report

Auditor:
  read evidence, inspect reports, write findings, cannot edit src

Security Reviewer:
  read diff, inspect configs, run security-oriented checks if available, cannot silently change code
```

Claude Code Subagents の `tools` 指定は、この runtime target として利用できる。

### 5.6 role output は成果物契約に従う

role の出力は自由文だけにしない。

```text
出力に必要なもの:
- conclusion
- scope_checked
- evidence
- findings
- severity
- unresolved_questions
- recommended_next_action
- escalation_required
```

これは Evidence Bridge と接続するために必要である。

### 5.7 role は Planning Lead の代替ではない

各 specialist role は、Planning Lead の判断を置き換えない。

```text
Planning Lead:
  run scope 内の進行責任を持つ

Worker:
  task を実装する

Reviewer:
  実装を検査する

Auditor:
  証跡と規律を検査する

Specialist:
  特定観点の判断材料を提供する
```

最終的に run scope 内で次に進めるか、停止するか、Escalation Packet を作るかは Planning Lead が判断する。

### 5.8 Planning Lead から design responsibility を分離する

Planning Lead は、進行判断、role orchestration、Human communication、campaign/run progression を担う。Planning Lead に ideal から feature scope を設計する責務、または feature / roadmap から spec / plan / tasks を設計する責務を持たせない。

分離する design responsibility は次である。

```text
Feature Scope Designer:
- product/ideal/ と user decisions から feature scope を設計する
- ops/scopes/features/<feature-id>.md の Scope / Roadmap Notes / Backlog を執筆する
- ideal が薄い場合は Planning Lead または Ideal Interviewer に戻す
- roadmap の進行順序、campaign/run の実行判断、spec task 分解は行わない

Spec Designer:
- feature scope と roadmap direction から spec / plan / tasks を設計する
- product/specs/<spec-id>/ の spec.md / plan.md / research.md / data-model.md / contracts / tasks.md を執筆する
- feature scope が薄い場合は Planning Lead または Feature Scope Designer に戻す
- roadmap の進行順序、campaign/run の実行判断、src 実装は行わない

Planning Lead:
- Feature Scope Designer と Spec Designer を呼び出す
- review 済み Designer output を Human communication、roadmap、campaign、run に接続する
- roadmap consultation、campaign/run progression、report、escalation を担う
- feature scope 本文や spec package 本文を自分で設計しない

Design Reviewer:
- ideal / feature / spec の各 artifact 執筆直後に、authoring role から起動される
- target artifact と最小の source context packet だけを読む
- 設計本文を修正せず、blocking findings、boundary risks、handoff readiness を返す
- review evidence は `cc-iasd review add <scope-id>` で記録する
- Planning Lead の代わりに設計妥当性を本文レビューする
```

この分離の目的は、Planning Lead の context pressure を下げることである。Planning Lead は full ideal、full feature backlog、full spec package、execution evidence を常時同時に抱え込まない。Designer roles は narrow context で設計本文を作成し、Design Reviewer が narrow context で artifact boundary を確認する。Planning Lead には summary、unresolved questions、decision points、created artifact refs、design review result を返す。

---

## 6. role source schema

cc-iasd の role source は、次のような schema を持つ。

```yaml
id: code-reviewer
name: Code Quality Reviewer
category: review
version: 0.1.0

purpose: >
  実装差分が spec / plan / tasks に対して妥当であり、
  保守性・可読性・局所的品質の観点で問題がないかを検査する。

non_goals:
  - プロダクト方針を変更しない
  - campaign scope を拡大しない
  - 実装者として修正を行わない
  - セキュリティ監査全体を代替しない

invocation:
  when:
    - Worker が task 実装を完了したとき
    - diff が生成されたとき
    - Completion Report 前の品質確認が必要なとき
  by:
    - planning-lead

authority:
  can:
    - review source diff
    - compare implementation with task requirements
    - request bounded remediation
    - mark finding as blocking / non-blocking
  cannot:
    - edit src directly
    - approve roadmap changes
    - waive unresolved high-severity findings

context_policy:
  required:
    - task.md
    - relevant requirements excerpt
    - implementation diff
    - test result summary
  optional:
    - architecture notes
    - previous review findings
  excluded:
    - unrelated chat history
    - full roadmap unless necessary

tool_policy:
  read:
    - src
    - specs
    - evidence
  write:
    - review report
  execute:
    - lint
    - unit test if safe
  forbidden:
    - direct production operation
    - dependency upgrade without approval
    - broad refactor execution

outputs:
  primary: review-report.md
  fields:
    - summary
    - scope_checked
    - findings
    - evidence
    - severity
    - blocking_status
    - remediation_request
    - unresolved_risks

escalation:
  required_when:
    - requirement conflict is found
    - implementation requires scope change
    - high-severity finding remains unresolved
    - test result contradicts completion claim

runtime_targets:
  claude_code_subagent: true
  codex_instruction_adapter: true
  bmad_style_agent: false
```

この schema により、role は単なる prompt ではなく、検証可能な operation unit になる。

---

## 7. 初期 role set

初期実装で必要な role は、最小限にする。

```text
初期 role set:
- Planning Lead
- Ideal Interviewer
- Feature Scope Designer
- Spec Designer
- Design Reviewer
- Worker
- Reviewer
- Auditor
```

### 7.1 Planning Lead

```text
責務:
- campaign/run の自走範囲を確認する
- Feature Scope Designer / Spec Designer を呼び出す
- task を Worker に渡す
- Reviewer / Auditor を呼び出す
- 停止条件を判定する
- Escalation Packet / Completion Report を作成する
- review 済みの ideal / feature / spec handoff を受け取り、進行判断に接続する
```

```text
禁止:
- roadmap を勝手に変更する
- feature scope 本文を自分で設計する
- spec / plan / tasks 本文を自分で設計する
- campaign 目的を変更する
- 技術スタックを勝手に変更する
- 人間判断が必要な事項を軽微判断として処理する
```

### 7.2 Ideal Interviewer

```text
責務:
- ideal が欠落、薄い、矛盾、outdated の場合に Human と直接対話する
- ideal interview packet を作成し、質問、回答、未決定事項を整理する
- product/ideal/<ideal-id>.md の Product Ideal / Experience Principles / Boundaries を執筆する
- Design Reviewer を狭い context で起動する
- Planning Lead 向け handoff summary を返す
```

```text
禁止:
- feature scope を設計する
- roadmap の進行順序を決める
- spec / plan / tasks を設計する
- campaign / run の実行判断を行う
- Human の未回答事項を product canon として確定する
```

### 7.3 Feature Scope Designer

```text
責務:
- ideal と user decisions から feature scope を設計する
- feature の Scope / Roadmap Notes / Backlog を執筆する
- backlog item を feature / debt / request として構造化する
- Design Reviewer を狭い context で起動する
- ideal gap や human decision gap を Planning Lead に戻す
```

```text
禁止:
- roadmap の進行順序を決める
- spec / plan / tasks を設計する
- campaign / run の実行判断を行う
- product ideal を変更する
```

### 7.4 Spec Designer

```text
責務:
- feature scope と roadmap direction から spec package を設計する
- spec.md / plan.md / research.md / data-model.md / contracts / tasks.md を執筆する
- implementation plan と roadmap / campaign / run state を混同しない
- Design Reviewer を狭い context で起動する
- feature scope gap や roadmap ambiguity を Planning Lead に戻す
```

```text
禁止:
- roadmap の進行順序を決める
- feature backlog を勝手に拡張する
- campaign / run の実行判断を行う
- src/ を実装する
```

### 7.5 Design Reviewer

```text
責務:
- ideal / feature / spec の authoring 直後に、対象 artifact と狭い context packet だけを読む
- artifact の内部整合性、boundary、次 role への handoff readiness を確認する
- blocking findings と non-blocking findings を分ける
- `cc-iasd review add <scope-id>` で review evidence を残す
```

```text
禁止:
- artifact 本文を直接修正する
- roadmap の進行順序を決める
- campaign / run の実行判断を行う
- 実装コード品質レビューを行う
- Devil's Advocate の full architecture review を代替する
```

### 7.6 Worker

```text
責務:
- task に基づいて src/ を変更する
- 必要なテストを実行する
- implementation notes を残す
- 不明点や scope conflict を Planning Lead に戻す
```

```text
禁止:
- task 外の大規模改修
- specs の黙った変更
- review finding の自己承認
- evidence を残さない実装完了宣言
```

### 7.7 Reviewer

```text
責務:
- 実装差分を requirements / tasks と照合する
- 品質・保守性・テスト妥当性を確認する
- blocking finding と non-blocking finding を分ける
- bounded remediation を要求する
```

```text
禁止:
- 実装を直接修正する
- product 判断を行う
- unresolved risk を黙って許容する
```

### 7.8 Auditor

```text
責務:
- evidence が揃っているか確認する
- review / test / decision / escalation の記録欠落を確認する
- no silent overwrite の原則に反していないか確認する
- Completion Report に残すべきリスクを整理する
```

```text
禁止:
- 実装の詳細修正
- 仕様判断
- Planning Lead の停止判断の代替
```

---

## 8. 後段 role set

運用観察後に、必要に応じて role を分割する。

```text
後段 role:
- Architect
- Requirements Reviewer
- Code Quality Reviewer
- Test Reviewer
- Security Reviewer
- Documentation Reviewer
- Devil's Advocate / Risk Reviewer
- Compliance Auditor
```

### 8.1 Architect

Architect は、技術構成や境界設計を扱う。

ただし、初期から常設しない。

```text
起動条件:
- run scope 内で設計判断が必要
- 既存 architecture との整合確認が必要
- src/ isolation や adapter 設計に影響する
```

```text
注意:
Architect は roadmap や技術スタックを勝手に変更できない。
大きな変更は Planning Lead 経由で Escalation Packet にする。
```

### 8.2 Requirements Reviewer

Requirements Reviewer は、実装が requirements を満たしているかを見る。

```text
役割:
- requirements と implementation の対応確認
- scope creep の検出
- 要件未充足の検出
```

### 8.3 Code Quality Reviewer

Code Quality Reviewer は、Reviewer を品質観点に分割した後段 role である。

```text
役割:
- readability
- maintainability
- local design
- error handling
- unnecessary complexity
```

### 8.4 Test Reviewer

Test Reviewer は、テスト観点の専門 role である。

```text
役割:
- test coverage の妥当性
- regression risk
- test command の結果確認
- flaky / shallow test の検出
```

### 8.5 Security Reviewer

Security Reviewer は、security 観点の専門 role である。

```text
役割:
- secrets exposure
- auth / authorization
- input validation
- dependency risk
- unsafe command / config
```

Security Reviewer は、すべてのタスクで必須にしない。security-sensitive な変更時に起動する。

### 8.6 Documentation Reviewer

Documentation Reviewer は、実装後の文書整合性を見る。

```text
役割:
- specs / README / usage docs の更新要否
- Completion Report の明確性
- implementation notes の不足確認
```

### 8.7 Devil's Advocate / Risk Reviewer

Devil's Advocate は、反対意見を出すための role である。

ただし、常時起動するとノイズが増える。

```text
起動条件:
- 複数案がある
- AI 開発チームが安易に完了扱いしている可能性がある
- 大きな設計判断を伴う
- 未検証の前提が多い
```

```text
出力:
- challenged_assumptions
- failure_modes
- missing_evidence
- recommended_stop_or_continue
```

---

## 9. role と artifact / evidence の接続

role は、必ず artifact または evidence に接続する。

```text
Planning Lead:
  - campaign/run status
  - task assignment
  - escalation packet
  - completion report

Worker:
  - source diff
  - implementation notes
  - test result summary

Reviewer:
  - review report
  - finding list
  - remediation request

Auditor:
  - audit findings
  - evidence completeness report
  - unresolved risk summary
```

role の出力は Evidence Bridge に索引される。

```text
Evidence Bridge:
  spec / task
    -> implementation notes
    -> review report
    -> audit findings
    -> escalation / completion report
```

---

## 10. role compile targets

### 10.1 Claude Code Subagent target

Claude Code 用には、role source から `.claude/agents/*.md` 相当を生成する。

```text
生成先例:
project-context/runtime/generated/claude-code/agents/code-reviewer.md
```

形式は次である。

```markdown
---
name: cc-iasd-code-reviewer
description: Review implementation diffs against cc-iasd task scope, quality expectations, and evidence requirements.
tools: Read, Grep, Glob, Bash
model: sonnet
---

<compiled role prompt>
```

ただし、生成物には次を入れすぎない。

```text
入れないもの:
- 全プロジェクト履歴
- 全spec全文
- 全review policy
- 他roleの詳細責務
```

必要なものは、呼び出し時の Role Context Packet で渡す。

初期 runtime manifest は、各 role の `Command Visibility` section を抽出し、role-specific guide として提示する。これにより、各 role が `cc-iasd --help` 相当の全 command set を読む必要を減らす。これは command enforcement ではなく、runtime context を狭めるための adapter metadata である。

### 10.2 Codex / AGENTS.md target

Codex には role ごとの subagent 概念を直接表現しにくい場合がある。

その場合、AGENTS.md には project-wide instruction を置き、role は prompt wrapper または command 側で表現する。

```text
Codex adapter:
- AGENTS.md に project-wide rules を置く
- role invocation prompt で role_id / scope / expected_output を渡す
- review / audit は別 run として実行する
```

### 10.3 BMAD-style target

BMAD 風の target は、後段で検討する。

```text
BMAD-style target:
- role source YAML
- command menu
- workflow references
- template references
- customization overlay
```

初期実装では、BMAD をそのまま生成先にする必要はない。

---

## 11. role invocation flow

標準的な role 呼び出しは次である。

```text
1. Planning Lead が campaign / task scope を確認する
2. Planning Lead が対象 role を選択する
3. Role Context Packet を生成する
4. runtime adapter が role source を runtime prompt に変換する
5. role が作業する
6. role が output contract に従って結果を返す
7. Planning Lead が結果を Evidence Bridge に接続する
8. 継続 / remediation / escalation / completion を判断する
```

command visibility を前提にした role / command / artifact の標準シーケンスは次である。

標準フローは、次の順序を持つ。

```text
1. Bootstrap / readiness
2. ideal interview and ideal design review
3. feature scope authoring and feature design review
4. roadmap consultation and roadmap creation
5. spec package authoring and spec design review
6. campaign / run creation
7. worker implementation and code quality review
8. planning lead run reconciliation and compliance review
9. Devil's Advocate campaign completion review
10. completion report or escalation
11. lifecycle maintenance: log / reference / archive / outdate
```

標準フローでは `feature add` を `roadmap add` より前に置く。Feature は ideal に紐づく scope inventory / backlog であり、Roadmap はその feature scope から進行対象、順序、到達点を選択する artifact である。したがって、roadmap consultation は、既存または新規の feature scope を前提に「どの範囲をどの順序で進めるか」を Human と確認する。

Design Reviewer は、Ideal Interviewer、Feature Scope Designer、Spec Designer が artifact を執筆した直後にだけ起動する。Planning Lead は設計本文を直接レビューしない。Planning Lead が受け取るのは、authoring role の handoff packet、Design Review Packet の要約、created artifact refs、unresolved decisions である。

Human との対話は communication packet として表現する。ここには ideal interview packet、roadmap consultation packet、completion report packet、escalation packet を含む。Human decision は `user/decisions.md` に記録する。

ideal interview は、subagent の裏側作業ではなく Human と直接対話する user-facing phase として扱う。Planning Lead が ideal の欠落または薄さを検出した場合、Ideal Interviewer を配下 subagent として継続会話させるのではなく、対話権限を Ideal Interviewer role に handoff する。Ideal Interviewer は main role として Human に質問し、回答を ideal interview packet、ideal draft、unresolved decision、Planning Lead 向け handoff summary に整理して返す。

この分離の目的は、Human との往復を Planning Lead の campaign / roadmap 文脈へ混在させないことである。context 分離は nested subagent ではなく、role handoff、communication packet、artifact boundary によって実現する。subagent を使う場合も、質問案の検査、不足観点の抽出、矛盾確認などの補助作業に限定し、Human に質問する責任は常に main role の Ideal Interviewer に置く。

`product outdate` と `ops archive` は標準進行の中心ではなく lifecycle maintenance である。新規作成直後に outdate するのではなく、artifact が superseded / completed / retired になった時点で Planning Lead または該当 role が明示的に実行する。

標準フローの概要シーケンス図は次にも置く。

```text
Mermaid source: docs/development/standard_flow_overview.mmd
SVG: docs/development/standard_flow_overview.svg
```

```mermaid
sequenceDiagram
  autonumber
  participant H as Human
  participant II as Ideal Interviewer
  participant FSD as Feature Scope Designer
  participant SD as Spec Designer
  participant DR as Design Reviewer
  participant PL as Planning Lead
  participant W as Worker
  participant CA as Compliance Auditor
  participant QA as Code Quality Auditor
  participant DA as Devils Advocate
  participant CLI as cc-iasd CLI
  participant UserDocs as user/
  participant Product as product/
  participant Ops as ops/
  participant Evidence as ops/evidence/
  participant Reference as reference/
  participant Runtime as runtime/
  participant Src as src/

  Note over CLI,Runtime: Bootstrap commands are not role-visible: cc-iasd init, cc-iasd profile update
  CLI-->>Product: init creates product/ scaffold
  CLI-->>Ops: init creates ops/ scaffold
  CLI-->>Runtime: profile update creates runtime/profile.md, plugins.yaml, adapters/*

  H->>PL: request governed development
  PL->>CLI: cc-iasd doctor
  CLI-->>PL: readiness result
  PL->>CLI: cc-iasd view current
  CLI-->>PL: stdout current view

  alt Human initiates ideal definition
    H->>II: invoke Ideal Interviewer
  else Planning detects thin or missing ideal
    PL->>II: invoke Ideal Interviewer for ideal refinement
  end
  II->>CLI: cc-iasd doctor
  CLI-->>II: readiness result
  II->>CLI: cc-iasd view current
  CLI-->>II: stdout current view
  II->>H: ideal interview packet
  H-->>II: product intent response
  II->>CLI: cc-iasd ideal add iNNN-ideal-id
  CLI-->>Product: product/ideal/iNNN-ideal-id.md
  CLI-->>Evidence: logs/log_timestamp_ideal-add.md
  II-->>Product: authored ideal content
  II->>DR: invoke Design Reviewer with ideal context packet
  DR->>CLI: cc-iasd doctor
  CLI-->>DR: readiness result
  DR->>CLI: cc-iasd review add iNNN-ideal-id
  CLI-->>Evidence: reviews/review_timestamp_summary.md
  CLI-->>Evidence: logs/log_timestamp_review-add.md
  DR-->>II: Design Review Packet
  II-->>PL: ideal readiness result with design review

  PL->>CLI: cc-iasd doctor
  CLI-->>PL: readiness result
  PL->>CLI: cc-iasd view current
  CLI-->>PL: stdout current view
  PL->>FSD: invoke Feature Scope Designer
  FSD->>CLI: cc-iasd doctor
  CLI-->>FSD: readiness result
  FSD->>CLI: cc-iasd view current
  CLI-->>FSD: stdout current view
  FSD->>CLI: cc-iasd feature add fNNN-feature-id
  CLI-->>Ops: scopes/features/fNNN-feature-id.md
  CLI-->>Evidence: logs/log_timestamp_feature-add.md
  FSD-->>Ops: authored feature scope and backlog
  FSD->>DR: invoke Design Reviewer with feature context packet
  DR->>CLI: cc-iasd doctor
  CLI-->>DR: readiness result
  DR->>CLI: cc-iasd view scope fNNN-feature-id
  CLI-->>DR: stdout scope boundary view
  DR->>CLI: cc-iasd review add fNNN-feature-id
  CLI-->>Evidence: reviews/review_timestamp_summary.md
  CLI-->>Evidence: logs/log_timestamp_review-add.md
  DR-->>FSD: Design Review Packet
  FSD-->>PL: Feature Scope Design Packet with design review
  PL->>H: roadmap consultation packet
  H-->>PL: roadmap decision
  PL-->>UserDocs: record user/decisions.md
  PL->>CLI: cc-iasd roadmap add rNNN-roadmap-id
  CLI-->>Ops: scopes/roadmaps/rNNN-roadmap-id.md
  CLI-->>Evidence: logs/log_timestamp_roadmap-add.md
  PL->>SD: invoke Spec Designer
  SD->>CLI: cc-iasd doctor
  CLI-->>SD: readiness result
  SD->>CLI: cc-iasd view current
  CLI-->>SD: stdout current view
  SD->>CLI: cc-iasd spec add sNNN-spec-id
  CLI-->>Product: specs/sNNN-spec-id/{spec,plan,research,data-model,tasks}.md
  CLI-->>Product: specs/sNNN-spec-id/contracts/README.md
  CLI-->>Evidence: logs/log_timestamp_spec-add.md
  SD-->>Product: authored spec package
  SD->>DR: invoke Design Reviewer with spec context packet
  DR->>CLI: cc-iasd doctor
  CLI-->>DR: readiness result
  DR->>CLI: cc-iasd view scope sNNN-spec-id
  CLI-->>DR: stdout scope boundary view
  DR->>CLI: cc-iasd review add sNNN-spec-id
  CLI-->>Evidence: reviews/review_timestamp_summary.md
  CLI-->>Evidence: logs/log_timestamp_review-add.md
  DR-->>SD: Design Review Packet
  SD-->>PL: Spec Design Packet with design review

  PL->>CLI: cc-iasd campaign add cNNN-campaign-id
  CLI-->>Ops: execution/campaigns/cNNN-campaign-id/{plan,state,queue,aggregate-report}.md
  CLI-->>Evidence: logs/log_timestamp_campaign-add.md
  PL->>CLI: cc-iasd run start cNNN-campaign-id
  CLI-->>Ops: execution/runs/run_timestamp_cNNN-campaign-id/{plan,handoff,state,open-items,knowledge}.md
  CLI-->>Ops: update execution/campaigns/cNNN-campaign-id/queue.md
  CLI-->>Evidence: logs/log_timestamp_run.md

  PL->>W: invoke Worker with run handoff
  W->>CLI: cc-iasd view run run_timestamp_cNNN-campaign-id
  CLI-->>W: stdout run-local context
  W->>Src: implement task in src/
  W->>CLI: cc-iasd open-item add run_timestamp_cNNN-campaign-id
  CLI-->>Ops: update execution/runs/run_timestamp_cNNN-campaign-id/open-items.md
  CLI-->>Evidence: logs/log_timestamp_open-item-add.md
  W->>QA: invoke Code Quality Auditor for task unit review
  QA->>CLI: cc-iasd view run run_timestamp_cNNN-campaign-id
  CLI-->>QA: stdout run-local context
  QA->>CLI: cc-iasd review add run_timestamp_cNNN-campaign-id
  CLI-->>Evidence: reviews/review_timestamp_summary.md
  CLI-->>Evidence: logs/log_timestamp_review-add.md
  QA-->>W: code quality findings
  W-->>PL: implementation result with code quality review evidence

  PL->>CLI: cc-iasd view scope fNNN-feature-id
  CLI-->>PL: stdout scope boundary view
  PL->>CLI: cc-iasd view run run_timestamp_cNNN-campaign-id
  CLI-->>PL: stdout run-local context
  PL->>CLI: cc-iasd open-item resolve run_timestamp_cNNN-campaign-id oi-NNN
  CLI-->>Ops: update execution/runs/run_timestamp_cNNN-campaign-id/open-items.md
  CLI-->>Evidence: logs/log_timestamp_open-item-resolve.md

  PL->>CA: invoke Compliance Auditor for evidence and rule compliance
  CA->>CLI: cc-iasd doctor
  CLI-->>CA: readiness result
  CA->>CLI: cc-iasd view evidence
  CLI-->>CA: stdout evidence overview
  CA->>CLI: cc-iasd view run run_timestamp_cNNN-campaign-id
  CLI-->>CA: stdout run-local context
  CA->>CLI: cc-iasd review add run_timestamp_cNNN-campaign-id
  CLI-->>Evidence: reviews/review_timestamp_summary.md
  CLI-->>Evidence: logs/log_timestamp_review-add.md
  CA-->>PL: compliance findings

  Note over PL,DA: Devil's Advocate review is a campaign completion condition
  PL->>DA: invoke Devils Advocate for campaign completion review
  DA->>CLI: cc-iasd view scope fNNN-feature-id
  CLI-->>DA: stdout scope boundary view
  DA->>CLI: cc-iasd view run run_timestamp_cNNN-campaign-id
  CLI-->>DA: stdout run-local context
  DA->>CLI: cc-iasd view evidence
  CLI-->>DA: stdout evidence overview
  DA->>CLI: cc-iasd review add run_timestamp_cNNN-campaign-id
  CLI-->>Evidence: reviews/review_timestamp_summary.md
  CLI-->>Evidence: logs/log_timestamp_review-add.md
  DA-->>PL: campaign completion findings

  alt campaign completion accepted
    PL->>CLI: cc-iasd campaign mark-run cNNN-campaign-id run_timestamp_cNNN-campaign-id
    CLI-->>Ops: update campaign queue, campaign state, run state
    CLI-->>Evidence: logs/log_timestamp_campaign-mark-run.md
    PL->>CLI: cc-iasd report run_timestamp_cNNN-campaign-id
    CLI-->>Evidence: reports/report_timestamp_run_timestamp_cNNN-campaign-id.md
    CLI-->>Evidence: logs/log_timestamp_report.md
    PL->>H: completion report packet
    H-->>PL: confirmation or follow-up direction
    PL-->>UserDocs: record user/decisions.md
  else escalation required
    PL->>CLI: cc-iasd escalate run_timestamp_cNNN-campaign-id
    CLI-->>Evidence: reports/escalation_timestamp_run_timestamp_cNNN-campaign-id.md
    CLI-->>Evidence: logs/log_timestamp_escalate.md
    PL->>H: escalation packet
    H-->>PL: human decision
    PL-->>UserDocs: record user/decisions.md
  end
  PL->>CLI: cc-iasd log event
  CLI-->>Evidence: logs/log_timestamp_type.md
  PL->>CLI: cc-iasd reference add historical/external/note reference-id
  CLI-->>Reference: historical-documents/external/notes reference-id.md
  CLI-->>Reference: update INDEX.md
  CLI-->>Evidence: logs/log_timestamp_reference-add.md
  PL->>CLI: cc-iasd ops archive layer artifact-id
  CLI-->>Ops: move artifact to archived/
  CLI-->>Evidence: logs/log_timestamp_ops-archive.md
  PL->>CLI: cc-iasd product outdate ideal/spec artifact-id
  CLI-->>Product: move artifact to outdated/
  CLI-->>Evidence: logs/log_timestamp_product-outdate.md
```

重要なのは、role が勝手に次の role を呼び続ける構成にしないことである。

```text
制御原則:
- Planning Lead が role orchestration の中心
- Ideal Interviewer / Feature Scope Designer / Spec Designer は、artifact authoring 直後の Design Reviewer だけを bounded post-authoring review として起動できる
- Worker は Reviewer を自己承認に使わない
- Worker は task unit の完了前に Code Quality Auditor を呼び、review evidence と一緒に Planning Lead へ戻す
- Reviewer は Auditor を代替しない
- Auditor は Planning Lead を代替しない
- Devil's Advocate review は campaign completion condition として扱い、campaign 完了扱いの前に Planning Lead が呼び出す
```

---

## 12. role 設計における anti-pattern

### 12.1 すべての role に同じ巨大コンテキストを渡す

```text
問題:
- context 分離が成立しない
- role ごとの判断境界が消える
- token 使用量が増える
- 誰が何を見て判断したか追跡しづらい
```

### 12.2 role prompt にすべての規約を書く

```text
問題:
- role 間で重複する
- 更新漏れが起きる
- runtime ごとの差分管理が破綻する
- prompt が長くなり重要指示が埋もれる
```

### 12.3 role を細かく分けすぎる

```text
問題:
- orchestration cost が上がる
- role 間 handoff が増える
- 小さな変更でも大掛かりになる
- 初期実装が成立しにくい
```

初期 role set は、Planning Lead に設計本文や設計レビュー本文を抱え込ませないため、Feature Scope Designer、Spec Designer、Design Reviewer を含める。ただし、それ以上の細分化は後段に回す。

### 12.4 role に authority を明記しない

```text
問題:
- Reviewer が product 判断をする
- Worker が scope を拡大する
- Auditor が実装を修正する
- Architect が技術スタックを変更する
```

role source には `can` と `cannot` を必ず書く。

### 12.5 role output を自由文にする

```text
問題:
- Evidence Bridge に接続しにくい
- blocking / non-blocking が曖昧になる
- Completion Report に転記しにくい
- 後続AIが再利用しにくい
```

role output は template に従わせる。

---

## 13. 初期実装方針

初期実装では、role runtime を完全自動化しない。

まずは次を作る。

```text
初期実装で作るもの:
- role source schema
- 8 role source
  - planning-lead
  - ideal-interviewer
  - feature-scope-designer
  - spec-designer
  - design-reviewer
  - worker
  - reviewer
  - auditor
- Role Context Packet template
- Review Report template
- Audit Finding template
- Role Handoff template
- Claude Code Subagent 生成方針
```

未実装項目は `10_todo.md` で管理する。

---

## 14. 推奨ディレクトリ構成

```text
project-context/
  rules/
    roles/
      source/
        planning-lead.role.yaml
        worker.role.yaml
        reviewer.role.yaml
        auditor.role.yaml
    context-packets/
      role-context-packet.md
      planning-lead-context.md
      worker-context.md
      reviewer-context.md
      auditor-context.md
    templates/
      role-handoff.md
      review-report.md
      audit-finding.md
      remediation-request.md
    checklists/
      reviewer-checklist.md
      auditor-checklist.md

  runtime/
    adapters/
      claude-code-role-adapter.md
      codex-role-adapter.md
    generated/
      claude-code/
        planning-lead.md
        worker.md
        reviewer.md
        auditor.md
```

`source/` が正本である。  
`runtime/generated/` は生成物である。  
`adapters/` は runtime ごとの差分を扱う。

---

## 15. 既存 cc-iasd 文書との接続

この文書は、既存ドキュメント群のうち次に接続する。

```text
01_requirements.md:
  role は cc-iasd の自律開発体験を成立させる責務分離単位である。

02_conceptual_design.md:
  role は project-context 内の運営概念であり、実行runtimeそのものではない。

04_core_workflow.md:
  role は基本ワークフローの中で Worker / Reviewer / Auditor の責務境界に接続する。

05_autonomy_protocol.md:
  Planning Lead の権限境界、自走条件、停止条件と接続する。

06_artifact_and_evidence_model.md:
  role output は Evidence Bridge / Escalation Packet / Completion Report に接続する。

07_framework_integration.md:
  BMAD / SuperClaude / Claude Code Subagents / AGENTS.md の方法論を参照する。

08_commands_and_workflows.md:
  cc-iasd run / escalate / report の内部で role invocation が発生する。
```

---

## 16. 最終整理

cc-iasd の role 設計は、既存 role prompt を探して貼り合わせる方向では成立しない。

調査上の前提として、cc-iasd にそのまま導入できる独立 role パッケージは存在しない。

したがって、cc-iasd は role を自前で定義する。ただし、ハンドメイドの prompt 集としてではなく、次のデファクトな方法論を踏襲する。

```text
踏襲する方法論:
- AGENTS.md 的な agent 向け project instruction 分離
- Claude Code Subagents 的な role ごとの context / tools / model 分離
- BMAD 的な source YAML -> runtime MD compile、agent / workflow / task / template 分離
- SuperClaude 的な command / agent / persona / mode 分離
- Codex 的な repo instruction と検証 evidence の重視
```

cc-iasd の role は、次の一点に集約される。

```text
cc-iasd role
  = campaign/run 自走を安全に進めるために、
    Planning Lead / Ideal Interviewer / Feature Scope Designer / Spec Designer / Design Reviewer / Worker / Reviewer / Auditor などの責務、権限、入力文脈、出力成果物、証跡要件を分離する、
    source-defined な operation unit
```

初期実装では、Planning Lead / Ideal Interviewer / Feature Scope Designer / Spec Designer / Design Reviewer / Worker / Reviewer / Auditor の8 role で、context 分離、authority 分離、output contract、Evidence Bridge 接続を成立させる。
