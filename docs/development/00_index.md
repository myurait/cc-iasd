# 00. cc-iasd 開発ドキュメント索引

作成日: 2026-07-05  
状態: kernel 正本 v1.0（Phase 1 レビュー待ち）

---

## 1. このドキュメント群の目的

このドキュメント群は、cc-iasd の概念設計・構造・執行プロトコル・artifact / evidence モデル・コマンド・ロール設計・将来構想を定める開発正本である。

cc-iasd の定義は次である。

```text
cc-iasd
  = 3 つの不変条件を「約束」ではなく「構造」で守る決定論的状態機械カーネル
```

不変条件は次の 3 つである。

```text
1. src/ 隔離を絶対制約とする
2. 証跡管理主義
3. 推測補完の禁止 -> 構造化された上流差し戻し
```

従来はこの 3 条件をロール文書に書かれた期待で担保していたが、kernel は LLM の遵守に依存せず、CLI のコードと状態機械のガードで執行する。ライフサイクル状態は append-only journal のみが持ち、完了へ至る経路は CLI 自身が実行した検証の成立のみであり、推測で埋める主体が構造上存在しない。cc-iasd は実装ループを実行する runtime の代替ではなく、意図を自走可能な作業単位へ変換する経路の厳密性と、その経路上のすべての前進を型付き遷移として記録する証跡構造を担う。詳細は 02 を参照。

---

## 2. ドキュメント構成

各文書の責務は kernel 正本化後の実態に一致させている。全 13 文書（00〜10、12、13）が kernel 正本化済みである。

```text
00_index.md
  全体索引、cc-iasd の定義、開発順序の方針、rework/ の位置づけ

01_requirements.md
  cc-iasd の要件、理想体験、非目標、成立条件

02_conceptual_design.md
  3 不変条件と構造の対応、6 ノード + evidence + 2 packet、journal 正本化、
  gap 台帳、終端 3 択、補強 1・2、人間介入モデルの思想（概念正本）

03_project_context_architecture.md
  project-context の物理構造、フラット構成ツリー、journal の物理形式、
  write-path allowlist、out/ 非正本、multi-repo 構成

04_core_workflow.md
  kernel の標準ワークフロー。1 機能を作り切る遷移列、差し戻しと決裁の流れ、
  adhoc からの導入フロー

05_autonomy_protocol.md
  自律プロトコル。状態機械と遷移ガード、停止条件、reject 階梯、risk tier、
  gate review 既定、人間介入モデルの詳細、decide の機構、並列 run 排他規則

06_artifact_and_evidence_model.md
  artifact の payload モデルと証跡 schema。event schema、verification の生成規則、
  content-hash 鮮度、handoff 合成規則、escalation packet / backtrack request の必須欄、
  DEMM 証拠十分性の検査観点

07_framework_integration.md
  先行事例との統合方針。artifact vocabulary 互換、語彙対応表

08_commands_and_workflows.md
  CLI コマンド一覧（約 17 + inbox）、対象者 3 分類と human-facing 上限、
  guard 拒否メッセージ仕様、導入・実行フロー

09_future_vision.md
  将来構想。外部投影 adapter、actor=human gate 要求、worktree 隔離の高度化など
  観察後に判断する項目

10_todo.md
  P1 実装項目と open questions

12_role_design.md
  planner / worker / reviewer の 3 role cards + human、判定権限のコード移管、
  fresh-context reviewer、role card 規約

13_simulation_scenarios.md
  机上検証シナリオ。PBI 並列完走 / backtrack / escalation / 中断再開 /
  停止条件 / gap 終端の 6 シナリオと 1-E 検証結果

14_brownfield_adoption.md
  既存コードベースへの追加導入。物理配置・as-built の扱い・段階導入ラダー・
  context 成果物ごとの取り扱い・アンチパターン

rework/
  先行事例調査に基づく設計リワークの検討・作業記録。設計正本は 04_radical_rework.md、
  正本化の作業計画は 05_work_plan.md、並行改稿の共通規約は 06_doc_rework_guide.md。
  Phase 1 完了後は経緯記録に降格する（後述の 4 章を参照）
```

出荷資産（roles/ の 3 role cards、templates/ の 8 種、rules/ の廃止と処分表 rework/07）も kernel 前提へ再設計済みである。現行の bin / test は旧構造前提であり、P1 実装（rework/05 Phase 2）で全面書き直すまで動作保証しない。

---

## 3. cc-iasd の正本定義

cc-iasd は次のように定義する。

```text
cc-iasd は、
3 つの不変条件（src/ 隔離 / 証跡管理主義 / 推測補完の禁止）を
ロール文書への期待ではなく状態機械の構造で執行し、
ライフサイクル状態を append-only journal に一本化し、
成果物 project を src/ に隔離し、
意図（vision）から自走実行単位（run）への変換経路を型付き遷移として記録する、
決定論的状態機械カーネルである。
```

短く表すと次である。

```text
cc-iasd
  = 3 不変条件を構造で守る決定論的状態機械カーネル
```

kernel が扱うノードは vision / spec / campaign / run / decision / gap の 6 種で、これに evidence（verification / review record）と 2 種の rendered packet（escalation packet / backtrack request）が加わる。各ノードの概念定義と役割は 02 を参照。

---

## 4. 開発順序の方針

kernel 移行は次の 3 Phase の順で進める（詳細は rework/05）。

```text
Phase 1: 本編ドキュメントの kernel 正本化
Phase 2: P1 実装（縦スライス）
Phase 3: README 全体再構築
```

この順序の理由は、実装が正本化されたドキュメントを仕様として参照し、README は実際に動くコマンド列を記載するため P1 実装完了後でなければ事実ベースで書けないことである。

Phase 2 の P1 は縦スライスから着手する。P1 のスコープは、journal / 状態機械 / write-path allowlist / run open（adhoc）/ handoff 機械合成 / run verify / 終端 3 択 / decide / gap / doctor に加え、multi-repo（repo 登録・repo 別 base commit / diff / surface 照合）と並列 run（claim event / write glob 交差ガード / verify lock）である。これにより adhoc run だけで 3 不変条件と並列安全が構造で守られる最小系を先に成立させる。vision / spec / campaign のノード化、review gates、covers 射影、Tier 1 adapter、session resume、worktree 隔離 adapter は P2 以降のスコープである。実装順序と各 Phase の完了条件は rework/05 を参照。

初期から自動化しすぎない。P1 は adhoc run を導入の入口とし、規模が増えたら spec / campaign へ昇格する運用を前提とする。

---

## 5. rework/ の位置づけ

`docs/development/rework/` は、先行事例調査に基づく設計リワークの検討・作業記録である。正本の所在は Phase の進行で移る。

```text
- Phase 1 完了まで: rework/04（kernel 設計、承認確定版）が設計の正本。
  本編は改稿途中の状態を取り得る
- Phase 1 完了後:   本編（docs/development/ 01〜13）が正本。rework/ は経緯記録に降格する
```

改稿・実装中に設計矛盾や未決事項を発見した場合、その場で本編に判断を埋め込まず、rework/04 の open questions に追記して確定を取ってから反映する（正本の所在ルールは rework/05 2 章）。
