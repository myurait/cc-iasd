# 12. cc-iasd ロール設計

作成日: 2026-07-05  
状態: kernel 正本 v1.0（Phase 1 レビュー待ち）

---

## 1. この文書の位置づけ

この文書は、kernel における LLM ロールと human の責務境界を定める。kernel は 3 不変条件を状態機械のガードで執行するため、進行順序・ゲート判定・証跡完全性検査はコードが担い、ロールには残らない。したがってロールに割り当てるのは、コードでは判定できない「LLM にしかできない判断」だけである。

ロールは planner / worker / reviewer の 3 種の role card と、著者かつ決裁者としての human から成る。旧設計の 10 ロール体系（Planning Lead / Execution Manager / Ideal Interviewer / Feature Scope Designer / Spec Designer / Design Reviewer / Worker / Code Quality Auditor / Devil's Advocate / Compliance Auditor）は、この 3 ロールへ統合または廃止される（3 章）。

kernel 全体の概念は 02、状態機械とゲートは 05、コマンドは 08 が一次責任を持つ。本文書は「どのロールが何を判断してよく、何を判断してはならないか」に限定する。

---

## 2. ロール設計の基本方針

### 2.1 判定権限のコード移管

旧設計では、規律の大半がロール文書への期待で担保されていた。順序を守ること、証拠なしに完了を宣言しないこと、ゲートを通すことは、いずれも Markdown に書かれた約束であり、破る経路が構造上開いていた。kernel はこれらの判定を状態機械のガードへ移管する。

```text
コードへ移管された判定（ロールには残さない）:
- 進行順序の強制:  charter の depends_on ガードと各遷移ガードが決定論的に強制する
- ゲート判定:      review record の有効性（hash 一致・鮮度・gate 種別）はカーネルが判定する
- 証跡完全性検査:  doctor が journal 整合・guard_results 再計算・src 汚染を検査する
- packet 中継:     handoff の機械合成・終端 packet の生成はコードが行う
```

この移管の結果、ロールに残るのは authored content の執筆（planner）、src の実装（worker）、gate ごとの妥当性判断（reviewer）という、コードで代替できない判断のみである。

### 2.2 ロールは責務境界であって人格ではない

role card は AI に雰囲気を与える persona ではなく、project-context 内での責務分離単位である。role card が定めるのは、判断してよい観点・判断してはならない観点・authority（can / cannot）である。手順や進行順序は書かない。順序はカーネルが強制するため、role card に手順を書くと二重管理になり、カーネルの遷移ガードと矛盾する余地を作る。

---

## 3. 3 role card + human

ゲート判定・進行順序・証跡完全性検査をカーネルへ移管した後に残る判断を、3 つの role card に割り当てる。

### 3.1 planner

```text
責務:
  vision / spec / charter の authored content を執筆する。
  人間との vision 対話もここが担う。

判断してよい観点:
  - 意図を vision / spec / charter の必須セクションへ構造化すること
  - gap の解消提案（背景・選択肢・推奨・routing）を書くこと
  - 未確定事項を gap として起票すること

判断してはならない観点（cannot）:
  - gap を close すること（close は decision または対象編集 + 再 review でのみ成立）
  - vision を approve すること（human の専権）
  - src/ を編集すること
  - 状態を進める遷移を自ら成立させること（遷移はガード通過でのみ起こる）

統合元:
  旧 Ideal Interviewer / Feature Scope Designer / Spec Designer /
  Planning Lead の執筆責務を統合。
```

### 3.2 worker

```text
責務:
  handoff を入力に src/ のみを編集し、notes と gap 起票で報告する。

判断してよい観点:
  - handoff の scope 内で src/ をどう実装するか
  - 実装の過程で得た知見を notes として残すこと
  - scope conflict や不明点を gap として起票すること

判断してはならない観点（cannot）:
  - src/ 外への書き込み（管理領域は write-path allowlist が拒否する）
  - handoff の scope を黙って拡大すること
  - 完了を宣言すること（完了を宣言するコマンドは可視性に存在しない。
    実装後に verify を要求し、終端は accept / block / escalate のみ）
  - review finding を自己承認すること
```

worker には完了宣言の手段が構造上ない。「テストは通った」と notes に書いても、verification 記録がなければ accept のガードで拒否される（検証の詳細は 06）。

### 3.3 reviewer

```text
責務:
  gate 種別（spec / launch / run / completion）ごとに fresh-context で起動され、
  review record を返す。

判断してよい観点:
  - 対象 artifact / diff / evidence が gate 種別の観点で妥当か
  - blocking finding と non-blocking finding の区別
  - verdict（pass / fail）とその根拠

判断してはならない観点（cannot）:
  - artifact 本文や src/ を直接修正すること
  - record の有効性（hash 一致・鮮度）を自ら決めること（カーネルが判定する）
  - gate 判定の成立条件を上書きすること（成立条件は 05）

統合元:
  旧 Design Reviewer / Code Quality Auditor / Devil's Advocate /
  Compliance Auditor を統合。launch gate = 旧 Design Launch Review、
  completion gate = 旧 Campaign Completion Review。
```

reviewer の verdict の中身は LLM 判断だが、その record が有効かどうか（対象の content-hash と一致するか、gate 種別が正しいか）はカーネルが機械判定する。reviewer は判断材料を返すだけで、遷移を成立させるのはガードである。fresh-context 起動の意味は 4 章に置く。

### 3.4 human

human は著者かつ決裁者であり、操作者ではない。

```text
専権（human のみが行える）:
  - vision approve:   vision を canon として承認する（decide 経由）
  - decide:           人間専権の判断を記録する。journal に actor=human が刻印される
  - campaign close:   completion report と completion review を読み、受け入れる

事前宣言による関与:
  infrastructure / cost / security / product value の判断は charter の
  Risk Tiers に事前宣言され、該当時は decision を経ずに進めない。
```

human の介入モデル（起点 / 呼ばれたとき / 節目 / 随時の 4 類型）と human-facing 操作の上限（inbox / decide / STOP）は 02 で思想を示し、詳細定義は 05 に置く。本文書は human が planner / worker / reviewer と並ぶロールとして、上記 3 点の専権を持つことのみを定める。

---

## 4. fresh-context reviewer

reviewer は gate 種別ごとに fresh-context で起動される。fresh-context とは、直前の planner / worker の文脈を引き継がず、対象 artifact と gate 種別に必要な最小 context のみを与えて起動することである。

```text
gate 種別ごとの起動:
- spec gate:        spec が ready へ遷移する前。spec の必須セクションと上流 vision を対象に判断
- launch gate:      campaign が launch する前。charter と coverage 対象 spec を対象に判断
- run gate:         run が accept される前。diff と verification 結果を対象に判断
- completion gate:  campaign が close する前。completion report と全 run 結果を対象に判断
```

fresh-context で起動する理由は、実装者や執筆者の思考過程に引きずられずに独立した判断を得るためである。同一の LLM セッションが執筆と review を兼ねると、自らの成果物への確証バイアスが review に混入する。gate ごとに context を切ることで、この混入を構造的に断つ。

review record の有効性判定はカーネル側にある。reviewer が返す record が現在の対象 content-hash と一致するか（対象が review 後に編集されていないか）、gate 種別が遷移に対応するかは、遷移ガードが機械判定する。reviewer は verdict を返すところまでを担い、その record が遷移を成立させるかはカーネルが決める（成立条件は 05）。

各 gate の起動タイミングと標準フロー上の位置は 6 章に置く。

---

## 5. role card 規約

role card は planner / worker / reviewer の 3 枚であり、次の規約に従う。

```text
規約:
- 各 role card は 50 行以内とする
- 出力言語を明示する（reviewer の review record を日本語で書くか英語で書くか等を
  card 内で確定させる）
- 手順・進行順序を書かない。順序はカーネルが遷移ガードで強制するため、
  role card に手順を書くと二重管理になり矛盾の余地を作る
- 判断してよい観点と判断してはならない観点（can / cannot）のみを書く
- 全プロジェクト履歴・全 spec 全文・他ロールの詳細責務を書かない
  （必要な context は起動時に与えられる）
```

role card に手順を書かないことは、判定権限のコード移管（2.1）の帰結である。「どの順序で何をするか」はカーネルが決めるため、role card は「与えられた入力に対して何を判断してよいか」だけを規定する。role card の配置場所と compile 生成物（out/）の扱いは 03 に置く。

---

## 6. 標準フローにおけるロールの位置

3 ロール + kernel の標準フローにおける各ロールの起動位置は次である。手順の主体はカーネルであり、ロールは各段で判断材料を返す。

```text
planner 起草        -> planner が vision / spec / charter を執筆する
gate review (spec)  -> reviewer が spec を fresh-context で review し record を返す
campaign launch     -> reviewer が launch gate を review。カーネルが launch ガードを判定
run open / handoff  -> カーネルが handoff を機械合成し worker へ渡す
worker 実装          -> worker が src/ を編集し notes / gap で報告する
run return / verify -> カーネルが diff snapshot を実測し Checks を実行する
reviewer record     -> reviewer が run gate を review し record を返す
accept / block /    -> カーネルが終端ガードを判定する。block / escalate は
  escalate             backtrack request / escalation packet を生成
decide              -> human が escalation / gap に対し decide で答える
campaign close      -> reviewer が completion gate を review。human が close で受け入れる
```

この流れで、ロールが状態を進めた箇所は一つもない。planner は執筆し、worker は実装し、reviewer は判断材料を返すだけであり、すべての前進はガードを通過した遷移である。標準フローの図は docs/development/standard_flow_overview.mmd に置く（各遷移の成立条件は 05）。

---

## 7. entry point ロール廃止と nested subagent 問題の消滅

旧設計は Planning Lead（planning entry point）と Execution Manager（execution entry point）を並立させ、両者が specialist role を起動する構成だった。両 entry point の実質は順序の強制・packet の中継・ゲート判定であり、いずれもカーネルへ移管済みである（2.1）。したがって entry point ロールは廃止する。

entry point ロールの廃止は、旧設計が抱えていた nested subagent 問題を消滅させる。旧設計では、AI runtime が nested subagent を起動できない制約から、Planning Lead から Execution Manager を起動し、その Execution Manager がさらに Worker や Auditor を起動する構成が成立しなかった。この制約は orchestrator が存在することから生じていた。kernel には orchestrator ロールが存在せず、進行はカーネルの遷移が駆動するため、「ロールが別のロールを起動する」という構造そのものが無い。planner / worker / reviewer は各段でカーネルに呼ばれて判断を返すだけであり、ロール間の起動関係は定義されない。

---

## 8. 詳細仕様の参照先

本文書はロールの責務境界に限定する。関連する詳細仕様は各文書に委ねる。

```text
- 02: 3 ロール + human の概念的位置づけ / 人間介入モデルの思想と 4 類型の概要
- 05: gate 判定の成立条件 / 人間介入 4 類型の詳細定義 / decide 機構 / gate review 既定
- 06: review record の schema / verification 生成規則 / content-hash 鮮度
- 08: コマンド一覧 / human-facing 上限の仕様
- 03: role card の配置場所と compile 生成物（out/）の扱い
```
