# 04. ledger MVP

作成日: 2026-05-04  
状態: 統合整理版 v0.1

---

## 1. MVP の目的

ledger MVP の目的は、完全な自律開発プラットフォームを作ることではない。

MVP の目的は、次の最小価値を成立させることである。

```text
MVP の最小価値:
project-context を作り、
spec / plan / tasks を正本として扱い、
src/ に成果物 project を隔離し、
milestone 単位の自走境界を文書化し、
停止時には Escalation Packet、完了時には Completion Report を出せる。
```

---

## 2. MVP の対象範囲

```text
MVP 対象:
- project-context 初期化
- src/ isolation
- ideal / roadmap の正本配置
- Spec Kit 由来の spec / plan / tasks の配置
- rules/ による制約レイヤー
- milestone status
- autonomy protocol
- escalation packet
- completion report
- evidence index
- 最小 command 設計
```

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

  ops/
    ideal/
      ideal-experience.md
      product-charter.md
    roadmaps/
      README.md
    specs/
      README.md
    milestones/
      README.md
    evidence-index.md

  src/
    README.md
```

Spec Kit を実際に利用する場合、`ops/specs/` は Spec Kit の生成結果に合わせる。

---

## 5. MVP のコマンド

MVP で必要な command は 4 つでよい。

```text
cc-iasd init
cc-iasd run milestone <id>
cc-iasd escalate <id>
cc-iasd report <id>
```

### 5.1 cc-iasd init

project-context を初期化する。

```text
実行内容:
- runtime/ 作成
- lock.json 作成
- rules/ 作成
- user/ 作成
- ops/ 作成
- ops/specs/ 作成または Spec Kit 初期化
- src/ 作成
- 最小テンプレート配置
```

### 5.2 cc-iasd run milestone <id>

MVP では、完全自動実行でなくてよい。

```text
実行内容:
- milestone を解決する
- 対象 spec / tasks を確認する
- autonomy protocol に照らして実行可能範囲を確認する
- 実行 agent に渡す作業内容を生成する
- status / evidence を更新する
```

### 5.3 cc-iasd escalate <id>

Escalation Packet を生成する。

```text
実行内容:
- 停止理由を整理する
- 関連 spec / tasks / evidence を参照する
- 選択肢と影響を整理する
- 推奨案を明示する
```

### 5.4 cc-iasd report <id>

Completion Report を生成する。

```text
実行内容:
- 実装内容をまとめる
- test / review 結果をまとめる
- 軽微判断と残リスクを整理する
- 人間確認点を出す
```

---

## 6. MVP のワークフロー

```text
1. cc-iasd init
2. user が product-intent / constraints を記述
3. ops/ideal/ を作成または更新する
4. ops/roadmaps/ で roadmap を定義する
5. Spec Kit で requirements / plan / tasks を作る
6. milestone を定義する
7. cc-iasd run milestone <id>
8. 必要に応じて cc-iasd escalate <id>
9. 人間判断後に再開
10. cc-iasd report <id>
```

---

## 7. MVP の成功条件

```text
成功条件:
- project-context の構造が安定している
- 成果物 project が src/ に分離されている
- ideal / roadmap / spec / milestone の階層が明確である
- spec / plan / tasks の正本が二重化していない
- milestone の自走可否を判断できる
- Escalation Packet が人間判断に足る情報を持つ
- Completion Report が作業結果と残リスクを示す
- Evidence Index から作業経緯を追える
```

---

## 8. MVP で自動化しない判断

次は MVP では自動化しない。

```text
MVP で人間判断に残す:
- roadmap 変更
- milestone 目的変更
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
- evidence index
- report generation

後回し:
- 完全自律 runtime orchestration
- plugin runtime
- UI
- complex permission system
- advanced audit trail
```

---

## 10. MVP の再定義

ledger MVP は、次のように定義する。

```text
ledger MVP
  = project-context scaffold
  + Spec Kit 正本の受け皿
  + src/ isolation
  + milestone autonomy protocol
  + escalation / completion / evidence templates
```

この段階では、ledger は「AI開発OS」ではなく、「自律開発を破綻させない project-context scaffold」である。
