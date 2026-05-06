# 00. ledger 開発ドキュメント索引

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. このドキュメント群の目的

このドキュメント群は、これまで散逸していた ledger 関連の設計メモ、再設計前提、再定義文書、ChatLobby との境界整理、過去会話上の判断を統合し、ledger の開発正本候補として再構成するためのものである。

ledger については、初期に次のような見方が混在していた。

```text
旧整理:
- project-local agentic SDLC harness
- AI 開発チームの運営・証跡・エスカレーション規律
- ChatLobby / Frontdoor 経由開発を支える project 側制約
```

その後、次の再定義が正本候補として採用された。

```text
新整理:
ledger
  = project-context full-stack agentic development framework
```

この文書群では、新整理を正本に置く。旧整理は破棄するのではなく、次のように扱う。

```text
旧整理から採用するもの:
- 非常駐ユーザー前提
- milestone 単位の自走境界
- Planning Lead の権限境界
- Escalation Packet
- Evidence / review / decision の証跡思想
- frontdoor は project 内ロールではないという境界

旧整理から修正するもの:
- 成果物 project の内部に ledger を埋め込む見方
- ledger が project-local 規約集であるという限定

新整理で採用するもの:
- ledger が project-context 全体を所有する
- 成果物 project は src/ に隔離する
- Spec Kit を spec-driven development kernel として利用する
- cc-sdd を autonomous implementation plugin 候補として扱う
- BMAD / MetaGPT は role / SOP 参照元または optional plugin とする
- ledger 固有価値は milestone 自走、escalation、evidence bridge、src isolation に集中する
```

---

## 2. ドキュメント構成

```text
00_index.md
  全体索引、統合方針、旧設計と新設計の扱い

01_requirements.md
  ledger の要件、理想体験、非目標、成立条件

02_conceptual_design.md
  ledger の概念設計、責務、境界、主要概念

03_project_context_architecture.md
  project-context 構造、src/ isolation、正本配置、ディレクトリ設計

04_mvp.md
  MVP スコープ、初期実装対象、初期から除外するもの

05_autonomy_protocol.md
  milestone 自走、Planning Lead、停止条件、エスカレーション条件

06_artifact_and_evidence_model.md
  spec / plan / tasks / evidence / escalation / completion report の成果物モデル

07_framework_integration.md
  Spec Kit、cc-sdd、BMAD、MetaGPT、AI Governance 系との統合方針

08_commands_and_workflows.md
  cc-iasd init / run / escalate / report のワークフロー設計

09_future_vision.md
  将来構想、plugin 化、多 runtime 対応、ChatLobby 連携強化

10_open_issues.md
  検討中の課題、MVP 前に決めること、後段に回すこと

11_source_consolidation.md
  既存情報源・旧設計・過去判断の採用 / 修正 / 退避 / 除外整理
```

---

## 3. ledger の最終的な正本定義

ledger は、次のように定義する。

```text
ledger は、
Spec Kit を spec-driven development kernel とし、
cc-sdd を autonomous implementation plugin とし、
BMAD / MetaGPT 的な role / SOP 思想を参照し、
成果物 project を src/ に隔離し、
milestone 自走・エスカレーション・証跡索引を独自に提供する、
project-context full-stack agentic development framework である。
```

短く表すと次である。

```text
ledger
  = project-context full-stack agentic development framework
```

---

## 4. ChatLobby との境界

ChatLobby は、ユーザーの会話、Workspace、Conversation、Message、軽量 Frontdoor、検索・要約を扱う。

ledger は、開発 project の project-context、spec / plan / tasks、自律実装、review / audit、escalation、evidence、completion report を扱う。

```text
ChatLobby:
  会話と関心領域の入口

ledger:
  開発 project-context の自律開発ハーネス
```

Frontdoor は ledger 内の登場人物ではない。Frontdoor は ChatLobby 側の入口であり、ledger から見ると「ユーザーが常駐しない」「判断依頼は後から読める形で返す必要がある」という制約としてのみ現れる。

---

## 5. 開発順序の基本方針

ledger は最初から完全な multi-agent 開発 OS として作らない。

初期実装では、次に絞る。

```text
MVP:
- project-context を初期化できる
- product/ideal/ を product 正本として扱える
- product/specs/ で Spec Kit 由来の spec / plan / tasks を正本として扱える
- ops/scopes/ で features / roadmaps / milestones を扱える
- ops/cycles/ で自走実行単位を扱える
- 成果物 project を src/ に隔離できる
- Escalation Packet を生成できる
- Completion Report を生成できる
- ops/evidence/ の logs / reviews / reports から成果物と判断を追跡できる
```

初期から自動化しすぎない。最初は、コマンド・テンプレート・運用規律を中心に構成し、実行 runtime や plugin は差し替え可能な前提に留める。
