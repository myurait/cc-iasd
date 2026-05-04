# 01. ledger 要件定義

作成日: 2026-05-04  
状態: 統合整理版 v0.1

---

## 1. 目的

ledger の目的は、AI 実行エージェントを直接作ることではない。

ledger の目的は、開発 project を内包する project-context を生成し、その中で AI 開発チームが、仕様、計画、タスク、自律実装、レビュー、証跡、エスカレーション、完了報告を一貫した流れで扱えるようにすることである。

```text
ledger の目的:
- project-context を作る
- spec / plan / tasks を正本化する
- 実装対象 project を src/ に隔離する
- milestone 単位で自走範囲を定義する
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

ledger:
  対象 spec / milestone を確認し、
  tasks を分解し、
  実装 runtime に委譲し、
  review / audit を実行し、
  証跡をまとめる。

ledger:
  人間判断が必要な場合だけ、
  Escalation Packet として状況、選択肢、推奨案、影響を提示する。

ユーザー:
  判断する。

ledger:
  判断後に再開し、完了時に Completion Report を返す。
```

ユーザーは、自走中に常駐しない。したがって、ledger は「今どうしたらよいですか」と短く聞くのではなく、後から読んでも判断できる材料を揃える必要がある。

### 2.2 AI 開発チーム視点

AI 開発チームは、roadmap 全体を自由に変更しない。

```text
AI 開発チームが行えること:
- 承認済み milestone 内の task 分解
- task の順序変更
- task-local な実装判断
- review / audit に基づく bounded remediation
- 軽微な実装方針の記録

AI 開発チームが行えないこと:
- roadmap の目的変更
- milestone の目的変更
- 技術スタックの大幅変更
- 費用・外部サービス・セキュリティに関わる決裁
- ユーザー価値判断を伴う仕様変更
```

### 2.3 開発 project 視点

成果物 project は、ledger の都合で汚染されない。

```text
project-context/
  runtime/
  rules/
  user/
  ops/
  src/  ← 成果物 project
```

成果物 project のコード、設定、テストは `src/` 以下に置く。ledger は外側から開発文脈と証跡を管理する。

---

## 3. 機能要件

### 3.1 project-context 初期化

```text
ledger は以下を初期化できること:
- runtime/
- rules/
- user/
- ops/
- src/
- profile / lock / framework version
- 最小テンプレート
```

Spec Kit を採用する場合、`specify init .` に相当する初期化を project-context に対して実行できること。

### 3.2 spec / plan / tasks の正本化

ledger は、spec / plan / tasks を独自再発明しない。

```text
正本:
- requirements
- plan
- tasks
```

これらは Spec Kit 系の成果物を正本として扱う。ledger はその外側に milestone 自走、escalation、evidence bridge を重ねる。

### 3.3 src/ isolation

ledger は、成果物 project を `src/` に隔離する。

```text
必要な制御:
- 実装対象 root は src/
- build / test / lint は src/ 内で実行
- spec / evidence / escalation は ops/ 側に保持
- coding agent に渡す root を明示
```

### 3.4 milestone 自走

ledger は、milestone 単位または bounded scope 単位で自走を開始できる。

```text
必要な定義:
- 自走開始条件
- 自走継続条件
- 停止条件
- milestone 内変更可能範囲
- roadmap 変更禁止条件
```

### 3.5 Escalation Packet

人間判断が必要な場合、ledger は Escalation Packet を生成する。

```text
Escalation Packet に含めるもの:
- 何が止まっているか
- 対象 spec / milestone / task
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

ledger は、全情報を独自ログとして複製しない。正本成果物への参照を集め、後から判断を追跡できる索引を作る。

```text
Evidence Bridge:
- spec / plan / tasks への参照
- task 実行結果への参照
- review 結果への参照
- ADR への参照
- escalation packet への参照
- completion report への参照
```

### 3.7 Completion Report

milestone 完了時には Completion Report を生成する。

```text
Completion Report:
- 対象 milestone
- 実装した内容
- 変更した構成
- 実施した test / lint / build
- review / audit 結果
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
  実装 runtime を Claude Code / Codex / cc-sdd などへ差し替え可能にすること。

低結合:
  ChatLobby、実行 runtime、Spec Kit、cc-sdd のどれか一つに過度依存しないこと。

成果物隔離:
  成果物 project に ledger の運用痕跡を必要以上に混入させないこと。

過剰統合回避:
  既存 framework を丸ごと重ねて二重管理しないこと。
```

---

## 5. 非目標

ledger は次を目標にしない。

```text
非目標:
- Claude Code / Codex / Copilot の代替 runtime になること
- AGENTS.md / CLAUDE.md の代替そのものになること
- MCP のような接続 protocol になること
- GitHub Actions の代替 CI になること
- ChatLobby の Frontdoor になること
- ChatLobby の Workspace / Conversation 管理を持つこと
- project のプロダクト方針を自動決定すること
- 技術スタックや外部サービス費用を自動決裁すること
- BMAD / Spec Kit / cc-sdd を全部丸ごと導入して混在させること
- enterprise compliance platform になること
```

---

## 6. 成立条件

ledger MVP が成立している状態は次である。

```text
成立条件:
- 新規 project-context を作成できる
- src/ に成果物 project を隔離できる
- ideal / roadmap を開発運営上の正本として扱える
- spec / plan / tasks を正本として扱える
- milestone 自走範囲を明示できる
- 実装 runtime に渡す作業単位を定義できる
- 停止時に Escalation Packet を生成できる
- 完了時に Completion Report を生成できる
- Evidence Index から作業・判断・レビューを追跡できる
```
