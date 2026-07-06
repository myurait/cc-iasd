# 01. cc-iasd 要件定義

作成日: 2026-07-05  
状態: kernel 正本 v1.0（Phase 1 レビュー待ち）

---

## 1. 目的

cc-iasd の目的は、AI 実行エージェントを直接作ることではない。

cc-iasd の目的は、3 つの不変条件を「約束」ではなく「構造」で守る決定論的状態機械カーネルを提供し、その上で人間のエンジニアが AI へ作業委任を最大化できる開発文脈管理を成立させることである。task の実装そのものは Claude Code / Codex などの実行 runtime へ委譲し、cc-iasd はその外側で、意図を自走可能な作業単位へ変換する経路の厳密性と、経路上のすべての前進を型付き遷移として記録する証跡構造を担う。

不変条件は 3 つである。この 3 つを守ることが cc-iasd の存在理由であり、他のすべての要件はこれを執行するための手段である。

```text
不変条件:
1. src/ 隔離を絶対制約とする
2. 証跡管理主義
3. 推測補完の禁止 -> 構造化された上流差し戻し
```

これらは従来ロール文書に書かれた期待で担保されていたが、kernel では CLI のコードと状態機械のガードで執行する。ライフサイクル状態は append-only journal のみが持ち、完了へ至る経路は CLI 自身が実行した検証の成立のみであり、推測で埋める主体が構造上存在しない。概念の全体像と根拠は 02 を参照する。

---

## 2. 目的・理想体験

### 2.1 ユーザー視点

ユーザーは、細かく逐次指示しない。また、自走中に常駐しない。

```text
ユーザー:
  この機能を作って

cc-iasd:
  vision / spec / campaign / run を確認し、
  task を分解し、
  handoff を機械合成して実行 runtime に委譲し、
  verification と review を実行し、
  journal に証跡を残す。

cc-iasd:
  人間判断が必要な場合だけ、
  escalation packet として停止理由・選択肢・各影響・推奨・再開条件を残して停止する。

ユーザー:
  都合のよいタイミングで packet を読み、decide で答える。

cc-iasd:
  decide した瞬間に該当 run の再開条件が満たされ、
  campaign の節目では completion report を返す。
```

ユーザーは自走中に常駐しないため、cc-iasd は「今どうしたらよいですか」と短く聞くのではなく、後から読んでも判断できる材料を packet として揃える。人間の関与は同期的な操作ではなく、packet を残して待つ非同期モデルである。ユーザーが覚える定常動線は 1 文に収束する。気になったら inbox、答えるは decide、止めるは STOP、直すは Markdown。

### 2.2 AI 視点

AI は、vision を自由に変更しない。前進はすべてガードを通過した遷移であり、AI が状態を勝手に進める経路は存在しない。

```text
AI が行えること:
- 承認済み scope 内の task 分解と順序変更
- task-local な実装判断
- review / verification に基づく bounded remediation
- notes への実装方針の記録
- gap の解消提案の起票

AI が行えないこと:
- vision / campaign の目的変更
- 技術スタックの大幅変更
- 費用・外部サービス・セキュリティに関わる決裁
- ユーザー価値判断を伴う仕様変更
- 状態を進める行為（遷移は CLI ガードのみが実行する）
- 完了の宣言（完了へ至る経路は CLI が実行した verification の成立のみ）
```

campaign / run の自走は、AI の善意ではなく journal とガードが前提である。run の入力は AI が執筆せず CLI が機械合成し、上流成果物が欠けていれば run は物理的に始まらない。AI が判断できない事項は escalation packet を残して停止し、上流不備で続けられない場合は backtrack request で差し戻す。詳細な遷移ガードとロール責務は 05 / 12 を参照する。

### 2.3 開発 project 視点

成果物 project は、cc-iasd の都合で汚染されない。

```text
project-context/
  journal/                     # ライフサイクル状態の正本（tool-owned）
  vision/ specs/ campaigns/ runs/ decisions/ gaps/   # authored content
  evidence/                    # verification / review record
  roles/ out/ reference/
  src/                         # 成果物 repo root（nested git）。CLI は読み取りと verify 実行のみ
```

成果物 project のコード・設定・テストは `src/` 以下に置く。cc-iasd は外側から開発文脈と証跡を管理し、`src/` 配下へ cc-iasd 管理 artifact を生成しない。ディレクトリ構造の詳細は 03 を参照する。

---

## 3. 機能要件

kernel の機能要件は、3 不変条件を執行する構造として次のように構成される。旧設計の 6 分割トップレベル構成はフラット構成へ再編済みであり、物理配置は 03 を参照する。

### 3.1 project-context 初期化

cc-iasd は、フラット構成の project-context を初期化できる。

```text
init が生成するもの:
- フラット構成の scaffold（vision / specs / campaigns / runs / decisions / gaps /
  evidence / roles / out / reference / src）
- journal の初期化（append-only event store）
- project-context 自体の git init
- cc-iasd.yaml（runtime adapter / budgets / checks allowlist / decision policy /
  gate 要否 / 登録 repo）
- multi-repo の repo 登録
```

`src/` 配下へ cc-iasd 管理 artifact（管理用ディレクトリ等）を生成しない。詳細は 03 を参照する。

### 3.2 journal 正本化

ライフサイクル状態の正本は append-only journal のみである。状態を変える行為を journal に event を追記する行為と同一化し、journal を経由しない状態変更を存在させない。

```text
必要な性質:
- Markdown から status 欄を廃止し、AI が状態を書き換える経路を物理的に消す
- 遷移・検証・決裁はすべて自動で journal に event として記録される
- silent overwrite は構造的に不可能（journal 経由の状態変更に一本化）
- state 導出は journal の畳み込みで再生成でき、正本は常に journal 側にある
- journal を git 版管理し、改竄検出とタイムラインを git に委譲する
```

event schema の詳細は 06、物理形式は 03 を参照する。

### 3.3 gap 台帳

未解決事項は単一の gap 台帳に集約する。旧設計で分散していた open item / planning feedback / TBD マーカー / 差し戻し起点は gap に統合済みである。

```text
必要な性質:
- gap は kind（needs-human-decision / needs-upstream-fix / needs-info / candidate）と
  route（vision / spec / campaign / none）と blocking（true / false）を持つ
- 本文中の未確定箇所は [UNRESOLVED: gNNN] 形式で gap を参照する
- blocking gap が open の間、その artifact を入力とする下流遷移は全拒否される
- gap の close は decision へのリンク、または対象 artifact の編集と再 review でのみ成立する
- 実行結果の計画層への還流は、run の終端 packet が gap を route 付きで起票する形に一本化する
```

gap の終端条件（closed / routed / deferred の成立規則）と規約の詳細は 06 を参照する。

### 3.4 handoff の機械合成

run の入力（handoff）は AI が執筆せず、CLI が上流成果物から機械合成する。これが「推測で埋める主体を存在させない」ことの執行形である。

```text
必要な性質:
- handoff は spec / charter / decision / vision / role card / exit protocol から
  CLI が決定論的に合成する
- 必須フィールドの合成に失敗した場合（上流セクションの欠落・空・blocking gap あり）、
  run open は欠落セクションを列挙して拒否する
- 合成失敗は backtrack request の決定論的トリガーになる
```

合成元と合成失敗時の挙動の詳細は 06、run open ガードの成立条件は 05 を参照する。

### 3.5 verification

完了へ至る経路は、CLI 自身が検証を実行して生成した verification の成立のみである。LLM の完了報告文は guard の入力にならない。

```text
必要な性質:
- spec が宣言した Checks（検証コマンドと期待 exit code）を CLI が子プロセス実行し、
  exit code を期待値と照合する
- 生出力（stdout / stderr / diff.patch）を evidence に捕捉する
- base commit からの git diff を Surfaces（write / forbid glob）と照合し、
  forbid 該当は機械 FAIL、write glob 外は off-surface として自動列挙する
- verification は verify コマンドの実行によってのみ生成される
- allowlist に適合しない Checks を含む spec は ready ガードで decision 承認を要求する
```

verification の生成規則と照合の詳細は 06 を参照する。

### 3.6 終端 3 択

run は accept / block / escalate 以外で終端できない。block が最も安価な合法出口になるコスト勾配を状態機械が作り、推測で完了を装うより差し戻す方が構造的に安くなる。

```text
- accept:   verification pass + review record + blocking gap 0 が必要（最も高価）
- block:    backtrack request を生成して blocked へ（欠落 ref 指定で成立。最も安価）
- escalate: escalation packet を生成して escalated へ（decision 待ち）
```

事前に検証コマンドを宣言できない調査作業のために spike 型 run を定義し、src/ を変更せず成果物の存在チェックを最低要件として report 提出で close する。停止条件（no-progress / budget / STOP）と reject 階梯は 05 を参照する。

### 3.7 decide（人間決裁）

人間決裁は decide コマンドのみが記録でき、journal に actor=human が刻印される。

```text
必要な性質:
- decide は既定で TTY を要求し、headless agent は物理的に自己承認できない
- 非常駐人間向けに、decision ファイルを配置して取り込む非同期経路を v0 から用意する
- vision approve / campaign close の人間専権判断は decide を経由する
```

decide の機構と threat model の詳細は 05 を参照する。

### 3.8 escalation packet / backtrack request

人間判断が必要な場合や上流不備で続けられない場合、cc-iasd は終端 packet を生成する。packet はノードではなく、journal と上流成果物から機械合成される rendered packet であり、report コマンドが skeleton を生成して authored 欄を埋める。必須欄は次である。

```text
escalation packet（run escalate の終端 packet）:
- 停止理由
- 選択肢
- 各選択肢の影響
- 放置した場合の影響
- 推奨
- 再開条件
- 関連証跡（evidence への参照）

backtrack request（run block の終端 packet）:
- blocked stage
- 欠落上流 ref
- 継続不能理由
- 推測継続時のリスク
- 再開条件
```

campaign / run の完了報告は report（completion / escalation / backtrack のいずれか 1 つ）に一本化される。completion report は実装内容・検証結果・review 結果・軽微判断・残リスク・関連証跡を持ち、計画層への還流事項があれば gap を route 付きで起票する。必須欄の完全な定義と tool-owned / authored の分離は 06 を参照する。

### 3.9 multi-repo と並列 run

想定対象（3.10 節）の性質上、multi-repo な src/ と並列 run は将来拡張ではなく v0 必須要件である。

```text
必要な性質:
- src/ 配下に複数 repo を登録し、Surfaces の glob は repo プレフィックスを含む。
  1 run = 1 repo に固定せず横断 run を許す
- base commit 記録・diff snapshot・surface 照合は repo ごとに行う
- 複数 run を同時に走らせられる。task の二重取りは run open 時の claim event で排他し、
  並列可否は決定論ガード（対象 repo が互いに素か、write glob 交差が空か）で判定する
```

並列 run の排他規則・verify lock・repo 別処理の詳細は 05 / 03 を参照する。

---

## 4. 非機能要件

```text
想定対象:
  infrastructure / frontend / backend など複数の構成要素から成る数十人月規模の
  プロダクトで、人間のエンジニアが AI へ作業委任を最大化するためのシステムである。
  単一 repo・小規模デモの運用を設計の既定にしない。

再現性:
  実行時の設定と適用ガードを journal から後から確認できること。

追跡性:
  判断・review・残リスク・escalation の根拠を journal の refs チェーンから後から追えること。

委譲性:
  実装 runtime を Claude Code / Codex / shell runner などへ差し替え可能にすること。

低結合:
  実行 runtime・特定の spec-driven framework のどれか一つに過度依存しないこと。
  不変条件は Tier 0（全 runtime 共通の CLI ガードと git 監査）だけで閉じること。

成果物隔離:
  成果物 project に cc-iasd の運用痕跡を混入させないこと。

過剰統合回避:
  既存 framework を丸ごと重ねて二重管理しないこと。
```

---

## 5. 非目標

cc-iasd は次を目標にしない。

```text
非目標:
- Claude Code / Codex / Copilot の代替 runtime になること
- AGENTS.md / CLAUDE.md の代替そのものになること
- MCP のような接続 protocol になること
- GitHub Actions の代替 CI になること
- project のプロダクト方針を自動決定すること
- 技術スタックや外部サービス費用を自動決裁すること
- 既存 framework / 実装 runtime を全部丸ごと導入して混在させること
- enterprise compliance platform になること
```

---

## 6. 成立条件

Phase 1（P1 縦スライス）が成立している状態は次である。adhoc run だけで 3 不変条件と並列安全が構造で守られる最小系を成立させることが到達点である。

```text
成立条件:
- 新規 project-context をフラット構成で作成し、multi-repo の repo を登録できる
- ライフサイクル状態が journal のみに一本化され、Markdown からは状態を進められない
- src/ 外への CLI 書き込みが例外になり、src/ 内の管理物混入を doctor が検出できる
- run open --adhoc で run を開始でき、handoff が機械合成される
- 上流欠落時に run open が拒否され、backtrack request へ誘導される
- run verify が Checks を CLI 実行し、生出力捕捉と surface 照合を行う
- verification なしの accept が拒否される
- run が accept / block / escalate の 3 択で終端し、block / escalate が packet を残す
- blocking gap が open の間、その artifact を入力とする下流遷移が拒否される
- decide が TTY 既定で actor=human を刻印し、非同期取込経路を持つ
- 並列 run の task 二重取りと write glob 交差が排他される
- doctor が green であり、破り試行がすべて構造で拒否される
```

vision / spec / campaign のノード化、review gates、covers 射影などは P2 以降のスコープである（詳細は 10 を参照）。
