# 00. cc-iasd 開発ドキュメント索引

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. このドキュメント群の目的

このドキュメント群は、cc-iasd の設計、責務境界、artifact model、command workflow、将来構想を整理する開発正本である。

cc-iasd の定義は次である。

```text
cc-iasd
  = project-context full-stack agentic development framework
```

cc-iasd は project-context 全体を所有し、成果物 project を `src/` に隔離し、Spec Kit を spec-driven artifact vocabulary の参照元として扱う。実行 runtime は task implementation loop の委譲先であり、cc-iasd の固有価値は milestone 自走、escalation、evidence bridge、src isolation に集中する。

---

## 2. ドキュメント構成

```text
00_index.md
  全体索引、統合方針、正本定義

01_requirements.md
  cc-iasd の要件、理想体験、非目標、成立条件

02_conceptual_design.md
  cc-iasd の概念設計、責務、境界、主要概念

03_project_context_architecture.md
  project-context 構造、src/ isolation、正本配置、ディレクトリ設計

04_core_workflow.md
  基本ワークフロー、成立条件、人間判断境界

05_autonomy_protocol.md
  milestone 自走、Planning Lead、停止条件、エスカレーション条件

06_artifact_and_evidence_model.md
  spec / plan / tasks / evidence / escalation / completion report の成果物モデル

07_framework_integration.md
  Spec Kit、実行 runtime、BMAD、MetaGPT、AI Governance 系との統合方針

08_commands_and_workflows.md
  cc-iasd init / run / escalate / report のワークフロー設計

09_future_vision.md
  将来構想、plugin 化、多 runtime 対応

10_todo.md
  未実装項目、未決定事項、観察後に判断する事項
```

---

## 3. cc-iasd の最終的な正本定義

cc-iasd は、次のように定義する。

```text
cc-iasd は、
Spec Kit の spec-driven artifact vocabulary を参照し、
product/specs/ に cc-iasd-owned spec 正本を持ち、
BMAD / MetaGPT 的な role / SOP 思想を参照し、
成果物 project を src/ に隔離し、
milestone 自走・エスカレーション・証跡索引を独自に提供する、
project-context full-stack agentic development framework である。
```

短く表すと次である。

```text
cc-iasd
  = project-context full-stack agentic development framework
```

---

## 4. 開発順序の基本方針

cc-iasd は最初から完全な multi-agent 開発 OS として作らない。

初期実装では、次に絞る。

```text
初期実装:
- project-context を初期化できる
- product/ideal/ を product 正本として扱える
- product/specs/ で Spec Kit 互換 dialect の spec / plan / tasks を正本として扱える
- ops/scopes/ で features / roadmaps / milestones を扱える
- ops/cycles/ で自走実行単位を扱える
- 成果物 project を src/ に隔離できる
- Escalation Packet を生成できる
- Completion Report を生成できる
- ops/evidence/ の logs / reviews / reports から成果物と判断を追跡できる
```

初期から自動化しすぎない。最初は、コマンド・テンプレート・運用規律を中心に構成し、実行 runtime や plugin は差し替え可能な前提に留める。
