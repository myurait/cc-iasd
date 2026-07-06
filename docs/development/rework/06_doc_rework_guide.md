# rework 06. Phase 1 改稿ガイド

作成日: 2026-07-05  
状態: 作業規約 v1.0

---

## 1. この文書の位置づけ

この文書は、Phase 1-B 以降で複数の執筆エージェントが本編ドキュメント（docs/development/ 01〜13）を並行改稿する際の共通規約である。設計正本は rework/04（kernel 構想、承認確定版）であり、語彙確定は rework/03、作業項目と依存順は rework/05 が定める。本ガイドはそれらを本編改稿に落とし込む際の用語対応・責務境界・文体・検査手順を規定する。

執筆エージェントは、改稿対象の文書に取りかかる前に本ガイドの 1〜6 章を通読し、rework/04 の該当章、rework/03 5 章の語彙対応表、rework/05 3.1 章の作業項目定義を参照すること。

---

## 2. 用語対応表

本編に残存し得る旧語彙を、新語彙または廃止・置換先へ写像する。左が旧、右が新である。「廃止」は artifact / 概念そのものが無くなったことを指し、置換先を併記する。

### 2.1 artifact 語彙

```text
ideal（artifact type） -> vision（ID 接頭辞 vNNN）
ideal（一般名詞「理想」） -> 維持（言い換え不要。artifact type としての ideal のみ変換）

feature（独立 artifact / scope layer / --kind epic） -> 廃止
  順序宣言        -> charter の depends_on ガード
  coverage 追跡   -> vision の Capabilities（構造化チェックリスト）+ covers 射影
  中期計画在庫    -> gap 台帳（route=vision, kind=candidate）

roadmap（独立 artifact / rNNN） -> 廃止
  実現順序        -> charter の depends_on ガード
  coverage        -> vision Capabilities + covers 射影
  計画ビュー      -> status --plan の射影出力

open item -> gap（gap 台帳に統合）
planning feedback / Planning Feedback Packet / planning-feedback artifact -> gap（route で戻し先を指定。run の report が gap を起票）
TBD マーカー / 裸の未確定記述 -> gap 台帳 + spec 本文の [UNRESOLVED: gNNN] 参照

milestone -> 廃止（概念として記述しない）
cycle -> 廃止（run に置換済み。旧設計にのみ存在）

spec の 6 ファイル束（spec/plan/research/data-model/contracts/tasks） -> 単一 spec.md（Requirements / Acceptance / Surfaces / Checks / Tasks の必須セクション）+ 任意 attachments/
campaign の 4 ファイル（plan/state/queue/aggregate-report） -> charter.md 1 枚 + journal 導出 state
run の 5 ファイル（plan/handoff/state/open-items/knowledge） -> handoff.md（機械合成）+ notes.md（authored）+ report.md（終端 packet）+ journal
```

### 2.2 状態管理と証跡

```text
state.md / queue.md / aggregate-report.md 等の状態 Markdown -> journal（append-only event store。ライフサイクル状態の正本）
frontmatter の status 欄 -> 廃止（状態は journal のみ。frontmatter は id と refs のみ）
archived/ ディレクトリへのファイル移動 -> journal 上の retired 状態（ファイルは動かさない）
outdated/ ディレクトリへのファイル移動 -> journal 上の retired 状態（ファイルは動かさない）
Evidence Bridge（相互参照網） -> journal の refs チェーン（run -> task -> spec -> vision）で表現。用語としては evidence（verifications / reviews）に整理
no silent overwrite（追記・退避規律） -> journal 経由の状態変更に一本化（silent overwrite は構造的に不可能）
```

### 2.3 実行入力と packet

```text
Execution Entry Packet -> handoff（CLI が上流成果物から機械合成する）
Run Handoff（AI 執筆） -> handoff（AI は執筆しない。CLI 生成物）
Backtrack Request -> backtrack request（維持。run block の終端 packet として再定式化）
Escalation Packet -> escalation packet（維持。run escalate の終端 packet として再定式化）
Completion Report -> report（run / campaign の終端 packet。completion / escalation / backtrack のいずれか 1 つ）
Planning Feedback Summary / Rollup -> 廃止（run report が gap を route 付きで起票する形に一本化）
```

### 2.4 ロール

```text
10 ロール体系 -> planner / worker / reviewer の 3 role cards + human
Planning Lead -> 廃止（順序強制・packet 中継・ゲート判定は状態機械が代替）
Execution Manager -> 廃止（同上）
Ideal Interviewer / Feature Scope Designer / Spec Designer -> planner に統合
Design Reviewer / Code Quality Auditor / Devil's Advocate / Compliance Auditor -> reviewer に統合
Devil's Advocate 2 モード（Design Launch Review / Campaign Completion Review） -> launch gate / completion gate（reviewer が gate 種別ごとに fresh-context で起動）
Architect / Requirements Reviewer / Test Reviewer / Security Reviewer 等の後段 role -> 廃止（reviewer に吸収。個別分割は記述しない）
entry point / nested subagent 制約 -> 廃止（orchestrator ロールの消滅により問題ごと消える）
```

### 2.5 CLI コマンド

```text
view evidence / view current / view scope / view run -> status（+ --plan）と handoff に統合
ops archive <layer> -> retire
product outdate ideal|spec -> retire
log event -> 廃止（遷移・検証・決裁は自動で journal に記録）
open-item add / resolve -> gap add / close / route
planning-feedback add / resolve / view -> gap add / route（+ report からの起票）
ideal add -> new vision
feature add / roadmap add -> 廃止
campaign add -> new campaign、campaign mark-run -> 廃止（run 終端が journal に記録）
run start -> run open
（新規）-> spec ready / campaign launch / campaign close / run handoff / run return / run verify / run accept / run block / run escalate / review record / decide / report / retire / role show / session start / resume / doctor / init / cc-iasd（inbox）
```

CLI の網羅一覧は rework/04 10.1 章（約 17 コマンド）を正とする。

### 2.6 一般名詞の許容範囲

`ideal` の一般名詞用法（「cc-iasd の理想」「理想体験」等）は本編で維持してよい。artifact type としての ideal のみを vision へ写像する。同様に、`plan`（計画一般）、`scope`（範囲一般）、`feature`（機能一般の説明語として、artifact でない文脈）、`run`（実行の一般語ではなく artifact 語彙として使う場合はそのまま）などは文脈で判断する。判断に迷う場合は 5 章の grep 注意書きに従い、artifact 語彙として使われているか（ID 接頭辞・ディレクトリ・コマンド引数・ライフサイクルを伴うか）で切り分ける。

---

## 3. 章構成対応

rework/04 の各章を本編のどの文書・節へ反映するかを割り当てる。改稿の第一次責任文書を先頭に置く。

### 3.1 全面改稿文書への割当

```text
02 概念設計:
  rework/04 2 章（中核主張: 構造で守る 3 不変条件）
  rework/04 5 章冒頭（6 ノード + evidence + 2 packet の列挙）
  rework/04 4 章 182〜193 行（journal 正本化の 4 要点）
  rework/04 6 章（gap 台帳の概念）
  rework/04 7.2 章（終端 3 択とコスト勾配の概念）
  rework/04 5.1 章（補強 1・2 の概念）
  rework/04 9.3 章（人間の介入モデルの思想と 4 類型の概要。詳細定義は 05 が一次）

03 構造（project_context_architecture）:
  rework/04 4 章（フラット構成ツリー）
  rework/04 4.1 章（journal 形式: 1-event-1-file + git 委譲）
  rework/04 2 章 不変条件 1 の write-path allowlist
  rework/04 4 章 out/ 非正本
  rework/04 7.4 章（multi-repo 構成）

05 プロトコル（autonomy_protocol）:
  rework/04 5 章（状態機械と遷移ガード表）
  rework/04 7.2 章（停止条件: no-progress / budget / STOP、reject 階梯）
  rework/04 5 章・9.1 章（risk tier）
  rework/04 5.2 章（gate review 既定: 4 gate 必須 + オプトダウン）
  rework/04 9.3 章（人間の介入モデル 4 類型の詳細定義。02 は概要のみ）
  rework/04 9.2 章（decide の機構: TTY 既定 / decision ファイル取込の非同期経路 / threat model）
  rework/04 7.4 章（並列 run の排他規則）

06 schema・evidence（artifact_and_evidence_model）:
  rework/04 4.1 章（event schema: closed set / guard_results / actor）
  rework/04 7.1 章（evidence 種別 / verification の生成規則）
  rework/04 5 章（content-hash 鮮度）
  rework/04 7.2 章（escalation packet / backtrack request の必須欄。旧 06 の 7.4 章・12 章を再定式化）
  rework/04 4.1 章・11 章（DEMM 証拠十分性検査観点）

08 コマンド（commands_and_workflows）:
  rework/04 10.1 章（約 17 コマンド + inbox）
  rework/04 10.1 章 後半（対象者 3 分類と human-facing 上限）
  rework/04 10.1 章 585 行（guard 拒否メッセージ仕様。in-band 知識供給）
  rework/04 10.2 章（5 分導入フロー）
  rework/04 10.3 章（1 機能フロー）

12 ロール（role_design）:
  rework/04 9.1 章（planner / worker / reviewer の 3 cards + human）
  rework/04 9 章冒頭（判定権限のコード移管）
  rework/04 9.1 章 reviewer（fresh-context reviewer）
  rework/04 9.1 章（role card 規約: 50 行以内・出力言語明示）
```

### 3.2 部分改稿文書への割当

```text
01 requirements:
  不変条件・非目標は維持。理想体験（2 章）と成立条件（6 章）を kernel 語彙で書き直し。
  旧 6 分割構成ツリー（88 行付近）はフラット構成へ。旧 Escalation Packet / Completion Report の
  機能要件は kernel の終端 packet 定義へ更新（rework/04 2 章・7.2 章）

07 framework_integration:
  Spec Kit 互換を「artifact vocabulary 互換」へ更新（rework/04 11 章 V4 留意点）。
  Anthropic harness / Kosli / DEMM を参照元に追加。語彙対応表（rework/03 5 章）を収載

00 index:
  文書一覧・責務・正本定義の更新。rework/ の位置づけ（Phase 1 完了後は経緯記録に降格）を反映

09 future_vision:
  rework/04 14 章 open questions と 8.2 章の observed-later 項目を移す
  （B2 外部投影 adapter、actor=human gate 要求、worktree 隔離の高度化）

10 todo:
  rework/05 4 章 P1 実装項目と rework/04 14 章 open questions で更新
```

### 3.3 その他

```text
04 core_workflow: rework/04 10.3 章のフローで再構成（1 機能を作り切る遷移列）
13 simulation_scenarios: 1-E で kernel 語彙により再作成（本ガイドの対象外だが語彙規約は同じ）
roles/ templates/ rules/: 1-D の出荷資産再設計。本ガイドの語彙規約・文体規約に従う
```

---

## 4. 文書間の責務境界

並行改稿で最も起きやすい事故は、同じ概念を複数文書が重複記述し、後で相互に矛盾することである。各文書に「書くべきこと」と「書いてはいけないこと（他文書の責務）」を定める。ある概念の詳細定義は一次責任文書に置き、他文書は参照に留める。

```text
02 概念設計:
  書く: 3 不変条件と構造の対応、6 ノードと 2 packet の存在と役割、journal 正本化の思想、
        gap 台帳・終端 3 択・補強 1・2 の「なぜ」、人間介入モデルの思想と 4 類型の概要
  書かない: 遷移ガードの具体条件（-> 05）、event schema の具体フィールド（-> 06）、
            コマンド構文（-> 08）、ディレクトリツリー詳細（-> 03）、
            介入 4 類型の詳細定義・decide 機構・threat model（-> 05）、
            human-facing 上限の仕様（-> 08。02 は原則の宣言まで）

03 構造:
  書く: project-context ディレクトリツリー、journal の物理形式（1-event-1-file / git 委譲）、
        write-path allowlist の配置、out/ の非正本性、multi-repo の登録と配置
  書かない: 状態機械の遷移（-> 05）、event schema フィールド定義（-> 06）、
            gate review 方針（-> 05）

05 プロトコル:
  書く: ノードごとの状態列、遷移ガード表、停止条件、reject 階梯、risk tier、
        gate review 既定、人間介入 4 類型の詳細定義、decide 機構
        （TTY / 非同期取込 / threat model）、並列 run 排他規則
  書かない: event の JSON 形状（-> 06）、verification の生成手順詳細（-> 06）、
            コマンド構文（-> 08）、ディレクトリ配置（-> 03）

06 schema・evidence:
  書く: event schema（closed set / guard_results / actor / refs）、verification の生成規則と
        surface 照合、content-hash 鮮度仕様、escalation packet / backtrack request / report の
        必須欄、DEMM 検査観点
  書かない: 遷移ガードの成立条件（-> 05）、コマンド構文（-> 08）、
            ディレクトリツリー（-> 03）

08 コマンド:
  書く: 各コマンドの目的・入力・出力、対象者 3 分類、human-facing 上限、guard 拒否メッセージ仕様、
        導入フローの実コマンド列
  書かない: ガードの内部条件（-> 05。08 は「どのコマンドがどの遷移を起こすか」まで）、
            event schema（-> 06）、ロール責務（-> 12）

12 ロール:
  書く: planner / worker / reviewer + human の責務・authority・禁止、判定権限のコード移管、
        fresh-context reviewer、role card 規約
  書かない: gate 判定の成立条件（-> 05。12 は「reviewer が record を返す」まで）、
            コマンド構文（-> 08）、ゲートのオプトダウン方針（-> 05）
```

参照の書き方: 他文書の責務に属する内容は「詳細は 05 の遷移ガード表を参照」の形で 1 文で示し、条件や表を再掲しない。同一の遷移ガード表・event schema・コマンド一覧が 2 文書に現れたら重複違反である。

---

## 5. 文体・形式規約

既存 docs/development/ の文体に合わせる。

```text
- 日本語・である調。ぶっきらぼう・事務的にならない範囲で簡潔に書く
- Markdown テーブルは使用禁止。列挙・対応関係・スキーマは ```text ブロックで表現する
  （旧 12 の Command Visibility テーブルのようなテーブルは text ブロックへ書き換える）
- 見出しは既存形式に合わせる:
    文書見出し: 「# 02. cc-iasd 概念設計」（番号 + 半角ピリオド + 空白 + 和文タイトル）
    節見出し:   「## 1. 節タイトル」「### 1.1 小節タイトル」
- 文書ヘッダは次の 3 行構成:
    「# NN. <タイトル>」
    「作成日: 2026-07-05」（Phase 1 で改稿する文書の作成日はこの日付に更新する）
    「状態: kernel 正本 v1.0」
- 自己強調表現を使わない。禁止例: 「唯一の」「実装で確定した」「決定的な」「テルテール」
  「本質は」等の自己強化的言い回し、自分の調査過程を強調する冗長な背景説明。
  読者に必要な事実と設計のみを書く。
  注記: 「唯一の」等が設計上の技術的事実（journal が単一の状態正本である、decide が
  唯一の決裁記録経路である等）を述べる場合は自己強調に当たらず許容する
- コードブロックは言語指定を付けず ```text を既定とする（既存本編に合わせる）
```

旧設計への言及が避けられない場合（07 の互換説明、09 の移行説明など）は「旧設計では」と明示し、最小限に留める。本編本文で旧概念を現行概念として説明しない。

---

## 6. grep 検査リスト

Phase 1 完了条件（rework/05 3.2 章）の機械検査に使う検索パターンである。docs/development/ 配下（rework/ を除く）に対して実行し、ヒットを目視で選別する。一般名詞用法は許容されるため、ヒット即違反ではない。

### 6.1 旧 artifact 語彙

```text
検索パターン                     期待                          注意
ideal                            artifact 語彙としての残存が 0   「理想」の一般名詞・「Ideal Interviewer」等ロール名の残存は別途 6.3 で検出。
                                                                artifact 文脈（iNNN- / product/ideal/ / ideal add）のヒットは違反
i[0-9]{3}-                       0                             旧 ideal ID 接頭辞。vNNN へ移行済みのはず
feature                          scope layer / --kind epic / feature add / feature backlog が 0
                                                                「機能」の一般名詞ヒットは許容。artifact 文脈は違反
roadmap                          artifact / rNNN- / roadmap add が 0
                                                                「行程」的一般語はほぼ無いので原則すべて要確認
open item / open-item            0                             gap へ統合済み
planning feedback / planning-feedback   0                       gap route へ統合済み
milestone                        0                             廃止概念
\bcycle\b                        0                             run へ置換済み（旧 cycle 概念）
state\.md / queue\.md / aggregate-report\.md   0               journal へ統合済み
open-items\.md / knowledge\.md   0                             notes.md / journal へ統合済み
outdated/ / archived/            0（ディレクトリ退避規約として）  journal retired へ置換済み
frontmatter.*status / Status:    ライフサイクル status 欄が 0    review finding の severity 等は別概念。要選別
```

### 6.2 旧 CLI コマンド名

```text
検索パターン                     期待
view evidence / view current / view scope / view run   0
ops archive                      0
product outdate                  0
log event                        0
ideal add / feature add / roadmap add   0
campaign mark-run                0
run start                        0（run open へ）
planning-feedback (add|resolve|view)    0
open-item (add|resolve)          0
```

### 6.3 旧ロール名

```text
検索パターン                     期待
Planning Lead                    0
Execution Manager                0
Ideal Interviewer                0
Feature Scope Designer           0
Spec Designer                    0
Design Reviewer                  0
Code Quality Auditor             0
Devil's Advocate                 0（launch gate / completion gate へ）
Compliance Auditor               0
Execution Entry Packet           0（handoff へ）
entry point                      0（orchestrator ロール消滅により不要）
```

一般名詞誤検出への注意: `feature`（機能）、`plan`（計画）、`scope`（範囲）、`run`（実行の動詞的用法）、`ideal`（理想）は日本語本文中の一般語として頻出する。grep はヒット箇所を必ず目視し、artifact 語彙・コマンド・ロールとして使われているものだけを違反とする。判定基準は「ID 接頭辞・ディレクトリパス・コマンド引数・ライフサイクル状態・固有名詞のロール名を伴うか」である。

---

## 7. 逸脱時の手順

改稿中に設計矛盾・未決事項・rework/04 で決まっていない仕様の穴を発見した場合、本編にその場の判断を埋め込んではならない（rework/05 2 章の正本ルール）。

```text
手順:
1. 発見した矛盾・未決事項を本編に書き込まず、いったん保留する
2. rework/04 14 章の open questions へ追記し、確定を取る
   （執筆エージェントは最終報告テキストに open question として列挙し、
    親エージェント経由で確定を仰ぐ）
3. rework/04 で確定してから本編へ反映する
```

rework/04 が承認確定済みの設計正本であり、そこからの逸脱・独自の新設計判断を勝手に加えてはならない。P1 実装中の仕様詳細（正規化ハッシュ、event data の型など）は rework/05 7 章のリスク欄で例外扱いが認められているが、Phase 1 の本編改稿段階では設計判断を新たに起こさず、rework/04 の記述の範囲で書く。
