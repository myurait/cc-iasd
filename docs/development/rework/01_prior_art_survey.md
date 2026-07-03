# rework 01. 先行事例調査

作成日: 2026-07-03  
状態: 調査正本 v0.1

---

## 1. 調査概要

cc-iasd の構想と類似する既存プロダクト・フレームワークを、次の 3 方向に分けて Web 検索と一次ソース取得により調査した（2026-07 時点）。

```text
調査方向:
- spec 駆動開発フレームワーク
- マルチエージェント / ロール型フレームワーク
- 自律実行ガバナンス / 証跡系ツール
```

比較のため、cc-iasd の構成要素を次に分解した。

```text
cc-iasd の構成要素:
(A) 成果物チェーン: ideal -> features -> roadmap -> specs -> campaigns -> runs -> evidence -> planning feedback
(B) Markdown ロール定義による運営モデル（ランタイムではない）
(C) Backtrack Request（推測補完の禁止と構造化された上流差し戻し）
(D) Escalation Packet（選択肢・推奨・影響を含む非同期意思決定文書）
(E) src isolation（project-context が成果物 repo を包含する反転構造）
(F) campaign / run による自走境界と停止条件
(G) 参照リンク型 evidence layer
```

---

## 2. 調査結論の要約

cc-iasd と完全に同じ構想のプロダクトは確認できなかった。ただし構成要素ごとには強い先行例が存在する。

```text
先行例が確認できなかった要素:
- (E) src isolation をフレームワークとして製品化した例
  （repo-of-repos / meta-repo というパターン先行はあるが、ブログ + テンプレート止まり）
- (D) Escalation Packet を一次概念として持つツール
  （既存はすべて承認 / 却下モデルか対話的介入）
- (C) Backtrack Request を形式化したフレームワーク
  （最も近い Spec Kit の [NEEDS CLARIFICATION] は spec 作成時の事前明確化であり、
   下流ロールが実行中に上流不備を検知して差し戻す双方向プロトコルではない）

コモディティ化済みで差別化にならない要素:
- run 相当（サンドボックス化された有界実行 + ログ + PR 報告）
- アクション粒度の自律性統制（リスク段階、帰結ベース裁定、permission）
- Markdown ロール定義という形式自体
- spec / plan / tasks の語彙
```

チェーン (A) の個々の層はほぼすべて先行例があり、全長を一気通貫で持つものがない、という状態である。

---

## 3. spec 駆動開発フレームワーク

### 3.1 GitHub Spec Kit

- URL: https://github.com/github/spec-kit
- constitution -> specify -> plan -> tasks -> implement の 5 フェーズで Markdown 成果物を連鎖生成する OSS ツールキット。30+ エージェント対応。
- 成果物は repo 内（`.specify/`、`specs/NNN-feature/`）。branch から active feature を判定する。
- spec テンプレートが曖昧箇所に `[NEEDS CLARIFICATION]` マーカーを強制し、`/speckit.clarify` が未確定領域を構造化質問として人間に返す。
- vision / roadmap 層なし。実行自律性管理なし。
- 重複度: 中。cc-iasd は spec 層の互換 dialect 参照元としてすでに位置づけ済み。

### 3.2 AWS Kiro

- URL: https://kiro.dev
- spec が存在するまでコード生成を始めない agentic IDE。requirements.md（EARS 記法）-> design.md -> tasks.md。steering ファイルで規約を永続化。autopilot / supervised モード、tasks 依存グラフからの並列 wave 実行。
- 成果物は repo 内 `.kiro/`。
- 重複度: 中。IDE 製品（コーディングエージェント自体）であり、外側から管理する cc-iasd とは役割が異なる。

### 3.3 OpenSpec

- URL: https://github.com/Fission-AI/OpenSpec
- 現行仕様の正本と変更提案（proposal / spec 差分 / tasks）を分離し、propose -> apply -> archive で変更を監査可能にする軽量 SDD。ADDED / MODIFIED / REMOVED のデルタマーカー。
- 成果物は repo 内 `openspec/`。v1.5.0 の Stores Beta でリポジトリ横断共有の方向性あり。
- 重複度: 低〜中。変更単位アーカイブの履歴性は evidence と発想が近いが、対象は spec 変更管理に限定。

### 3.4 cc-sdd（gotalab）

- URL: https://github.com/gotalab/cc-sdd
- 承認済み spec を長時間自律実装に変える npm CLI。discovery（brief.md）-> roadmap.md -> requirements（EARS）-> design -> tasks -> 自律実装。
- 実行管理が充実: タスクごとに新規 implementer（TDD、feature flag 下）+ 独立 reviewer + 2 回却下で根本原因調査に切り替える auto-debug。中断後再開可能。学習は tasks.md の Implementation Notes に伝播。
- 成果物は repo 内 `.kiro/`。単一リポジトリ前提。
- 重複度: 高。campaign / run 層に最も近い OSS。差分は repo 内配置、製品戦略層と証跡連鎖・エスカレーション文書の不在。

### 3.5 spec-workflow-mcp（Pimzino）

- URL: https://github.com/Pimzino/spec-workflow-mcp
- MCP サーバー型 SDD。Steering -> Requirements -> Design -> Tasks の逐次生成、Web ダッシュボード、承認ワークフロー（差し戻し付き）、実装ログ。
- 成果物は repo 内 `.spec-workflow/`。
- 重複度: 中。human-in-the-loop の可視化・承認・記録は ops/evidence に通じるが、自律実行ループの統治ではない。

### 3.6 Spec-Flow（marcusgoll）

- URL: https://github.com/marcusgoll/Spec-Flow
- spec -> plan -> tasks -> implement -> optimize -> ship のパイプラインに、ブロッキング品質ゲート（性能・セキュリティ・a11y・カバレッジ）、トークンバジェット、監査可能成果物を組み込む Claude Code 用ツールキット。quick / feature / epic のスコープ階層。
- 成果物は repo 内（`.spec-flow/`、`specs/`、`epics/`）。
- 重複度: 中〜高。品質ゲート + 監査証跡 + 段階スコープは campaign / run / evidence と発想が重なる。

### 3.7 Tessl

- URL: https://tessl.io
- spec を code の上位ソースに置く spec-as-source 志向（1:1 の spec / code 対応）。Spec Registry（OSS ライブラリの正しい使い方 spec 集）。2026 年にエージェントスキルのパッケージマネージャへリフレーミング。
- 重複度: 低。spec がコードの代替ソースという哲学であり、cc-iasd とは根本的に異なる。

### 3.8 GSD（Get Shit Done）

- URL: https://github.com/gsd-build/get-shit-done
- 軽量メタプロンプティング + SDD。context rot 対策として状態をファイルに外部化し、小さな plan 単位で新規コンテキストの executor を並列起動、plan ごとに atomic git commit、verifier がフェーズゴールと照合検証する。
- 階層: Project（vision）-> Roadmap（フェーズ）-> Phase -> Plan の 4 層分解。
- 成果物は repo 内 `.planning/`（PROJECT.md / REQUIREMENTS.md / ROADMAP.md / STATE.md / phases/ / research/ / debug/）。
- 重複度: 高。vision からの成果物チェーン + 検証付き自律実行ループ + 状態のファイル外部化という概念構成が cc-iasd に最も近い。差分は repo 内配置、単一リポジトリ、エージェントの中で自前実行する点、エスカレーション文書・完了報告の対外形式の不在。

### 3.9 Agent OS（Builder Methods）

- URL: https://buildermethods.com/agent-os / https://github.com/buildermethods/agent-os
- mission.md / roadmap.md / tech-stack.md の product 層を作り、規約（standards）を文脈に応じて注入し、spec 作成の質を上げるシステム。
- 成果物は repo 内 `agent-os/`。ロール・実行管理・証跡なし。
- 重複度: 中〜高（上流文書チェーンに限定）。mission -> roadmap -> spec が ideal -> features -> roadmap -> specs と直接競合する。

### 3.10 Intent（Augment Code）

- URL: https://www.augmentcode.com/tools/intent-vs-kiro
- スタンドアロンのデスクトップワークスペース。living specs（エージェント作業に応じて自己更新される仕様文書）を共有成果物とし、隔離 git worktree 上で複数エージェントを並列オーケストレーション。BYOA（既存 AI サブスクリプション持ち込み）。
- 一次情報がベンダー発信中心である点に留意。
- 重複度: 中〜高（構図として）。repo の外からエージェント群と仕様を管理する商用製品。クローズドで、成果物チェーンの形式を持たない。

### 3.11 Google Antigravity

- URL: https://antigravity.google
- Agent Manager で複数エージェントを並列管理し、Task List -> Implementation Plan（レビューポリシー設定可）-> Walkthrough（完了後の変更サマリと検証方法）という Artifacts で計画と検証証跡を残す agentic 開発プラットフォーム。
- 成果物はプラットフォーム側 Artifacts（クローズド）。
- 重複度: 中。実行の外部管理 + 検証証跡（Walkthrough は completion report に相当）は run / evidence 層と重なる。

---

## 4. マルチエージェント / ロール型フレームワーク

### 4.1 BMAD Method

- URL: https://github.com/bmad-code-org/BMAD-METHOD / https://docs.bmad-method.org/
- Analysis -> Planning -> Solutioning -> Implementation の 4 フェーズと 34+ ワークフローで全ライフサイクルをカバーする OSS。各フェーズが文書を生成し次フェーズのコンテキストになる progressive context 設計。
- ロール: Analyst / PM / Architect / Developer / UX / PO / SM / QA / Orchestrator など 12+。ランタイムではなく Markdown のペルソナ / ワークフロー定義。cc-iasd と同じ「ロール = プロンプト定義」型。
- ハンドオフ: `bmad-create-story` が PRD・アーキテクチャの関連コンテキストを注入した story ファイルを作成し Dev エージェントに渡す。Execution Entry Packet に最も近い先行例。`sprint-status.yaml` で進行管理。
- 差し戻し: `bmad-correct-course` はスプリント中の重大変更時に計画を更新するが、人間（または SM ロール）が起動する軌道修正であり、下流ロールが情報不足を検知して構造化リクエストを返す自動的プロトコルではない。
- docs に Adversarial Review / Checkpoint Preview への言及あり（詳細仕様は未検証）。Devil's Advocate と部分的に重なる。
- 成果物は repo 内（`_bmad-output/` 等）。
- 重複度: 高。Markdown ロール定義 + 文書チェーン + 修正ワークフローの 3 点で最も競合する。

### 4.2 MetaGPT

- URL: https://github.com/FoundationAgents/MetaGPT / https://arxiv.org/abs/2308.00352
- Code = SOP(Team) 哲学のソフトウェア会社シミュレーション。PM / Architect / Project Manager / Engineer / QA の 5 ロールを Python クラスとして実装したランタイムエージェント。構造化文書（PRD -> 設計 -> タスク）をエージェント間でパスする。
- 差し戻し・エスカレーションなし。全自動志向。
- 重複度: 低〜中。役割分担 + 文書チェーンの学術的原型として参照価値はあるが、設計目的が異なる。

### 4.3 ChatDev

- URL: https://github.com/OpenBMB/ChatDev
- 仮想ソフトウェア会社。ChatChain で原子的サブタスクに分割し、各ノードで 2 エージェント対話（instructor / assistant）により提案・検証する。研究系・全自動。
- 重複度: 低。2 エージェント対話による相互検証は Reviewer / Devil's Advocate と着想が重なる。

### 4.4 AutoGen / AG2、CrewAI

- URL: https://github.com/ag2ai/ag2 / https://github.com/crewAIInc/crewAI
- 会話駆動の汎用マルチエージェントランタイム。ロールは system message / パラメータで定義。human_input_mode 等の対話的 HITL はあるが、構造化エスカレーション文書はない。
- 重複度: 低。cc-iasd が「エージェントランタイムではない」と宣言する際の対比対象。

### 4.5 CCPM（automazeio/ccpm）

- URL: https://github.com/automazeio/ccpm
- GitHub Issues と git worktree を使った並列エージェント実行の PM スキルシステム。brainstorm -> document -> plan -> execute -> track の 5 フェーズ。PRD -> Epic -> Task -> Issue -> Code -> Commit の完全トレーサビリティ（すべてのコード行は spec に遡れる）を掲げる。
- ハンドオフ: Epic 内の明示的技術判断 + 受け入れ基準・工数見積・依存宣言を含む構造化タスクファイル。進捗は `.claude/epics/<feature>/updates/` と GitHub Issue コメントに書き戻す。
- 成果物は repo 内 `.claude/` + GitHub Issues（SSoT は GitHub 側）。
- 重複度: 高。成果物チェーン + 並列実行管理 + 証跡の 3 点で campaigns / runs / evidence に近い。差分は上流層の浅さ、多役割レビュー体制の不在、GitHub 依存、差し戻しプロトコルの不在。

### 4.6 claude-task-master（Taskmaster AI）

- URL: https://github.com/eyaltoledano/claude-task-master
- PRD をパースして構造化タスク（tasks.json）を生成し、サブタスク分解・依存管理・複雑度分析・next_task 選定を CLI / MCP で提供。
- 成果物は repo 内 `.taskmaster/`。上流層・実行管理・ロールなし。
- 重複度: 中。PRD -> タスク分解 -> 実行の中流工程のみ重複。

### 4.7 実行オーケストレータ群（Conductor / claude-squad / claude-flow 等）

- Conductor: https://conductor.build（複数 Claude Code を git worktree で並列実行する Mac アプリ）
- claude-squad: https://github.com/smtg-ai/claude-squad（tmux + worktree のターミナル管理）
- claude-flow（Ruflo に改名）: https://github.com/ruvnet/ruflo（Queen + Worker の hive-mind 型スワーム。SPARC 方法論内蔵）
- vibe-kanban: https://github.com/BloopAI/vibe-kanban（カンバン UI のオーケストレータ）
- 重複度: いずれも低。実行レイヤーの補完関係にあり、cc-iasd が実装を委譲する下請け側に位置する。

### 4.8 Beads（steveyegge/beads）

- URL: https://github.com/steveyegge/beads
- コーディングエージェントのための分散グラフ issue トラッカー / 記憶システム。Dolt（バージョン管理 SQL DB）上に依存関係グラフを持ち、ready-work 検出、アトミックな作業クレーム、知見の永続化、memory decay を提供。
- 「散らかった Markdown プランの置き換え」を明示的に掲げる。cc-iasd の Markdown 成果物チェーンに対するアンチテーゼとして重要な参照点。
- 成果物は repo 内 `.beads/`。
- 重複度: 低〜中（runs / tasks 管理層のみ）。

### 4.9 Backlog.md（MrLesk）

- URL: https://github.com/MrLesk/Backlog.md
- git リポジトリを Markdown ベースのプロジェクトボードに変える CLI / TUI / Web ツール。タスク・decision が repo 内 `backlog/` に置かれ、全変更が git コミットになる。
- 重複度: 低〜中。Markdown 正本 + git という媒体選択は同系統。

### 4.10 Claude Code subagents / Agent Teams（Anthropic 公式）

- URL: https://code.claude.com/docs/en/sub-agents
- `.claude/agents/` の Markdown + YAML でペルソナ別 subagent を定義する公式機構。コミュニティにロール集も多数（例: https://github.com/VoltAgent/awesome-claude-code-subagents ）。
- Markdown ロール定義という形式自体は一般化済み。ただし成果物チェーンと結びついた運営モデル・差し戻し規約は伴わない。

---

## 5. 自律実行ガバナンス / 証跡系

### 5.1 Devin（Cognition）

- URL: https://devin.ai / https://cognition.com/blog/devin-2-1
- フルオートノマスな AI ソフトウェアエンジニア SaaS。Interactive Planning（計画はチェックポイントであってゲートではない）、Confidence スコア（緑黄赤。緑以外は計画承認待ちで停止し明確化質問）、Playbooks（反復タスク用テンプレート）、Knowledge（セッション横断の規約集）。
- 選択肢・推奨・影響を含む構造化非同期エスカレーション文書は確認できず。
- 自社エージェント専用。
- 重複度: 中。Confidence はエスカレーショントリガーに相当するが、campaign 級のプラン境界・非常駐人間向け意思決定文書はない。

### 5.2 Sculptor（Imbue）

- URL: https://imbue.com/sculptor/
- 複数エージェントを並列の隔離 Docker コンテナで走らせるローカルハーネス / UI。開発者が常駐して監督する同期モデル。
- 重複度: 低〜中。ランタイム非依存ハーネスという点は共通だが、非常駐人間 + 事後トレーサビリティという cc-iasd の運用モデルとは正反対。

### 5.3 Amp（Sourcegraph）

- URL: https://ampcode.com
- ツールレベル許可ルール（allow / reject / ask / 外部プログラムへの判断委譲）、スレッドの共有・永続化が特徴。
- 重複度: 低〜中。許可ルールの外部委譲はポリシー層と親和的。

### 5.4 OpenAI Codex（クラウド）、Google Jules

- URL: https://developers.openai.com/codex/cloud / https://jules.google
- タスクごとに独立サンドボックスで実行し diff・ログ・PR で返す非同期エージェント。Jules は Planning Critic（実行前に別エージェントが計画を批評）を持つ。Jules の無応答時オートアプルーブは第三者記事のみで一次未確認。
- 重複度: 中。run 相当はコモディティ化済みであることを示す。Jules の Planning Critic は Devil's Advocate Design Launch Review と類似。

### 5.5 Cursor（Auto-review）

- URL: https://cursor.com/blog/agent-autonomy-auto-review
- ツールコールを 3 段フィルタで裁定: allowlist 即実行 / サンドボックス隔離実行 / 分類器サブエージェントが文脈込みで審査。ブロック時はまず親エージェントに理由を返して安全な代替経路を取らせる。
- 重複度: 中。帰結に基づく動的境界判定はエスカレーショントリガー設計として最も洗練された実装例。ただしアクション粒度であり、campaign / run 粒度の統治ではない。

### 5.6 Anthropic long-running harness パターン

- URL: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents / https://github.com/anthropics/cwc-long-running-agents
- Initializer + Coding エージェントの 2 部構成。参照実装の主要機構:
  - Default-FAIL 契約: test-results を pass に書き換えるには、証拠（スクリーンショット / ログ / テスト出力）を先に Read することを PreToolUse フックで強制
  - Fresh-Context Evaluator: Write 権限のない別サブエージェントが diff と証拠を独立検証し PASS / NEEDS_WORK を返す
  - 停止条件: 全 feature pass / 変化なしサイクル / トークン・時間予算枯渇 / AGENT_STOP ファイル（キルスイッチ）。STEER.md で走行中に人間が誘導
- 人間へのエスカレーションは未設計（人間 -> エージェント方向のステアリングのみ）。
- 重複度: 高。有界セッション + アーティファクトハンドオフ + 独立検証 + 停止条件はほぼ同じ問題を解いている。差分は campaign 級の UX プラン境界と影響マップ、Escalation Packet、判断領域の AI 禁止規範の 3 点。

### 5.7 FINOS AI Governance Framework

- URL: https://air-governance-framework.finos.org/
- 金融業界向けのベンダー中立 AI リスク管理フレームワーク。v2.0 でエージェント固有リスクをカバー。規範カタログであり実行機構ではない。関連して FINOS SDLC Governance Working Group が機械可読な SDLC 統制語彙を策定中。
- 重複度: 低（補完関係）。evidence / escalation を統制要件へマッピングする語彙供給源。

### 5.8 Kosli

- URL: https://www.kosli.com/
- AI 支援ソフトウェアデリバリーのガバナンスインフラ。policy-as-code、暗号学的エビデンスチェーン。エージェントがプログラム的に承認をリクエストし証拠を添付できる API。エージェント非依存。
- 重複度: 高（evidence 層に限定）。CI/CD・デリバリー統制のレイヤーで動き、実装計画の意味論的境界や Escalation Packet の意思決定支援構造は持たない。

### 5.9 Ona（旧 Gitpod）

- URL: https://ona.com
- エンタープライズ向けのバックグラウンド SWE エージェント実行基盤。カーネルレベルの技術統制（ネットワーク制限、ファイルシステムロック、実行バイナリのハッシュ制御、シークレット隔離）。2026-06 に OpenAI が買収を発表。
- 重複度: 中。cc-iasd がプロセス / 文書レイヤーで行う統治をインフラレイヤーで行う。相互補完的。

### 5.10 Factory.ai（Droids）

- URL: https://factory.ai
- 専門分化した自律エージェント群のエンタープライズプラットフォーム。Autonomy Level が明示的な段階制（low: 安全な編集のみ自動 / medium: 可逆的変更は自動 / high: 全自動）。リスク超過アクションは承認要求。
- 重複度: 中。リスク段階 x 自動化レベルは run 内エスカレーショントリガーに相当する成熟した実装。

### 5.11 Blitzy

- URL: https://blitzy.com
- 大企業向け自律ソフトウェア開発プラットフォーム。公開情報がマーケティング主体で、統治機構の技術的詳細は検証できず。
- 重複度: 低（判定保留）。

### 5.12 関連する理論・言説

- Decision Evidence Maturity Model（DEMM）: https://arxiv.org/abs/2605.04093 。「エビデンスデータがあること」と「意思決定を監査できること」の混同（container fallacy）を指摘し、決定単位の証拠十分性を 5 段階で評価する成熟度モデル。evidence layer の評価軸として直接有用。
- ハーネスエンジニアリングの分野化: https://github.com/ai-boost/awesome-harness-engineering 等のキュレーション集が成立。
- HITL エスカレーション設計の一般論: 「帰結で分類し、リスク層でゲートし、非同期でエスカレーションし、生トレースではなく decision-ready なコンテキストパッケージを人間に渡す」という言説が 2026 年のベストプラクティスとして確立しつつある。ただしコーディングエージェント向けの具体的な文書型・フレームワークとして実装した OSS は本調査では確認できなかった。
- MCP ゲートウェイ型監査: 全ツールコールを単一ゲートウェイ経由にして監査証跡を作るアプローチ。EU AI Act の高リスク AI ログ義務（2026-08 適用開始）が推進要因。

---

## 6. 反転構造（context が repo を包む）の先行

cc-iasd の src isolation には、パターンとしての先行事例が存在する。いずれもブログ + テンプレートであり、成果物チェーンや実行自律性管理を備えたフレームワークではない。

### 6.1 Repo-of-Repos パターン

- URL: https://raffertyuy.com/raztype/repo-of-repos-pattern/ / https://github.com/raffertyuy/repo-of-repos
- 外側ワークスペースに CLAUDE.md / .claude/ / _plans/（クロスリポジトリ実装計画）/ docs/ を置き、`repos/` 配下に各プロダクトリポジトリを clone（origin 保持、repos.yaml マニフェスト）。「plan はリポジトリ境界をまたぐから外側に置く」という理由付けまで cc-iasd と同型。
- 構造の重複: 高。機能の重複: 低（spec チェーン・run 管理・evidence なし）。

### 6.2 Meta-Repo パターン

- URL: https://seylox.github.io/2026/03/05/blog-agents-meta-repo-pattern.html
- 専用リポジトリをエージェントの知識ベース・作業記憶とし、AGENTS.md / repos.yaml / conventions/ / workflows/ / active-work/（エピック追跡）/ archive/ を持つ。active-work -> archive の流れは runs / evidence の履歴性に似る。
- ただし meta-repo はプロダクトリポジトリと並置（包含ではない）で、パターンであってツールではない。

---

## 7. 重複度サマリ

```text
重複度 高:
- GSD（vision->roadmap->phase->plan チェーン + 検証付き実行。repo 内）
- cc-sdd（spec 承認 -> 自律実装ループ + 再開管理。repo 内）
- BMAD（Markdown ロール定義 + 文書チェーン + 軌道修正。repo 内）
- CCPM（トレーサビリティ + 並列 run 管理 + 進捗可視化。GitHub 依存）
- Anthropic long-running harness（有界セッション + 独立検証 + 停止条件。人間エスカレーション未設計）
- Kosli（evidence 層のみ。CI/CD レイヤー）
- repo-of-repos パターン（構造の反転のみ。機能なし）

重複度 中:
- Spec Kit、Kiro、Agent OS、spec-workflow-mcp、Spec-Flow、Intent、Antigravity、
  Taskmaster、Devin、Codex cloud、Jules、Cursor、Ona、Factory.ai

重複度 低:
- Tessl、OpenSpec、MetaGPT、ChatDev、AG2、CrewAI、実行オーケストレータ群、
  Beads、Backlog.md、Sculptor、Amp、FINOS、Blitzy
```

---

## 8. cc-iasd の空白地帯（差別化ポイント）

```text
1. src isolation + 包含構造をフレームワークとして製品化した例はない。
   反転構造は repo-of-repos / meta-repo としてパターン化され始めているが、
   npm CLI・成果物スキーマ・ライフサイクル管理を伴うものは未確認。

2. ideal -> feature -> roadmap -> spec -> campaign -> run -> evidence の
   全長チェーンを一気通貫で持つツールはない。campaign と
   escalation packet / planning feedback（実行結果の計画への還流）を
   形式化した OSS は見当たらない。

3. Escalation Packet（選択肢 + 推奨 + 各影響 + 無対応影響 + 再開計画を含む
   非同期意思決定文書)を一次概念として持つ既存ツールは確認できなかった。
   既存は承認 / 却下モデルか対話的介入に留まる。

4. Backtrack Request（推測補完の禁止 -> 構造化された上流差し戻し）を
   形式化したフレームワークは確認できなかった。

5. コーディングエージェントを置き換えず外側から自律性境界を管理する
   ポジションは、OSS ではエージェントの中で実行する形（cc-sdd / GSD）、
   商用ではクローズドプラットフォーム（Intent / Antigravity）が部分的に
   占めるのみで、ファイルベース・エージェント非依存・オープンな形では
   空いている。
```

---

## 9. リスク・留意点

```text
- cc-sdd と GSD が上位層・実行管理へ機能拡張中（cc-sdd は roadmap、
  GSD は vision -> roadmap を既に保有）。repo 内で十分とする立場との
  差別化は、反転構造・マルチリポジトリ対応・証跡監査・エスカレーション
  文書に依存する。

- repo 内配置には「エージェントが自然にコンテキストを読める」実利がある。
  外部配置時のコンテキスト供給方法（実行 runtime へ何をどう渡すか）が
  cc-iasd の説明責任ポイントになる。

- HITL エスカレーションの言説は確立しつつあり、Escalation Packet を
  成果物形式まで落とすポジションは時間の問題で追随が出得る。

- Spec Kit 互換を掲げる以上、Spec Kit 本体の仕様変更への追従コストがある。
```

---

## 10. 未検証事項

```text
- BMAD の Adversarial Review / Checkpoint Preview の具体仕様
- Blitzy のガバナンス機構の実装詳細
- Jules の無応答時オートアプルーブ挙動（第三者記事のみ）
- claude-flow の性能数値（自称のみ）
- 各フレームワークは 2025〜2026 年に改版が頻繁であり、細部は変わり得る
```
