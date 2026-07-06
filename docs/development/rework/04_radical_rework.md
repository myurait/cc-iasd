# rework 04. 破壊的リワーク提案: cc-iasd kernel

作成日: 2026-07-03  
状態: 承認確定版 v0.4（全論点確定 + 人間介入モデル明文化。本編反映と P1 実装計画へ進行可能）

---

## 1. この文書の位置づけ

この文書は、既存の cc-iasd 設計（docs/development/ 01〜13）への追記や修繕ではなく、3 つの不変条件だけを残して全体を再設計する提案である。採用された場合、本編ドキュメントの大部分と現行 CLI は置き換え対象になる。

不変条件は次の 3 つのみである。

```text
不変条件:
1. src/ 隔離を絶対制約とする
2. 証跡管理主義
3. 推測補完の禁止 -> 構造化された上流差し戻し
```

加えて、rework/02・03 で確定した設計原則（決定論主義 / 規約最小主義 / 外部サービス非依存 / 後方互換不要 / 確定語彙）に服する。

### 1.1 設計の方法

本提案は、4 つの異なるレンズ（状態機械カーネル / 証跡台帳 event-sourcing / runtime 統合コンパイラ / 契約・検証ファースト)から独立に生成した設計案を、3 観点（不変条件の執行構造 / 採用実務性 / 先行事例との差別化）の審査で採点・統合したものである。審査は 3 観点とも「状態機械カーネル案を骨格とし、他 3 案を部品として接ぎ木する」で一致した。審査記録の要約は 12 章に置く。

### 1.2 承認記録（2026-07-03）

```text
- Q1: kernel 構想の全体採用を承認
- Q2: Spec Kit 互換を「artifact vocabulary 互換」へ後退させることを承認
- Q3: feature / roadmap の廃止を承認。代替として補強 1（charter depends_on ガード）と
  補強 2（vision Capabilities + covers 射影）を組み込む（5.1 章）
- multi-repo src/ と並列 run は将来拡張ではなく v0 必須要件とする（7.4 章）。
  本システムの想定対象は、infra / frontend / backend など複数の構成要素から成る
  数十人月規模のプロダクトで、人間のエンジニアが AI へ作業委任を最大化するための
  システムである。単一 repo・小規模デモの運用を設計の既定にしない
- gate review の既定は「4 gate すべて必須 + charter 単位のオプトダウン」で確定（5.2 章）。
  緩和下限は launch + completion。actor=human 要求オプションは v0 非搭載
- （2026-07-05 追記）人間の介入モデル（4 類型）と human-facing 上限
  （cc-iasd inbox / decide / STOP）を明文化（9.3 章・10.1 章）。
  人間は著者と決裁者であり操作者ではない。独自ナレッジの要求は設計バグとして扱う
```

---

## 2. 中核主張

現行 cc-iasd の規律は、その大半が「ロール文書への期待」で担保されている。Worker が推測しないこと、証拠なしに完了を宣言しないこと、状態を勝手に書き換えないことは、すべて Markdown に書かれた約束であり、破る経路が構造上開いている。

本提案の中核主張は次である。

```text
cc-iasd kernel
  = 3 不変条件を「約束」ではなく「構造」で守る決定論的状態機械カーネル

- ライフサイクル状態の正本は append-only journal のみ。
  Markdown から status 欄を廃止し、AI が状態を書き換える経路を物理的に消す
- 完了へ至る経路は「CLI 自身が検証を実行して生成した verification の成立」のみ。
  LLM の完了報告文は guard の入力にならない
- run の入力（handoff）は AI が執筆せず、CLI が上流成果物から機械合成する。
  合成に失敗した場合は欠落箇所を明示して拒否する。推測で埋める主体が存在しない
- run の終端は accept / block（backtrack）/ escalate の 3 択のみ。
  block が最も安価な合法出口になるコスト勾配を作る
- 人間決裁は decide コマンドのみが記録でき、journal に actor=human が刻印される
```

不変条件と構造の対応は次である。

```text
不変条件 1（src/ 隔離）:
  CLI の全書き込みが単一 write-path モジュールを通り、管理領域の
  allowlist 外への書き込みを例外で拒否する。verify の出力捕捉先は
  evidence/ に固定。doctor が src/ 配下の管理物混入を deny-glob 検査。
  さらに run 単位で surface（write/forbid glob）を宣言し、verify が
  base commit からの git diff を照合して逸脱を機械検出する

不変条件 2（証跡管理主義）:
  状態を変える行為 = journal に event を追記する行為、として同一化する。
  journal を経由しない状態変更は存在せず、silent overwrite は構造的に
  不可能。verification は CLI が実行した場合にのみ生成され、review は
  対象の content-hash を刻印して鮮度が機械判定される。遷移 event には
  guard 判定結果が焼き込まれ、doctor が事後に再計算検証できる

不変条件 3（推測補完の禁止）:
  blocking gap が open の artifact を入力とする下流遷移はコードレベルで
  全拒否される。handoff の機械合成失敗は backtrack request の決定論的
  トリガーになる。終端 3 択の強制により、完了を偽装するより差し戻す方が
  構造的に安い
```

---

## 3. 破壊するもの / 残すもの

### 3.1 破壊するもの

```text
- 6 分割トップレベル（runtime/ rules/ user/ product/ ops/ reference/）
  -> フラット構成 + reference/（非管理）+ src/ に再編
- feature / roadmap の独立 artifact
  -> vision の Priorities セクションと gap 台帳（route=vision）+ 射影 plan ビューに吸収
- spec の 6 ファイル束（spec/plan/research/data-model/contracts/tasks）
  -> 単一 spec.md（必須セクション制）+ 任意 attachments/
- campaign の 4 ファイル構成（plan/state/queue/aggregate-report）
  -> charter.md 1 枚 + journal 導出 state
- run の 5 ファイル構成（plan/handoff/state/open-items/knowledge）
  -> handoff.md（機械合成）+ notes.md（authored）+ report.md（終端 packet）+ journal
- open item / planning feedback / TBD 規約の 3 重管理
  -> 単一の gap 台帳に統合（rework 02 B1 確定への回答）
- archived/ outdated/ へのファイル移動による退避規約
  -> ファイルは動かさず journal 上の retired 状態で表現
- 10 ロール体系と Planning Lead / Execution Manager の entry point 並立
  -> planner / worker / reviewer の 3 role cards + human。
     ゲート判定・進行順序・証跡完全性検査はカーネルのコードへ移管
- Markdown frontmatter の status 欄と、state.md / queue.md の半自由編集
  -> ライフサイクル状態は journal のみ
- log event を含む prompted logging
  -> 遷移・検証・決裁はすべて自動で journal に記録される
- view evidence / view current / view scope / view run の分立
  -> status（+ --plan）と handoff に統合
- 約 25〜30 の CLI コマンド -> 約 17 に縮約
```

### 3.2 残すもの

```text
- 3 不変条件（すべて執行構造に昇格）
- 確定語彙: vision（旧 ideal）/ spec / tasks / run / evidence（de facto 準拠）、
  campaign / escalation packet / backtrack request（差別化語彙）
- campaign / run の 2 層実行モデル（charter は stop conditions / risk tiers /
  non-regression focus / cross-checks を保持）
- Devil's Advocate の 2 モード review（launch gate / completion gate として再定式化）
- tool-owned metadata と AI-authored content の分離原則
- 実装ループの実行 runtime への委譲（cc-iasd は runtime を代替しない）
- Markdown を authored content の媒体とすること（人間がファイルを開けば読める）
- npm 薄型 CLI、外部サービス非依存
- rework 02 採用機構: A1〜A7 はすべて本設計の構造として実装される（11 章）
```

---

## 4. アーキテクチャ全景

```text
project-context/               # それ自体が git repo（証跡の版管理。src/ は ignore）
  cc-iasd.yaml                 # 唯一の設定: runtime adapter / budgets / checks allowlist /
                               # decision policy / gate 要否
  journal/                     # append-only event store。1 event = 1 JSON file（ULID 名）
                               # CLI のみ書込。ライフサイクル状態の唯一の正本
  state.json                   # journal からの導出 snapshot（再生成可能。正本ではない）
  vision/
    v001-core.md               # 起点正本。Target Experience / Non-Goals / Boundaries /
                               # Capabilities（構造化チェックリスト。旧 Priorities）/
                               # Human Decision Points 必須セクション
  specs/
    s001-<slug>/
      spec.md                  # Requirements / Acceptance / Surfaces / Checks / Tasks 必須セクション
      attachments/             # 任意（data model / contracts 等。スキーマ非強制）
  campaigns/
    c001-<slug>/
      charter.md               # UX Outcome / Coverage / Depends On / Stop Conditions /
                               # Risk Tiers / Non-Regression Focus / Cross-Checks
  runs/
    r-<ulid>-<slug>/
      handoff.md               # CLI が機械合成する実行入力（生成物）
      notes.md                 # worker の実装ノート（authored）
      report.md                # 終端 packet: completion / escalation / backtrack のいずれか 1 つ
  evidence/
    verifications/             # verify の verdict JSON + 生出力（stdout/stderr/diff.patch）
    reviews/                   # review record（対象 content-hash 刻印つき）
  decisions/
    d001-<slug>.md             # 人間決裁記録（decide のみが登録する）
  gaps/
    g001-<slug>.md             # gap 台帳の authored 本文（metadata は journal 側）
  roles/                       # planner / worker / reviewer の 3 role cards（各 50 行以内）
  out/                         # compile 生成物（runtime bundle）。gitignore。非正本
  reference/                   # カーネル非管理の自由領域
  src/                         # 成果物 repo root（nested git）。CLI は読み取りと verify 実行のみ
```

構造上の要点は 4 つである。

```text
1. Markdown は authored content 専用。frontmatter は id と refs のみで、
   status 欄を持たない。人間はファイルを開けば内容を読める（ブラウザビリティ維持）
2. ライフサイクル状態・遷移・検証・決裁は journal の event が正本。
   state.json と status 出力はすべて導出
3. project-context 自体を git repo とし、CLI が遷移のたびに auto-commit する。
   改竄検出とタイムラインは自前の hash-chain を実装せず git に委譲する
4. out/ は再生成可能な非正本。runtime へ渡すものはすべてここに生成され、
   src/ にも $HOME にも書かない
```

### 4.1 journal の形式

journal は 1 event = 1 file（ULID 名の JSON）とする。単一 NDJSON への追記は並行 run と git ブランチ運用で必ず衝突するため採らない。1-event-1-file は追記が新規ファイル作成のみになり、並行書き込みも git merge も衝突しない。順序は ULID で決まり、state.json 導出時に全 event を時系列で畳み込む。

改竄耐性は event 間の hash-chain を自作せず、project-context repo の git 履歴で担保する（ローカル版 Kosli の再実装を避ける）。doctor は「journal event の参照整合」「guard_results の再計算一致」「evidence の sha256 一致」を検査する。

event schema は次である。

```text
event:
- id: ULID
- ts
- actor: { kind: human | agent | cli, session }
- type: created | revised | transitioned | verify.recorded | review.recorded |
        gap.opened | gap.closed | decision.recorded | session.started |
        session.resumed | commit.observed | note.appended
- subject: <kind>:<id>（vision:v001 / spec:s001 / campaign:c001 / run:r-... / gap:g001）
- data: type 固有。transitioned は { from, to, guard_results: [...] } を必ず持つ
- payload: { path, sha256 }（revised / verify / review で必須）
- refs: [{ rel, to }]（covers / upstream / selects / commit 等）
```

event type は closed set とし、追加は cc-iasd 本体の version up でのみ行う。

---

## 5. ノードと状態機械

カーネルのノードは 6 種、終端 packet は 2 種である。各ノードの authored 媒体は Markdown ファイルであり、campaign の authored 媒体を charter と呼ぶ。

```text
vision:    draft -> approved -> retired
spec:      draft -> ready -> in-campaign -> done / retired
campaign:  draft -> active -> closed / halted
run:       created -> handed-off -> returned -> verified -> accepted /
           blocked（backtrack）/ escalated
decision:  open -> decided（decide のみが遷移させる）
gap:       open -> closed / routed / deferred
```

主要遷移とガードの対応は次である。ガードはすべて決定論的（ファイル存在・セクション非空パース・exit code・hash 一致・journal カウント）であり、LLM の自己申告は一切評価しない（rework 02 B4 確定に準拠）。

```text
遷移                ガード（すべてコード判定）
vision approve      必須セクション非空 / 対応する decision 記録あり（人間承認）
spec ready          必須セクション非空 / blocking gap = 0 / 上流 vision = approved /
                    gate=spec の review record が現在の content-hash と一致 /
                    Checks が allowlist 適合または decision 承認済み
campaign launch     charter 構造化欄完備 / coverage の全 spec = ready /
                    depends_on の全 campaign = closed /
                    gate=launch の review record が hash 一致 / blocking gap = 0
run open            campaign = active / 対象 task 未完 / handoff 機械合成成功
                    （合成失敗 = 欠落セクション列挙 + backtrack 誘導）/
                    stop-file 不在 / budget 残 / no-progress 上限未達
run return          notes.md 存在 / base commit からの git diff snapshot 取得成功
run verify          spec の Checks を CLI が子プロセス実行し exit code を期待値と照合 /
                    生出力を evidence/verifications/ に捕捉 /
                    diff を Surfaces と照合し forbid 該当は機械 FAIL、
                    write glob 外は off-surface として report に自動列挙
run accept          verification = pass / gate=run の review record が hash 一致 /
                    run の blocking gap = 0 / reject 回数 < 上限
reject 上限到達      accept 封鎖。escalate のみ許可（A3 階梯の決定論化）
campaign close      全 run = accepted / 全 task チェック済 / gate=completion の
                    review record あり / gap 全て closed | routed | deferred（要 decision）/
                    completion report 存在
escalated -> 再開    対応する decision 記録の存在
blocked -> 再開      上流 artifact の編集（hash 更新）+ 該当 gate の再 review
```

review の鮮度は content-hash で機械判定する。hash は frontmatter 除外 + 空白正規化した本文に対して計算し、軽微な整形で stale 化しないようにする。seal による凍結方式（編集のたびに再承認の連鎖が走る方式）は、人間承認の形骸化を招くため採らない。dirty 検出方式（編集されたら次の遷移時に再 review を要求する）とする。

### 5.1 順序と coverage の決定論化（feature / roadmap 廃止の代替。補強 1・2）

feature / roadmap が担っていた実質は、実現順序の宣言と coverage 追跡（想定機能を漏らさない）である。両者を artifact ではなく、決定論ガードと射影として再実装する。

```text
補強 1（順序宣言 -> depends_on ガード）:
  charter は depends_on: [campaign-ref] を宣言できる。campaign launch ガードは
  依存 campaign がすべて closed であることを検査する。PBI が複数 campaign に
  またがる場合の実現順序は、散文の roadmap ではなくこのガードが強制する

補強 2（coverage 追跡 -> Capabilities + covers 射影）:
  vision の Capabilities は構造化チェックリスト（提供すべき機能能力の列挙）とする。
  spec / campaign は covers ref で capability を参照し、status --plan と doctor が
  「どの capability がどの spec / campaign にカバーされ、どれが未カバーか」を
  journal の refs から機械射影する。「想定機能を漏らさない」は散文の点検ではなく
  射影の空欄として可視化される
```

中期計画在庫（campaign 未満・vision 超過の粒度のアイデア）は、gap 台帳（route=vision, kind=candidate）が受け皿になる。

### 5.2 gate review の既定（確定）

gate review の主体は fresh-context の AI reviewer であり、人間の稟議ではない。人間の関与点は decide と campaign close に限定されるため、gate 必須化のコストはトークン・レイテンシ・並列スループットである。想定規模（数十人月・並列 run 多数・委任最大化）では、人間が見ていない時間の検出網は AI reviewer しかないため、既定を堅く倒す。

```text
既定:      spec / launch / run / completion の 4 gate すべてで review record 必須
緩和経路:  charter が「run gate を risk-tier 連動にする」と宣言できる。
           low tier（可逆・surface 内・公開契約に触れない）の run は
           verification のみで accept 可、medium 以上は reviewer 必須。
           宣言の妥当性は launch review が検査し、off-surface 検出時は
           tier に関係なく reviewer 必須へ強制昇格する（決定論的オプトダウン）
緩和下限:  launch と completion は config でも外せない
           （checks の信頼境界検査と完走判定の総点検が消えるため）
非搭載:    「特定 gate の review record に actor=human を要求する」宣言は
           v0 に搭載しない。人間関与点を decide と campaign close に絞る
           設計を維持し、必要性は運用観察後に再判断する
```

---

## 6. gap 台帳（未解決事項の一元管理）

open item / planning feedback / TBD マーカー / backtrack 起点の 4 概念を、単一の gap 台帳に統合する（rework 02 B1 確定「統合できないなら導入しない」への回答）。

```text
gap:
- kind: needs-human-decision / needs-upstream-fix / needs-info / candidate
- route: vision / spec / campaign / none（どの層に戻すべきか）
- blocking: true / false
- 本文（authored）: 背景 / 選択肢 / 推奨 / routing 提案
```

規約は次の 1 本のみである。

```text
- 未確定事項は gap として登録する
- spec 本文中の未確定箇所は [UNRESOLVED: g012] の形で gap を参照する
  （台帳に存在しない裸のマーカーは doctor が違反として検出する）
- blocking gap が open の間、その artifact を入力とする下流遷移は全拒否される
- gap の close は「decision へのリンク」か「対象 artifact の編集 + 再 review」のみで成立する
- route=vision の gap 一覧が、旧 feature backlog / planning feedback の受け皿になる
```

旧 planning feedback の還流（実行結果を計画層へ戻す）は、run の report が gap を起票し、route で戻し先を指定する形に一本化される。

---

## 7. 検証と終端

### 7.1 verification（A1 Default-FAIL の完成形）

spec は Surfaces と Checks を構造化欄で宣言する。

```text
Surfaces:
  write:  ["src/api/app/auth/**", "src/api/tests/auth/**"]
  forbid: ["src/**/infra/**", "src/**/.env*"]

Checks:
  - id: unit ; run: "npm test -- auth" ; cwd: src/api ; expect: { exit: 0 }
  - id: lint ; run: "npm run lint"     ; cwd: src/api ; expect: { exit: 0 }
```

`run verify` は次を行う。

```text
1. Checks を CLI 自身が子プロセス実行し、exit code を期待値と照合する
2. 生出力（stdout / stderr）と diff.patch を evidence/verifications/ に保存する
3. base commit からの git diff を Surfaces と照合する。
   forbid 該当の変更 = 機械 FAIL。write glob 外の変更 = off-surface として
   report の tool-owned 欄に自動列挙（人間可視化）
4. verdict JSON（check 結果・照合結果・payload sha256）を生成し journal に記録する
```

verification は verify コマンドの実行によってのみ生成される。worker が「テストは通った」と書いても、verification 記録がなければ accept のガードで拒否される。証拠を「読む義務」ではなく「CLI が作る構造」であり、完了偽装の経路がコード上存在しない。

Checks は任意 shell コマンドであるため信頼境界になる。cc-iasd.yaml の command allowlist（prefix match）に適合しない check を含む spec は、ready ガードで decision 承認を要求する。

### 7.2 終端 3 択とコスト勾配

run は accept / block / escalate 以外で終端できない。

```text
accept:   verification pass + review + blocking gap 0 が必要（最も高価）
block:    backtrack request を生成して blocked へ（--missing <ref> 一発で成立。最も安価）
escalate: escalation packet を生成して escalated へ（decision 待ち）
```

推測で埋めて完了を装うことが最も高くつき、差し戻すことが最も安い、というコスト勾配を状態機械が作る。これが不変条件 3 の執行形である。

停止監視は journal から機械判定する（A2）: 直近 N run で diff / task 進捗ゼロ（no-progress）、budget 超過、stop-file（キルスイッチ）の存在は run open / verify のガードに組み込まれる。同一 check の連続失敗・reject が閾値（既定 2）に達すると accept が封鎖され escalate のみ許可される（A3）。

### 7.3 spike run（探索作業の受け皿）

事前に検証コマンドを宣言できない調査・探索作業のために、spike 型 run を最初から定義する。逃げ道を用意しないと現場で弱い Checks が乱造され、Default-FAIL 自体が骨抜きになるためである。

```text
spike run:
- surfaces.write は空または notes 限定（src/ を変更しない）
- Checks の最低要件は「調査成果（notes.md / report.md）の存在チェック」
- 終端は accept ではなく「report 提出による close」
- spike の成果から spec / gap を起票して通常 run に接続する
```

### 7.4 multi-repo と並列 run（v0 必須要件）

現実のプロダクトは infra / frontend / backend など複数の構成要素で成り立つ。multi-repo src/ と並列 run は将来拡張ではなく、v0 の必須要件として設計する。

```text
multi-repo:
- src/ 配下の repo は cc-iasd.yaml に登録する（nested git を doctor が検出・照合する）
- Surfaces の glob は src/<repo>/ プレフィックスを含み、run の対象 repo 集合は
  Surfaces から導出される。1 run = 1 repo に固定せず、横断 run を許す
- run open は対象 repo ごとに base commit を journal に記録し（commit.observed）、
  run return / verify の diff snapshot と surface 照合は repo ごとに行う
- Checks は check ごとに cwd（repo）を持つ（7.1 の設計のまま）
- handoff は対象 repo のレイアウト（repo 一覧・各 base commit・対象 glob）を含めて
  機械合成される

並列 run:
- journal は 1-event-1-file のため、並列 append で衝突しない
- task の二重取りは run open 時の claim event で機械的に排他する
- 並列可否は決定論ガードで判定する:
    対象 repo が互いに素          -> 常に並列可
    同一 repo を共有する場合       -> Surfaces の write glob 交差が空なら並列可。
                                    交差する run open は先行 run の終端まで拒否
- 同一 repo を共有する並列 run の verify は repo 単位の lock で直列化する
  （テスト・ビルド実行の相互干渉を防ぐ）
- adapter は run ごとの git worktree 隔離を提供できる（同一 repo 並列の強い隔離。
  accept 時に merge し、conflict は verify 失敗として機械検出する）
```

---

## 8. handoff 機械合成と runtime 接続

### 8.1 handoff の機械合成（A6 の実装）

src/ 隔離の最大の代償は「runtime が context を自然に読めない」ことである。本設計はこれを handoff の機械合成（compile）で解く。

`run open` は、AI に handoff を書かせない。CLI が次を決定論的に組み立てる。

```text
handoff の合成元:
- spec の Requirements / Acceptance / Surfaces / Checks / 対象 Tasks
- charter の Risk Tiers / Non-Regression Focus / Stop Conditions
- 関連する decision の確定事項
- vision の該当 Boundaries 抜粋
- worker role card と許可コマンド表
- exit protocol（「完了を宣言する手段はない。実装後に run verify を要求せよ。
  終端は accept / block / escalate のみ」）
```

必須フィールドの合成に失敗した場合（上流セクションが欠落・空・blocking gap あり）、run open は「どのセクションが欠けているか」を列挙して拒否し、backtrack request の生成を誘導する。上流不備の run は物理的に始まらず、推測で埋める主体が存在しない。

### 8.2 Tier 0 / Tier 1 の二層 enforcement

runtime 非依存を守るため、enforcement を二層で定義する。

```text
Tier 0（全 runtime 共通。不変条件はこの層だけで閉じる）:
- handoff の stdout 配布: cc-iasd run handoff <id> | claude -p -（または codex 等）
- CLI ガード（全遷移）
- run return 時の git diff snapshot（自己申告ではなく実測）
- run verify の CLI 実行
- doctor の src/ 汚染検査・journal 整合検査

Tier 1（hook 対応 runtime 向けの optional 加速層。失敗を早めるだけ）:
- adapter が out/<run>/ に settings.json / context.md / launch.sh を生成し、
  runtime をその設定で起動する（src/ にも $HOME にも書かない）
- SessionStart hook: context packet の注入
- PreToolUse hook: worker profile での src/ 外書込 deny、stop-file 検出
- PostToolUse hook: journal への自動追記
- Stop hook: 終端 3 択が未成立の session 終了をブロック
```

「Tier 0 のみで 3 不変条件が成立する」ことを仕様として明文化する。Tier 1 の hook は特定 runtime の API に依存するため、enforcement の本体には決してしない（ロックイン回避）。adapter は capability manifest（contextInjection / writeGuard / stopGate / journal の各 capability を hook / wrapper / none で宣言）を持つ compile ターゲットとして実装する。

Bash 経由の src/ 外書込は Tier 1 でも完全阻止できないことを明示的に認め、Tier 0 の git 監査（return / verify / doctor）で事後捕捉する defense in depth とする。

### 8.3 session lifecycle

```text
開始:   session start が bundle を compile し、base commit と session metadata を
        journal に記録して runtime を起動する（--runtime none なら手順のみ出力）
中断:   特別な後始末を要求しない。status が「running だが journal に N 分イベントなし」を
        stale として決定論表示する
再開:   session resume が resume brief（base commit からの git diff --stat /
        最終 verification 結果 / 未終端 event）を再コンパイルして再起動する。
        圧縮要約やロール文書のリロード規約に依存しない
キル:   runs/<id>/STOP ファイル（人間が置く）。guard が検出して以降の遷移を拒否する
```

---

## 9. ロールと人間決裁

### 9.1 3 ロール + human

ゲート判定・進行順序・証跡完全性検査をカーネルへ移管した後に残る「LLM にしかできない判断」だけをロールにする。role card は各 50 行以内、出力言語を明示する。

```text
planner:
  vision / spec / charter の authored content を執筆する。gap の解消提案を書けるが
  close はできない。旧 Ideal Interviewer / Feature Scope Designer / Spec Designer /
  Planning Lead の執筆責務を統合。人間との vision 対話もここが担う

worker:
  handoff を入力に src/ のみを編集し、notes.md と gap 起票で報告する。
  可視コマンドは run handoff / return / verify / block / escalate / gap add / status のみ。
  完了を宣言するコマンドは可視性に存在しない

reviewer:
  gate 種別（spec / launch / run / completion）ごとに fresh-context で起動され、
  review record を返す。旧 Design Reviewer / Code Quality Auditor /
  Devil's Advocate / Compliance Auditor を統合。launch gate = 旧 Design Launch Review、
  completion gate = 旧 Campaign Completion Review。verdict の中身は LLM 判断だが、
  record の有効性（hash 一致・鮮度）はカーネルが判定する

human:
  vision approve / decide / campaign close の専権。infrastructure / cost / security /
  product value の判断は charter の risk tiers に事前宣言され、該当時は decision を
  経ずに進めない
```

Planning Lead / Execution Manager という entry point ロールは廃止する。両者の実質は「順序の強制」「packet の中継」「ゲート判定」であり、すべて状態機械が決定論的に代替する。entry point 並立問題（nested subagent 制約）は、orchestrator ロールの廃止によって問題ごと消滅する。

### 9.2 人間決裁と threat model

decide は既定で TTY 必須とし、journal に actor=human を刻印する。headless で走る agent は物理的に自己承認できない。

非同期・リモート決裁のために escape hatch を v0 から仕様化する: 人間が decisions/ に decision ファイルを配置し、`cc-iasd decide --adopt <file>` で取り込む経路を認める（cc-iasd.yaml で有効化。journal に adopt 経由であることを記録し、doctor が一覧表示する）。

threat model は明記する: この機構が防ぐのは「善意のドリフト」（agent が流れで自己承認してしまうこと）であり、擬似 TTY の確保や decision ファイルの偽造を行う敵対的 agent には耐えない。敵対的 runtime を仮定する統制はカーネルの責務外であり、実行環境側（sandbox / 権限分離）に委ねる。

### 9.3 人間の介入モデル

人間の役割は「著者と決裁者」であり「操作者」ではない。run open / return / verify / accept / review record などの進行操作は agent が実行するものであり、人間がコマンド体系を学習しなければ回らない状態は設計バグとして扱う。

介入は 4 類型である。

```text
起点（稀）:
  vision の本文を執筆する（または planner セッションとの対話で書かせて直す）。
  承認は decide 一発

呼ばれたとき（非同期決裁。非常駐人間の中核介入）:
  escalation packet / blocking gap（needs-human-decision）/ allowlist 外 checks の
  発生時、自走は packet を残して停止する。人間は都合のよいタイミングで packet
  （選択肢・推奨・各影響・放置影響・再開条件）を読み、decide で答える。
  答えた瞬間に該当 run の再開条件が満たされる

節目（campaign ごと）:
  campaign close。completion report と completion review を読んで受け入れる
  （PBI 単位の受け入れに相当）

随時（要求されない任意介入）:
  cc-iasd（inbox）で覗く / Markdown を直接編集する（dirty 検出が次の遷移で
  再 review を強制するため、人間の直接編集は常に安全）/ STOP ファイルで
  緊急停止する / gap や adhoc run を起票する
```

人間が覚える定常動線は 1 文に収束する: 「気になったら cc-iasd、答えるは decide、止めるは STOP、直すは Markdown」。

---

## 10. CLI surface と導入曲線

### 10.1 コマンド一覧（約 17。現行の約半分）

```text
cc-iasd                                        # 引数なし = human inbox。要対応事項（open decisions /
                                               # escalations / stale runs / close 待ち campaign / 未読 report）
                                               # を一覧し、その場で対話的に decide / close できる人間の定常入口

cc-iasd init                                   # scaffold + journal + git init
cc-iasd doctor                                 # 構造 / 参照 / src 汚染 / guard 再計算 / 証拠十分性の検査
cc-iasd status [--plan | <ref>]                # 導出 view（--plan は route=vision の gap と
                                               # campaign 順序から中期計画ビューを射影）

cc-iasd new vision|spec|campaign <slug>        # scaffold 作成（AI は authored 節を執筆）
cc-iasd spec ready <id>
cc-iasd campaign launch <id> / close <id>

cc-iasd run open <campaign-id> --tasks <T..> | --adhoc "<goal>" --check "<cmd>" [--spike]
cc-iasd run handoff <run-id>                   # stdout 出力（Tier 0 正本経路）
cc-iasd session start <run-id> [--runtime claude-code|codex|none] / resume <run-id>
cc-iasd run return <run-id>                    # diff snapshot の実測記録
cc-iasd run verify <run-id>                    # Checks の CLI 実行 + surface 照合
cc-iasd run accept <run-id> / block <run-id> --missing <ref> / escalate <run-id>

cc-iasd review record <ref> --gate spec|launch|run|completion
cc-iasd gap add <ref> / close <id> / route <id> --to <ref>
cc-iasd decide <decision-id> [--adopt <file>]
cc-iasd report <ref>                           # 終端 packet / progress の skeleton 生成
cc-iasd retire <ref>                           # 退避（ファイル移動なし。journal 状態のみ）
cc-iasd role show planner|worker|reviewer
```

guard 不成立時の拒否メッセージは「どの型付き入力が欠けているか」と「次に打つべきコマンド」を人間可読 + 機械可読（--json）で返す。差し戻しが唯一のサンクションされた次の一手として提示される。

コマンドは対象者で 3 分類し、human-facing の上限を設計原則として固定する。

```text
human-facing（この 3 つが上限。超える human 必須操作の追加は設計バグとして扱う）:
  cc-iasd（inbox。decide と campaign close はここから対話実行できる）/
  decide / STOP ファイル（コマンドですらない）
  + Markdown 編集と git（独自ナレッジではない既存スキル）

agent-facing（人間は学習不要。知識は事前学習ではなく in-band で供給される —
  handoff への焼き込み、guard 拒否メッセージの次の一手提示、status の可能遷移提示）:
  new / spec ready / campaign launch / run open / run handoff / session start / resume /
  run return / run verify / run accept / block / escalate / review record /
  gap add / close / route / report / retire / role show

setup（初回と点検のみ）:
  init / doctor
```

### 10.2 導入曲線（5 分で最初の run）

フル chain（vision -> spec -> campaign -> run）を初日から要求しない。adhoc run を導入の入口にする。

```bash
npx cc-iasd@latest init myapp --repo git@github.com:me/app.git
cd myapp
npx cc-iasd run open --adhoc "ログイン失敗時に 500 が出るのを修正" --check "npm test"
npx cc-iasd session start r-... --runtime claude-code
```

adhoc run は spec を要求しない（人間直書きの goal は推測補完に当たらない）が、guard / journal / verify / 終端 3 択はすべて有効である。不変条件は初日から守られ、規模が増えたら spec / campaign へ昇格する。doctor が adhoc run の比率を表示して昇格を促す。

### 10.3 実行例（1 機能を作り切るフロー）

```bash
# 計画
cc-iasd new vision core && $EDITOR vision/v001-core.md
cc-iasd decide d001-approve-vision           # 人間承認 -> vision approved
cc-iasd new spec csv-export && $EDITOR specs/s001-csv-export/spec.md
#   文字コード未確定 -> cc-iasd gap add spec:s001 --kind needs-human-decision --blocking
#   spec 本文には [UNRESOLVED: g001] を記載
cc-iasd spec ready s001    # => 拒否: blocking gap g001 が open。decide を促す
cc-iasd decide d002-csv-encoding             # 「BOM 付き UTF-8」を決裁。g001 close
cc-iasd review record spec:s001 --gate spec  # reviewer session が record
cc-iasd spec ready s001                      # => ready

cc-iasd new campaign reporting && $EDITOR campaigns/c001-reporting/charter.md
cc-iasd review record campaign:c001 --gate launch   # 旧 Design Launch Review
cc-iasd campaign launch c001

# 実行
cc-iasd run open c001 --tasks T001,T002      # handoff 機械合成。上流欠落なら開始不能
cc-iasd session start r-xxx --runtime claude-code
#   （runtime 内で worker が src/ を実装）
cc-iasd run return r-xxx                     # diff snapshot 実測
cc-iasd run verify r-xxx                     # Checks 実行 + surface 照合 -> verification pass
cc-iasd review record run:r-xxx --gate run
cc-iasd run accept r-xxx                     # 全ガード通過 -> accepted

# 締め
cc-iasd review record campaign:c001 --gate completion   # 旧 Campaign Completion Review
cc-iasd report campaign:c001
cc-iasd campaign close c001
```

このフロー全体で、AI が状態を進めた箇所は一つもない。すべての前進はガードを通過した遷移であり、すべての停止は型付き packet（decision / backtrack / escalation）として journal に残る。

---

## 11. 確定事項との整合

rework 02・03 の確定判断との対応は次である。

```text
A1 Default-FAIL        -> verification は CLI 実行のみで生成（7.1）。構造化として完成形
A2 停止条件語彙         -> no-progress / budget / stop-file を run open・verify ガードに組込（7.2）
A3 却下回数階梯         -> journal カウントで accept 封鎖・escalate 強制（7.2）
A4 リスク段階分類       -> charter の Risk Tiers 欄 + escalation trigger（5 章・9.1）
A5 DEMM 証拠十分性      -> guard_results の event 焼き込み + doctor 再計算検証（4.1・5 章）
A6 context 注入 handoff -> handoff の機械合成 + Tier 1 hook 注入（8.1・8.2）
A7 トレーサビリティ     -> journal の refs チェーン（run -> task -> spec -> vision）と
                          commit.observed による src/ commit 紐付け
B1 clarify 統合         -> gap 台帳 + [UNRESOLVED: gNNN] 参照の単一規約（6 章）
B2 外部可視化           -> 非導入（journal からの射影として将来 adapter 可能だが根幹から分離）
B3 機械可読 state       -> 「状態のみ journal 化、authored は Markdown 維持」で部分回答。
                          全面 DB 化はしない（Beads への回答であり B3 確定と整合）
B4 Confidence 不採用    -> ガード入力は常にファイル存在 / exit code / diff / hash。
                          自己申告は一切評価しない
V1 ideal -> vision      -> 採用（vNNN 接頭辞）
V4 spec/plan/tasks      -> spec.md に統合するが語彙は spec / tasks を維持。
                          contract 等の新語彙は導入しない
V5/V8 差別化語彙        -> campaign / escalation packet / backtrack request を維持
```

留意点が 1 つある。V4 の確定は「Spec Kit 互換 dialect として維持」だったが、本提案は 6 ファイル束を単一 spec.md + attachments に統合するため、ファイル構成の互換は緩む（語彙とセクション構成の互換は維持）。互換の深さを「artifact vocabulary 互換」まで後退させることの承認が必要である。

---

## 12. 審査記録の要約

4 設計案に対する 3 審査（不変条件執行 / 採用実務性 / 差別化)の平均スコア（60 点満点換算の合計）は次である。

```text
設計 1 状態機械カーネル:      invariants 9.0 / determinism 9.0 / adoption 6.0 /
                             llm_ergonomics 8.0 / differentiation 7.7 / implementability 7.0
設計 2 証跡台帳:             invariants 9.0 / determinism 9.0 / adoption 3.7 /
                             llm_ergonomics 6.0 / differentiation 7.7 / implementability 4.7
設計 3 runtime コンパイラ:    invariants 7.0 / determinism 7.7 / adoption 9.0 /
                             llm_ergonomics 9.0 / differentiation 7.3 / implementability 7.0
設計 4 契約・検証ファースト:  invariants 8.7 / determinism 8.7 / adoption 5.3 /
                             llm_ergonomics 6.7 / differentiation 6.7 / implementability 7.0
```

3 審査とも設計 1 を骨格に推奨した。本提案は設計 1 の骨格に、設計 3 の導入・接続層（adhoc run / compile / Tier 0-1 / session lifecycle）、設計 4 の検証機構（surface + diff 照合 / expect 付き checks）、設計 2 の監査機構（guard_results 焼き込み / doctor 再計算 / payload sha256）を接ぎ木したものである。

審査が挙げた致命的欠陥のうち、本提案で先行手当したものは次である。

```text
- Markdown 可読正本の放棄（設計 2）        -> authored は Markdown 維持（4 章）
- 状態正本を frontmatter に残す（設計 3）   -> journal 一本化（4 章）
- hook を enforcement 本体にする           -> Tier 0 で閉じる定義（8.2）
- journal 並行書込の未解決                 -> 1-event-1-file + git 委譲（4.1）
- seal 凍結による承認形骸化（設計 4）       -> dirty 検出 + 正規化ハッシュ（5 章）
- spike の受け皿欠如                       -> spike run 型（7.3）
- 中期計画在庫の消滅                       -> 補強 1・2 + gap route=vision（5.1 章）
- TTY 必須の非同期決裁問題                 -> --adopt escape hatch + threat model 明記（9.2）
- verify commands の信頼境界               -> allowlist + decision 承認（7.1）
- ロール collapse しすぎ（設計 4 の 3 役）  -> planner / worker / reviewer + human の下限維持（9.1）
```

---

## 13. 既存設計への影響と移行

### 13.1 ドキュメントへの影響

```text
全面改稿:   02（概念設計）/ 03（アーキテクチャ）/ 04（ワークフロー）/
            05（自律プロトコル）/ 06（artifact・evidence モデル）/
            08（コマンド）/ 12（ロール設計）
部分改稿:   00 / 01（不変条件と非目標は維持。成立条件を kernel 語彙で書き直し）/
            07（Spec Kit 互換の深さを artifact vocabulary 互換へ後退）
影響小:     09（将来構想）/ 10 / 13
全面書換:   roles/（10 -> 3 cards）、templates/（journal 前提へ）、bin/cc-iasd.js、test/
```

### 13.2 実装順序案

```text
P1（縦スライス）: journal / 状態機械 / write-path allowlist / run open（adhoc）/
                 handoff 機械合成 / run verify / 終端 3 択 / decide / gap / doctor /
                 multi-repo（repo 登録・repo 別 base commit / diff / surface 照合）/
                 並列 run（claim event / write glob 交差ガード / verify lock）
                 -> adhoc run だけで 3 不変条件 + 並列安全が構造で守られる最小系を成立させる
P2（chain）:     vision（Capabilities）/ spec / campaign（depends_on）のノード化、
                 review gates、report、covers 射影（status --plan）
P3（接続層）:    claude-code adapter（Tier 1 hooks）、session resume、worktree 隔離 adapter
P4（監査強化）:  guard_results 再計算検証、証拠十分性検査の拡充
```

0.x につき、既存 project-context からの移行ツールは提供しない（rework 03 確定の後方互換不要に準拠）。

---

## 14. リスクと open questions

```text
リスク:
- handoff 機械合成は spec のセクション schema への依存を強め、spec 執筆の自由度を下げる。
  セクション schema の設計品質がシステム全体の律速になる
- ガードの厳格さと導入摩擦のバランス。adhoc run が便利すぎると spec チェーンが形骸化し、
  厳しすぎると採用されない。doctor の昇格促しが機能するかは運用観察が必要
- content-hash の正規化仕様が甘いと stale 連鎖、厳しいと改変見逃し。v0 で仕様を固めて
  からの調整コストが高い
- Tier 1 hook の runtime API 追従コストは恒常的に発生する（optional 層に閉じ込めても残る）
- journal event の粒度が粗いと監査に穴、細かいと肥大化。closed set の設計が要
- Windows のシェル差異（launch / guard / checks 実行）

open questions:
- status --plan + Capabilities 射影が中期計画の実運用に耐えるか。耐えない場合に足すのは
  専用 artifact の復活か charter 拡張か
- project-context repo の auto-commit 粒度（遷移ごとか、まとめるか）
- 旧 roles/ の prompt 資産（narrow context packet 設計等）を 3 cards へどこまで移植するか
- P1 実装時に確定する事項（Phase 1-B で検出。rework/05 7 章の例外扱いを適用）:
    cc-iasd.yaml の repo 登録スキーマ / out/ の run 別内部レイアウト /
    数値既定（no-progress の N / budget / session stale 閾値）/
    decision と notes の authored セクション構成 / spike run の report 分類 /
    new が記録する event 種別と vision approve の decide 対応 /
    report コマンドが journal event を残すか
- 1-D で確定する事項: role card の既定出力言語 /
  planner・worker も fresh-context 起動を前提とするか（fresh-context は現状
  reviewer についてのみ確定）

決定済み（2026-07-03）:
- multi-repo: v0 必須。横断 run を許す（7.4 章）
- 並列 run: v0 必須。claim + write glob 交差ガード + verify lock で並列安全を担保（7.4 章）
- gate review: 4 gate 既定必須 + charter 単位の risk-tier オプトダウン。
  緩和下限は launch + completion。actor=human 要求は v0 非搭載（5.2 章）
- gap の終端条件（2026-07-05 確定。Phase 1 末レビューで再確認）:
    closed   = decision へのリンク、または対象 artifact の編集 + 再 review で成立
    routed   = blocking=false かつ route が none でない場合に decision 不要で成立。
               gap は route 先の計画在庫として台帳に残り、status --plan に現れ続ける。
               blocking gap を routed にはできない（先に decision か上流編集で
               blocking を解消する）
    deferred = decision へのリンクを必須とする（campaign close ガードの
               「deferred（要 decision）」と整合）
- refs の対応形式（2026-07-05 確定。Phase 1 末レビューで再確認）:
    frontmatter の refs は作成・編集時の宣言入力であり、遷移時に CLI がパースして
    journal の refs（{rel, to} の正規形）へ正規化して取り込む。正本は journal 側で
    あり、doctor が frontmatter と journal 導出 refs の一致を検査する
- 終端 packet の必須欄（2026-07-06 確定。Phase 1 末レビューで再確認）:
    escalation packet = 停止理由 / 選択肢 / 各選択肢の影響 / 放置した場合の影響 /
    推奨 / 再開条件 / 関連証跡（evidence への参照）
    backtrack request = blocked stage / 欠落上流 ref / 継続不能理由 /
    推測継続時のリスク / 再開条件
    （旧設計で承認済みだった必須欄から、廃止したロール中継系の欄を除いて再定式化）
- gap ID の正規形（2026-07-06 確定）: gNNN（v001 / s001 / c001 / d001 と同形式で
  ハイフンなし）。未確定マーカーは [UNRESOLVED: gNNN]
- risk tier の分類軸（2026-07-06 確定）: A4 の 3 軸（帰結の不可逆性 / 影響範囲
  （surface 内外・impact）/ 人間専権領域該当）とする
- gate 緩和の適用範囲（2026-07-06 確定）: charter によるオプトダウンは run gate のみ。
  config による無効化は spec / run gate に対して可能で、launch / completion は不可
- role card の出力言語（2026-07-06 確定。Phase 1 末レビューで再確認）:
  card の出力言語欄は init の --doc-lang（cc-iasd.yaml の doc-lang）から生成時に
  確定する。card template は言語をプレースホルダで持ち、生成後の card には
  具体言語が明示される
- fresh-context 起動の前提（2026-07-06 確定。Phase 1 末レビューで再確認）:
  3 ロールとも fresh-context 起動を前提とする。planner は narrow context packet、
  worker は handoff、reviewer は gate 入力を起動時に与えられ、過去 session の
  文脈を引き継がない。role card に履歴・手順を書かない規約の根拠である
- campaign 内の spec 順序制約（2026-07-06 確定。1-E 机上検証で検出した設計の穴への
  対応。Phase 1 末レビューで再確認）:
  charter の Coverage は spec 単位の順序制約 after: [spec-ref] を宣言できる。
  run open ガードは「対象 spec の after に列挙された spec の全 task が accepted
  済みであること」を検査する。write glob が交差しない論理依存（例: API spec の後で
  ないと意味をなさない migration spec）を決定論的に直列化するための宣言であり、
  宣言がなければ順序制約は課されない
```
