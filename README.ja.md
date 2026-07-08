[English](README.md) | 日本語

# cc-iasd

cc-iasd は、3 つの不変条件を「約束」ではなく「構造」で守る、決定論的状態機械カーネル / 実行ハーネスです。

守る不変条件は次の 3 つです。

```text
1. src/ 隔離を絶対制約とする
2. 証跡管理主義
3. 推測補完の禁止 -> 構造化された上流差し戻し
```

従来、これらは「Worker は推測しない」「証拠なしに完了を宣言しない」「状態を勝手に書き換えない」といったロール文書に書かれた期待で担保され、破る経路が構造上開いていました。cc-iasd は、この 3 条件を LLM の遵守に依存させず、CLI のコードと状態機械のガードで執行します。ライフサイクル状態は追記専用（append-only）の journal のみが持ち、完了へ至る経路は CLI 自身が実行した検証の成立のみで、推測で埋める主体が構造上存在しません。

cc-iasd は、Claude Code / Codex などの実装 runtime を置き換えるものではありません。task の実装ループ（コード編集・テスト実行・diff 生成）は runtime へ委譲し、cc-iasd はその外側から、何を渡すか（handoff）・どの scope で自走させるか（Surfaces / Checks）・どこで止めるか（停止条件・終端 3 択）・何を証跡として残すか・何を人間判断へ戻すか（decision / escalation）を管理します。

## 3 不変条件を守る構造

3 つの不変条件は、期待ではなく次の構造で守られます。

```text
不変条件 1（src/ 隔離）:
  CLI の全書き込みが単一の write-path モジュールを通り、管理領域の allowlist 外への
  書き込みを拒否する。run は Surfaces（write / forbid glob）で変更面を宣言し、
  verify が base commit からの git diff を照合して逸脱を機械検出する

不変条件 2（証跡管理主義）:
  状態を変える行為を、journal への event 追記と同一化する。journal を経由しない
  状態変更は存在せず、silent overwrite は構造的に不可能。verification は CLI が
  検証を実行した場合にのみ生成され、LLM の「テストは通った」という報告文は
  ガードの入力にならない

不変条件 3（推測補完の禁止）:
  handoff（run の入力）は AI が執筆せず、CLI が上流成果物から機械合成する。
  上流に欠落があれば run は始まらない。run の終端は accept / block / escalate の
  3 択のみで、上流不足を差し戻す block が最も安価な合法出口になるコスト勾配を
  状態機械が作る。人間決裁は decide コマンドのみが記録でき、journal に
  actor=human が刻印される
```

これらはすべて CLI のガードに埋め込まれています。フロー上のどこにも、AI が状態を進めたり、証拠なしに完了を偽装したりする経路はありません。

## 先行事例との関係

AI 開発フレームワークの先行事例調査（`docs/development/rework/01_prior_art_survey.md`）では、成果物チェーン・独立検証・却下階梯・並列 run といった個々の構成要素にはそれぞれ強い先行例があるものの、次の 3 点については同種の先行事例が確認できませんでした。

```text
1. src/ 隔離（成果物 repo を project-context が包含する反転構造）を、
   成果物スキーマとライフサイクル管理を伴う形で製品化した例
2. escalation packet（選択肢・推奨・各影響・無対応影響・再開条件を含む
   非同期意思決定文書）を一次概念として持つツール
3. backtrack request（推測補完を拒否し上流不足を構造化して差し戻す
   双方向プロトコル）を形式化したフレームワーク
```

cc-iasd はこの 3 点を固有機能として実装し、それ以外の領域では先行事例へ準拠します。詳細と参照方針は `docs/development/07_framework_integration.md` を参照してください。

## 人間の介入モデル

人間の役割は「著者と決裁者」であり「操作者」ではありません。run の進行操作（open / return / verify / accept / review record など）は agent が実行するものであり、人間がコマンド体系を学習しなければ回らない状態は設計バグとして扱います。

人間が覚える定常動線は 1 文に収束します。

```text
気になったら cc-iasd、答えるは decide、止めるは STOP、直すは Markdown。
```

- 気になったら `cc-iasd`（引数なし = inbox）。要対応事項を一覧し、その場で decide / campaign close を実行できます
- 答えるは `cc-iasd decide`。escalation や blocking gap への人間決裁を記録します（journal に actor=human を刻印）
- 止めるは STOP ファイル。run の停止条件として機械判定されます（コマンドですらありません）
- 直すは Markdown 編集。vision / spec / charter などの authored content を直接編集し、git で版管理します

human-facing 操作の上限はこの inbox / decide / STOP（+ Markdown 編集と git）です。これを超える人間必須操作の追加は設計バグとして扱います。agent-facing コマンドの知識は事前学習ではなく in-band で供給されます（handoff への焼き込み・guard 拒否メッセージの次の一手提示・status の可能遷移提示）。

## 5 分で最初の run

フル chain（vision -> spec -> campaign -> run）を初日から要求しません。人間が直書きした goal で始める adhoc run が導入の入口です。adhoc run は spec を経由しませんが、guard / journal / verify / 終端 3 択はすべて有効で、3 不変条件は初日から守られます。

```bash
# 1. project-context を初期化する（scaffold + journal + git init）
npx cc-iasd@latest init myapp
cd myapp

# 2. 成果物 repo を src/ に配置する（例）
git clone git@github.com:me/app.git src/app

# 3. adhoc run を開く。handoff が機械合成される
npx cc-iasd run open --adhoc "ログイン失敗時に 500 が出るのを修正" --check "npm test"

# 4. 合成された handoff を実装 runtime に渡す
npx cc-iasd run handoff <run-id> | claude
```

`init` の出力例は次です。

```text
$ cc-iasd init myapp
project-context を初期化しました: /path/to/myapp
  doc_lang: Japanese / dev_lang: TypeScript
  初回 commit: 10901261d88a
次に打つコマンド:
  $ cc-iasd doctor
```

ガードが差し戻す様子も確認できます。たとえば `--check` を付けずに adhoc run を開くと、遷移は起きず拒否メッセージが返ります。

```text
$ cc-iasd run open --adhoc "goal だけ指定"
拒否: run open
欠けている入力:
  - adhoc.check: --check "<cmd>" が必要です（spike を除く）
次に打つコマンド:
  $ cc-iasd gap add <ref> / cc-iasd decide <id>（上流不足の解消）
  $ cc-iasd run block <run-id> --missing <ref>（差し戻し）
```

拒否メッセージは必ず「どの型付き入力が欠けているか」と「次に打つべきコマンド」を含み、`--json` で機械可読形式も返します。agent は全成立条件を暗記していなくても、この次の一手をたどるだけで正しい動線に戻れます。

## project-context の構成

project-context の想定構成は次のフラット構成です。`src/` は利用者が成果物 repo を clone して配置し、`state.json` は導出時に生成され、それ以外を `init` が作成します（詳細は `docs/development/03_project_context_architecture.md`）。

```text
project-context/               # それ自体が git repo（証跡の版管理。src/ は ignore）
  cc-iasd.yaml                 # 唯一の設定: runtime adapter / budgets / checks allowlist /
                               # decision policy / gate 要否 / 登録 repo
  journal/                     # append-only event store。1 event = 1 JSON file（ULID 名）
                               # CLI のみ書込。ライフサイクル状態の唯一の正本
  state.json                   # journal からの導出 snapshot（再生成可能。正本ではない）
  vision/                      # 起点正本。v<NNN>-<slug>.md
  specs/                       # s<NNN>-<slug>/spec.md（必須セクション制）+ attachments/
  campaigns/                   # c<NNN>-<slug>/charter.md（複数 run を束ねる実行 envelope）
  runs/                        # r-<ulid>-<slug>/。handoff.md（生成物）/ notes.md（authored）/
                               # report.md（終端 packet）
  evidence/                    # verifications/（verify の verdict + 生出力）/ reviews/（review record）
  decisions/                   # d<NNN>-<slug>.md（人間決裁記録。decide のみが登録）
  gaps/                        # g<NNN>-<slug>.md（未解決事項の単一台帳）
  roles/                       # planner / worker / reviewer の 3 role cards
  out/                         # compile 生成物（runtime bundle）。gitignore。非正本
  reference/                   # カーネル非管理の自由領域
  src/                         # 成果物 repo root（nested git）。CLI は読み取りと verify のみ
```

Markdown は authored content 専用で、frontmatter は id と refs のみを持ち status 欄を持ちません。AI が Markdown を編集しても状態は動かず、状態を進めるのは常にガードを通過した遷移 event です。`src/` は成果物のための清潔な境界で、cc-iasd 管理 artifact（spec / runtime / evidence / report など）はすべて `src/` の外側に置きます。複数 repo を扱う場合は `src/` 配下に横並びで配置し、Surfaces の glob に `src/<repo>/` プレフィックスを含めます。

## 標準フロー概観

1 機能を作り切る標準フローは、計画 -> run サイクル -> 締めの 3 フェーズです（詳細は `docs/development/04_core_workflow.md`、図は `docs/development/standard_flow_overview.mmd`）。

```text
フェーズ 1: 計画と gate
  new vision -> planner が執筆 -> decide（human 承認）-> vision approved
  new spec   -> planner が執筆。未確定は gap 起票 + [UNRESOLVED: gNNN]
             -> review record（gate=spec）-> spec ready
  new campaign -> planner が charter を執筆 -> review record（gate=launch）-> campaign launch

フェーズ 2: run サイクル（campaign 内で task が尽きるまで反復。並列可）
  run open   -> handoff を CLI が機械合成（上流欠落なら欠落列挙 + 拒否）
  実装        -> worker が handoff を入力に src/ のみを編集し、notes と gap 起票で報告
  run return -> CLI が repo 別 git diff snapshot を実測記録
  run verify -> CLI が Checks を子プロセス実行し、Surfaces と diff を照合
  review record（gate=run）-> run accept

フェーズ 3: 締め
  review record（gate=completion）-> report（completion）
  -> human が report と review を読む -> campaign close
```

run の終端は次の 3 択のみで、差し戻す block が最も安価な合法出口になります。

```text
accept:   verification pass + review record + blocking gap 0 が必要（最も高価）
block:    backtrack request を生成して blocked へ（欠落 ref 指定で成立。最も安価）
escalate: escalation packet を生成して escalated へ（decision 待ち）
```

## 現在の状態

計画スコープ（P1〜P4）はすべて実装済みです。adhoc run の最小系、vision 承認から campaign close までの full-chain（4 gate 運用）、session 起動（runtime adapter による bundle compile）、並列 run の worktree 隔離、doctor の監査検査群までが動作します。次のコマンドが実装済みです（各コマンドの目的・入力・出力・遷移は `docs/development/08_commands_and_workflows.md`）。

```text
cc-iasd                                        # 引数なし = human inbox
cc-iasd init [project-context-path]            # scaffold + journal + git init
cc-iasd doctor                                 # 構造 / 参照 / src 汚染 / guard 再計算 / 証拠十分性の検査
cc-iasd status [--plan | <ref>]                # journal からの導出 view

cc-iasd new vision|spec|campaign <slug>        # scaffold 作成（AI が authored 節を執筆）
cc-iasd spec ready <id>
cc-iasd campaign launch|close <id>

cc-iasd run open <campaign-id> --tasks <T..> | --adhoc "<goal>" --check "<cmd>" [--spike] [--worktree]
cc-iasd run handoff <run-id>                   # 合成済み handoff を stdout 出力（Tier 0 正本経路）
cc-iasd run return <run-id>                    # diff snapshot の実測記録
cc-iasd run verify <run-id>                    # Checks の CLI 実行 + surface 照合
cc-iasd run accept|block|escalate <run-id>     # 終端 3 択
cc-iasd session start|resume <run-id>          # out/<run-id>/ へ bundle compile（adapter: none / claude-code）/ 再開 brief 生成

cc-iasd review record <ref> --gate spec|launch|run|completion
cc-iasd gap add|close|route <ref>
cc-iasd decide <decision-id> [--adopt <file>]  # 人間専権。TTY 既定 / --adopt で非同期取込
cc-iasd report <ref>
cc-iasd retire <ref>
cc-iasd role show planner|worker|reviewer
```

実行検証済みの動線は 2 本です。adhoc の最短動線は `init -> run open --adhoc --check -> run handoff` で handoff を機械合成して runtime へ渡し、`run return -> run verify -> review record --gate run --verdict pass -> run accept` で完走します。full-chain の動線は `new vision`（Capabilities 宣言）`-> decide --approve -> new spec -> spec ready -> new campaign -> campaign launch -> run open <campaign-id> --tasks -> run 完走 -> review record --gate completion -> report -> campaign close` を通し、charter Coverage の `after:` による run open の順序制約、宣言 task の全消化判定、`status --plan` での capability カバー / 未カバー射影が e2e テストで検証済みです。ガード不成立時（notes 不在での return、verify 前の accept、blocking gap open での spec ready、先行 spec 未完了での run open など）は遷移せず拒否メッセージを返します。

### roadmap

計画スコープ（P1〜P4）は完了しています。実装 runtime への handoff 配布は `run handoff` の stdout 出力（Tier 0 の正本経路）に加え、`session start` による `out/<run-id>/` への bundle compile が使えます。claude-code adapter は Tier 1 の加速層（settings / write-guard hook の生成）を提供しますが、Tier 0 だけで 3 不変条件は閉じています。今後の拡張候補と運用観察後に判断する事項は `docs/development/09_future_vision.md` と `docs/development/10_todo.md` を参照してください。

## 語彙対応表

kernel の語彙は、先行事例で収斂した de facto 準拠語彙と、対応する確立語彙がない差別化語彙に分けて構成しています（詳細は `docs/development/07_framework_integration.md` 6 章）。

```text
cc-iasd の語彙        先行事例での近い語彙 / 位置づけ
vision（旧 ideal）     GSD の vision / Agent OS の mission / BMAD の brief。de facto 準拠
spec / plan / tasks    Spec Kit の spec / plan / tasks。de facto 準拠（artifact vocabulary 互換）
campaign              対応語なし。BMAD / CCPM の epic、GSD の phase に近いが、停止条件・
                      リスク段階・非退行焦点を持つ実行計画 envelope。差別化語彙
run                   一般的な agent run。Devin / Codex cloud の session に相当。de facto 準拠
evidence              Kosli の evidence / 監査文脈の audit trail。de facto 準拠
escalation packet      対応語なし。HITL 言説の decision-ready context package に相当。差別化語彙
backtrack request      対応語なし。差別化語彙
gap                   open item / follow-up は PM 一般語だが、needs-human-decision /
                      needs-upstream-fix / needs-info / candidate を単一台帳に統合した概念
feature（廃止）        独立 artifact としては廃止。置換先: charter depends_on による順序、
                      vision Capabilities + covers 射影、gap route=vision による中期計画在庫
roadmap（廃止）        独立 artifact としては廃止。置換先: charter depends_on ガード、
                      status --plan の射影ビュー
```

## 設計ドキュメント

設計正本は `docs/development/` にあります。主要文書は次です。

```text
00_index.md                 全体索引・cc-iasd の定義・開発順序
02_conceptual_design.md     3 不変条件と構造の対応・ノードモデル・journal 正本化・終端 3 択
03_project_context_architecture.md  物理構造・journal 形式・write-path allowlist・multi-repo
04_core_workflow.md         標準ワークフロー（1 機能を作り切る遷移列）
05_autonomy_protocol.md     状態機械・遷移ガード・停止条件・reject 階梯・decide の機構
06_artifact_and_evidence_model.md  event schema・verification 生成規則・packet 必須欄
07_framework_integration.md 先行事例との統合方針・語彙対応表
08_commands_and_workflows.md  CLI コマンド一覧・guard 拒否メッセージ仕様・導入フロー
12_role_design.md           planner / worker / reviewer の 3 role cards + human
```

## ライセンス

MIT
