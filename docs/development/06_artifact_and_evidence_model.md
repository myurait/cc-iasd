# 06. Artifact / Evidence Model

作成日: 2026-05-04  
状態: 統合整理版 v0.1

---

## 1. この文書の目的

この文書は、ledger が扱う成果物と証跡のモデルを定義する。

ledger は、単なるログ収集機構ではない。開発作業、判断、review、escalation、completion を後から追跡できるようにする evidence bridge を持つ。

---

## 2. 成果物の分類

```text
成果物分類:
- Rule artifacts
- User-authored artifacts
- Ideal artifacts
- Roadmap artifacts
- Spec artifacts
- Milestone artifacts
- Ops evidence artifacts
- Source project artifacts
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

### 3.1 policies/

自走条件、停止条件、証跡要件、言語、テストなどの制約を定義する。

### 3.2 roles/

Planning Lead / Worker / Reviewer / Auditor などの責務、権限、入力文脈、出力成果物を定義する。

### 3.3 templates/ and checklists/

Escalation Packet、Completion Report、Review Report、Role Handoff などの出力形式と検査観点を定義する。

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

ledger はこの領域を勝手に上書きしない。

```text
product-intent.md:
  プロダクト意図

constraints.md:
  技術・費用・運用・環境制約

decisions.md:
  人間が明示的に決めたこと

preferences.md:
  強制ではないが尊重すべき傾向

scratch.md:
  未整理メモ。正本ではない
```

---

## 5. Ideal artifacts

Ideal artifacts は、ユーザー入力を開発判断に使える形へ正規化した正本である。

```text
ops/ideal/
  ideal-experience.md
  product-charter.md
```

`user/` が raw input と人間判断の領域であるのに対し、`ops/ideal/` は Planning Lead、Worker、Reviewer が参照する正規化済みの開発運営上の正本である。

---

## 6. Roadmap artifacts

Roadmap artifacts は、ideal をどの順序で実現へ近づけるかを定義する計画正本である。

```text
ops/roadmaps/
  <roadmap-id>.md
```

roadmap は milestone の上位にある。milestone は roadmap の一部を実行可能な自走単位として切り出したものであり、AI 開発チームが roadmap の目的を勝手に変更してはならない。

---

## 7. Spec artifacts

Spec artifacts は、Spec Kit を正本とする。

```text
ops/specs/<spec-id>/
  requirements.md
  plan.md
  tasks.md
```

### 7.1 requirements.md

ユーザー価値、要件、制約を定義する。

### 7.2 plan.md

設計方針、実装計画、依存関係を定義する。

### 7.3 tasks.md

実装 runtime に渡せる作業単位を定義する。

ledger はこれらを複製しない。milestone / evidence / escalation から参照する。

---

## 8. Milestone artifacts

milestone ごとに状態と証跡を管理する。

```text
ops/milestones/<milestone-id>/
  status.md
  evidence.md
  escalation.md
  completion-report.md
```

### 8.1 status.md

```text
status.md:
- milestone id
- linked spec
- linked tasks
- current status
- active blocker
- last update
```

### 8.2 evidence.md

```text
evidence.md:
- 実行 task
- 実装結果
- test / lint / build 結果
- review 結果
- audit finding
- ADR / decision references
- escalation references
```

### 8.3 escalation.md

milestone 内で発生した Escalation Packet を記録する。

### 8.4 completion-report.md

milestone 完了時の報告である。

---

## 9. Ops evidence artifacts

ops 直下には、milestone をまたいで参照する証跡索引と判断履歴を置く。

```text
ops/
  decisions.md
  evidence-index.md
  knowledge.md
```

`ops/decisions.md` は AI 開発チームと project-context 運営上の判断履歴であり、`user/decisions.md` の人間判断とは分ける。

`ops/evidence-index.md` は、spec、task、review、escalation、completion report への索引である。

`ops/knowledge.md` は、再利用可能な教訓を一時的に蓄積する領域である。

---

## 10. Source project artifacts

`src/` 以下は成果物 project の領域である。

```text
src/:
- source code
- tests
- dependency files
- build config
- runtime config
```

ledger は `src/` の中身を project 固有の事情に任せる。ただし、実装 runtime に `src/` が成果物 root であることを明示する。

---

## 11. Evidence Bridge

Evidence Bridge は、各成果物への索引である。

```text
Evidence Bridge の目的:
- 作業内容を後から追跡する
- 軽微判断の根拠を残す
- review / audit の結果を参照する
- escalation 判断の背景を示す
- completion report の裏付けを提供する
```

Evidence Bridge は、すべてのログを保存する巨大ログではない。

```text
Evidence Bridge が持つもの:
- 参照
- 要約
- 判断理由
- 状態
- 未解決 / 解決済みの区別

Evidence Bridge が持たないもの:
- 全 chat transcript
- 全 agent token log
- 全 diff の複製
- すべての runtime event
```

---

## 12. Escalation Packet テンプレート

```markdown
# Escalation Packet: <id>

## 1. 停止理由

## 2. 対象

- spec:
- milestone:
- tasks:

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
# Completion Report: <milestone-id>

## 1. 対象 milestone

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

ledger は、過去の判断や証跡を黙って上書きしない。

```text
原則:
- 判断は追記する
- 変更理由を残す
- 古い判断を消す場合は無効化理由を残す
- review finding は resolved / unresolved / deferred を区別する
- milestone 内の方針変更は evidence に残す
```

MVP では、完全な immutable log ではなく、Markdown 上の追記規律として定義すればよい。
