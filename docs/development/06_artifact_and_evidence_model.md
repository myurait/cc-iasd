# 06. Artifact / Evidence Model

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. この文書の目的

この文書は、ledger が扱う成果物、scope / transaction、証跡のモデルを定義する。

ledger は、単なるログ収集機構ではない。一方で、すべての情報を横断索引へ集約する仕組みでもない。正本、scope、cycle、evidence の境界を分け、必要な参照だけを相互に持たせる。

---

## 2. 成果物の分類

```text
成果物分類:
- Rule artifacts
- User-authored artifacts
- Product canon artifacts
- Scope artifacts
- Cycle artifacts
- Evidence artifacts
- Reference artifacts
- Source project artifacts
```

この分類では、`product/` と `ops/` を分ける。

```text
product:
  ideal / spec などプロダクト正本

ops:
  scopes / cycles / evidence など運用上の transaction artifact
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

cycle 内で得た知見は、恒常化できる場合のみ `rules/` に昇格する。

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
  <ideal-id>.md
  outdated/
    <ideal-id>.md
```

ideal は、ユーザー入力を開発判断に使える形へ正規化した正本である。

`outdated/` に入っていない ideal が現行参照対象である。ideal はプロジェクト状況や外部環境によって変わるため、旧化できる必要がある。

### 5.2 product/specs/

```text
product/specs/
  <spec-id>/
    requirements.md
    plan.md
    tasks.md
  outdated/
    <spec-id>/
      requirements.md
      plan.md
      tasks.md
```

spec は、`requirements / plan / tasks` の束として正本性を持つ。旧化は原則として spec 単位で行う。

spec ごと outdated にする代表例は次である。

```text
- requirements が大きく変わり、旧 plan / tasks が意味を失った
- plan が採用技術や実装方針変更で無効になった
- tasks の分解単位が全面的に再作成された
- roadmap 変更により spec 自体が実施対象から外れた
- 実装済み spec を historical artifact として残す
```

軽微な修正は同じ spec 内で更新してよい。requirements、plan、tasks の対応関係が壊れる場合は、spec ごと `product/specs/outdated/<spec-id>/` に移す。

---

## 6. Scope artifacts

Scope artifacts は、何を、どの範囲で、どの順序または到達点として扱うかを定義する。

```text
ops/scopes/
  features/
  roadmaps/
  milestones/
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
- roadmap / spec / milestone / task へ切り出される前段
- 複数 cycle をまたいで残り得る planning context
- priority、blocker、design constraints、target destination を持つ
```

旧 ledger 運用では backlog が早期に肥大化した。そのため、backlog は feature scope に閉じ、必要に応じて epic / supporting の区分を metadata で持たせる。

### 6.2 roadmaps/

```text
ops/scopes/roadmaps/
  <roadmap-id>.md
  archived/
    <roadmap-id>.md
```

roadmap は、ideal / feature を入力にして実現順序を定義する scope artifact である。roadmap 自体を AI が勝手に目的変更してはならない。

### 6.3 milestones/

```text
ops/scopes/milestones/
  <milestone-id>.md
  archived/
    <milestone-id>.md
```

milestone は、roadmap 上の到達点または計画境界である。

milestone は実行証跡の入れ物ではない。実行状態、handoff、実行中の知見は `ops/cycles/` に置く。review 本体も milestone には内包せず、`ops/evidence/reviews/` の review ID または path を参照する。

---

## 7. Cycle artifacts

Cycle artifacts は、AI 自走の実行単位である。

```text
ops/cycles/
  cycle_<timestamp>_<scope>/
    state.md
    handoff.md
    knowledge.md
  archived/
    cycle_<timestamp>_<scope>/
      state.md
      handoff.md
      knowledge.md
```

Kiro / cc-sdd 的には、実装進行の中心は spec / task である。cycle は、それらを cc-iasd の project-context から安全に実行 runtime へ渡し、状態を追跡する transaction artifact である。

### 7.1 state.md

```text
state.md:
- Cycle ID
- Status: running / completed / aborted / escalated / blocked
- Started At
- Ended At
- Related Ideal
- Related Feature
- Related Roadmap
- Related Milestone
- Related Spec
- Related Tasks
- Related Logs
- Related Reviews
- Related Reports
- Active Blocker
- Open Items
```

中断や失敗は `state.md` の status で表現する。

open item は、cycle 実行中に発生した未解決事項である。backlog とは異なり、feature の計画候補ではなく、その cycle の継続、停止、review、report に影響する runtime context として扱う。

```text
open item:
- cycle 実行中に発生した不明点、保留、軽微な未完了
- cycle の継続判断または停止判断に影響する事項
- completion report で処理結果を確認する事項
```

cycle 終了時、open item は次のいずれかへ分類する。

```text
resolved:
  cycle 内で解決済み。

escalated:
  人間判断が必要。Escalation Packet に接続する。

promoted:
  後続 planning 対象として feature backlog に昇格する。

deferred:
  今回は扱わない。Completion Report に根拠を残す。
```

### 7.2 handoff.md

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

handoff は、Worker / runtime に渡す実行入力 packet である。milestone の恒久文書ではなく、cycle-local runtime context として扱う。

### 7.3 knowledge.md

```text
knowledge.md:
- cycle 中に判明した注意点
- 次の worker / reviewer に渡す観察
- spec / tasks にまだ反映していない局所知識
- 後続 cycle に渡すべき前提
- feature backlog へ昇格し得る観察
```

`knowledge.md` は global knowledge ではない。cycle-local な一時知識である。

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

logs は global chronological ledger である。

最新状態は log の写しではなく、cycle の `state.md` と scope / product artifact の参照で判断する。

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
- cycle
- milestone
- roadmap
- rules
- project-context
```

review は `milestones/` 以下に固定しない。scope 側の artifact は review ID または path を参照する。

### 8.3 reports/

```text
ops/evidence/reports/
  report_<timestamp>_<scope>.md
  archived/
    report_<timestamp>_<scope>.md
```

reports は、人間に返す構造化報告である。completion report、escalation packet、progress report などを含む。

report は正本の複製ではなく、product / scope / cycle / evidence への参照と、人間判断に必要な要約を持つ。

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

historical documents、外部資料、調査メモ、移行資料は `reference/` に置く。

`reference/` にある資料は直接の実装判断正本ではない。必要な内容は `product/`、`ops/`、`rules/` に昇格する。

---

## 10. Evidence Bridge

Evidence Bridge は、単一の `evidence-index.md` ではない。

cc-iasd における Evidence Bridge は、以下の相互参照で成立する。

```text
product/specs/<spec-id>/
  requirements / plan / tasks

ops/scopes/<scope-kind>/<scope-id>.md
  related product / cycles / reviews / reports

ops/cycles/<cycle-id>/state.md
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

## 11. Escalation Packet テンプレート

```markdown
# Escalation Packet: <scope-id>

## 1. 停止理由

## 2. 対象

- ideal:
- feature:
- roadmap:
- milestone:
- spec:
- tasks:
- cycle:

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

## 12. Completion Report テンプレート

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

## 13. no silent overwrite

ledger は、過去の判断や証跡を黙って上書きしない。

```text
原則:
- product 正本が旧化したら product/*/outdated/ に退避する
- ops artifact が古くなったら ops/**/archived/ に退避する
- scope / cycle / evidence の各 artifact は関連 artifact を参照で結ぶ
- review finding は resolved / unresolved / deferred を区別する
- cycle の中断や失敗は directory ではなく state で表現する
- decisions / knowledge を ops 直下の横断ファイルに集約しない
```

初期実装では、完全な immutable log ではなく、Markdown 上の追記・退避規律として定義する。
