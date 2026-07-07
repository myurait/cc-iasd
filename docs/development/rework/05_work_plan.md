# rework 05. kernel 移行作業計画

作成日: 2026-07-05  
状態: 承認待ち v0.1

---

## 1. この文書の目的

rework/04（kernel 構想、承認確定版）を実体化するための作業計画である。作業順序は次で確定している。

```text
Phase 1: 本編ドキュメントの kernel 正本化
Phase 2: P1 実装（rework/04 13.2 章の P1 縦スライス）
Phase 3: README 全体再構築
```

この順序の理由: 実装は正本化されたドキュメントを仕様として参照する。README は「実際に動くコマンド列」を記載するため、P1 実装の完了後でなければ事実ベースで書けない（02 の 5 章確定「表現は事実ベースに留める」に従う）。

---

## 2. 正本の所在ルール（作業中の混乱防止）

```text
- Phase 1 完了まで: rework/04 が kernel 設計の正本。本編は改稿途中の状態を取り得る
- Phase 1 完了後:   本編（docs/development/ 01〜13）が正本。rework/ は経緯記録に降格
- 改稿・実装中に設計矛盾や未決事項を発見した場合:
  その場で本編に埋め込まず、rework/04 の open questions に追記して確定を取ってから反映する
```

---

## 3. Phase 1: 本編ドキュメントの kernel 正本化

### 3.1 作業項目と依存順

```text
1-A 概念骨格（他のすべての親。ここで一度ユーザーレビューを挟む）
  - 02_conceptual_design.md 全面改稿:
    中核主張（構造で守る 3 不変条件）、6 ノード + evidence + 2 packet、
    journal 正本化、gap 台帳、終端 3 択、補強 1・2

1-B 構造と実行（1-A 確定後に並行可能）
  - 03_project_context_architecture.md 全面改稿:
    フラット構成ツリー、journal 形式（1-event-1-file + git 委譲）、
    write-path allowlist、out/ 非正本、multi-repo 構成
  - 05_autonomy_protocol.md 全面改稿:
    状態機械と遷移ガード表、停止条件（no-progress / budget / STOP）、
    reject 階梯、risk tier、gate review 既定（4 gate 必須 + オプトダウン）、
    人間の介入モデル（4 類型）、並列 run の排他規則
  - 06_artifact_and_evidence_model.md 全面改稿:
    event schema（closed set / guard_results / actor）、evidence 種別、
    verification の生成規則、content-hash 鮮度、escalation packet /
    backtrack request の必須欄、DEMM 検査観点
  - 08_commands_and_workflows.md 全面改稿:
    約 17 コマンド + inbox、対象者 3 分類と human-facing 上限、
    guard 拒否メッセージ仕様（in-band 知識供給）、5 分導入フロー
  - 12_role_design.md 全面改稿:
    planner / worker / reviewer の 3 cards + human、判定権限のコード移管、
    fresh-context reviewer、role card 規約（50 行以内・出力言語明示）。
    standard_flow_overview.mmd / .svg を 3 ロール + kernel 前提で再生成する作業を含む

1-C 部分改稿（1-B と並行可能）
  - 01_requirements.md: 不変条件・非目標は維持。理想体験と成立条件を kernel 語彙で書き直し
  - 07_framework_integration.md: Spec Kit 互換を vocabulary 互換へ更新。
    Anthropic harness / Kosli / DEMM を参照元に追加。語彙対応表（rework/03 5 章）を収載
  - 00_index.md: 索引・正本定義の更新
  - 09_future_vision.md: B2（外部投影 adapter）、actor=human gate 要求、
    worktree 隔離の高度化など observed-later 項目を移す
  - 10_todo.md: P1 実装項目と open questions で全面更新

1-D 出荷資産の再設計（1-B 確定後）
  - roles/: 10 ロール文書を削除し、planner.md / worker.md / reviewer.md の 3 cards を新規作成
  - templates/: journal 前提へ全面刷新
    （vision / spec / charter / handoff / report / decision / gap の各 template。
     旧 open-item / planning-feedback / campaign 4 ファイル系は削除）
  - rules/: kernel では package 内蔵既定 + cc-iasd.yaml override に吸収されるため、
    出荷対象を整理（language-policy 等の残すものを選別）

1-E 机上検証（Phase 1 の締め）
  - 04_core_workflow.md を rework/04 10.3 章のフロー（1 機能を作り切る遷移列）で
    再構成する（ガイド 3.3 章の割当）
  - 13_simulation_scenarios.md を kernel 語彙で再作成し、
    PBI 並列完走・backtrack・escalation・中断再開のシナリオを新設計で通し検証する。
    矛盾が出たら 2 章のルールに従い rework/04 経由で解決する
```

### 3.2 完了条件

```text
- 全ドキュメントが kernel 語彙で一貫している
  （grep 検査: artifact 語彙としての ideal / feature backlog / roadmap artifact /
   open item / planning feedback / milestone が残っていない。一般名詞用法は除く）
- 旧 CLI コマンド名（view evidence / ops archive / product outdate 等）への参照が残っていない
- 13 の机上検証シナリオがすべて新設計で説明できる
- ユーザーレビュー通過（1-A 後の方向確認 + Phase 末の全体確認の 2 回）
```

### 3.3 コミット粒度

1-A / 1-B / 1-C / 1-D / 1-E の各ブロック完了時にコミットする。

---

## 4. Phase 2: P1 実装（縦スライス）

対象は rework/04 13.2 章の P1。bin/cc-iasd.js と test/ は後方互換なしで全面書き直しとする。テスト駆動（ガード単位でテスト先行）で進める。

### 4.1 作業項目と依存順

```text
2-A 基盤
  - journal store（1-event-1-file、ULID、event schema、state.json 導出）
  - write-path allowlist モジュール（全書き込みの単一経路化）
  - cc-iasd.yaml loader（runtime adapter / budgets / checks allowlist / decision policy）
  - init（フラット構成 scaffold + journal 初期化 + git init + multi-repo 登録）

2-B 状態機械
  - 遷移エンジン（ガード評価 + guard_results 焼き込み + 拒否メッセージの
    人間可読 / --json 出力）
  - doctor（構造・参照解決・src 汚染 deny-glob・guard 再計算・証拠十分性）

2-C run 縦スライス
  - run open --adhoc / --spike（claim event、write glob 交差ガード、
    repo 別 base commit 記録、stop-file / budget / no-progress ガード）
  - handoff 機械合成 + run handoff（stdout。合成失敗 = 欠落列挙 + backtrack 誘導）
  - run return（repo 別 git diff snapshot）
  - run verify（checks 子プロセス実行 + 生出力捕捉 + surface 照合 +
    repo 単位 verify lock）
  - run accept / block / escalate（終端 3 択、reject 階梯、packet 生成）

2-D 人間動線
  - decide（TTY 既定 + --adopt escape hatch、actor=human 刻印）
  - gap add / close / route（blocking gap の下流遷移拒否）
  - cc-iasd（引数なし inbox）と status
  - report（tool-owned 欄の機械生成 + authored 欄 scaffold）

2-E テスト・検収
  - test/ 全面書き換え。3 不変条件の破り試行テストを必須で含める:
    (a) verification なしの accept が拒否される
    (b) 上流欠落時に run open が拒否され backtrack へ誘導される
    (c) src/ 外への CLI 書き込みが例外になる / src/ 内の管理物混入を doctor が検出する
    (d) blocking gap open 中の下流遷移が拒否される
    (e) 並列 run の task 二重取りと write glob 交差が排他される
  - 5 分導入フロー（init -> run open --adhoc -> handoff | 実 runtime）の実機通し
```

### 4.2 完了条件

```text
- rework/04 10.2 章の導入フローが実機で通る
- 上記 (a)〜(e) の破り試行がすべて構造で拒否される
- doctor が green
- npm test 通過
- ユーザーレビュー通過
```

### 4.3 スコープ外（P2 以降。今回は着手しない）

vision / spec / campaign のノード化、review gates、covers 射影（status --plan）、Tier 1 adapter（hooks）、session resume、worktree 隔離 adapter、guard_results 再計算検証の拡充。

---

## 5. Phase 3: README 全体再構築

### 5.1 作業項目

```text
3-A README.ja.md 再構築（正本として先に日本語で確定）
  - 位置づけ: 3 不変条件を構造で守る実行ハーネス
  - 差別化 3 点（src isolation の製品化 / escalation packet / backtrack request）を
    事実ベースで記載
  - 人間の介入モデル（覚えるのは cc-iasd / decide / STOP / Markdown 編集のみ）
  - 5 分導入（P1 実装で実際に動くコマンド列のみ記載）
  - 現在の状態（P1 実装済み範囲）と roadmap（P2〜P4）
  - 語彙対応表（先行事例の語彙との対応。rework/03 5 章から転載）
3-B README.md（英語版）を 3-A から作成
3-C 検収: README 記載の全コマンド列を実行して動作を確認する
```

### 5.2 完了条件

README 記載のコマンド列がすべて実機で動作し、実装されていない機能が「現在の状態」に含まれていないこと。ユーザーレビュー通過。

---

## 6. 横断ルール

```text
- 各ブロック完了時にコミットする（コミットメッセージは日本語・簡潔）
- ユーザーレビューゲートは 3 箇所: 1-A 後（概念骨格の方向確認）/
  Phase 1 末 / Phase 2 末。Phase 3 末は最終確認
- 設計変更が必要になったら rework/04 に追記して確定を取ってから反映する（2 章）
- rework/00 のステータス欄を各 Phase 完了時に更新する
```

---

## 7. リスク

```text
- 1-B の 5 文書は相互参照が多く、並行改稿で語彙・参照のズレが出やすい。
  1-A で用語と章構成の対応表を先に固めてから展開する
- 13 の机上検証（1-E）で設計矛盾が見つかった場合、Phase 2 開始が遅れる。
  これは仕様バグの早期発見であり、実装後の手戻りより安価と割り切る
- P1 実装中に journal / ガードの仕様詳細（正規化ハッシュ、event data の型）を
  詰める必要が出る。都度 rework/04 の open questions を経由すると往復が重いため、
  「本編ドキュメントの仕様欄を実装と同時に更新し、Phase 2 末レビューでまとめて確認」
  を許容する（正本ルールの例外として明記）
```

---

## 8. ステータス

```text
- Phase 1: 1-A 完了・承認済み（2026-07-05）。
  1-B 完了（2026-07-06。03 / 05 / 06 / 08 / 12 全面改稿 + standard_flow_overview.mmd
  再作成。svg はサンドボックス制約（Chromium 起動不可）で再生成できず旧版を削除。
  再生成は Chromium 利用可能環境で行う）。
  1-C 完了（2026-07-06。00 / 01 / 07 / 09 / 10 部分改稿）。
  1-D 完了（2026-07-06。roles 3 cards + README / templates 8 種刷新 + 旧 17 種削除 /
  rules 全 5 ファイル削除・処分表は rework/07。
  注記: 現行 bin / test は旧構造前提のため P2（P1 実装）で全面書き直すまで動作保証しない）。
  1-E 完了（2026-07-06。04 を kernel 標準フローで再構成、13 を机上検証シナリオ 6 本で
  再作成。机上検証で campaign 内 spec 順序制約の欠落を検出し、coverage after ガードを
  rework/04 に確定して 05 へ反映。grep 完了条件検査は全文書クリア）。
  Phase 1 完了。第 2 レビューゲート（Phase 1 末）待ち
- Phase 2: 完了（2026-07-07。コア 12 モジュール + コマンド 5 モジュール + dispatcher を
  実装。npm test 140/140（破り試行 (a)-(e) と e2e を含む）。5 分導入フローと
  拒否メッセージの in-band 誘導を実機確認済み。
  要判断事項: run 系コマンドの --json 非対応（出力規約の不揃い）。
  記録: 実装中に smoke 試験の auto-commit が repo 履歴へ混入（8aa35bc / 79b5d6c。
  実装本体も混在）。追記型クリーンアップ（89b68c0）で混入物は除去済み。未 push の
  ため、push 前に履歴を整理するかは人間判断に委ねる。
  第 3 レビューゲート（Phase 2 末）待ち）
- Phase 3: 完了（2026-07-07。README.ja（正本）と README（英語版）を kernel 前提で
  全体再構築。記載コマンド列は日英とも一時ディレクトリでの実機検収済み。
  検収指摘への対応で run open の欠落報告の重複も実装修正（テスト 140/140 維持））
- 全 Phase 完了（2026-07-07）。本編（docs/development/ 00〜13）が正本となり、
  rework/ は経緯記録に降格した（正本ルールは 2 章）
```
