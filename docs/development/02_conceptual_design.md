# 02. cc-iasd 概念設計

作成日: 2026-07-05  
状態: kernel 正本 v1.0（1-A レビュー待ち）

---

## 1. cc-iasd kernel の概念的位置づけ

cc-iasd は、3 つの不変条件を「約束」ではなく「構造」で守る決定論的状態機械カーネルである。

```text
不変条件:
1. src/ 隔離を絶対制約とする
2. 証跡管理主義
3. 推測補完の禁止 -> 構造化された上流差し戻し
```

これらの不変条件は、従来はロール文書に書かれた期待で担保されていた。Worker が推測しないこと、証拠なしに完了を宣言しないこと、状態を勝手に書き換えないこと。いずれも Markdown に書かれた約束であり、破る経路が構造上開いていた。

kernel は、この 3 不変条件を LLM の遵守に依存せず、CLI のコードと状態機械のガードで執行する。ライフサイクル状態は append-only journal のみが持ち、完了へ至る経路は CLI 自身が実行した検証の成立のみであり、推測で埋める主体が構造上存在しない。

cc-iasd は実装ループを実行する runtime の代替にはならない。task の実装は Claude Code / Codex などの実行 runtime へ委譲する。cc-iasd が担うのは、意図を自走可能な作業単位へ変換する経路の厳密性と、その経路上のすべての前進を型付き遷移として記録する証跡構造である。

### 1.1 想定対象

本システムの想定対象は、infrastructure / frontend / backend など複数の構成要素から成る数十人月規模のプロダクトで、人間のエンジニアが AI へ作業委任を最大化するための開発文脈管理である。単一 repo・小規模デモの運用を設計の既定にしない。したがって multi-repo な src/ と並列 run は将来拡張ではなく v0 の前提要件である（8.4 節）。

---

## 2. 中核主張

kernel の中核主張は、不変条件を守る構造を状態機械の内部に埋め込むことである。不変条件と構造の対応は次である。

```text
journal 正本化:
  ライフサイクル状態の正本は append-only journal のみ。
  Markdown から status 欄を廃止し、AI が状態を書き換える経路を物理的に消す

verification は CLI 実行のみ:
  完了へ至る経路は「CLI 自身が検証を実行して生成した verification の成立」のみ。
  LLM の完了報告文は guard の入力にならない

handoff 機械合成:
  run の入力（handoff）は AI が執筆せず、CLI が上流成果物から機械合成する。
  合成に失敗した場合は欠落箇所を明示して拒否する。推測で埋める主体が存在しない

終端 3 択のコスト勾配:
  run の終端は accept / block（backtrack）/ escalate の 3 択のみ。
  block が最も安価な合法出口になるコスト勾配を作る

decide の actor=human 刻印:
  人間決裁は decide コマンドのみが記録でき、journal に actor=human が刻印される
```

不変条件と構造の対応を整理すると次である。

```text
不変条件 1（src/ 隔離）:
  CLI の全書き込みが単一 write-path モジュールを通り、管理領域の allowlist 外への
  書き込みを拒否する。run 単位で surface（write / forbid glob）を宣言し、verify が
  base commit からの git diff を照合して逸脱を機械検出する

不変条件 2（証跡管理主義）:
  状態を変える行為を journal に event を追記する行為と同一化する。journal を経由
  しない状態変更は存在せず、silent overwrite は構造的に不可能。verification は CLI が
  実行した場合にのみ生成され、遷移 event には guard 判定結果が焼き込まれる

不変条件 3（推測補完の禁止）:
  blocking gap が open の artifact を入力とする下流遷移はコードレベルで全拒否される。
  handoff の機械合成失敗は backtrack request の決定論的トリガーになる。終端 3 択の
  強制により、完了を偽装するより差し戻す方が構造的に安い
```

詳細な遷移ガード表・停止条件・gate 既定は 05、event schema・evidence 詳細は 06 に置く。本文書は概念・根拠・境界を示し、詳細仕様は各文書へ委ねる。

---

## 3. ノードモデル

kernel が扱うノードは 6 種、それに evidence と 2 種の rendered packet が加わる。

```text
6 ノード:
- vision:    起点正本。何を作り何を作らないかの canon
- spec:      開発対象の仕様単位
- campaign:  複数 run を束ねる上位実行計画
- run:       AI 自走の実行 transaction 単位
- decision:  人間決裁の記録
- gap:       未解決事項の台帳エントリ

evidence:
- verification / review record の証跡層

rendered packet（journal 由来の生成物。ノードではない）:
- escalation packet:  非同期意思決定のために停止時に残す構造化文書
- backtrack request:  推測補完を拒否して上流へ差し戻す構造化文書
```

各ノードの概念定義は次である。

```text
vision:
  product 正本の起点。Target Experience / Non-Goals / Boundaries / Capabilities /
  Human Decision Points を持つ。Capabilities は提供すべき機能能力の構造化チェックリスト
  であり、coverage 追跡の基準になる（7.2 節）

spec:
  開発対象の仕様単位。Requirements / Acceptance / Surfaces / Checks / Tasks を持つ。
  Surfaces と Checks は検証の構造化宣言であり、verification の入力になる（6 章）。
  tasks は実装 runtime に委譲可能な作業単位で、spec / plan から導出され review の単位にもなる

campaign:
  複数 run を束ねる実行計画 envelope。authored 媒体を charter と呼ぶ（配置は 03）。
  UX Outcome / Coverage / Depends On /
  Stop Conditions / Risk Tiers / Non-Regression Focus / Cross-Checks を持つ。
  巨大な実行単位ではなく、複数 run を通じてユーザー体験や機能まとまりが成立するかを
  制御する上位境界である。実行状態・handoff・局所知識は run に置く

run:
  AI 自走の実行単位。spec / task / campaign を bounded scope として入力にし、
  handoff を runtime へ渡し、終端 packet で報告する。禁止領域を過度に列挙するのではなく、
  Surfaces（想定変更面・禁止面）と Checks（検証条件）で自走境界を表現する

decision:
  人間決裁の記録。decide コマンドのみが登録でき、journal に actor=human が刻印される。
  infrastructure / cost / security / product value など人間専権の判断がここに集約される

gap:
  未解決事項の台帳エントリ。needs-human-decision / needs-upstream-fix / needs-info /
  candidate の 4 種を単一台帳で管理する（4 章）
```

evidence は、作業・判断・レビューの追跡材料であり、全情報の複製ではなく参照でつながる証跡である。verification（CLI が検証を実行して生成する verdict）と review record（gate ごとの reviewer 判定）から成る。

escalation packet は、AI が判断できない事項を人間へ戻す構造化文書であり、単なる質問ではなく判断に必要な背景・選択肢・各選択肢の影響・放置した場合の影響・推奨・再開条件を含む。backtrack request は、上流成果物の不足により下流作業を続けられないときに推測補完を拒否して差し戻す構造化文書である。両者はノードではなく、journal と上流成果物から機械合成される rendered packet である。

---

## 4. journal 正本化と gap 台帳

### 4.1 journal と Markdown の役割分担

kernel は、ライフサイクル状態と authored content を明確に分離する。

```text
journal（tool-owned。CLI のみが書く）:
  ライフサイクル状態・遷移・検証・決裁の正本。append-only の event store であり、
  状態を変える唯一の経路。state 導出はここから畳み込む

Markdown（authored payload。人間と AI が書く）:
  vision / spec / charter / notes / gap 本文などの authored content の媒体。
  frontmatter は id と refs のみを持ち、status 欄を持たない。
  人間はファイルを開けば内容を読める（ブラウザビリティの維持）
```

この分離により、AI が Markdown を編集しても状態は動かない。状態を進めるのは常にガードを通過した遷移 event であり、Markdown の直接編集は次の遷移時に再 review を要求する dirty 検出方式で安全に扱われる（詳細は 05）。

journal を git repo として版管理し、遷移のたびに auto-commit することで、改竄検出とタイムラインは自前の hash-chain を実装せず git に委譲する。journal の物理形式（1-event-1-file / ULID 名 / 並行書き込みの衝突回避）とディレクトリ構造は 03、event schema（closed set / guard_results / actor）は 06 に置く。

### 4.2 gap 台帳による未解決事項の一元管理

未解決事項は単一の gap 台帳に集約する。旧設計で分散していた open item / planning feedback / TBD マーカー / 差し戻し起点の 4 概念は、gap に統合済みである。

```text
gap の属性:
- kind:     needs-human-decision / needs-upstream-fix / needs-info / candidate
- route:    vision / spec / campaign / none（どの層へ戻すべきか）
- blocking: true / false
- 本文（authored）: 背景 / 選択肢 / 推奨 / routing 提案
```

規約は 1 本に集約される。未確定事項は gap として登録し、本文中の未確定箇所は gap を参照する形で記す。blocking gap が open の間、その artifact を入力とする下流遷移は全拒否される。gap の close は decision へのリンク、または対象 artifact の編集と再 review でのみ成立する。route=vision の gap 一覧が、中期計画在庫（campaign 未満・vision 超過の粒度のアイデア）の受け皿になる。旧設計の planning feedback（実行結果を計画層へ還流する）は、run の終端 packet が gap を起票し route で戻し先を指定する形に一本化されている。

gap 台帳の詳細な規約と裸マーカーの検出仕様は 05 / 06 に置く。

---

## 5. 検証と終端

### 5.1 検証の概念

検証は 2 系統から成る。一方は verification（Checks の CLI 実行と Surfaces の照合）、他方は review record（gate ごとの reviewer 判定）である。

```text
Checks の CLI 実行:
  spec が構造化欄で宣言した Checks（検証コマンドと期待 exit code）を、CLI 自身が
  子プロセスとして実行し、exit code を期待値と照合する。生出力を evidence に捕捉する。
  worker が「テストは通った」と書いても、verification 記録がなければ accept は拒否される

Surfaces 照合:
  base commit からの git diff を spec の Surfaces（write / forbid glob）と照合する。
  forbid 該当の変更は機械 FAIL、write glob 外の変更は off-surface として自動列挙する
```

verification は verify コマンドの実行によってのみ生成される。証拠を「読む義務」ではなく「CLI が作る構造」であり、完了偽装の経路がコード上存在しない。Checks は任意コマンドであるため信頼境界になり、allowlist に適合しない Checks を含む spec は ready ガードで decision 承認を要求する。verification の生成規則・照合の詳細は 06、gate review の既定は 05 に置く。

### 5.2 終端 3 択とコスト勾配

run は accept / block / escalate 以外で終端できない。

```text
accept:   verification pass + review record + blocking gap 0 が必要（最も高価）
block:    backtrack request を生成して blocked へ（欠落 ref 指定で成立。最も安価）
escalate: escalation packet を生成して escalated へ（decision 待ち）
```

推測で埋めて完了を装うことが最も高くつき、差し戻すことが最も安い、というコスト勾配を状態機械が作る。これが不変条件 3 の執行形である。同一検証の連続失敗や却下が閾値に達すると accept が封鎖され escalate のみ許可される。停止条件（no-progress / budget / STOP ファイル）は run の open / verify ガードに組み込まれる。停止条件の語彙・reject 階梯・状態遷移表は 05 に置く。

事前に検証コマンドを宣言できない調査・探索作業のために、spike 型 run を最初から定義する。逃げ道がないと弱い Checks が乱造され Default-FAIL が骨抜きになるためである。spike run は src/ を変更せず、成果物の存在チェックを最低要件とし、report 提出による close で終端する。

---

## 6. handoff 機械合成と runtime 委譲

### 6.1 handoff の機械合成

src/ 隔離の最大の代償は、runtime が context を自然に読めないことである。kernel はこれを handoff の機械合成で解く。

run open は AI に handoff を書かせず、CLI が上流成果物から決定論的に組み立てる。

```text
handoff の合成元:
- spec の Requirements / Acceptance / Surfaces / Checks / 対象 Tasks
- charter の Risk Tiers / Non-Regression Focus / Stop Conditions
- 関連する decision の確定事項
- vision の該当 Boundaries 抜粋
- worker role card と許可コマンド表
- exit protocol（完了宣言の手段はなく、終端は accept / block / escalate のみ）
```

必須フィールドの合成に失敗した場合（上流セクションの欠落・空・blocking gap あり）、run open はどのセクションが欠けているかを列挙して拒否し、backtrack request の生成を誘導する。上流不備の run は物理的に始まらず、推測で埋める主体が存在しない。handoff の合成規則の詳細は 06 に置く。

### 6.2 Tier 0 / Tier 1 の二層 enforcement

runtime 非依存を守るため、enforcement を二層で定義する。概念的な要点は「Tier 0 のみで 3 不変条件が閉じる」ことである。

```text
Tier 0（全 runtime 共通。不変条件はこの層だけで閉じる）:
- handoff の stdout 配布（CLI が生成した handoff を runtime へ渡す正本経路）
- CLI ガード（全遷移）
- run return 時の git diff snapshot（自己申告ではなく実測）
- run verify の CLI 実行
- doctor の src/ 汚染検査・journal 整合検査

Tier 1（hook 対応 runtime 向けの optional 加速層。失敗を早めるだけ）:
- adapter が起動設定を生成し、runtime をその設定で起動する（src/ にも $HOME にも書かない）
- context packet 注入・src/ 外書込 deny・journal 自動追記・終端未成立の session 終了ブロック
```

Tier 1 の hook は特定 runtime の API に依存するため、enforcement の本体には決してしない（ロックイン回避）。Tier 1 が使えない runtime でも、Tier 0 の CLI ガードと git 監査だけで 3 不変条件が成立する。Bash 経由の src/ 外書込のように Tier 1 でも完全阻止できない経路は、Tier 0 の git 監査（return / verify / doctor）で事後捕捉する defense in depth とする。adapter の capability manifest と session lifecycle の詳細は 03 / 05 に置く。

---

## 7. 順序と coverage の決定論化

旧設計の feature / roadmap は独立 artifact として廃止した。両者が担っていた実質は、実現順序の宣言と coverage 追跡（想定機能を漏らさない）である。これを artifact ではなく、決定論ガードと射影として再実装する。

### 7.1 補強 1: charter depends_on による順序の決定論化

```text
補強 1（順序宣言 -> depends_on ガード）:
  charter は depends_on: [campaign-ref] を宣言できる。campaign launch ガードは
  依存 campaign がすべて closed であることを検査する。複数 campaign にまたがる実現
  順序は、散文の roadmap ではなくこのガードが強制する
```

### 7.2 補強 2: vision Capabilities + covers 射影による coverage の決定論化

```text
補強 2（coverage 追跡 -> Capabilities + covers 射影）:
  vision の Capabilities は提供すべき機能能力の構造化チェックリストとする。
  spec / campaign は covers ref で capability を参照し、status と doctor が
  「どの capability がどの spec / campaign にカバーされ、どれが未カバーか」を
  journal の refs から機械射影する。「想定機能を漏らさない」は散文の点検ではなく
  射影の空欄として可視化される
```

中期計画在庫は gap 台帳（route=vision, kind=candidate）が受け皿になる。順序ガードと射影の詳細仕様は 05 に置く。

---

## 8. ロールと人間の介入

### 8.1 3 ロール + human

ゲート判定・進行順序・証跡完全性検査をカーネルのコードへ移管した後に残る、LLM にしかできない判断だけをロールにする。判定権限のコード移管がロール設計の基本方針である。

```text
planner:
  vision / spec / charter の authored content を執筆する。gap の解消提案は書けるが
  close はできない。人間との vision 対話もここが担う

worker:
  handoff を入力に src/ のみを編集し、notes と gap 起票で報告する。
  完了を宣言するコマンドは可視性に存在しない

reviewer:
  gate 種別（spec / launch / run / completion）ごとに fresh-context で起動され、
  review record を返す。verdict の中身は LLM 判断だが、record の有効性（hash 一致・
  鮮度）はカーネルが判定する

human:
  vision approve / decide / campaign close の専権。infrastructure / cost /
  security / product value の判断は charter の Risk Tiers に事前宣言され、
  該当時は decision を経ずに進めない
```

旧設計の Planning Lead / Execution Manager という entry point ロールは廃止した。両者の実質は順序の強制・packet の中継・ゲート判定であり、すべて状態機械が決定論的に代替する。entry point 並立問題（nested subagent 制約）は、orchestrator ロールの廃止によって問題ごと消滅する。ロールの詳細（role card 規約・出力言語明示・fresh-context reviewer）は 12 に置く。

### 8.2 人間の介入モデル

人間の役割は「著者と決裁者」であり「操作者」ではない。run open / return / verify / accept / review record などの進行操作は agent が実行するものであり、人間がコマンド体系を学習しなければ回らない状態は設計バグとして扱う。

介入は 4 類型である（概要のみ。各類型の詳細定義は 05 に置く）。

```text
起点（稀）:           vision を執筆し、decide で承認する
呼ばれたとき:         escalation packet / blocking gap の発生時、自走は停止して待つ。
（非同期決裁）        人間は都合のよいタイミングで packet を読み、decide で答える
節目（campaign ごと）: completion report と completion review を読み、campaign close で受け入れる
随時（任意）:         inbox で覗く / Markdown を直接編集する / STOP ファイルで止める /
                     gap や adhoc run を起票する
```

人間が覚える定常動線は 1 文に収束する。気になったら inbox、答えるは decide、止めるは STOP、直すは Markdown。人間 facing の操作は inbox / decide / STOP に上限を置き、これを超える人間必須操作の追加は設計バグとして扱う（上限の仕様は 08 に置く）。

decide は既定で TTY を要求して journal に actor=human を刻印し、非常駐人間向けには decision ファイルを配置して取り込む非同期経路を v0 から用意する。この機構が防ぐのは善意のドリフト（agent が流れで自己承認してしまうこと）であり、敵対的 runtime を仮定する統制はカーネルの責務外である。decide の機構と threat model の詳細は 05 に置く。

---

## 9. 語彙

kernel の artifact 語彙は、先行事例への準拠と差別化概念の保持を分けて構成する。

```text
de facto 準拠語彙（先行事例で収斂しており、それに合わせる）:
- vision（旧 ideal から改称）/ spec / tasks / run / evidence

差別化語彙（対応する確立語彙がなく、独自語彙として保持し対外発信する）:
- campaign / escalation packet / backtrack request
```

準拠語彙は、product management の慣用語に寄せることで利用者と実行 runtime（LLM）双方の理解コストを下げる。LLM は学習済みの一般語彙に強い事前知識を持つため、語彙の選択はプロンプト効率にも影響する。差別化語彙は cc-iasd 固有の意味構造を持つため独自語彙を維持し、対応表で先行語彙との関係を説明する。

一般名詞としての「理想」は文脈に応じて使ってよいが、artifact 語彙としての ideal は使わず vision を用いる。旧設計の feature / roadmap / open item / planning feedback / milestone / cycle は現行概念として使わない。順序は charter の depends_on、coverage は vision の Capabilities + covers 射影、未解決は gap 台帳に置換済みである。旧設計への言及が必要な場合のみ「旧設計では」と明示して最小限にとどめる。先行事例との語彙対応表は 07 に置く。

---

## 10. multi-repo と並列 run の位置づけ

現実のプロダクトは infrastructure / frontend / backend など複数の構成要素で成り立つ。したがって multi-repo な src/ と並列 run は将来拡張ではなく、v0 の前提要件である（1.1 節）。

```text
multi-repo:
  src/ 配下に複数の repo を登録し、Surfaces の glob は repo プレフィックスを含む。
  1 run = 1 repo に固定せず横断 run を許す。base commit 記録・diff snapshot・
  surface 照合は repo ごとに行う

並列 run:
  journal が並行 append で衝突しない構造のため、複数 run を同時に走らせられる。
  task の二重取りは run open 時の claim event で機械的に排他し、並列可否は
  決定論ガードで判定する（対象 repo が互いに素か同一 repo を共有するかで扱いが
  分かれる。成立条件の詳細は 05）
```

kernel は、この multi-repo・並列前提を単一 repo 運用の後付けオプションとしてではなく、状態機械のガードと journal 構造そのものに織り込む。並列 run の排他規則・verify lock・repo 別処理の詳細仕様は 05 / 03 に置く。

---

## 11. 詳細仕様の参照先

本文書は概念・根拠・境界を示す。詳細仕様は各文書に委ねる。

```text
- 03: ディレクトリ構造 / journal の物理形式 / write-path allowlist / out 非正本 / multi-repo 構成
- 05: 状態遷移表 / 遷移ガード / 停止条件 / reject 階梯 / gate review 既定 / 並列 run 排他規則
- 06: event schema / verification 生成規則 / content-hash 鮮度 / escalation packet・backtrack request の必須欄 / 証拠十分性検査
- 08: コマンド一覧 / 対象者 3 分類と human-facing 上限 / guard 拒否メッセージ / 導入フロー
- 12: ロール詳細 / role card 規約 / 判定権限のコード移管 / fresh-context reviewer
```
