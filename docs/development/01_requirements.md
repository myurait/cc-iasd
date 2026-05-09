# 01. cc-iasd 要件定義

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. 目的

cc-iasd の目的は、AI 実行エージェントを直接作ることではない。

cc-iasd の目的は、開発 project を内包する project-context を生成し、その中で AI 開発チームが、仕様、計画、タスク、自律実装、レビュー、証跡、エスカレーション、完了報告を一貫した流れで扱えるようにすることである。

```text
cc-iasd の目的:
- project-context を作る
- spec / plan / tasks を正本化する
- 実装対象 project を src/ に隔離する
- campaign / run 単位で自走範囲を定義する
- 自律実装を既存 framework / runtime に委譲する
- 判断・レビュー・残リスクを追跡できる形にする
- 必要な場合だけ人間判断へ戻す
```

---

## 2. 理想体験

### 2.1 ユーザー視点

ユーザーは、細かく逐次指示しない。

```text
ユーザー:
  この機能を作って

cc-iasd:
  対象 spec / campaign / run を確認し、
  tasks を分解し、
  実装 runtime に委譲し、
  review / audit を実行し、
  証跡をまとめる。

cc-iasd:
  人間判断が必要な場合だけ、
  Escalation Packet として状況、選択肢、推奨案、影響を提示する。

ユーザー:
  判断する。

cc-iasd:
  判断後に再開し、完了時に Completion Report を返す。
```

ユーザーは、自走中に常駐しない。したがって、cc-iasd は「今どうしたらよいですか」と短く聞くのではなく、後から読んでも判断できる材料を揃える必要がある。

### 2.2 AI 開発チーム視点

AI 開発チームは、roadmap 全体を自由に変更しない。

```text
AI 開発チームが行えること:
- 承認済み run scope 内の task 分解
- task の順序変更
- task-local な実装判断
- review / audit に基づく bounded remediation
- 軽微な実装方針の記録

AI 開発チームが行えないこと:
- roadmap の目的変更
- campaign の目的変更
- 技術スタックの大幅変更
- 費用・外部サービス・セキュリティに関わる決裁
- ユーザー価値判断を伴う仕様変更
```

### 2.3 開発 project 視点

成果物 project は、cc-iasd の都合で汚染されない。

```text
project-context/
  runtime/
  rules/
  user/
  product/
  ops/
  src/  ← 成果物 project
```

成果物 project のコード、設定、テストは `src/` 以下に置く。cc-iasd は外側から開発文脈と証跡を管理する。

---

## 3. 機能要件

### 3.1 project-context 初期化

```text
cc-iasd は以下を初期化できること:
- runtime/
- rules/
- user/
- product/
- product/ideal/
- product/specs/
- ops/
- ops/scopes/
- ops/execution/
- ops/execution/campaigns/
- ops/execution/runs/
- ops/evidence/
- src/
- profile / lock / framework version
- 最小テンプレート
```

Spec Kit 互換の artifact vocabulary を採用する場合でも、`src/` 配下へ `.specify/` や `specs/` などの cc-iasd 管理 artifact を生成しないこと。

### 3.2 spec / plan / tasks の正本化

cc-iasd は、Spec Kit の成果物正本性を採用しない。

ただし、Spec Kit が標準化した spec-driven development の artifact vocabulary には可能な限り寄せる。

```text
正本:
- spec
- plan
- tasks
```

これらは `product/specs/` に置く cc-iasd-owned artifact である。cc-iasd は Spec Kit tooling を再実装するのではなく、src isolation を満たす範囲で artifact structure と workflow semantics を互換 dialect として取り込む。

### 3.3 src/ isolation

cc-iasd は、成果物 project を `src/` に隔離する。

```text
必要な制御:
- 実装対象 root は src/
- build / test / lint は src/ 内で実行
- spec は product/ 側に保持
- run / evidence / report は ops/ 側に保持
- coding agent に渡す root を明示
- cc-iasd 管理 artifact を src/ 配下に作成しない
- src/ 配下の成果物 project は cc-iasd なしでも分離可能である
```

### 3.4 campaign / run 自走

cc-iasd は、spec / task を campaign / run に接続して自走を開始できる。

```text
必要な定義:
- 自走開始条件
- 自走継続条件
- 停止条件
- run 内変更可能範囲
- roadmap 変更禁止条件
```

### 3.5 Escalation Packet

人間判断が必要な場合、cc-iasd は Escalation Packet を生成する。

```text
Escalation Packet に含めるもの:
- 何が止まっているか
- 対象 spec / campaign / run / task
- ここまでに実施したこと
- 現在の状態
- 既に判断したこと
- 人間決裁が必要なこと
- 選択肢
- 推奨案
- 推奨理由
- 各選択肢の影響
- 放置した場合の影響
- 判断後に再開する作業
- 関連証跡
```

### 3.6 Evidence Bridge

cc-iasd は、全情報を独自ログや横断 index として複製しない。product / scope / execution / evidence の artifact を参照で結び、後から判断を追跡できる構造を作る。

```text
Evidence Bridge:
- spec / plan / tasks への参照
- run state への参照
- log への参照
- review 結果への参照
- escalation packet への参照
- completion report への参照
```

横断 view が必要な場合は CLI が生成し、正本化しない。

### 3.7 Completion Report

run または campaign 完了時には Completion Report を生成する。

```text
Completion Report:
- 対象 scope
- 実装した内容
- 変更した構成
- 実施した test / lint / build
- ops/evidence/reviews/ に置かれた review / audit 結果
- AI が軽微判断した事項
- 残リスク
- 未完了事項
- 人間が確認すべき点
```

---

## 4. 非機能要件

```text
再現性:
  実行時の profile version と適用ルールを後から確認できること。

追跡性:
  判断、review、残リスク、escalation の根拠を後から追えること。

委譲性:
  実装 runtime を Claude Code / Codex / shell runner などへ差し替え可能にすること。

低結合:
  実行 runtime、Spec Kit、特定の spec-driven framework のどれか一つに過度依存しないこと。

成果物隔離:
  成果物 project に cc-iasd の運用痕跡を混入させないこと。

過剰統合回避:
  既存 framework を丸ごと重ねて二重管理しないこと。
```

---

## 5. 非目標

cc-iasd は次を目標にしない。

```text
非目標:
- Claude Code / Codex / Copilot の代替 runtime になること
- AGENTS.md / CLAUDE.md の代替そのものになること
- MCP のような接続 protocol になること
- GitHub Actions の代替 CI になること
- project のプロダクト方針を自動決定すること
- 技術スタックや外部サービス費用を自動決裁すること
- BMAD / Spec Kit / implementation runtime を全部丸ごと導入して混在させること
- enterprise compliance platform になること
```

---

## 6. 成立条件

初期実装が成立している状態は次である。

```text
成立条件:
- 新規 project-context を作成できる
- src/ に成果物 project を隔離できる
- ideal / spec を product 正本として扱える
- features / roadmap を scope artifact として扱える
- spec / plan / tasks を正本として扱える
- logs / reviews / reports を evidence layer に記録できる
- campaign / run 自走範囲を明示できる
- 実装 runtime に渡す作業単位を定義できる
- 停止時に Escalation Packet を生成できる
- 完了時に Completion Report を生成できる
- artifact 間参照から作業・判断・レビューを追跡できる
```
