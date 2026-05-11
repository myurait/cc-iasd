# 02. cc-iasd 概念設計

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. cc-iasd の概念的位置づけ

cc-iasd は、AI 実行エージェントでも、チャット UI でも、単なるログ機構でもない。

```text
cc-iasd
  = project-context full-stack agentic development framework
```

cc-iasd は、成果物 project の外側に project-context を構成し、その中で仕様、計画、タスク、自律実装、レビュー、証跡、エスカレーションを管理する。

```text
cc-iasd が扱うもの:
- project-context
- product canon
- spec / plan / tasks
- scope / execution
- role operating model
- autonomy protocol
- implementation delegation
- review / audit evidence
- escalation packet
- completion report
```

---

## 2. cc-iasd の ideal

cc-iasd の ideal は、人間の意図を、AI が自走可能な作業単位へ変換するまでの経路を厳密に保つことである。

cc-iasd は、AI に長時間の実装を委譲するための単なる checklist ではない。AI が実装作業を進める前に、何を作るべきか、何を作るべきではないか、どの機能が重要か、どの判断を人間へ戻すべきか、どの単位で体験価値を成立させるかを project-context に固定する実行 harness である。

cc-iasd は次を満たす必要がある。

```text
cc-iasd の ideal:
- ユーザーが意図していないものを作らない
- 想定している機能を漏らさない
- 想定している機能の重要度を誤らない
- 各 task が関連機能へ破壊的影響を出さないようにする
- infrastructure、cost、security、product value など人間判断が必要な事項を早期に返す
- 作業単位を細かく厳密にし、run 単位で検証可能にする
- ユーザー体験への直接影響を campaign 単位でまとめる
```

この ideal は、ideal / feature / spec / campaign / run を増やすこと自体を目的にしない。各 artifact は、run が完全な入力を持ち、Worker が意図から逸脱せず、Reviewer が不足や逸脱を検出できるようにするための境界である。

---

## 3. Artifact Quality と差し戻し

cc-iasd は、ideal / feature / spec の前段不足を独立 gate として扱わない。

```text
方針:
- 各 artifact の品質要件が、実質的に downstream への進行条件になる
- authoring role は、前段不足があるまま推測で執筆を続けない
- Design Reviewer は、同じ design level の成果物品質を評価し、必要な場合は修正を要求する
- Planning Lead は gate 判定者ではなく、差し戻し要求を中継する coordinator である
```

Feature Scope Designer は、ideal や human decision が不足している場合、feature scope を推測で補完しない。Spec Designer は、feature / roadmap / ideal / human decision が不足している場合、spec / plan / tasks を推測で補完しない。どちらも、完全な成果物を書けないと判断した時点で Backtrack Request を返す。

Design Reviewer は、artifact が次の role に渡せる品質を持つかを評価する。Design Reviewer が不足を検出した場合、Planning Lead は指摘内容を作成元 role または上流 role へ narrow context packet として差し戻す。

Planning Lead は、品質判断を自分で肩代わりしない。Planning Lead の責務は、Backtrack Request を受け取り、差し戻し先 role、必要な context、再開位置を整理することである。

---

## 4. Devil's Advocate の2モード

Devil's Advocate は単一 role のまま維持する。ただし、campaign に対しては別々の観点で2回起動され得る。

```text
Devil's Advocate review modes:
- Design Launch Review
- Campaign Completion Review
```

Design Launch Review は、spec design review と campaign planning の後、最初の run を開始する前に行う。目的は、campaign を走らせてよいかを疑うことである。ここでは、実装コードではなく、campaign の user experience outcome、feature / spec coverage、task selector、stop / progression conditions、impact map、non-regression focus、人間判断が必要な infrastructure / cost / security / privacy / external service / product value を確認する。

Campaign Completion Review は、implementation と task-unit review の後、campaign を完了扱いにする前に行う。目的は、campaign を完了として受け入れてよいかを疑うことである。ここでは、完了 task と feature coverage の混同、未解決 open item、debt、follow-up、spec gap、impact map 外の変更、non-regression verification、証跡の十分性を確認する。

Devil's Advocate Focus はどちらの mode でも監査範囲を限定しない。Focus は、特に警戒すべき観点を事前に渡すための入力である。

---

## 5. project-context

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

`src/` は成果物 project の root である。cc-iasd は `src/` の外側から開発文脈を管理する。

`src/` 配下を cc-iasd 管理 artifact で汚染しないことは絶対制約である。spec、runtime、run state、evidence、report、policy は `src/` の外側に置く。cc-iasd は `src/` 配下の成果物 project に対して command を実行してよいが、成果物 project の中に cc-iasd 管理の仕様領域や runtime 領域を持ち込んではならない。

この構造により、次を分ける。

```text
project-context:
  制約、ユーザー入力、product 正本、scope、execution、証跡、escalation、completion report

src/:
  成果物 project のコード、設定、テスト、ビルド構成
```

---

## 6. 正本の考え方

cc-iasd は、すべてを独自形式で再実装しない。

```text
正本割当:
- ideal: product/ideal/
- spec / plan / tasks: product/specs/（Spec Kit 互換 dialect）
- task implementation loop: Claude Code / Codex などの実行 runtime
- role / SOP: cc-iasd が最小定義し、BMAD / MetaGPT を参照
- features / roadmap: ops/scopes/
- campaign / run: ops/execution/
- run autonomy: cc-iasd 固有
- escalation: cc-iasd 固有
- evidence: ops/evidence/
- 成果物 project: src/
```

正本は一つにする。複数 framework が同じ成果物を持つ場合、cc-iasd は所有権を割り当てる。

---

## 7. 主要概念

### 7.1 Spec

Spec は、開発対象の仕様単位である。

```text
Spec:
- spec
- plan
- tasks
```

cc-iasd は Spec Kit の成果物正本性を採用しない。Spec Kit が標準化した artifact vocabulary と workflow は参照するが、cc-iasd の spec 正本は `product/specs/` に置く。

### 7.2 Campaign

Campaign は、複数の task set や run を段階的に処理するための計画境界である。

```text
Campaign:
- user experience outcome を持つ
- feature / spec coverage を持つ
- task selector を持つ
- stop condition を持つ
- progression condition を持つ
- cross-run non-regression focus を持つ
- impact map を持つ
- Devil's Advocate Focus を持つ
- Devil's Advocate Design Launch Review の結果を参照する
- completion condition を持つ
- aggregate report の単位になり得る
```

Campaign は巨大な実行単位ではない。実行 transaction の状態、handoff、局所知識は run に置く。Campaign は、複数 run を通じてユーザー体験や機能まとまりが成立するかを制御する上位境界である。

### 7.3 Run

Run は、AI 自走の実行単位である。

```text
Run:
- spec / task / campaign などの bounded scope を入力にする
- Worker / runtime に渡す handoff を持つ
- state と run-local knowledge を持つ
- selected tasks を持つ
- expected local outcome を持つ
- likely touched surfaces を持つ
- related impact surfaces を持つ
- non-regression focus を持つ
- escalation triggers を持つ
- local verification を持つ
- open item routing を持つ
- logs / reviews / reports を参照する
```

Spec-driven development 的な実装進行の中心は spec / task である。Run は、それを cc-iasd の project-context と evidence layer に接続する transaction artifact である。Run は禁止領域を過度に定義しない。想定変更面、影響確認面、非退行焦点、エスカレーション条件によって、自走境界を表現する。

### 7.4 Task

Task は実装 runtime に委譲可能な作業単位である。

```text
Task:
- spec / plan から導出される
- implementation plugin が実行対象にする
- review / audit の単位にもなる
```

### 7.5 Evidence

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

cc-iasd の evidence は、全情報の複製ではなく、scope / run / product artifact への参照でつながる証跡である。

### 7.6 Escalation

Escalation は、AI が判断できない事項を人間へ戻すための構造化文書である。

単なる質問ではなく、判断に必要な背景、選択肢、影響、推奨案を含む。

### 7.7 Completion Report

Completion Report は、scope または run 完了時に人間が確認するまとめである。

実装内容だけでなく、軽微判断、review 結果、残リスク、未完了事項を含む。

---

## 8. ロール概念

cc-iasd のロールは、AI の人格設定ではなく、責務分離である。

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

### 8.1 Planning Lead

Planning Lead は project-context 内の開発チームリーダーである。

```text
Planning Lead の責務:
- scope / run の開発進行管理
- task breakdown の調整
- Worker / Reviewer への作業割当
- run 内の軽微判断
- 停止・エスカレーション判断
- completion report の整理
```

### 8.2 Worker

Worker は、task を実装する。

```text
Worker の責務:
- task の実装
- test / lint / build の実行
- 実装結果の記録
- 実装中に判明した問題の報告
```

### 8.3 Reviewer

Reviewer は、Worker の結果を検査する。

```text
Reviewer の責務:
- task 完了条件の確認
- regression risk の確認
- implementation note の確認
- 修正要求の提示
```

---

## 9. 成果物 project の由来管理について

cc-iasd は、成果物 project が新規開発なのか、既存 repository の解析なのか、別 repository から移植したものなのかを一律に規定しない。

これは project 固有の文脈に依存する。

cc-iasd が定義するのは次である。

```text
cc-iasd が定義する:
- project-context と src/ の関係
- spec / plan / tasks の配置
- 実装対象 root の明示
- 証跡と report の置き場所

cc-iasd が一律には定義しない:
- ソースコードの由来管理ルール
- repository 分割方針
- upstream 追従方針
- 既存コード解析 project 特有の運用
```

この境界により、cc-iasd は project-context framework に留まり、個別 project の source provenance policy を過剰に抱え込まない。
