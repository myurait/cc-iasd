# 03. project-context アーキテクチャ

作成日: 2026-07-05  
状態: kernel 正本 v1.0（Phase 1 レビュー待ち）

---

## 1. この文書の位置づけ

本文書は、cc-iasd kernel が扱う project-context の物理構造を定める。ディレクトリツリー、各領域の役割、journal の物理形式、書き込み経路の管理、成果物 repo との境界、multi-repo 構成の登録と照合を対象とする。

概念・根拠は 02、状態遷移とガードは 05、event schema と evidence の詳細は 06、コマンド構文は 08 に置く。本文書はそれらの詳細を再掲せず、物理配置と領域境界に責務を限定する。

---

## 2. フラット構成の全景

project-context は、それ自体が git repo である。証跡の版管理をこの repo の git 履歴に委ね、成果物 repo（src/）は ignore する。

```text
project-context/               # それ自体が git repo（証跡の版管理。src/ は ignore）
  cc-iasd.yaml                 # 唯一の設定: runtime adapter / budgets / checks allowlist /
                               # decision policy / gate 要否 / 登録 repo
  journal/                     # append-only event store。1 event = 1 JSON file（ULID 名）
                               # CLI のみ書込。ライフサイクル状態の唯一の正本
  state.json                   # journal からの導出 snapshot（再生成可能。正本ではない）
  vision/
    v001-core.md               # 起点正本。必須セクションを持つ authored content
  specs/
    s001-<slug>/
      spec.md                  # spec 本文（必須セクション制）
      attachments/             # 任意（data model / contracts 等。スキーマ非強制）
  campaigns/
    c001-<slug>/
      charter.md               # campaign の authored 媒体
  runs/
    r-<ulid>-<slug>/
      handoff.md               # CLI が機械合成する実行入力（生成物）
      notes.md                 # worker の実装ノート（authored）
      report.md                # 終端 packet: completion / escalation / backtrack のいずれか 1 つ
  evidence/
    verifications/             # verify の verdict JSON + 生出力（stdout / stderr / diff.patch）
    reviews/                   # review record（対象 content-hash 刻印つき）
  decisions/
    d001-<slug>.md             # 人間決裁記録（decide のみが登録する）
  gaps/
    g001-<slug>.md             # gap 台帳の authored 本文（metadata は journal 側）
  roles/                       # planner / worker / reviewer の 3 role cards
  out/                         # compile 生成物（runtime bundle）。gitignore。非正本
  reference/                   # カーネル非管理の自由領域
  src/                         # 成果物 repo root（nested git）。CLI は読み取りと verify 実行のみ
```

旧設計の 6 分割トップレベル（runtime / rules / user / product / ops / reference）は廃止した。ライフサイクル状態を Markdown から追い出して journal に一本化した結果、状態を運ぶための階層が不要になり、authored content の種別（vision / spec / campaign / run / decision / gap）と証跡（evidence）と設定（cc-iasd.yaml）が同一階層に並ぶフラット構成に再編される。

この構成の要点は次である。

```text
1. Markdown は authored content 専用。frontmatter は id と refs のみで status 欄を持たない。
   人間はファイルを開けば内容を読める（ブラウザビリティの維持）
2. ライフサイクル状態・遷移・検証・決裁は journal の event が正本。state.json と status 出力は
   すべて導出であり、正本ではない
3. project-context 自体を git repo とし、CLI が遷移のたびに auto-commit する。改竄検出と
   タイムラインは自前の hash-chain を実装せず git に委譲する
4. out/ は再生成可能な非正本。runtime へ渡すものはすべてここに生成し、src/ にも $HOME にも書かない
```

---

## 3. 各領域の役割

### 3.1 journal（ライフサイクル状態の正本）

journal は append-only の event store であり、ライフサイクル状態・遷移・検証・決裁の唯一の正本である。CLI のみが書き込む。状態を変える行為は journal に event を追記する行為と同一化されており、journal を経由しない状態変更は存在しない。物理形式は 4 章で述べる。

### 3.2 state.json（導出 snapshot）

state.json は journal の全 event を時系列で畳み込んで得る導出 snapshot である。再生成可能であり、正本ではない。破損・欠落しても journal から再構築でき、status 出力もここではなく journal から導出される。

### 3.3 authored content 領域（vision / specs / campaigns / runs / decisions / gaps）

vision / specs / campaigns / runs / decisions / gaps は authored content の媒体である。それぞれのノードが持つ必須セクションと概念は 02、event schema は 06 に置く。ここでは配置のみを扱う。

```text
vision/     起点正本。v<NNN>-<slug>.md
specs/      s<NNN>-<slug>/ ディレクトリ。spec.md 本体 + 任意 attachments/
campaigns/  c<NNN>-<slug>/ ディレクトリ。authored 媒体は charter.md
runs/       r-<ulid>-<slug>/ ディレクトリ。handoff.md（生成物）/ notes.md（authored）/
            report.md（終端 packet）
decisions/  d<NNN>-<slug>.md。decide コマンドのみが登録する
gaps/       g<NNN>-<slug>.md。authored 本文のみを置き、metadata は journal 側に持つ
```

authored content 領域のファイルは、frontmatter に id と refs のみを持ち、status 欄を持たない。frontmatter の refs は作成・編集時の宣言入力であり、遷移時に CLI がパースして journal の refs（正規形）へ正規化して取り込む。正本は journal 側であり、doctor が frontmatter と journal 導出 refs の一致を検査する。

旧設計にあった outdated/ や archived/ へのファイル移動による退避規約は廃止した。正本性を失った artifact はファイルを動かさず、journal 上の retired 状態で表現する。したがって authored content 領域に退避用サブディレクトリは置かない。

### 3.4 evidence（証跡層）

evidence は verification と review record の証跡層である。

```text
evidence/
  verifications/   verify の verdict JSON + 生出力（stdout / stderr / diff.patch）
  reviews/         review record（対象の content-hash を刻印）
```

verification は verify コマンドの実行によってのみここに生成される。review record は gate ごとの reviewer 判定を記録し、対象の content-hash を刻印する。verify の出力捕捉先はこの evidence/ に固定され、src/ など管理領域外へは書かない。verification の生成規則・content-hash 鮮度・review record の必須欄は 06 に置く。

### 3.5 roles（role cards）

roles/ は planner / worker / reviewer の 3 role card を置く。role card 規約（行数上限・出力言語明示）とロール責務は 12 に置く。

### 3.6 cc-iasd.yaml（唯一の設定）

cc-iasd.yaml は唯一の設定ファイルである。runtime adapter、budgets、checks allowlist、decision policy、gate 要否、登録 repo を持つ。登録 repo の扱いは 7 章で述べる。各設定項目の意味と運用は 05 / 08 に置く。

---

## 4. journal の物理形式

### 4.1 1-event-1-file

journal は 1 event = 1 file とし、ファイル名を ULID とする JSON で表現する。単一 NDJSON への追記は並行 run と git ブランチ運用で必ず衝突するため採らない。1-event-1-file にすることで、追記は常に新規ファイル作成のみになり、並行書き込みも git merge も衝突しない。

順序は ULID で決まる。state.json 導出時には journal 内の全 event を ULID 順（時系列）で畳み込む。event の JSON 構造（closed set の type / guard_results / actor / refs 等のフィールド定義）は 06 に置く。

### 4.2 git 委譲による改竄検出

改竄耐性は event 間の hash-chain を自作せず、project-context repo の git 履歴で担保する。CLI が遷移のたびに auto-commit することで、event の追加・改変・削除はすべて git の履歴と差分に現れる。ローカル版の証跡台帳を自前で再実装せず、既存の git インフラに委ねる方針である。

doctor は「journal event の参照整合」「guard 判定結果の再計算一致」「evidence の sha256 一致」を検査する。doctor の検査観点の詳細は 06 に置く。

### 4.3 state.json は導出 snapshot（正本ではない）

state.json は 4.1 の畳み込み結果を保持する導出 snapshot であり、正本ではない。journal が正本であるため、state.json が破損・欠落しても journal から再生成できる。AI が state.json を編集しても、次の導出で journal の内容に上書きされるため状態は動かない。

---

## 5. write-path allowlist（書き込み経路の一元化）

不変条件 1（src/ 隔離）の物理的執行点は、CLI の全書き込みが単一の write-path モジュールを通ることである。この単一経路が、管理領域の allowlist に照らして書き込み先を判定し、allowlist 外への書き込みを例外で拒否する。

```text
管理領域（write-path allowlist の対象。CLI が所有し書き込む）:
  cc-iasd.yaml / journal/ / state.json / vision/ / specs/ / campaigns/ / runs/ /
  evidence/ / decisions/ / gaps/ / roles/ / out/

非管理領域:
  reference/  カーネルが管理しない自由領域（6.1）
  src/        成果物 repo。CLI は読み取りと verify 実行のみ（6.2）
```

verify の出力捕捉先は evidence/ に固定される。verification の生出力を src/ や reference/ に書くことはなく、管理領域外への書き込み経路が構造上開いていない。doctor は src/ 配下への管理物混入を deny-glob 検査で捕捉する。

write-path allowlist は「どのディレクトリに書けるか」を定める物理境界であり、「どの遷移で何が書かれるか」の遷移規則ではない。遷移ごとの書き込み内容とガードは 05、書き込まれる event の形状は 06 に置く。

---

## 6. 非正本領域と成果物境界

### 6.1 out/（非正本の compile 生成物）

out/ は compile 生成物（runtime bundle）を置く領域である。gitignore され、非正本であり、いつでも再生成できる。

```text
out/ の性質:
- runtime へ渡すもの（起動設定など）はすべてここに生成する
- src/ にも $HOME にも書かない
- gitignore 対象。git 履歴に含めない
- 削除しても compile で再生成できる。正本ではないため復元対象にしない
```

adapter が runtime を起動するための設定生成物はこの out/ 配下に置かれる。adapter の capability manifest や Tier 1 hook の詳細は 05 に置く。

### 6.2 reference/（カーネル非管理の自由領域）

reference/ は cc-iasd kernel が管理しない自由領域である。write-path allowlist の対象外であり、doctor の管理整合検査の対象にもならない。調査メモや外部資料など、正本性を持たない補助資料の置き場として利用者が自由に使える。kernel はこの領域の内容を状態機械の入力にしない。

### 6.3 src/（成果物 repo。読み取りと verify のみ）

src/ は成果物 repo の root である。project-context repo からは ignore され、nested git として独立に版管理される。

cc-iasd の src/ に対する関与は、読み取りと verify 実行に限られる。CLI は src/ の内容を handoff 合成のために読み、verify 時に Checks を子プロセス実行し、git diff を取得して Surfaces と照合する。src/ への書き込みは worker（実装 runtime）が行うものであり、CLI は src/ にファイルを作成・編集しない。

src/ 内の技術スタックは kernel が一律に規定しない。verify の照合規則・Surfaces の意味・diff snapshot の取得規則は 05 / 06 に置く。

---

## 7. multi-repo 構成

現実のプロダクトは infrastructure / frontend / backend など複数の構成要素で成り立つ。multi-repo な src/ は将来拡張ではなく v0 の前提要件であり、その物理構造と登録・照合の枠組みを本文書で定める。

### 7.1 repo 登録と nested git 検出

src/ 配下の各 repo は、project-context 直下の cc-iasd.yaml が持つ repo エントリに登録する。src/ の内側に管理ファイルは置かない（5 章の write-path allowlist と 6.3 節の境界に従う）。

```text
src/
  <repo-a>/        # nested git repo
  <repo-b>/        # nested git repo
```

doctor は、cc-iasd.yaml に登録された repo と src/ 配下の実際の nested git を突き合わせて検出・照合する。登録されているのに実体がない repo、実体があるのに未登録の repo は doctor が不整合として報告する。

### 7.2 Surfaces glob の repo プレフィックス

spec が宣言する Surfaces の write / forbid glob は、`src/<repo>/` プレフィックスを含む。run の対象 repo 集合は Surfaces から導出され、1 run = 1 repo に固定せず横断 run を許す。glob と対象 repo 集合の対応の詳細、および Surfaces と diff の照合規則は 06 に置く。

### 7.3 repo 別 base commit

run open は、対象 repo ごとに base commit を journal に記録する。run return / verify 時の diff snapshot 取得と Surfaces 照合は、この repo 別 base commit を基準に repo ごとに行う。Checks も check ごとに cwd（対象 repo）を持ち、repo ごとに実行される。

```text
repo 別処理の物理的な要点:
- base commit は repo ごとに journal へ記録する（run open 時）
- diff snapshot は repo ごとに取得し、repo ごとに Surfaces と照合する
- Checks は check ごとに cwd（repo）を持つ
```

base commit の記録・diff snapshot・照合を起こす遷移とガード、並列 run の排他規則（対象 repo が互いに素か同一 repo を共有するか、verify lock、worktree 隔離）は 05 に置く。本文書は repo が cc-iasd.yaml に登録され nested git として配置される物理構造までを扱う。
