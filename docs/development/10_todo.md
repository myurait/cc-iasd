# 10. TODO

作成日: 2026-07-05  
状態: kernel 正本 v1.1（P1 / P2 実装済み。2026-07-07 更新）

---

## 1. この文書の目的

この文書は、通常の設計文書へ混ぜない未実装項目・確定待ち仕様・残作業・観察後判断事項・レビューゲートで再確認する設計判断を管理する。

確定済みの構造・状態機械・artifact model・コマンド体系は、それぞれの kernel 正本文書（02 / 03 / 05 / 06 / 08 / 12）に置く。この文書は、これから実装する項目と、実装・観察を経てから固める項目だけを扱う。設計正本は kernel 正本文書であり、そこから逸脱する新規の設計判断をこの文書で起こさない。

---

## 2. P1 実装項目（縦スライス）【完了】

P1 は実装完了した（Phase 2。破り試行 (a)〜(e) 通過・導入フロー実機通し・npm test 全 green・ユーザーレビュー通過）。以下は完了条件の記録として残す。

P1 は adhoc run だけで 3 不変条件と並列安全を構造で守る最小系を成立させる縦スライスである。bin/cc-iasd.js と test/ は後方互換なしで全面書き直しとし、ガード単位でテストを先行させるテスト駆動で進める。作業項目と依存順は次である。

```text
2-A 基盤:
  - journal store（1-event-1-file / ULID / event schema / state.json 導出）
  - write-path allowlist モジュール（全書き込みの単一経路化）
  - cc-iasd.yaml loader（runtime adapter / budgets / checks allowlist / decision policy）
  - init（フラット構成 scaffold + journal 初期化 + git init + multi-repo 登録）

2-B 状態機械:
  - 遷移エンジン（ガード評価 + guard_results 焼き込み +
    拒否メッセージの人間可読 / --json 出力）
  - doctor（構造・参照解決・src 汚染 deny-glob・guard 再計算・証拠十分性）

2-C run 縦スライス:
  - run open --adhoc / --spike（claim event / write glob 交差ガード /
    repo 別 base commit 記録 / stop-file / budget / no-progress ガード）
  - handoff 機械合成 + run handoff（stdout。合成失敗 = 欠落列挙 + backtrack 誘導）
  - run return（repo 別 git diff snapshot）
  - run verify（checks 子プロセス実行 + 生出力捕捉 + surface 照合 +
    repo 単位 verify lock）
  - run accept / block / escalate（終端 3 択 / reject 階梯 / packet 生成）

2-D 人間動線:
  - decide（TTY 既定 + --adopt escape hatch / actor=human 刻印）
  - gap add / close / route（blocking gap の下流遷移拒否）
  - cc-iasd（引数なし inbox）と status
  - report（tool-owned 欄の機械生成 + authored 欄 scaffold）

2-E テスト・検収:
  - test/ 全面書き換え。3 不変条件の破り試行テストを必須で含める:
    (a) verification なしの accept が拒否される
    (b) 上流欠落時に run open が拒否され backtrack へ誘導される
    (c) src/ 外への CLI 書き込みが例外になる / src/ 内の管理物混入を doctor が検出する
    (d) blocking gap open 中の下流遷移が拒否される
    (e) 並列 run の task 二重取りと write glob 交差が排他される
  - 5 分導入フロー（init -> run open --adhoc -> handoff | 実 runtime）の実機通し
```

P1 完了条件は、導入フローが実機で通ること、上記 (a)〜(e) の破り試行がすべて構造で拒否されること、doctor が green であること、npm test 通過、ユーザーレビュー通過である。

P2（vision / spec / campaign のノード化、full-chain の 4 gate 運用、campaign close での Cross-Checks CLI 実行、vision Capabilities + covers 射影）は実装済みである（2026-07-07。full-chain e2e テストで検証済み）。未実装で残るのは P3（session start / resume、Tier 1 adapter、worktree 隔離 adapter）と P4（監査強化。guard_results 再計算検証の拡充を含む）である。

---

## 3. P1 実装時に確定する仕様詳細【確定済み】

以下は P1 実装時に確定し、実装契約（rework/08）と各正本文書の仕様欄へ反映済みである。記録として残す。

次は kernel 設計の骨格には含まれるが、具体的な形は P1 実装時に確定する。設計正本の記述範囲を超える新設計判断を先取りせず、実装と同時に本編の仕様欄を更新し、Phase 2 末レビューでまとめて確認する（rework/05 7 章のリスク欄で正本ルールの例外として明記された運用）。

```text
- cc-iasd.yaml の repo 登録スキーマ:
    multi-repo で src/ 配下の各 repo をどう記述するか（repo キー / パス / 想定 glob）
- out/ の run 別内部レイアウト:
    compile 生成物を run ごとにどう配置するか（adapter が settings / context / launch を
    生成する際の格納構造）
- 数値既定:
    no-progress の N（直近何 run で diff / task 進捗ゼロを停止条件とするか）/
    budget の既定値 / session stale の閾値（何分イベントなしで stale 表示するか）
- decision と notes の authored セクション構成:
    decision ファイルと notes.md にどの必須・任意セクションを持たせるか
- spike run の report 分類:
    spike の report を completion / escalation / backtrack のどれに位置づけるか、
    または spike 専用の close 種別を設けるか
- new が記録する event 種別と vision approve の decide 対応:
    new vision|spec|campaign が journal に残す event の type / subject、
    vision approve に対応する decide の記録形（decision と vision 遷移の紐付け）
- report コマンドが journal event を残すか:
    report を skeleton 生成の副作用なし操作とするか、note.appended 等の event を残すか
```

---

## 4. Phase 1 の残作業（1-D / 1-E）【完了】

4.1〜4.3 は完了した（roles 3 cards / templates 8 種 / rules 廃止 / 机上検証 6 シナリオ）。4.4 の図版（standard_flow_overview.svg）再生成は破棄した（2026-07-08。図の正本は .mmd ソースであり、svg が必要になれば再指示する）。

### 4.1 1-D 出荷資産の再設計

```text
- roles/: 旧 10 ロール文書を削除し、planner.md / worker.md / reviewer.md の
  3 role cards を新規作成する（各 50 行以内。詳細は 12 を参照）
- templates/: journal 前提へ全面刷新する。
  vision / spec / charter / handoff / report / decision / gap の各 template を用意し、
  旧 open-item / planning-feedback / campaign 4 ファイル系 template は削除する
- rules/: kernel では package 内蔵既定 + cc-iasd.yaml override に吸収されるため、
  出荷対象を整理する（language-policy 等の残すものを選別する）
```

### 4.2 1-D で確定する事項

role card の再設計時に、rework/04 14 章の 1-D open questions を確定する。

```text
- role card の既定出力言語:
    3 role cards が出力に使う言語を role card 規約に明示する（詳細は 12 を参照）
- planner / worker も fresh-context 起動を前提とするか:
    fresh-context は現状 reviewer についてのみ確定している。planner / worker も
    fresh-context 前提とするかを 1-D で確定する
```

### 4.3 1-E 机上検証

```text
- 13_simulation_scenarios.md を kernel 語彙で再作成し、PBI 並列完走 / backtrack /
  escalation / 中断再開のシナリオを新設計で通し検証する。
  矛盾が出たら本編に埋め込まず、rework/04 経由で解決してから反映する
```

---

## 5. 観察後に判断する事項

次は設計時に固めず、P1 実装後の運用観察を経てから判断する。将来拡張として保持する項目（外部投影 adapter、actor=human gate 要求、worktree 隔離の高度化など）は 09 に置く。ここでは 09 と重複させず、観察後に既定値・方針を調整する種類の判断のみを挙げる。

```text
- adhoc run と spec チェーンのバランス:
    adhoc run が便利すぎると spec チェーンが形骸化し、厳しすぎると採用されない。
    doctor の昇格促し（adhoc run 比率の表示）が機能するかを運用観察で確認する
- content-hash 正規化仕様の調整:
    正規化が甘いと stale 連鎖、厳しいと改変見逃しになる。P1 で仕様を固めた後の
    調整コストが高いため、運用観察で正規化の粒度を見直す
- journal event 粒度の調整:
    粗いと監査に穴、細かいと肥大化する。closed set の粒度を運用観察で見直す
- project-context repo の auto-commit 粒度:
    遷移ごとに commit するか、まとめるかを運用観察で確定する
- status --plan + Capabilities 射影が中期計画の実運用に耐えるか:
    耐えない場合に足すのが専用 artifact の復活か charter 拡張かを観察後に判断する
```

---

## 6. レビューゲートで再確認する設計判断【再確認済み】

6.1（Phase 1 末）・6.2（Phase 2 末）ともレビュー通過済みである。記録として残す。

次は rework/04 で決定済みだが、実装と机上検証を経て再確認するレビューゲートを設けた項目である。判断そのものは確定しており（詳細は各正本文書を参照）、ここでは「いつ再確認するか」を管理する。

### 6.1 Phase 1 末レビューで再確認

rework/04 14 章で「Phase 1 末レビューで再確認」と注記された確定事項である。1-E の机上検証を通してから、gap・refs・終端 packet の仕様が新設計で一貫するかを再確認する。

```text
- gap の終端条件（closed / routed / deferred の成立規則）:
    blocking gap を routed にできない、deferred は decision 必須、などの成立規則が
    campaign close ガードと整合するかを再確認する（規則の詳細は 05 / 06 を参照）
- refs の対応形式（frontmatter 宣言 -> journal 正規形への正規化取込）:
    frontmatter の refs を遷移時に journal の {rel, to} 正規形へ取り込み、
    doctor が両者の一致を検査する形が机上検証で成立するかを再確認する（詳細は 06 を参照）
- 終端 packet の必須欄（escalation packet / backtrack request）:
    escalation packet（停止理由 / 選択肢 / 各影響 / 放置影響 / 推奨 / 再開条件 /
    関連証跡）と backtrack request（blocked stage / 欠落上流 ref / 継続不能理由 /
    推測継続時のリスク / 再開条件）が机上検証で過不足ないかを再確認する（詳細は 06 を参照）
```

### 6.2 Phase 2 末レビューで再確認

P1 実装中に詰めた仕様詳細（3 章のバッチ、および正規化ハッシュ・event data の型など）を本編の仕様欄へ反映し、Phase 2 末レビューでまとめて確認する。P1 実装で詰めた具体形が正本文書の記述と一貫するかを、この時点で総点検する。

---

## 7. brownfield 導入の実装候補【実装済み】

14_brownfield_adoption.md 7 章の未確定事項に対応する実装候補である。3 件とも実装・確定済み。

```text
- 導入時 baseline イベント【実装済み】:
    init が各登録 repo の HEAD / dirty を baseline.recorded event（subject=project:root）として
    journal に 1 件刻む（登録 0 件でも data.repos=[] で刻む）。06 3.2 の closed set に追加済み
- doctor の導入時検査【実装済み】:
    doctor の adoption-baseline 検査を追加。baseline 欠落の登録 repo と導入時点 dirty=true の repo を
    warning にする（両者とも error ではないため green 判定は崩さない）
- 既存ドキュメントの参照形式の確定【確定済み】:
    src/<repo>/<path> の論理パス参照に確定。持ち込み領域は設けない。14 の 5.5 章に規定
```
