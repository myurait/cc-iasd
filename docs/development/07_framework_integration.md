# 07. 既存フレームワーク統合方針

作成日: 2026-07-05  
状態: kernel 正本 v1.0（Phase 1 レビュー待ち）

---

## 1. この文書の位置づけ

cc-iasd は、既存の AI 開発フレームワークを丸ごと再実装するものではない。既存事例を参照元または準拠先として選択的に取り込み、正本が領域ごとに一つになるよう統合する。

本文書は、どの先行事例から何を参照し何を採らないか、および kernel の語彙が先行事例のどの語彙に対応するかを定める。cc-iasd 自身の設計（不変条件・状態機械・ノードモデル）は 02 が、詳細仕様は各文書が扱う。ここでは外部との関係づけと語彙対応表に責務を限定する。

kernel は 3 つの不変条件（src/ 隔離 / 証跡管理主義 / 推測補完の禁止）を構造で守る決定論的状態機械であり、詳細は 02 を参照する。統合方針はこの kernel 構造を前提とする。

---

## 2. 統合原則

```text
統合原則:
- 既存フレームワークを丸ごと重ねない
- 正本は領域ごとに一つにする（journal がライフサイクル状態の唯一の正本）
- 収斂した先行語彙は de facto 準拠として合わせ、差別化概念のみ独自語彙を保持する
- cc-iasd は先行事例が空けている領域だけを固有機能として提供する
- src/ 配下へ cc-iasd 管理 artifact を持ち込まない
```

先行事例のどれもが持たない cc-iasd の空白地帯は、src/ 隔離を伴う反転構造、escalation packet / backtrack request の形式化、および campaign を含む上流から run・evidence までの一気通貫チェーンである（rework/01 8 章の調査による）。統合はこの空白を埋める kernel を中心に置き、既存事例はその周辺に配置する。

---

## 3. artifact vocabulary 互換への後退

cc-iasd は Spec Kit を spec 駆動開発の主要な語彙参照元とする。ただし互換の深さは「artifact vocabulary 互換」に限定する。

```text
Spec Kit から参照するもの（採る）:
- spec / plan / tasks の語彙
- specification-first workflow の思想（仕様が先、実装が後）
- 曖昧箇所を構造化マーカーで明示する発想（[NEEDS CLARIFICATION] に相当する未確定の可視化）

Spec Kit から採らないもの:
- ファイル構成（specs/<feature>/ 配下の spec.md / plan.md / research.md /
  data-model.md / contracts/ / tasks.md の 6 ファイル束）
- 実装対象 repository 内配置（.specify/ / specs/ を src 側に置く前提）
- Git branch からの active feature 検出
- constitution / quickstart などの周辺 artifact 生成
```

Spec Kit tooling は通常、実装対象 repository 側に `.specify/` や `specs/` を作り、Git branch から active feature を判定する。この前提は src/ 隔離という cc-iasd の絶対制約と衝突する。kernel は spec を project-context 側の `specs/s001-<slug>/` に置き、本文は単一の spec.md（Requirements / Acceptance / Surfaces / Checks / Tasks の必須セクション）とし、任意の補足を attachments/ に置く（配置の詳細は 03）。6 ファイル束は採らない。

この後退により、Spec Kit のファイルライフサイクル（command と template が複数ファイルを連鎖生成する仕組み）の再現義務が消える。cc-iasd が互換対象とするのは語彙とセクション構成であり、ファイルの物理レイアウトや生成手順ではない。互換課題として旧設計が抱えていた artifact location / branch-based active spec / constitution ownership / plan.md の語義衝突 / quickstart の不要性 / source tree vocabulary / generated command lifecycle の 7 課題は、この後退でおおむね解消される。残る課題は source tree vocabulary の語義差のみである。

Spec Kit の plan template における `src/` は repository root 内の source code directory を指すが、cc-iasd の src/ は成果物 project container を指す。この語義差だけは互換後退では消えないため、spec 本文と handoff では source target を `src/<repo-id>/` として明示し、Spec Kit 標準の source tree 例をそのまま持ち込まない（multi-repo 構成の詳細は 03）。

---

## 4. 参照元と採否

kernel の各機構は、先行事例の対応機構を参照点として設計されている。ここでは主要な参照元ごとに、何を参照し何を採らないかを 1 段落で示す。詳細な調査は rework/01 にあり、本節は事実の要約に留める。

### 4.1 Anthropic long-running harness（停止条件と Default-FAIL の参照元）

Anthropic の long-running agent 向け harness（Initializer + Coding の 2 部構成）は、Default-FAIL 契約（証拠を Read しない限り test-results を pass に書き換えられない）、fresh-context evaluator（Write 権限のない別サブエージェントが diff と証拠を独立検証する）、および停止条件（全 feature pass / 変化なしサイクル / 予算枯渇 / STOP ファイル）を持つ。kernel は verification を CLI 実行のみで生成する Default-FAIL の構造化（06）、fresh-context reviewer（12）、no-progress / budget / STOP ファイルによる停止（05）をここから採る。採らないのは、この harness が人間への escalation を設計しない点であり、cc-iasd は escalation packet で人間 <- AI 方向の構造化差し戻しを持つ点で分岐する。

### 4.2 Kosli（evidence 語彙の収斂先）

Kosli は AI 支援デリバリーのガバナンスインフラであり、policy-as-code とエビデンスチェーン、エージェントがプログラム的に承認を要求し証拠を添付できる API を持つ。cc-iasd は evidence という語彙をこの収斂側に合わせる（rework/03 V7）。採らないのは、Kosli が CI/CD・デリバリー統制レイヤーで動く点である。cc-iasd の evidence は project-context 内の journal と参照チェーンで完結し、暗号学的チェーンは自作せず project-context repo の git 履歴に委譲する（journal の版管理は 03）。

### 4.3 DEMM（決定単位の証拠十分性）

Decision Evidence Maturity Model（DEMM）は、「エビデンスデータがあること」と「意思決定を監査できること」の混同（container fallacy）を指摘し、決定単位での証拠十分性を評価する成熟度モデルである。cc-iasd はこれを evidence 検査の評価軸として参照し、doctor の証拠十分性検査の観点に取り込む（検査の詳細は 06）。採らないのは 5 段階の成熟度尺度そのものではなく、「証拠が存在することと決定を監査できることは別」という判断単位の観点である。

### 4.4 GSD / cc-sdd / CCPM / BMAD（rework/01 で高重複だった先行）

これら 4 つは rework/01 の調査で cc-iasd との重複度が高いと評価された先行である。GSD は vision から plan までの成果物チェーンと検証付き自律実行ループ、状態のファイル外部化を持つ。cc-sdd は承認済み spec の長時間自律実装、タスクごとの新規 implementer と独立 reviewer、2 回却下での root-cause 切替、中断後再開を持つ。CCPM は PRD から commit までの完全トレーサビリティと git worktree 並列実行を持つ。BMAD は Markdown ロール定義と文書チェーン、story ハンドオフ、軌道修正ワークフローを持つ。cc-iasd はこれらから成果物チェーン・独立検証・却下階梯・トレーサビリティ・ロール定義形式という発想を共有するが、いずれも成果物を実装対象 repo 内に置き（BMAD は `_bmad-output/`、CCPM は `.claude/` + GitHub、GSD / cc-sdd は `.planning/` / `.kiro/`）、単一 repo を既定とし、上流の product 境界（campaign 相当）と escalation packet を持たない。cc-iasd は src/ 隔離と multi-repo 前提、campaign envelope、escalation packet でこれらから分岐する。個々の機構対応は rework/01 に委ね、本編ではこの分岐点のみを記録する。

### 4.5 MetaGPT / ChatDev（責務分離の思想的参照）

MetaGPT と ChatDev は、AI 開発チームを組織として扱う思想的参照元である。MetaGPT は Code = SOP(Team) の哲学で PM / Architect / Engineer / QA のロールを実装し、ChatDev は 2 エージェント対話による相互検証を持つ。cc-iasd はロール分離と相互検証の発想を参照するが、両者は全自動ランタイムであり差し戻し・escalation を持たない。cc-iasd はこれらを runtime として取り込まず、ロールを planner / worker / reviewer の 3 cards に集約する設計（12）の参照に留める。

### 4.6 AI Governance / FINOS 系（統制語彙の供給源）

FINOS AI Governance Framework は金融業界向けのベンダー中立な AI リスク管理フレームワークであり、規範カタログであって実行機構ではない。cc-iasd は quality gates / audit trail / decision logging / accountability という統制語彙をここから参照し、重厚な規制対応としてではなく、非常駐の人間と AI の間で作業・判断・リスクを後追い可能にする evidence model として取り込む。採らないのは規範カタログの全面適用であり、cc-iasd の evidence は kernel の journal と gate review に閉じる。

### 4.7 実行 runtime（Claude Code / Codex 等）

Claude Code / Codex / Copilot などの shell runner は自律実装 runtime の候補であり、cc-iasd の置き換え対象ではない。runtime は task 単位の実装ループ・code edit・test 実行・PR / diff 生成を担い、cc-iasd は何を渡すか（handoff）・どの scope で自走させるか（Surfaces / Checks）・どこで止めるか（停止条件・終端 3 択）・何を evidence として残すか・何を人間判断に戻すか（decision / escalation）を担う。cc-iasd は実装ループを再実装せず runtime へ委譲し、runtime を project-context 全体の所有者にはしない。handoff の機械合成と Tier 0 / Tier 1 二層 enforcement の詳細は 02 / 08 を参照する。

---

## 5. 正本割当

領域ごとの正本を kernel の配置に合わせて割り当てる。ライフサイクル状態はすべて journal が正本であり、以下は authored content と証跡の物理配置に関する割当である（配置の詳細は 03）。

```text
領域              正本                      cc-iasd の役割
vision            vision/                   起点正本。旧 ideal を改称した product canon
spec / plan       specs/                    単一 spec.md（必須セクション制）+ attachments/。
                                            plan は独立ファイルにせず spec の Tasks / 導出に吸収
tasks             specs/                    spec.md の Tasks セクション。run / runtime へ接続
campaign          campaigns/                charter.md。複数 run を束ねる上位実行 envelope
run autonomy      runs/                     handoff（機械合成）/ notes（authored）/ report（終端 packet）
evidence          evidence/                 verifications / reviews の証跡層
decision          decisions/                人間決裁記録。decide のみが登録する
gap               gaps/                     未解決事項の単一台帳（本文 authored、metadata は journal）
role / SOP        roles/                    planner / worker / reviewer の 3 cards
ライフサイクル状態  journal/                  遷移・検証・決裁の唯一の正本
implementation loop 実行 runtime              委譲・結果の verify 捕捉
source project    src/                      成果物 repo root（multi-repo）。外側から読み取りと verify のみ
```

旧設計の 6 分割トップレベル（runtime / rules / user / product / ops）配下への割当（ops/scopes/features/ / ops/execution/campaigns/ など）は廃止した。ライフサイクル状態を journal に一本化した結果、状態を運ぶ階層が不要になり、authored content の種別と証跡と設定が同一階層に並ぶフラット構成へ再編された（03）。旧割当にあった features / roadmap の行は、独立 artifact の廃止により正本を持たない（順序は charter の depends_on、coverage は vision Capabilities + covers 射影へ移った。詳細は 02 の 7 章）。

---

## 6. 語彙対応表

kernel の語彙と先行事例の近い語彙の対応を示す。de facto 準拠語彙は先行側に合わせたもの、差別化語彙は独自に保持し対外発信するものである。語彙選択の判断根拠は rework/03 にあり、本表はその確定結果を kernel 確定語彙で収載する。

```text
cc-iasd の語彙          先行事例での近い語彙
vision（旧 ideal）      GSD の vision / Agent OS の mission / BMAD の brief。
                       de facto 準拠。artifact type としての ideal は廃止し vision に統一
spec / plan / tasks     Spec Kit の spec / plan / tasks。de facto 準拠。
                       互換深度は artifact vocabulary 互換（3 章）。plan は独立 artifact にしない
campaign               対応語なし。BMAD / CCPM の epic、GSD の phase に近いが、
                       停止条件・リスク段階・非退行焦点を持つ実行計画 envelope。差別化語彙
run                    一般的な agent run。Devin / Codex cloud の session に相当。de facto 準拠
evidence               Kosli の evidence / 監査文脈の audit trail。de facto 準拠
escalation packet       対応語なし。HITL 言説の decision-ready context package に相当。差別化語彙
backtrack request       対応語なし。差別化語彙
gap                    open item / follow-up は PM 一般語だが、cc-iasd では
                       needs-human-decision / needs-upstream-fix / needs-info / candidate を
                       単一台帳に統合した概念。旧 open item / planning feedback / TBD の統合先
rules                  Spec Kit の constitution に近い。cc-iasd では cc-iasd.yaml と roles/ が正本
feature（廃止）         Spec Kit / Kiro の feature、kind=epic は BMAD / CCPM の epic に相当したが、
                       独立 artifact としては廃止（置換先: charter depends_on による順序、
                       vision Capabilities + covers 射影による coverage、
                       gap route=vision による中期計画在庫）
roadmap（廃止）         GSD / Agent OS の roadmap に相当したが、独立 artifact としては廃止
                       （置換先: charter depends_on ガードによる実現順序、status --plan の射影ビュー）
```

feature / roadmap の 2 語は、rework/03 の初期検討では「de facto と一致するため維持」とされたが、rework/04 の kernel 採用（Q3 承認）により独立 artifact ごと廃止された。語彙対応表では両者を「廃止（置換先）」として記載し、置換先を併記する。未確定事項を指す裸のマーカーは使わず、gap 台帳のエントリを `[UNRESOLVED: gNNN]` の形で参照する（gap ID の正規形は gNNN。gap 台帳の詳細は 02 / 06）。

---

## 7. 悪い統合と良い統合

避けるべき統合は、複数のフレームワークをそれぞれ丸ごと重ね、各々が spec / tasks / workflow の正本を主張し、cc-iasd 側にも重複する正本を持たせ、src/ 配下に cc-iasd 管理物を置く構成である。この構成では正本が領域ごとに複数になり、AI がどれを信じるべきか判定できなくなる。

kernel が取る統合は次である。

```text
良い統合:
- Spec Kit を spec 駆動 artifact vocabulary の参照元にする（artifact vocabulary 互換。3 章）
- specs/ を cc-iasd 所有の spec 正本にし、単一 spec.md に統合する
- 実行 runtime を task implementation loop に使い、cc-iasd は委譲側に立つ
- Anthropic harness を Default-FAIL / 停止条件の、Kosli を evidence 語彙の、
  DEMM を証拠十分性観点の参照元にする
- GSD / cc-sdd / CCPM / BMAD を成果物チェーン・独立検証・トレーサビリティの参照元にし、
  src/ 隔離・multi-repo・campaign・escalation packet で差別化する
- MetaGPT / ChatDev / FINOS を責務分離・統制語彙の思想的参照に留める
- ライフサイクル状態の正本は journal のみとし、authored content は Markdown で保持する
```

正本を領域ごとに一つに保つことが統合の核であり、その担保は kernel の journal 正本化と src/ 隔離が構造で行う。

---

## 8. 詳細仕様の参照先

本文書は外部フレームワークとの関係づけと語彙対応に責務を限定する。kernel 自身の詳細は各文書に委ねる。

```text
- 02: 不変条件 / 状態機械 / ノードモデル / 語彙の設計根拠 / feature・roadmap 廃止と置換
- 03: ディレクトリ構造 / journal の物理形式 / multi-repo 構成 / src 境界
- 06: event schema / evidence 生成規則 / 証拠十分性検査 / packet 必須欄
- 08: コマンド一覧 / handoff 機械合成 / Tier 0・Tier 1 enforcement
- 12: ロール詳細 / fresh-context reviewer
```
