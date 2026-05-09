# 06. Artifact / Evidence Model

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. この文書の目的

この文書は、cc-iasd が扱う成果物、scope / transaction、証跡のモデルを定義する。

cc-iasd は、単なるログ収集機構ではない。一方で、すべての情報を横断索引へ集約する仕組みでもない。正本、scope、execution、evidence の境界を分け、必要な参照だけを相互に持たせる。

---

## 2. 成果物の分類

```text
成果物分類:
- Rule artifacts
- User-authored artifacts
- Product canon artifacts
- Scope artifacts
- Run artifacts
- Evidence artifacts
- Reference artifacts
- Source project artifacts
```

この分類では、`product/` と `ops/` を分ける。

```text
product:
  ideal / spec などプロダクト正本

ops:
  scopes / execution / evidence など運用上の transaction artifact
```

---

## 3. Rule artifacts

Rule artifacts は、恒常的な制約レイヤーである。

```text
rules/
  policies/
  roles/
  templates/
  checklists/
```

自走条件、停止条件、証跡要件、言語、テスト、role 責務、出力形式、review / audit 観点を定義する。

run 内で得た知見は、恒常化できる場合のみ `rules/` に昇格する。

---

## 4. User-authored artifacts

ユーザーが直接書く、または人間判断として保持する領域である。

```text
user/
  product-intent.md
  constraints.md
  decisions.md
  preferences.md
  scratch.md
```

`user/decisions.md` は人間判断の正本である。AI の軽微判断や運用上の観察を横断的な `ops/decisions.md` に集めない。

---

## 5. Product canon artifacts

Product canon artifacts は、実装判断の基準になる正本である。

```text
product/
  ideal/
  specs/
```

`product/` 以下で古くなった artifact は `outdated/` へ退避する。

### 5.1 product/ideal/

```text
product/ideal/
  iNNN-<ideal-slug>.md
  outdated/
    iNNN-<ideal-slug>.md
```

ideal は、ユーザー入力を開発判断に使える形へ正規化した正本である。

`outdated/` に入っていない ideal が現行参照対象である。ideal はプロジェクト状況や外部環境によって変わるため、旧化できる必要がある。

ideal ID は `iNNN-<ideal-slug>` とする。複数の ideal は同時に正本性を持ち得るため、番号は優先順位や単一 current を意味しない。番号は人間が参照しやすくするための安定識別子である。

ideal file の schema は次である。

```text
ideal:
- ID
- Title
- Status: current / outdated
- Created At
- Last Reviewed At
- Source Inputs
- Target Experience
- Non Goals
- Product Principles
- Success Signals
- Constraints
- Open Questions
```

ideal は reason なしで outdated にしてよい。状況や外部環境の変化により、現行参照対象から外れるだけで成立する。

### 5.2 product/specs/

```text
product/specs/
  sNNN-<spec-slug>/
    spec.md
    plan.md
    research.md
    data-model.md
    contracts/
      README.md
    tasks.md
  outdated/
    sNNN-<spec-slug>/
      spec.md
      plan.md
      research.md
      data-model.md
      contracts/
        README.md
      tasks.md
```

spec は、`spec / plan / tasks` を中心とする束として正本性を持つ。旧化は原則として spec 単位で行う。

spec ID は `sNNN-<spec-slug>` とする。spec は roadmap、campaign、run、evidence から参照されるため、番号を持つ安定 ID として扱う。

cc-iasd の Spec Kit 互換範囲は artifact vocabulary の互換であり、Spec Kit tooling の lifecycle を再実装することではない。初期 profile は次を作成する。

```text
required:
- spec.md
- plan.md
- research.md
- data-model.md
- contracts/README.md
- tasks.md

not generated:
- quickstart.md
- .specify/
- src/ 配下の specs/
```

`plan.md` は当面維持する。ただし、roadmap、campaign、run handoff と混同しないよう、implementation plan に限定する。名称は未決定事項として残し、実装前にリネームを検討できる状態にする。

### 5.2.1 spec.md schema

```text
spec.md:
- ID
- Summary
- Created At
- Status
- User Scenarios & Testing
- Requirements
- Success Criteria
```

### 5.2.2 plan.md schema

```text
plan.md:
- ID
- Summary
- Created At
- Approach
- Dependencies
```

`plan.md` は実装方針を記述する。feature roadmap、campaign queue、run state、handoff は含めない。

### 5.2.3 research.md schema

```text
research.md:
- ID
- Summary
- Created At
- Decisions
- Alternatives Considered
- Open Questions
```

research は spec-local な検討記録である。恒常ルールは `rules/`、人間判断は `user/decisions.md`、実行証跡は `ops/evidence/` に置く。

### 5.2.4 data-model.md schema

```text
data-model.md:
- ID
- Summary
- Created At
- Entities
- Relationships
- Validation Rules
```

データモデルが存在しない spec でも、未使用であることを明示するために `None recorded.` を置く。

### 5.2.5 contracts/ schema

```text
contracts/
  README.md
  <contract-name>.md
```

contracts は API、event、CLI、schema、integration contract が必要な場合だけ追加する。初期生成では `README.md` のみを作る。

spec ごと outdated にする代表例は次である。

```text
- spec が大きく変わり、旧 plan / tasks が意味を失った
- plan が採用技術や実装方針変更で無効になった
- tasks の分解単位が全面的に再作成された
- roadmap 変更により spec 自体が実施対象から外れた
- 実装済み spec を historical artifact として残す
```

軽微な修正は同じ spec 内で更新してよい。spec、plan、tasks の対応関係が壊れる場合は、spec ごと `product/specs/outdated/<spec-id>/` に移す。

---

## 6. Scope artifacts

Scope artifacts は、何を、どの範囲で、どの順序または到達点として扱うかを定義する。

```text
ops/scopes/
  features/
  roadmaps/
```

`ops/scopes/` 以下で古くなった artifact は `archived/` へ退避する。`archived/` に入っていないものが通常参照対象である。

### 6.1 features/

```text
ops/scopes/features/
  <feature-id>.md
  archived/
    <feature-id>.md
```

feature は、ideal と roadmap の間に置く planning layer である。

feature scope は、構造化 backlog を持つ。backlog は、まだ実行されていないが feature の実現範囲に属する作業候補である。

```text
feature backlog:
- feature の実現に必要な候補作業
- roadmap / spec / task へ切り出される前段
- 複数 run をまたいで残り得る planning context
- priority、blocker、design constraints、target destination を持つ
```

backlog は早期に肥大化しやすい。そのため、backlog は feature scope に閉じ、必要に応じて epic / supporting の区分を metadata で持たせる。

feature file の item schema は次である。

```text
feature:
- ID
- Kind: epic / supporting
- Summary
- Ideal Pillar
- Status: proposed / active / blocked / completed / archived
- Created At
- Scope
- Roadmap Notes
- Backlog

backlog item:
- ID
- Type: feature / debt / request
- Summary
- Priority: low / medium / high
- Experience Tie
- Impact Scope
- Blockers
- Design Constraints
- Target Destination: epic / supporting / roadmap / deferred
- Source: user / planning / promoted-open-item / review
```

### 6.2 roadmaps/

```text
ops/scopes/roadmaps/
  rNNN-<roadmap-slug>.md
  archived/
    rNNN-<roadmap-slug>.md
```

roadmap は、ideal / feature を入力にして実現順序を定義する scope artifact である。roadmap 自体を AI が勝手に目的変更してはならない。

roadmap file の保存形式は単一 Markdown file とする。

roadmap ID は `rNNN-<roadmap-slug>` とする。roadmap は複数 campaign や report から参照されるため、番号を持つ安定 ID として扱う。

```text
roadmap:
- ID
- Summary
- Goal
- Status: proposed / active / blocked / completed / archived
- Created At
- Campaigns / Runs
- Feature Inputs
- Deferred
```

---

## 7. Execution artifacts

Execution artifacts は、campaign と run で構成する。milestone は廃止する。

```text
ops/execution/
  campaigns/
    cNNN-<campaign-slug>/
      plan.md
      state.md
      queue.md
      aggregate-report.md
    archived/
      cNNN-<campaign-slug>/
  runs/
    run_<timestamp>_<task-or-scope>/
      plan.md
      handoff.md
      state.md
      open-items.md
      knowledge.md
    archived/
      run_<timestamp>_<task-or-scope>/
```

spec-driven development 的には、実装進行の中心は spec / task である。campaign と run は、それらを cc-iasd の project-context から安全に実行 runtime へ渡す transaction artifact である。

### 7.1 campaigns/

campaign は、複数 run の進行を束ねる orchestration artifact である。

campaign が持つもの:

```text
- task selector
- stop condition
- progression condition
- run queue
- aggregate report
```

campaign は runtime output を直接所有しない。証跡は `ops/evidence/` に置き、どの campaign / run から発行されたかを metadata で記録する。

campaign ID は `cNNN-<campaign-slug>` とする。

### 7.2 runs/

run は、task の実行選択と runtime context を持つ自走実行単位である。旧 cycle 概念は run に置き換える。

run が持つもの:

```text
- selected tasks
- runtime context
- handoff packet
- current state
- open items
- run-local knowledge に相当する一時知識
```

run は証跡の正本ではない。実行結果、review、report、log は `ops/evidence/` に切り出し、Source Campaign / Source Run を明記する。

### 7.2.1 state.md

```text
state.md:
- Run ID
- Status: running / completed / aborted / escalated / blocked
- Started At
- Ended At
- Related Ideal
- Related Feature
- Related Roadmap
- Related Campaign
- Related Spec
- Related Tasks
- Related Logs
- Related Reviews
- Related Reports
- Active Blocker
- Open Items
```

中断や失敗は `state.md` の status で表現する。

run state の result / status は次を使う。

```text
run result:
- in-progress
- completed
- blocked
- escalated
- aborted
```

`aborted` は directory ではなく result の一状態である。

open item は、run 実行中に発生した未解決事項である。backlog とは異なり、feature の計画候補ではなく、その run の継続、停止、review、report に影響する runtime context として扱う。

```text
open item:
- run 実行中に発生した不明点、保留、軽微な未完了
- run の継続判断または停止判断に影響する事項
- completion report で処理結果を確認する事項
```

run 終了時、open item は次のいずれかへ分類する。

```text
resolved:
  run 内で解決済み。

escalated:
  人間判断が必要。Escalation Packet に接続する。

promoted:
  後続 planning 対象として feature backlog に昇格する。

deferred:
  今回は扱わない。Completion Report に根拠を残す。
```

open item は operation metadata と authored content を分離する。

```text
tool-owned metadata:
- ID
- Kind
- Status
- Source Run
- Target
- Resolution
- Created At
- Updated At

authored content:
- Background
- Options
- Recommendation
- Notes
```

AI agent は authored content を執筆してよい。ただし、open item の作成、status 変更、resolution 変更、target 変更は cc-iasd command が行う。

### 7.2.2 handoff.md

```text
handoff.md:
- Scope
- Source Root
- Linked Product Artifacts
- Linked Scope Artifacts
- Constraints
- Expected Output
- Evidence To Record
```

handoff は、Worker / runtime に渡す実行入力 packet である。run-local runtime context として扱う。

tasks.md の実行単位は checklist item とする。run は単一 task または複数 task を参照できるが、handoff では実行対象 task を明示する。

### 7.2.3 knowledge.md

```text
knowledge.md:
- run 中に判明した注意点
- 次の worker / reviewer に渡す観察
- spec / tasks にまだ反映していない局所知識
- 後続 run に渡すべき前提
- feature backlog へ昇格し得る観察
```

`knowledge.md` は global knowledge ではない。run-local な一時知識である。

永続化先は次のように分ける。

```text
恒常ルール:
  rules/

product 正本に影響するもの:
  product/ideal/ または product/specs/

実行事実:
  ops/evidence/logs/

検査結果:
  ops/evidence/reviews/

参照資料:
  reference/
```

user decisions と run-local 軽微判断は分離する。人間による product / policy / scope 判断は `user/decisions.md` に置く。Planning Lead の軽微判断は発生した run state、knowledge、review、report のいずれかに閉じる。

---

## 8. Evidence artifacts

Evidence artifacts は、発生した事実、検査、報告を記録する。

```text
ops/evidence/
  logs/
  reviews/
  reports/
```

`ops/evidence/` 以下で古くなった artifact は `archived/` へ退避する。

### 8.1 logs/

```text
ops/evidence/logs/
  log_<timestamp>_<type>.md
  archived/
    log_<timestamp>_<type>.md
```

logs は global chronological work log である。

最新状態は log の写しではなく、run の `state.md` と scope / product artifact の参照で判断する。

log entry schema は次である。

```text
log:
- Date
- Type
- Summary
- Source Campaign
- Source Run
- Related Evidence
- Notes
```

log type は lowercase kebab-case とする。log は発生事実を記録し、状態正本にはしない。

### 8.2 reviews/

```text
ops/evidence/reviews/
  review_<timestamp>_<scope>.md
  archived/
    review_<timestamp>_<scope>.md
```

review は scope 横断の evidence である。

review scope は次を取り得る。

```text
- spec
- task
- run
- campaign
- roadmap
- rules
- project-context
```

review は特定の scope directory 配下に固定しない。scope 側の artifact は review ID または path を参照する。

review lifecycle は次である。

```text
review lifecycle:
- requested
- in-review
- passed
- changes-requested
- blocked
- archived
```

初期生成時の review は結果を `Result` に記録する。review finding は severity と status を持つ。

```text
finding:
- ID
- Severity: critical / high / medium / low
- Status: open / resolved / deferred / accepted-risk
- Summary
- Evidence
- Response
```

### 8.3 reports/

```text
ops/evidence/reports/
  report_<timestamp>_<scope>.md
  archived/
    report_<timestamp>_<scope>.md
```

reports は、人間に返す構造化報告である。completion report、escalation packet、progress report などを含む。

report は正本の複製ではなく、product / scope / execution / evidence への参照と、人間判断に必要な要約を持つ。

report も hybrid artifact として扱う。Source Artifact、Source Campaign、Source Run、review refs、related report refs は command が作成する。AI agent は Scope Summary、Completion Assessment、Human Confirmation Points などの本文 section を執筆する。

report lifecycle は次である。

```text
report lifecycle:
- draft
- issued
- acknowledged
- superseded
- archived
```

completion report と escalation report は同じ scope ref 形式を使う。

```text
scope ref:
- ideal: product/ideal/iNNN-<ideal-slug>.md
- feature: ops/scopes/features/<feature-id>.md
- roadmap: ops/scopes/roadmaps/rNNN-<roadmap-slug>.md
- campaign: ops/execution/campaigns/cNNN-<campaign-slug>/state.md
- spec: product/specs/sNNN-<spec-slug>/spec.md
- tasks: product/specs/sNNN-<spec-slug>/tasks.md
- run: ops/execution/runs/<run-id>/state.md
- log: ops/evidence/logs/<log-id>.md
- review: ops/evidence/reviews/<review-id>.md
- report: ops/evidence/reports/<report-id>.md
```

evidence artifact は、必要に応じて次の metadata を持つ。

```text
- Source Campaign: <campaign-id>
- Source Run: <run-id>
- Source Tasks: <spec-id>#T001-T003
- Related Spec: <spec-id>
```

Escalation report は停止理由、対象 scope refs、選択肢、推奨案、判断後の再開条件を必ず持つ。Completion report は実装内容、検証結果、review 結果、軽微判断、残リスク、関連証跡を必ず持つ。

---

## 9. Reference artifacts

Reference artifacts は、正本ではない補助資料である。

```text
reference/
  INDEX.md
  historical-documents/
  external/
  notes/
```

historical documents、外部資料、調査メモは `reference/` に置く。

`reference/` にある資料は直接の実装判断正本ではない。必要な内容は `product/`、`ops/`、`rules/` に昇格する。

reference artifact の新規作成も cc-iasd command が行う。AI agent は作成済み reference の Notes / Source Material などの authored section を編集する。

---

## 10. Artifact Creation Authority

project-context 運用時、AI agent は `src/` 以外の cc-iasd-managed 領域で新規ファイルを直接作成しない。

```text
AI agent may create/edit:
- src/

AI agent must not directly create files under:
- product/
- ops/
- rules/
- runtime/
- user/
- reference/
```

新規 artifact は cc-iasd command または明示的人間操作で作成する。

```text
command-owned:
- file path
- artifact ID
- metadata
- source refs
- lifecycle status
- archive / outdate movement

AI-authored:
- purpose
- background
- reasoning
- findings
- options
- recommendation
- summary
```

この方針は、AI の執筆能力を使いつつ、project-context の構造、ID、参照、状態遷移を AI の自由編集に依存させないための制約である。

---

## 11. Evidence Bridge

Evidence Bridge は、単一の `evidence-index.md` ではない。

cc-iasd における Evidence Bridge は、以下の相互参照で成立する。

```text
product/specs/<spec-id>/
  spec / plan / tasks

ops/scopes/<scope-kind>/<scope-id>.md
  related product / execution / reviews / reports

ops/execution/runs/<run-id>/state.md
  related product / scopes / logs / reviews / reports

ops/evidence/logs/
  event facts

ops/evidence/reviews/
  review facts and findings

ops/evidence/reports/
  human-facing summaries
```

横断索引を正本化すると、証跡全体を要約する巨大文書になりやすく、AI に渡す context を肥大化させるため、Evidence Bridge は artifact 間参照と CLI 生成 view で成立させる。

必要な横断 view は CLI が生成する。生成 view は正本ではない。

---

## 12. Escalation Packet テンプレート

```markdown
# Escalation Packet: <scope-id>

## 1. 停止理由

## 2. 対象

- ideal:
- feature:
- roadmap:
- campaign:
- spec:
- tasks:
- run:

## 3. ここまでに実施したこと

## 4. 現在の状態

## 5. 既に判断したこと

## 6. 人間判断が必要なこと

## 7. 選択肢

### A.

### B.

### C.

## 8. 推奨案

## 9. 推奨理由

## 10. 各選択肢の影響

## 11. 放置した場合の影響

## 12. 判断後に再開する作業

## 13. 関連証跡
```

---

## 13. Completion Report テンプレート

```markdown
# Completion Report: <scope-id>

## 1. 対象 scope

## 2. 実装した内容

## 3. 変更したファイル・構成

## 4. 実施した検証

- test:
- lint:
- build:

## 5. Review / Audit 結果

## 6. 軽微判断

## 7. 残リスク

## 8. 未完了事項

## 9. 人間が確認すべき点

## 10. 関連証跡
```

---

## 14. no silent overwrite

cc-iasd は、過去の判断や証跡を黙って上書きしない。

```text
原則:
- product 正本が旧化したら product/*/outdated/ に退避する
- ops artifact が古くなったら ops/**/archived/ に退避する
- scope / execution / evidence の各 artifact は関連 artifact を参照で結ぶ
- review finding は resolved / unresolved / deferred を区別する
- run の中断や失敗は directory ではなく state で表現する
- decisions / knowledge を ops 直下の横断ファイルに集約しない
```

初期実装では、完全な immutable log ではなく、Markdown 上の追記・退避規律として定義する。
