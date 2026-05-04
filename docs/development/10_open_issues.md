# 10. ledger 検討中の課題

作成日: 2026-05-04  
状態: 統合整理版 v0.1

---

## 1. この文書の目的

この文書は、ledger の未決論点を整理する。

未決論点は、MVP 前に決めるべきもの、MVP 後の観察で決めるもの、将来構想として残すものに分ける。

---

## 2. MVP 前に決めるべきこと

### 2.1 project-context の最小構造

```text
決めること:
- runtime/ の最小ファイル
- rules/ の最小構造
- user/ の最小構造
- ops/ の最小構造
- ops/ideal/ と ops/roadmaps/ の最小ファイル
- ops/features/ の index / backlog / epics / supporting の最小ファイル
- ops/specs/ を Spec Kit 生成に完全委譲するか
- src/ の初期状態
```

### 2.2 Spec Kit の採用深度

```text
論点:
- 実際に specify init . を呼ぶか
- 互換構造だけを先に置くか
- Spec Kit 未導入環境でも使えるようにするか
```

MVP では、Spec Kit 正本を前提にしつつ、実装は互換構造から始めてもよい。

### 2.3 src/ isolation の運用

```text
論点:
- coding agent に project-context root を渡すか
- src/ root を渡すか
- spec / evidence をどう参照させるか
- test / lint command の working directory をどう固定するか
```

### 2.4 Git 管理単位

```text
選択肢:
A. project-context 全体を git 管理
B. src/ のみを git 管理
C. project-context と src/ を別 repository
D. worktree / submodule
```

MVP では A が簡単だが、成果物 project を汚さない思想とはやや緊張する。

### 2.5 milestone と spec の対応

```text
論点:
- 1 spec = 1 milestone か
- 1 spec に複数 milestone を許すか
- milestone は ledger 側の独自単位か
- tasks.md 上の group と対応させるか
```

### 2.6 Escalation Packet の必須項目

MVP で必須にする項目を固定する必要がある。

```text
候補:
- 停止理由
- 対象 spec / milestone / task
- 人間判断が必要な事項
- 選択肢
- 推奨案
- 影響
- 再開条件
```

### 2.7 Completion Report の必須項目

```text
候補:
- 実装内容
- 変更箇所
- 検証結果
- review 結果
- 軽微判断
- 残リスク
- 未完了事項
```

---

## 3. MVP 後に観察して決めること

### 3.1 role 数

MVP では Planning Lead / Worker / Reviewer でよい。

観察後、次を分けるか判断する。

```text
候補:
- Code Quality Auditor
- Compliance Auditor
- Devil's Advocate
- Architect
- Documentation Maintainer
```

### 3.2 Evidence の粒度

```text
観察点:
- evidence が粗すぎて追跡不能になるか
- evidence が細かすぎて運用不能になるか
- task 単位で足りるか
- milestone 単位で足りるか
```

### 3.3 completion report の有用性

```text
観察点:
- 人間が後から判断できるか
- 残リスクが見えるか
- 次回作業の文脈復元に使えるか
```

### 3.4 implementation plugin の実効性

```text
観察点:
- cc-sdd 的な実装ループが合うか
- Claude Code / Codex への handoff で足りるか
- どこまで自動化すると破綻するか
```

---

## 4. 後段に回すこと

```text
後段:
- plugin architecture
- multi-runtime orchestration
- ChatLobby tight integration
- profile migration
- advanced audit
- UI
- source provenance adapter
- knowledge promotion automation
```

---

## 5. 判断が難しい論点

### 5.1 ledger は framework か harness か

現在の正本は `project-context full-stack agentic development framework` である。

ただし、MVP 実装は `project-context scaffold + autonomy harness` に近い。

```text
整理:
- 概念上は framework
- MVP 実装は scaffold / harness
- 将来的に plugin 化・統合が進むと framework 性が強くなる
```

### 5.2 src/ に隔離することの負荷

`src/` isolation は、成果物 project を汚さない利点がある。一方で、既存 coding agent や tool は root 前提で動くことが多い。

```text
リスク:
- agent が project-context root を src root と誤解する
- build / test command の working directory がずれる
- dependency file を見つけられない
```

adapter / command / prompt で明示する必要がある。

### 5.3 Spec Kit 依存の強さ

Spec Kit を kernel にする方針は明確である。ただし、Spec Kit 自体の構造変更や利用可能性に依存しすぎると ledger の初期導入が重くなる。

```text
MVP 方針:
- Spec Kit 正本の思想は採用
- 実装は互換構造から始められるようにする
```

### 5.4 BMAD の扱い

BMAD は role / planning の参照元として有用だが、全面統合すると Spec Kit と責務が衝突する可能性がある。

```text
方針:
- MVP では参照に留める
- optional plugin は後段
```

---

## 6. 未決論点一覧

```text
未決:
- cc-iasd.yaml の schema
- lock.json の schema
- ops/roadmaps/ の保存形式
- ops/features/ の item schema
- ops/logs/ の entry schema
- ops/milestones/<id>/reviews/ の review lifecycle
- milestone id の命名規則
- spec id と milestone id の対応
- tasks.md のどの粒度を実行単位にするか
- evidence.md の粒度
- escalation.md を milestone ごとにするか global にするか
- completion-report.md の保存場所
- user decisions と AI 軽微判断の分離形式
- src/ の Git 管理方式
- runtime handoff packet の schema
- reviewer findings の lifecycle
- profile update の方法
```

---

## 7. 現時点の推奨

```text
推奨:
- MVP では構造とテンプレートを固定する
- 自動化は最小にする
- Spec Kit 正本方針は採用する
- cc-sdd は plugin 候補に留める
- src/ isolation は採用する
- Git 分離は後で検証する
- ChatLobby 連携は後段にする
```
