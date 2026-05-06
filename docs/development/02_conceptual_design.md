# 02. ledger 概念設計

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. ledger の概念的位置づけ

ledger は、AI 実行エージェントでも、チャット UI でも、単なるログ機構でもない。

```text
ledger
  = project-context full-stack agentic development framework
```

ledger は、成果物 project の外側に project-context を構成し、その中で仕様、計画、タスク、自律実装、レビュー、証跡、エスカレーションを管理する。

```text
ledger が扱うもの:
- project-context
- product canon
- spec / plan / tasks
- scope / cycle
- role operating model
- autonomy protocol
- implementation delegation
- review / audit evidence
- escalation packet
- completion report
```

---

## 2. project-context

project-context は、成果物 project を内包する開発文脈である。

```text
project-context/
  runtime/
  rules/
  user/
  product/
  ops/
  src/
```

`src/` は成果物 project の root である。ledger は `src/` の外側から開発文脈を管理する。

この構造により、次を分ける。

```text
project-context:
  制約、ユーザー入力、product 正本、scope、cycle、証跡、escalation、completion report

src/:
  成果物 project のコード、設定、テスト、ビルド構成
```

---

## 3. 正本の考え方

ledger は、すべてを独自形式で再実装しない。

```text
正本割当:
- ideal: product/ideal/
- spec / plan / tasks: Spec Kit（product/specs/）
- task implementation loop: cc-sdd または同等 plugin
- role / SOP: ledger が最小定義し、BMAD / MetaGPT を参照
- features / roadmap / milestone: ops/scopes/
- cycle autonomy: ledger 固有
- escalation: ledger 固有
- evidence: ops/evidence/
- 成果物 project: src/
```

正本は一つにする。複数 framework が同じ成果物を持つ場合、ledger は所有権を割り当てる。

---

## 4. 主要概念

### 4.1 Spec

Spec は、開発対象の仕様単位である。

```text
Spec:
- requirements
- plan
- tasks
```

ledger は Spec Kit の spec 構造を正本として扱う。

### 4.2 Milestone

Milestone は、roadmap 上の到達点または計画境界である。

```text
Milestone:
- spec の一部または複数 tasks を束ねる
- Planning Lead が安全と判断した bounded scope
- completion report の単位になり得る
```

Milestone は実行証跡の入れ物ではない。自走実行の状態、handoff、局所知識は cycle に置く。

### 4.3 Cycle

Cycle は、AI 自走の実行単位である。

```text
Cycle:
- spec / task / milestone などの bounded scope を入力にする
- Worker / runtime に渡す handoff を持つ
- state と cycle-local knowledge を持つ
- logs / reviews / reports を参照する
```

Kiro / cc-sdd 的な実装進行の中心は spec / task である。Cycle は、それを cc-iasd の project-context と evidence layer に接続する transaction artifact である。

### 4.4 Task

Task は実装 runtime に委譲可能な作業単位である。

```text
Task:
- requirements / plan から導出される
- implementation plugin が実行対象にする
- review / audit の単位にもなる
```

### 4.5 Evidence

Evidence は、作業・判断・レビューの追跡材料である。

```text
Evidence:
- 実装ログ
- review 結果
- audit finding
- test 結果
- escalation packet
- completion report
```

ledger の evidence は、全情報の複製ではなく、scope / cycle / product artifact への参照でつながる証跡である。

### 4.6 Escalation

Escalation は、AI が判断できない事項を人間へ戻すための構造化文書である。

単なる質問ではなく、判断に必要な背景、選択肢、影響、推奨案を含む。

### 4.7 Completion Report

Completion Report は、scope または cycle 完了時に人間が確認するまとめである。

実装内容だけでなく、軽微判断、review 結果、残リスク、未完了事項を含む。

---

## 5. ロール概念

ledger のロールは、AI の人格設定ではなく、責務分離である。

```text
最小ロール:
- Planning Lead
- Worker
- Reviewer
```

拡張ロールは後段でよい。

```text
拡張候補:
- Code Quality Auditor
- Compliance Auditor
- Devil's Advocate
- Architect
- Documentation Maintainer
```

### 5.1 Planning Lead

Planning Lead は project-context 内の開発チームリーダーである。

```text
Planning Lead の責務:
- scope / cycle の開発進行管理
- task breakdown の調整
- Worker / Reviewer への作業割当
- cycle 内の軽微判断
- 停止・エスカレーション判断
- completion report の整理
```

Planning Lead は ChatLobby の Frontdoor ではない。ChatLobby 側の入口機能は、ledger 内ロールではなく外部制約である。

### 5.2 Worker

Worker は、task を実装する。

```text
Worker の責務:
- task の実装
- test / lint / build の実行
- 実装結果の記録
- 実装中に判明した問題の報告
```

### 5.3 Reviewer

Reviewer は、Worker の結果を検査する。

```text
Reviewer の責務:
- task 完了条件の確認
- regression risk の確認
- implementation note の確認
- 修正要求の提示
```

---

## 6. ChatLobby との境界

ChatLobby は、ユーザーの会話と workspace-aware chat shell を扱う。

ledger は、開発 project-context の自律開発規律を扱う。

```text
ChatLobby から ledger へ渡され得るもの:
- ユーザーの作業依頼
- 対象 project-context
- 参照すべき会話要約
- 人間判断結果

ledger から ChatLobby へ返され得るもの:
- Escalation Packet
- Completion Report
- status summary
```

ただし、ledger は ChatLobby との密結合を前提にしない。CLI またはローカル project-context 単体でも成立させる。

---

## 7. 成果物 project の由来管理について

ledger は、成果物 project が新規開発なのか、既存 repository の解析なのか、別 repository から移植したものなのかを一律に規定しない。

これは project 固有の文脈に依存する。

ledger が定義するのは次である。

```text
ledger が定義する:
- project-context と src/ の関係
- spec / plan / tasks の配置
- 実装対象 root の明示
- 証跡と report の置き場所

ledger が一律には定義しない:
- ソースコードの由来管理ルール
- repository 分割方針
- upstream 追従方針
- 既存コード解析 project 特有の運用
```

この境界により、ledger は project-context framework に留まり、個別 project の source provenance policy を過剰に抱え込まない。
