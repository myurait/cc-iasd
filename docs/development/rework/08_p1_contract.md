# rework 08. P1 実装契約

作成日: 2026-07-06  
状態: Phase 2 作業規約 v1.0（Phase 2 末レビューで再確認）

---

## 1. この文書の位置づけ

P1 実装（rework/05 4 章）を複数エージェントで並列実装するための実装契約である。モジュール境界・共有 API・仕様既定を固定し、並列実装の衝突と齟齬を防ぐ。rework/04 14 章の「P1 実装時に確定する事項」バッチはここで確定する（Phase 2 末レビューで再確認）。

設計正本は本編 02〜13 であり、本契約は実装の取り決めのみを定める。矛盾があれば本編が勝つ。

---

## 2. ファイル配置とモジュール境界（各エージェントの担当は互いに素）

```text
bin/cc-iasd.js            # dispatcher のみ。コマンド解決と lib/commands/* への委譲
lib/paths.js              # project-context root 解決、管理領域パス定数
lib/refuse.js             # ガード拒否メッセージ（人間可読 + --json。欠落入力と次の一手）
lib/hash.js               # content-hash（frontmatter 除外 + 空白正規化）、sha256
lib/ulid.js               # ULID 自前実装（時刻 48bit + 乱数 80bit、Crockford base32）
lib/journal.js            # event store（1-event-1-file）。append / readAll（時系列 sort）
lib/state.js              # derive(events) -> 導出 snapshot。state.json の再生成
lib/config.js             # cc-iasd.yaml の load / validate / 既定値
lib/writePath.js          # 単一 write-path。allowlist 外への書込を例外で拒否
lib/gitops.js             # project-context の auto-commit、src/ repo の base commit / diff 取得
lib/transitions.js        # 遷移エンジン。guard fn 群を実行し、通過時のみ
                          # transitioned event（guard_results 焼込）を append + auto-commit
lib/handoff.js            # handoff 機械合成（合成元は 06 の 5 章。失敗 = 欠落列挙）
lib/verify.js             # Checks 子プロセス実行 + 生出力捕捉 + Surfaces/diff 照合 + verify lock
lib/commands/init.js      # init
lib/commands/doctor.js    # doctor（構造 / 参照解決 / src 汚染 deny-glob / guard 再計算 /
                          # frontmatter refs と journal の一致 / 裸マーカー検出）
lib/commands/authoring.js # new vision|spec|campaign / spec ready / campaign launch|close / retire
lib/commands/run.js       # run open(--adhoc/--spike) / handoff / return / verify /
                          # accept / block / escalate
lib/commands/humans.js    # decide / gap add|close|route / review record
lib/commands/views.js     # status(--plan) / inbox（引数なし cc-iasd）/ report / role show
test/*.test.js            # node:test。モジュール別 + 破り試行 + e2e
```

規約: guard fn は各 command モジュール内に定義する（共有 guards ファイルは作らない。並列衝突防止）。lib/ のコア API は本契約が固定し、実装エージェントは変更しない（不足があれば最終報告で申告）。

## 3. 共有 API（並列実装の前提。シグネチャ厳守）

```text
journal.append(root, event) -> eventId
  event: { type, subject, actor: {kind, session?}, data?, payload?: {path, sha256}, refs?: [{rel,to}] }
  id / ts は append が付与。ファイル名 <ulid>.json。書込は writePath 経由
journal.readAll(root) -> Event[]（ULID 昇順）

state.derive(events) -> {
  nodes: { "<kind>:<id>": { status, hash?, refs, reject_count?, ... } },
  gaps:  { "gNNN": { kind, route, blocking, status } },
  runs:  { "<run-id>": { status, campaign?, spec?, repos: {name: baseCommit}, type } } }

config.load(root) -> Config（4 章の schema。欠落キーは既定値で補完）

writePath.write(root, relPath, content) / writePath.rm(root, relPath)
  allowlist: vision/ specs/ campaigns/ runs/ evidence/ decisions/ gaps/ roles/ journal/
             out/ state.json cc-iasd.yaml。src/ と reference/ への書込は例外

refuse(cmd, missing: [{input, detail}], next: [command...]) -> exit 2
  --json 時は { ok:false, command, missing, next } を stdout へ

transitions.attempt(root, { subject, from, to, guards: [fn...] })
  guard fn: (ctx) -> { name, pass: bool, detail }
  全 pass -> transitioned event（data.guard_results = 全結果）+ gitops.autoCommit
  fail あり -> refuse で拒否（journal へは書かない）

verify.run(root, runId) -> { pass, checks: [...], surface: {offSurface: [], forbidden: []} }
  実行は repo 単位 lock（lockfile）で直列化。生出力は evidence/verifications/<run-id>/ へ
```

## 4. cc-iasd.yaml schema と数値既定（P1 確定バッチ）

```text
doc_lang: Japanese            # role card の {{docLang}} を init が確定
dev_lang: TypeScript
repos:                        # multi-repo 登録
  - { name: api, path: src/api }
budgets:
  max_minutes: 90             # run open からの経過で判定
  no_progress_runs: 2         # 直近 N run で diff/task 進捗ゼロなら open 拒否
  session_stale_minutes: 15   # status の stale 表示閾値
reject_limit: 2               # 到達で accept 封鎖、escalate のみ
checks_allowlist: ["npm ", "npx ", "node ", "git "]   # prefix match
gates: { spec: required, run: required }   # launch / completion は常に required（変更不可）
runtime: { adapter: none }    # P1 は none のみ（handoff stdout が正本経路）
decision: { require_tty: true, allow_adopt: false }
```

## 5. その他の確定事項（P1 確定バッチ）

```text
- out/ レイアウト: out/<run-id>/handoff.md（P3 で bundle が増える）
- run ID: r-<ulid26>-<slug>。gap ID: gNNN（連番）。他は v/s/c/dNNN-<slug>
- decision の authored セクション: ## 判断 / ## 根拠 / ## 対象（refs）
- spike run: journal の run type=spike。終端 report は kind=completion
  （成果 = 調査結果。第 4 の kind は設けない）
- new が記録する event: created（subject=<kind>:<id>）。vision の承認は
  decide --approve vision:<id> が decision.recorded + transitioned(draft->approved) を起こす
- report コマンド: report.md skeleton 生成 + created event（subject=report:<run-id>）。
  状態遷移は起こさない（終端遷移は accept / block / escalate / campaign close が担う）
- session start / resume は P3（P1 では提供しない。5 分導入は run handoff の stdout パイプ）
- 依存: js-yaml のみ。Node >= 18、node:test を使用
- journal の auto-commit 粒度: 遷移 event ごとに 1 commit（観察後に調整。09 参照）
```

## 6. 破り試行テスト（2-E 必須。すべて「拒否されること」を検証）

```text
(a) verification なしで run accept -> 拒否
(b) 上流欠落（spec の必須セクション空 / blocking gap）で run open -> 欠落列挙つき拒否
(c) CLI で src/ 配下へ書込 -> writePath 例外。src/ 内に管理物を置くと doctor が検出
(d) blocking gap open のまま spec ready / campaign launch -> 拒否
(e) 並列 run: 同一 task の二重 claim / write glob 交差 open -> 拒否
+ e2e: init -> run open --adhoc -> handoff -> (擬似実装) -> return -> verify -> accept
```
