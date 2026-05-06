# 04. ledger MVP

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. MVP の目的

ledger MVP の目的は、完全な自律開発プラットフォームを作ることではない。

MVP の目的は、次の最小価値を成立させることである。

```text
MVP の最小価値:
project-context を作り、
product 正本と ops transaction を分け、
spec / plan / tasks を正本として扱い、
src/ に成果物 project を隔離し、
cycle 単位で自走境界を文書化し、
停止時には Escalation Packet、完了時には Completion Report を出せる。
```

---

## 2. MVP の対象範囲

```text
MVP 対象:
- project-context 初期化
- src/ isolation
- product/ideal/ の正本配置
- product/specs/ の Spec Kit 互換配置
- ops/scopes/ による feature / roadmap / milestone 管理
- ops/cycles/ による自走実行状態管理
- ops/evidence/logs/ による global logs
- ops/evidence/reviews/ による scope 横断 review
- ops/evidence/reports/ による escalation / completion report
- rules/ による制約レイヤー
- 最小 command 設計
```

MVP では `evidence-index.md`、`current-work.md`、`open-items.md`、`milestone-index.md`、`ops/decisions.md`、`ops/knowledge.md` を作らない。

---

## 3. MVP から除外するもの

```text
MVP 除外:
- 完全な multi-agent runtime
- 実行 agent の独自実装
- BMAD の全面統合
- MetaGPT / ChatDev の実行基盤統合
- AI Governance platform 的な重厚監査
- ChatLobby との密結合
- Hermes 連携
- 複数 repository / worktree の高度な管理
- 自動 plugin marketplace
- UI
- 長期 memory system
- 正本化された横断 index
```

MVP は CLI / Markdown / template 中心で成立させる。

---

## 4. MVP で作るファイル群

```text
project-context/
  runtime/
    cc-iasd.yaml
    lock.json

  rules/
    policies/
      autonomy-policy.md
      escalation-policy.md
      evidence-policy.md
    roles/
      planning-lead.md
      worker.md
      reviewer.md
      auditor.md
    templates/

  user/
    product-intent.md
    constraints.md
    decisions.md
    scratch.md

  product/
    ideal/
      README.md
      outdated/
    specs/
      README.md
      outdated/

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

Spec Kit を実際に利用する場合、`product/specs/` は Spec Kit の生成結果に合わせる。

---

## 5. MVP のコマンド

MVP の command は、project-context の構造と artifact 作成を扱う薄い CLI でよい。

```text
cc-iasd init
cc-iasd run cycle <id>
cc-iasd escalate <scope-ref>
cc-iasd report <scope-ref>
cc-iasd view evidence|current|scope|cycle
cc-iasd log event
cc-iasd review add
cc-iasd feature add
cc-iasd roadmap add
cc-iasd milestone add
cc-iasd spec add
cc-iasd product outdate
cc-iasd ops archive
cc-iasd doctor
```

### 5.1 cc-iasd init

project-context を初期化する。

```text
実行内容:
- runtime/ 作成
- lock.json 作成
- rules/ 作成
- user/ 作成
- product/ 作成
- product/ideal/ 作成
- product/specs/ 作成または Spec Kit 初期化
- ops/scopes/ 作成
- ops/cycles/ 作成
- ops/evidence/ 作成
- reference/ 作成
- src/ 作成
- 最小テンプレート配置
```

### 5.2 cc-iasd milestone add <id>

Milestone scope を作成する。

```text
実行内容:
- milestone id と summary を受け取る
- 関連 feature / roadmap / spec / tasks の参照を検査する
- ops/scopes/milestones/<id>.md を作成する
- milestone event を ops/evidence/logs/ に記録する
```

### 5.3 cc-iasd run cycle <id>

MVP では、完全自動実行でなくてよい。

```text
実行内容:
- cycle を作成または解決する
- 対象 spec / tasks を確認する
- 関連 feature / roadmap / milestone を確認する
- autonomy protocol に照らして実行可能範囲を確認する
- 実行 agent に渡す handoff.md を生成する
- state.md を初期化する
- cycle-local knowledge.md を用意する
- run event を ops/evidence/logs/ に記録する
```

### 5.4 cc-iasd escalate <scope-ref>

Escalation Packet を生成する。

```text
実行内容:
- 停止理由を整理する
- 関連 product / scope / cycle / evidence を参照する
- 選択肢と影響を整理する
- 推奨案を明示する
- report として ops/evidence/reports/ に保存する
```

### 5.5 cc-iasd report <scope-ref>

Completion Report を生成する。

```text
実行内容:
- 実装内容をまとめる
- test / review 結果をまとめる
- 軽微判断と残リスクを整理する
- 人間確認点を出す
- report として ops/evidence/reports/ に保存する
```

---

## 6. MVP のワークフロー

```text
1. cc-iasd init
2. user が product-intent / constraints を記述
3. product/ideal/ に ideal 正本を作成または更新する
4. ops/scopes/features/ で feature scope を整理する
5. ops/scopes/roadmaps/ で roadmap を定義する
6. product/specs/ で requirements / plan / tasks を作る
7. cc-iasd milestone add <id> で milestone を定義する
8. cc-iasd run cycle <id>
9. Worker runtime が src/ を編集する
10. Reviewer runtime または人間が ops/evidence/reviews/ に review を記録する
11. 必要に応じて cc-iasd escalate <scope-ref>
12. 人間判断後に再開
13. cc-iasd report <scope-ref>
14. 必要な一時 context は cc-iasd view ... で生成する
15. 完了した cycle / evidence / scope artifact を cc-iasd ops archive で archived/ へ退避する
16. 正本でなくなった product artifact を cc-iasd product outdate で outdated/ へ退避する
```

---

## 7. MVP の成功条件

```text
成功条件:
- project-context の構造が安定している
- 成果物 project が src/ に分離されている
- product 正本と ops transaction が分離されている
- ideal / spec の正本が product/ にある
- features / roadmap / milestone が scope artifact として整理されている
- cycle が自走実行単位として定義されている
- logs / reviews / reports が evidence layer にある
- spec / plan / tasks の正本が二重化していない
- Escalation Packet が人間判断に足る情報を持つ
- Completion Report が作業結果と残リスクを示す
- artifact 間参照から作業経緯を追える
```

---

## 8. MVP で自動化しない判断

次は MVP では自動化しない。

```text
MVP で人間判断に残す:
- ideal の目的変更
- roadmap 変更
- milestone 目的変更
- spec の大幅変更
- 技術スタック変更
- 外部サービス導入
- 費用が発生する判断
- セキュリティ境界に関わる判断
- 成果物 project の repository 方針
```

---

## 9. MVP の実装方針

MVP は、重い framework 統合よりも、文書構造と運用規律を優先する。

```text
優先:
- Markdown templates
- deterministic directory structure
- simple CLI
- explicit root path
- product / ops layer separation
- archive / outdated rule
- report generation

後回し:
- 完全自律 runtime orchestration
- plugin runtime
- UI
- complex permission system
- advanced audit trail
- 正本化された横断 index
```

---

## 10. MVP の再定義

ledger MVP は、次のように定義する。

```text
ledger MVP
  = project-context scaffold
  + product canon layer
  + Spec Kit 正本の受け皿
  + scope / transaction layer
  + cycle autonomy protocol
  + evidence layer
  + src/ isolation
  + escalation / completion templates
```

この段階では、ledger は「AI開発OS」ではなく、「自律開発を破綻させない project-context scaffold」である。
