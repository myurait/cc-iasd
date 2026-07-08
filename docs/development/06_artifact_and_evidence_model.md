# 06. artifact / evidence モデル

作成日: 2026-07-05  
状態: kernel 正本 v1.0（Phase 1 レビュー待ち）

---

## 1. この文書の目的

この文書は、cc-iasd kernel が扱う artifact の payload モデルと、状態・証跡の schema を定義する。具体的には、authored payload と journal の役割分担、event schema、verification の生成規則、content-hash による鮮度判定、handoff の機械合成規則、終端 packet の必須欄、gap 台帳の metadata / authored 分離、DEMM 証拠十分性の検査観点を扱う。

kernel の設計思想は、状態を「約束」ではなく「構造」で守ることである。本文書はその構造のうち、schema と証跡が実際にどの形を持つかを定める一次責任文書である。概念の全体像と根拠は 02 に、状態遷移とガードの成立条件は 05 に置く。本文書は「何がどんな形で記録され、どう検査されるか」に責務を限定し、遷移ガードの成立条件・コマンド構文・ディレクトリツリーは再掲しない。

---

## 2. artifact / payload モデル

### 2.1 payload と journal の分離

kernel は artifact を、authored payload と journal-owned な状態に分離する。payload は人間と AI が書く Markdown であり、状態は CLI のみが書く journal の event である。

```text
authored payload（Markdown。人間と AI が書く）:
  vision / spec / charter / notes / gap 本文 / decision 本文などの authored content の媒体。
  人間がファイルを開けば内容を読める（ブラウザビリティの維持）

journal（tool-owned。CLI のみが書く）:
  ライフサイクル状態・遷移・検証・決裁の正本。append-only の event store。
  Markdown からは状態を導出できず、状態を進める唯一の経路が journal への event 追記になる
```

authored payload の frontmatter は id と refs のみを持ち、status 欄を持たない。旧設計は frontmatter や state.md に status を保持していたが、kernel はこれを廃止し、状態は journal のみに置く。この分離により、AI が Markdown を編集しても状態は動かない。

### 2.2 各ノードの authored 媒体

6 ノードのうち authored payload を持つのは vision / spec / campaign / gap / decision であり、run は authored の notes と機械合成の handoff、機械生成の report を持つ。各ノードの authored 媒体は次である。ファイルの配置と物理構造は 03 に置く。

```text
vision:    vision Markdown（必須セクションの構成は 02 の 3 章を参照）
spec:      spec Markdown（同上。Surfaces / Checks は検証の入力になる。4 章）
campaign:  charter（campaign の authored 媒体をこう呼ぶ。必須欄の構成は 02 の 3 章を参照）
run:       notes（worker の authored 実装ノート）。handoff（機械合成）と
           report（機械生成の終端 packet skeleton）は authored ではない
gap:       gap 本文（背景 / 選択肢 / 推奨 / routing 提案）。metadata は journal 側（7.2 節）
decision:  decision 本文。decide のみが登録し、journal に actor=human が刻印される
```

campaign の authored 媒体を charter と呼ぶのは kernel の語彙規約である。旧設計の campaign は plan / state / queue / aggregate-report の 4 ファイルに分かれていたが、kernel では charter 1 枚 + journal 導出 state に統合されている。

### 2.3 frontmatter refs の対応形式

frontmatter の refs は artifact 間の参照関係（covers / upstream / selects / commit 等）を宣言する。ただし frontmatter refs は宣言入力であって正本ではない。

```text
refs の対応形式:
- frontmatter の refs は artifact の作成・編集時に authored される宣言入力である
- 遷移時に CLI が frontmatter refs をパースし、journal の refs（{rel, to} の正規形）へ
  正規化して取り込む
- 正本は journal 側の refs である
- doctor が frontmatter の refs と journal 導出 refs の一致を検査する
```

この設計により、参照関係の正本も journal に一本化される。人間や AI が frontmatter に書いた refs は遷移時に journal へ写像され、両者の不一致は doctor が検出する。

---

## 3. event schema

### 3.1 event の構造

journal は 1 event = 1 file（ULID 名の JSON）である。event schema は次である。

```text
event:
- id:      ULID
- ts:      timestamp
- actor:   { kind: human | agent | cli, session }
- type:    closed set（3.2）
- subject: <kind>:<id>（vision:v001 / spec:s001 / campaign:c001 / run:r-... / gap:g001）
- data:    type 固有。transitioned は { from, to, guard_results: [...] } を必ず持つ
- payload: { path, sha256 }（revised / verify / review で必須）
- refs:    [{ rel, to }]（covers / upstream / selects / commit 等）
```

actor.kind は human / agent / cli の 3 値である。人間決裁は decide コマンドのみが記録でき、actor.kind = human が刻印される。headless で走る agent は decide の TTY 要求を満たせず、自己承認できない（threat model の詳細は 05）。

payload は revised / verify.recorded / review.recorded で必須の { path, sha256 } であり、対象 payload の content-hash を刻印する。この sha256 が content-hash 鮮度判定（7 章）と証拠十分性検査（9 章）の照合キーになる。

### 3.2 event type の closed set

event type は closed set であり、追加は cc-iasd 本体の version up でのみ行う。任意の event 型を追記する経路を設けない。

```text
event type（closed set）:
- created            ノードの新規作成
- revised            authored payload の編集（payload 必須）
- transitioned       状態遷移（data に { from, to, guard_results } 必須）
- verify.recorded    verification の記録（verify のみが生成。payload 必須）
- review.recorded    review record の記録（payload 必須）
- gap.opened         gap の起票
- gap.closed         gap の close
- decision.recorded  人間決裁の記録（actor.kind = human）
- session.started    session 開始
- session.resumed    session 再開
- commit.observed    src/ 側 repo の base commit 観測（refs に commit）
- note.appended      notes への追記
- baseline.recorded  導入時点の各登録 repo の HEAD / dirty の記録（init のみが生成）
```

session / commit 系 event の data フィールドは次の確定形を持つ。

```text
session.started.data:
  { runtime, bundleDir, repos }
    runtime    起動 adapter 名（none / claude-code / codex）
    bundleDir  compile 出力先（out/<run-id>）
    repos      起動時点 base（name -> commit）。commit.observed 反映後の集合

session.resumed.data:
  { runtime, bundleDir, resumeBrief, priorSession, diff }
    resumeBrief    resume brief の compile 先（out/<run-id>/resume-brief.md）
    priorSession   直前の session.started/resumed の event id
    diff           base からの diff 概要（name -> { base, changedCount, changed }）

commit.observed.data:
  { repos, reason? }
    repos   観測した base（name -> commit）。state が run.repos へ畳み込む
    reason  観測契機（省略可。session start は無指定、worktree-merge 後は 'worktree-merge'）
```

### 3.3 transitioned event の guard_results

状態を進める遷移はすべて transitioned event として記録され、data に { from, to, guard_results } を持つ。guard_results は、その遷移で評価された各ガードの判定結果を焼き込んだものである。

```text
transitioned の data:
- from:          遷移前の状態
- to:            遷移後の状態
- guard_results: 各ガードの { ガード識別子, 判定に用いた入力, pass/fail } の列
```

guard_results を event に焼き込むことで、遷移が「なぜ通ったか」が事後に追跡可能になる。ガードはすべて決定論的（ファイル存在・セクション非空・exit code・hash 一致・journal カウント）であり、guard_results はその決定論的判定の記録である。doctor は guard_results を同じ入力から再計算し、記録と一致するかを検証する（9 章）。各遷移でどのガードが評価されるか、その成立条件は 05 に置く。

---

## 4. verification の生成規則

### 4.1 verify のみが verification を生成する

verification は run verify コマンドの実行によってのみ生成される。worker が「テストは通った」と authored payload に書いても、verification 記録がなければ accept のガードは通らない。証拠は「読む義務」ではなく「CLI が作る構造」であり、完了偽装の経路がコード上に存在しない。

verify が生成するのは verdict JSON であり、次を含む。

```text
verdict:
- Checks の実行結果（各 check の id / exit code / 期待値との照合）
- Surfaces 照合の結果（forbid 該当・off-surface の列挙）
- 生出力の捕捉先（stdout / stderr / diff.patch）
- payload sha256（対象成果物の content-hash）
```

verdict JSON は evidence の verifications 層に保存され、対応する verify.recorded event が journal に記録される。verification の成立（pass / fail）が accept ガードの入力になるが、そのガードの成立条件は 05 に置く。

### 4.2 Checks の子プロセス実行と exit code 照合

spec は Checks を構造化欄で宣言する。各 check は検証コマンド・実行 cwd・期待 exit code を持つ。verify は次を行う。

```text
Checks の実行:
- CLI 自身が各 check を子プロセスとして実行する
- exit code を check が宣言した期待値と照合する
- multi-repo では check ごとに cwd（対象 repo）を持ち、repo 単位で実行する
```

Checks は任意の shell コマンドであるため信頼境界になる。cc-iasd.yaml の command allowlist に適合しない check を含む spec は、spec ready ガードで decision 承認を要求する（ガードの成立条件は 05）。

### 4.3 生出力・diff.patch の捕捉

verify は Checks の生出力と成果物の diff を捕捉し、evidence に保存する。

```text
捕捉対象:
- 各 check の stdout / stderr（生出力をそのまま保存）
- base commit からの git diff（diff.patch として保存）
```

捕捉先は evidence の verifications 層に固定される（配置は 03）。捕捉は verify の実行時に行われ、後から手で差し替える経路はない。生出力を保存することで、verdict の pass/fail だけでなく実際の実行結果が事後に確認できる。

### 4.4 Surfaces 照合

verify は捕捉した diff を spec の Surfaces（write / forbid の glob 宣言）と照合する。照合結果は次の 3 分類になる。

```text
Surfaces 照合:
- forbid glob に該当する変更   -> 機械 FAIL（verification が fail になる）
- write glob 内の変更         -> 想定内。何も列挙しない
- write glob 外・forbid 外の変更 -> off-surface として report の tool-owned 欄へ自動列挙
```

forbid 該当は機械 FAIL であり、run が禁止面に触れたことを verification 段階で確実に捕捉する。off-surface は禁止ではないが想定外の変更面であり、人間可視化のために report へ自動列挙される。multi-repo では diff snapshot と surface 照合を repo ごとに行う（repo 別処理の詳細は 05 / 03）。

---

## 5. handoff の機械合成規則

run の入力 handoff は AI が執筆せず、CLI が上流成果物から機械合成する。合成元と失敗時の挙動を定める。

### 5.1 合成元

handoff は次の上流成果物から決定論的に組み立てられる。

```text
handoff の合成元:
- spec の Requirements / Acceptance / Surfaces / Checks / 対象 Tasks
- charter の Risk Tiers / Non-Regression Focus / Stop Conditions
- 関連する decision の確定事項
- vision の該当 Boundaries 抜粋
- worker role card と許可コマンド表
- exit protocol（完了宣言の手段はなく、終端は accept / block / escalate のみ）
- multi-repo では対象 repo のレイアウト（repo 一覧・各 base commit・対象 glob）
```

合成元はすべて上流の authored payload と journal であり、AI が handoff に新たな内容を書き足す経路はない。

### 5.2 合成失敗 = 欠落列挙 + backtrack 誘導

必須フィールドの合成に失敗した場合、handoff は生成されず、run open は拒否される。合成失敗は次のいずれかで起きる。

```text
合成失敗の条件:
- 上流セクションの欠落
- 上流セクションが空
- 対象 artifact に blocking gap が open
```

合成に失敗すると、CLI はどのセクションが欠けているかを列挙して拒否し、backtrack request の生成を誘導する。上流不備の run は物理的に始まらず、推測で埋める主体が構造上存在しない。この「合成失敗 = backtrack の決定論的トリガー」が不変条件 3（推測補完の禁止）の執行形の一つである。合成成功が run open ガードの入力になるが、そのガードの成立条件は 05 に置く。

---

## 6. content-hash による鮮度判定

review record は対象 payload の content-hash を刻印し、鮮度を機械判定する。対象が編集されて hash が変われば、記録済みの review は stale になり、次の遷移で再 review が要求される（dirty 検出方式）。seal による凍結方式（編集のたびに再承認の連鎖が走る方式）は人間承認の形骸化を招くため採らない。

content-hash の計算原則は次である。

```text
content-hash の計算原則:
- frontmatter を除外した本文に対して計算する
  （id / refs の記述変更で hash が動かないようにする）
- 空白を正規化する（軽微な整形で stale 化しないようにする）
```

frontmatter 除外は、frontmatter が id と refs のみを持ち authored content ではないためである。空白正規化は、インデントや改行の軽微な整形が review を無効化しないためである。正規化が甘いと改変を見逃し、厳しいと stale 連鎖を招くため、正規化の具体仕様（対象とする空白の種類・改行コードの扱い等）は P1 実装時に確定する。本文書は「frontmatter 除外 + 空白正規化」の原則までを定め、詳細仕様は実装段階に委ねる。

刻印された content-hash は review.recorded event の payload.sha256 に記録される。遷移時に対象 payload の現在の hash と記録済み hash を照合し、一致すれば鮮度あり、不一致なら stale と判定する。この判定は content-hash の照合という決定論的操作であり、LLM の自己申告は評価しない。鮮度が遷移ガードの入力になるが、そのガードの成立条件は 05 に置く。

---

## 7. 終端 packet と gap 台帳

### 7.1 終端 packet の必須欄

run の終端は accept / block / escalate の 3 択であり、block と escalate は終端 packet を伴う。終端 packet は journal と上流成果物から機械合成される rendered packet であり、ノードではない。report コマンドが skeleton を生成し、AI が authored 欄を埋める。

escalation packet（run escalate の終端 packet）の必須欄は次である。

```text
escalation packet:
- 停止理由
- 選択肢（複数）
- 各選択肢の影響
- 放置した場合の影響
- 推奨
- 再開条件
- 関連証跡（evidence への参照）
```

backtrack request（run block の終端 packet）の必須欄は次である。

```text
backtrack request:
- blocked stage（どの段階で継続不能になったか）
- 欠落上流 ref（不足している上流成果物の参照）
- 継続不能理由（推測なしに続けられない理由）
- 推測継続時のリスク（そのまま埋めて進んだ場合の危険）
- 再開条件（上流がどう修正されれば再開できるか）
```

backtrack request は 5.2 の handoff 合成失敗からも誘導される。欠落上流 ref は合成失敗時に列挙された欠落セクションと対応する。

report（run / campaign の終端報告。completion / escalation / backtrack のいずれか 1 つ）は、tool-owned 欄と authored 欄を分離する。

```text
report の分離:
tool-owned（CLI が埋める）:
- source refs（対象 ref / source campaign / source run）
- verification 結果への参照
- review record への参照
- off-surface として自動列挙された変更面（4.4）
- gap への参照

authored（AI が書く）:
- scope summary
- completion assessment
- 軽微判断の記録
- 残リスク
- 人間が確認すべき点
```

completion report は実装内容・検証結果・review 結果・軽微判断・残リスク・関連証跡を持ち、planning 層への還流事項があれば gap を route 付きで起票する（旧設計の Planning Feedback Summary は gap 起票に一本化されている）。

### 7.2 gap 台帳の metadata / authored 分離

gap は未解決事項の台帳エントリであり、metadata（journal 側）と authored 本文を分離する。

```text
gap の metadata（tool-owned。journal 側）:
- kind:     needs-human-decision / needs-upstream-fix / needs-info / candidate
- route:    vision / spec / campaign / none（どの層へ戻すべきか）
- blocking: true / false
- source:   起票元（run / review / planner 等）
- 状態:     open / closed / routed / deferred

gap の authored 本文（人間と AI が書く）:
- 背景
- 選択肢
- 推奨
- routing 提案
```

metadata は journal の event（gap.opened / gap.closed 等）が正本であり、AI が authored 本文を書いても metadata と状態は動かない。gap の kind / route / blocking の意味と、close / routed / deferred の成立条件は 05 に置く。spec 本文中の未確定箇所は gap を参照する形（[UNRESOLVED: gNNN]）で記し、台帳に存在しない裸のマーカーは doctor が違反として検出する（検出仕様は本文書 9 章）。

---

## 8. 証跡の構造

kernel の証跡は、単一の横断索引に集約しない。旧設計の Evidence Bridge（相互参照網）は、journal の refs チェーンに置き換えられている。

```text
証跡のつながり:
- journal の refs が run -> task -> spec -> vision の参照チェーンを構成する
- evidence は verification（verify が生成する verdict）と review record（reviewer 判定）から成る
- commit.observed event が src/ 側 repo の base commit を run に紐付ける
```

横断索引を正本化すると、証跡全体を要約する巨大文書になり AI へ渡す context を肥大化させる。kernel は横断 view を CLI が journal から機械射影する形にし、view は正本ではなく再生成可能な導出とする。covers 射影（capability カバレッジの可視化）や status --plan の中期計画ビューも、journal の refs からの射影である（射影の詳細は 05 / 08）。

---

## 9. DEMM 証拠十分性の検査観点

DEMM（決定単位の証拠十分性）は、決定・遷移が「証拠が揃った上で成立したか」を事後に検証する観点である。doctor が journal に対して次を検査する。

```text
証拠十分性の検査観点:
- 参照整合:       journal event の refs が指す artifact が実在し、参照が閉じていること
- guard 再計算:   transitioned event の guard_results を同じ入力から再計算し、記録と一致すること
- evidence hash:  verification / review record の payload sha256 が対象成果物の
                  現在の content-hash と整合すること（改変後の証跡でないこと）
- 決定単位の充足: 各遷移について、その決定が依拠すべき evidence 参照
                  （verification / review record / decision）が揃っていること
- 裸マーカー検出: spec 本文の [UNRESOLVED: gNNN] が台帳に実在する gap を参照していること
```

これらはすべて決定論的な再計算・照合である。guard_results の再計算検証により、遷移が記録どおりのガード判定で通ったことが事後に確認でき、遷移 event の改竄や guard の実装ドリフトが検出できる。決定単位で evidence 参照が揃うことの検査により、証拠なしに成立した遷移が存在しないことを保証する。

上記観点は次の具体検査として実装される。severity は 3 不変条件の破れを error、鮮度切れ・順序観察を warn とする。

```text
実装される具体検査:
- evidence-hash 照合:  verify.recorded は verdict.json 実ファイルを再直列化 sha256 して payload と照合、
                      review.recorded は対象 authored 本文の現 content-hash と照合する。
                      不一致（stale）= warn、対象ファイル欠落 = error
- guard 再計算:        transitioned 直前の時点 snapshot を journal から再構成し
                      （当該 event より前の event のみ畳み込む）、snapshot だけで決まるガード
                      （blocking-gap / no-blocking-gap / verification）を再計算して記録値と照合する。
                      不一致 = error。鮮度依存ガード（review 系）は evidence-hash 側に委ね再計算しない
- 決定単位の充足:      遷移種別ごとに要求 evidence を照合する。run -> accepted は verification(pass)
                      （run gate=required なら加えて run gate の review record）、spec -> ready は
                      spec gate、campaign -> active/closed は launch/completion。欠落した成立遷移 = error。
                      decision.recorded の actor≠human = error
- ULID 時系列整合:     journal ファイル名 ULID と event.id の一致、ULID 昇順に対する ts 単調性。
                      逆転 = warn（git 履歴が一次証跡）
- evidence-file 突合:  journal event に対応しない孤立 verdict.json / review record = warn
- event schema 検査:   closed set / 必須欄 / payload 形の破れ = error
```

改竄検出とタイムラインの担保は、event 間の hash-chain を自作せず project-context repo の git 履歴に委譲する（物理形式は 03）。doctor の検査は git 履歴の上に、参照整合・guard 再計算・evidence hash・証拠十分性・裸マーカーの決定論的検査を重ねるものである。

---

## 10. 詳細仕様の参照先

本文書は schema と証跡の一次責任文書である。関連する詳細仕様は次に置く。

```text
- 02: 概念・根拠・境界（journal 正本化の思想 / 終端 3 択のコスト勾配 / gap 台帳の概念）
- 03: ディレクトリ構造 / journal の物理形式（1-event-1-file / ULID / git 委譲）/ evidence の配置
- 05: 状態遷移表 / 各遷移のガード成立条件 / gap の close・routed・deferred の成立条件 /
      裸マーカー検出の運用 / gate review 既定 / 射影の詳細
- 08: コマンド構文 / report skeleton 生成 / status の射影出力
- 12: reviewer が review record を返す責務 / fresh-context reviewer
```
