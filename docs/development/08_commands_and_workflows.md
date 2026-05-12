# 08. Commands / Workflows

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. この文書の目的

この文書は、cc-iasd の主要 command と workflow を定義する。

command は完全な実行基盤ではない。Markdown scaffold、外部 framework 呼び出し、テンプレート生成、状態更新を行う薄い CLI として定義する。

---

## 2. 主要 command

```text
cc-iasd init
cc-iasd ideal add <id>
cc-iasd campaign add <id>
cc-iasd campaign mark-run <campaign-id> <run-id>
cc-iasd run start <id>
cc-iasd escalate <scope-ref>
cc-iasd report <scope-ref>
cc-iasd view evidence
cc-iasd view current
cc-iasd view scope <id>
cc-iasd view run <id>
cc-iasd log event
cc-iasd review add
cc-iasd open-item add <run-id>
cc-iasd open-item resolve <run-id> <item-id>
cc-iasd feature add <id>
cc-iasd roadmap add <id>
cc-iasd spec add <id>
cc-iasd reference add historical|external|note <id>
cc-iasd profile update
cc-iasd product outdate ideal|spec <id>
cc-iasd ops archive feature|roadmap|campaign|run|log|review|report <id>
cc-iasd doctor
```

横断 index は正本化しない。AI や人間に渡す要約が必要な場合は `cc-iasd view ...` が標準出力に一時 view を生成する。

### 2.1 artifact 作成権限

project-context 運用中、AI agent は `src/` 配下では通常の実装成果として新規ファイルを作成してよい。

一方、`product/`、`ops/`、`rules/`、`runtime/`、`user/`、`reference/` 配下の cc-iasd-managed artifact について、AI agent は新規ファイル作成、移動、rename、archive、outdate、削除、lifecycle metadata 更新を直接行わない。

新規 artifact は cc-iasd command または明示的人間操作で作成する。AI agent は、command が作成した artifact のうち、本文、背景、選択肢、判断理由、補足、実装結果などの authored content section を執筆する。

command が管理する領域は次である。

```text
tool-owned:
- artifact id
- created / updated timestamp
- lifecycle status
- source run / source campaign
- target reference
- resolution
- archive / outdate placement
```

AI agent が執筆できる領域は次である。

```text
authored:
- summary details
- background
- options
- recommendation
- implementation notes
- risk notes
- report narrative
```

---

## 3. cc-iasd init

### 3.1 目的

project-context を初期化する。

### 3.2 入力

```text
cc-iasd init <project-context-path>
```

### 3.3 処理

```text
処理:
1. project-context directory を作成する
2. runtime/ を作成する
3. lock.json を作成する
4. rules/ を作成する
5. user/ を作成する
6. product/ を作成する
7. product/ideal/ を作成する
8. product/specs/ を作成する
9. ops/scopes/ を作成する
10. ops/execution/ を作成する
11. ops/execution/campaigns/ を作成する
12. ops/execution/runs/ を作成する
13. ops/evidence/ を作成する
14. reference/ を作成する
15. src/ を作成する
16. 最小 template を配置する
17. runtime profile / plugin / adapter metadata を記録する
18. framework version を記録する
```

### 3.4 出力

```text
project-context/
  runtime/
  rules/
  user/
  product/
  ops/
  reference/
  src/
```

---

## 4. cc-iasd run start <id>

### 4.1 目的

対象 task selection の run を開始し、実行に必要な runtime context と handoff packet を作る。

### 4.2 初期実装での扱い

初期実装では、完全自動実行を前提にしない。

```text
run:
- 対象 spec / tasks を解決する
- linked roadmap / feature / campaign を確認する
- 自走条件を確認する
- 実行 runtime に渡す handoff.md を生成する。handoff は selected tasks、expected local outcome、likely touched surfaces、related impact surfaces、non-regression focus、escalation triggers、local verification、open item routing を持つ
- state.md を初期化する
- open-items.md を用意する
- knowledge.md を用意する
- campaign source から開始した場合、campaign queue に run を登録する
- ops/evidence/logs/ に run event を記録する
```

初期実装では、`ops/execution/runs/run_<timestamp>_<scope>/plan.md`、`handoff.md`、`state.md`、`open-items.md`、`knowledge.md` を作る。既存 run record は上書きしない。

### 4.3 処理

```text
処理:
1. run source id を解決
2. linked spec を確認
3. linked tasks を確認
4. linked scope を確認
5. autonomy protocol を確認
6. blocker / open item の有無を確認
7. 実行 runtime 用の handoff.md を作成
8. state.md を初期化
9. open-items.md を初期化
10. campaign queue に running run として登録
11. ops/evidence/logs/ に run event を記録
```

### 4.4 停止条件

次の場合は run を開始せず escalation を促す。

```text
停止:
- 対象 spec がない
- tasks がない
- run scope が曖昧
- expected local outcome が定義できない
- related impact surfaces または non-regression focus が空のままになる
- user decision が未解決
- src/ root が解決不能
- roadmap / campaign 目的変更が必要
```

---

## 5. cc-iasd escalate <scope-ref>

### 5.1 目的

人間判断が必要な停止状態を Escalation Packet に整形する。

### 5.2 処理

```text
処理:
1. run state を読む
2. linked product / scope artifacts を読む
3. related logs / reviews を読む
4. 停止理由を整理する
5. 選択肢を整理する
6. 推奨案を出す
7. ops/evidence/reports/ に escalation report を作成する
8. ops/evidence/logs/ に escalation event を記録する
```

### 5.3 出力

```text
ops/evidence/reports/report_<timestamp>_escalation.md
```

---

## 6. cc-iasd report <scope-ref>

### 6.1 目的

scope、campaign、run の完了報告を生成する。

### 6.2 処理

```text
処理:
1. run state を読む
2. linked product / scope artifacts を読む
3. related logs を確認する
4. related reviews を確認する
5. test / lint / build 結果を整理する
6. 軽微判断を整理する
7. 残リスクを整理する
8. Planning Feedback Summary の authored section を用意する
9. ops/evidence/reports/ に completion report を作成する
10. ops/evidence/logs/ に report event を記録する
```

### 6.3 出力

```text
ops/evidence/reports/report_<timestamp>_<scope>.md
```

report command は source artifact 全文を report に複製しない。source artifact、run state、review、既存 report への参照を作成し、AI agent が Completion Assessment や Planning Feedback Summary などの authored content を執筆する。

Planning Feedback Summary は、roadmap / feature / spec / ideal への直接更新ではない。Execution Manager が completion report と同時に返す Planning Feedback Packet の要約または下書きであり、Planning Lead が別 entry point として再開したときに分類して処理する。

Planning Feedback Summary と Planning Feedback Packet の各 item は、Type と Recommended Planning Role をそれぞれ 1 つだけ持つ。1 つの観測が複数の planning layer または role にまたがる場合は、単一 item に併記せず、item を分割して記録する。

---

## 7. cc-iasd log event

### 7.1 目的

project-context 全体の時系列作業台帳へ、明示的な log event を追加する。

### 7.2 処理

```text
処理:
1. event type を受け取る
2. summary を受け取る
3. 任意で related product / scope / execution / evidence refs を受け取る
4. ops/evidence/logs/log_<timestamp>_<type>.md を作成する
```

### 7.3 出力

```text
ops/evidence/logs/log_<timestamp>_<type>.md
```

初期実装では、新規 log file を作る。既存 log file への追記は行わない。最新状態は `cc-iasd view current` で確認する。

---

## 8. cc-iasd review add

### 8.1 目的

scope 横断の review record を `ops/evidence/reviews/` に作成する。

### 8.2 処理

```text
処理:
1. review scope type を受け取る
2. review scope refs を受け取る
3. review type を受け取る
4. 任意で review mode を受け取る
5. summary と result を受け取る
6. ops/evidence/reviews/ に review file を作成する
7. ops/evidence/logs/ に review event を記録する
```

### 8.3 出力

```text
ops/evidence/reviews/review_<timestamp>_<scope>.md
```

review は特定 scope 配下に置かない。run、campaign、spec、roadmap などは review ID または path を参照する。

Devil's Advocate を campaign 走行前または完了前に起動する場合、review mode として `design-launch` または `campaign-completion` を記録する。この 2 つの review mode は campaign の走行可否または完了可否に関わるため、`--type full` でなければならない。

---

## 9. cc-iasd open-item add / resolve

### 9.1 目的

run-local open item の作成と解決分類を command-owned operation として扱う。

### 9.2 処理

```text
add:
1. run id を受け取る
2. kind、summary、任意の target ref を受け取る
3. ops/execution/runs/<run-id>/open-items.md に item entry を追加する
4. ops/evidence/logs/ に open-item-add event を記録する

resolve:
1. run id と open item id を受け取る
2. resolution を resolved / escalated / promoted / deferred から受け取る
3. 任意の target ref と summary を受け取る
4. open item metadata を更新する
5. ops/evidence/logs/ に open-item-resolve event を記録する
```

### 9.3 出力

```text
ops/execution/runs/<run-id>/open-items.md
```

open item の ID、kind、status、source run、target、resolution、created / updated timestamp は command が管理する。AI agent は command が作成した entry の Background、Options、Recommendation、Notes を執筆する。

open item の Background、Options、Recommendation、Planning Feedback Routing、Notes は高密度 feedback の authored section として扱う。metadata だけで planning-layer follow-up を完了扱いにしてはならない。

open item kind は、実行中に自然発生する planning gap を分類するため、`roadmap-gap`、`feature-gap`、`spec-gap` を許可する。解決時に planning artifact へ戻す必要がある場合は、resolution を `promoted` とし、Planning Feedback Routing に target candidate と evidence refs を記述する。

---

## 10. cc-iasd ideal add <id>

### 10.1 目的

product ideal 正本を追加する。

### 10.2 処理

```text
処理:
1. ideal id を iNNN-kebab-case として受け取る
2. summary を受け取る
3. product/ideal/<id>.md を作成する
4. ops/evidence/logs/ に ideal-add event を記録する
```

### 10.3 出力

```text
product/ideal/<id>.md
```

初期実装では、既存 ideal file は上書きしない。古くなった ideal は直接移動せず、`cc-iasd product outdate ideal <id>` で `outdated/` に退避する。

ideal artifact が存在する場合、doctor は Product Ideal、Experience Principles、Boundaries の authored section が空でないことを検査する。ideal の本文が薄いまま feature / roadmap / spec へ進むことは許可しない。

---

## 11. cc-iasd feature add <id>

### 11.1 目的

ideal と roadmap の間に置く feature scope を追加する。

### 11.2 処理

```text
処理:
1. feature id を fNNN-kebab-case として受け取る
2. kind を epic / supporting などの metadata として受け取る
3. summary と ideal refs を受け取る
4. ops/scopes/features/ に feature file を作成する
5. ops/evidence/logs/ に feature event を記録する
```

### 11.3 出力

```text
ops/scopes/features/<id>.md
```

初期実装では、既存 feature file は上書きしない。

feature file は構造化 backlog を持つ。run-local open item が後続 planning 対象に昇格した場合は、feature backlog に `promoted` として記録する。

---

## 12. cc-iasd roadmap add <id>

### 12.1 目的

feature layer を入力にして、campaign / run へ接続する roadmap scope を追加する。

### 12.2 処理

```text
処理:
1. roadmap id を受け取る
2. summary と goal を受け取る
3. ops/scopes/roadmaps/ に roadmap file を作成する
4. ops/evidence/logs/ に roadmap event を記録する
```

### 12.3 出力

```text
ops/scopes/roadmaps/<id>.md
```

初期実装では、既存 roadmap file は上書きしない。

---

## 13. cc-iasd campaign add <id>

### 13.1 目的

複数 run の進行制御を担う campaign を追加する。

### 13.2 処理

```text
処理:
1. campaign id を受け取る
2. linked roadmap / spec / tasks を受け取る
3. user experience outcome / feature-spec coverage / task selector / stop condition / progression condition / cross-run non-regression focus / impact map / Devil's Advocate Focus / Devil's Advocate Design Launch Review / completion condition を受け取る
4. ops/execution/campaigns/ に campaign directory を作成する
5. ops/evidence/logs/ に campaign event を記録する
```

### 13.3 出力

```text
ops/execution/campaigns/<id>/plan.md
ops/execution/campaigns/<id>/state.md
ops/execution/campaigns/<id>/queue.md
ops/execution/campaigns/<id>/aggregate-report.md
```

campaign は runtime output を直接内包しない。実行結果は `ops/evidence/` に置き、Source Campaign / Source Run で関連付ける。

Devil's Advocate Focus は、Devil's Advocate の監査範囲を制限しない。計画時点で特に警戒すべき項目を明示するための入力である。

Devil's Advocate Design Launch Review は、campaign 作成後、最初の run を開始する前に記録される review evidence への参照である。campaign 完了時の Campaign Completion Review とは review mode を分ける。

aggregate-report.md は campaign の複数 run を横断する authored summary である。Execution Manager は各 run の completion report、open items、review evidence、Planning Feedback Packet をもとに、Progression Summary、Open Item Rollup、Planning Feedback Rollup を更新する。aggregate-report.md は roadmap / feature / spec の正本更新を代替しない。

### 13.4 cc-iasd campaign mark-run

campaign queue に登録済みの run を `completed / blocked / escalated / deferred` のいずれかに更新する。

```text
処理:
1. campaign id と run id を受け取る
2. status を completed / blocked / escalated / deferred から受け取る
3. ops/execution/campaigns/<id>/queue.md の該当 run status を更新する
4. ops/execution/runs/<run-id>/state.md の Result と Last Update を更新する
5. ops/execution/campaigns/<id>/state.md の Result と Last Update を queue から更新する
6. ops/evidence/logs/ に campaign-mark-run event を記録する
```

AI agent は queue.md を直接編集して進行状態を変更しない。

---

## 14. cc-iasd spec add <id>

### 14.1 目的

Spec Kit 互換 dialect の spec / plan / tasks 正本の最小受け皿を作成する。

### 14.2 処理

```text
処理:
1. spec id を受け取る
2. summary を受け取る
3. product/specs/<id>/spec.md を作成する
4. product/specs/<id>/plan.md を作成する
5. product/specs/<id>/research.md を作成する
6. product/specs/<id>/data-model.md を作成する
7. product/specs/<id>/contracts/README.md を作成する
8. product/specs/<id>/tasks.md を作成する
9. ops/evidence/logs/ に spec event を記録する
```

### 14.3 出力

```text
product/specs/<id>/spec.md
product/specs/<id>/plan.md
product/specs/<id>/research.md
product/specs/<id>/data-model.md
product/specs/<id>/contracts/README.md
product/specs/<id>/tasks.md
```

初期実装では、既存 spec file は上書きしない。

---

## 15. cc-iasd reference add historical|external|note <id>

### 15.1 目的

正本ではない参照資料、外部資料、補助 note の受け皿を command-created artifact として追加する。

### 15.2 処理

```text
処理:
1. reference kind を historical / external / note から受け取る
2. reference id を lowercase-kebab-case として受け取る
3. summary を受け取る
4. reference/<kind-dir>/<id>.md を作成する
5. reference/INDEX.md に参照 entry を追加する
6. ops/evidence/logs/ に reference-add event を記録する
```

### 15.3 出力

```text
reference/historical-documents/<id>.md
reference/external/<id>.md
reference/notes/<id>.md
reference/INDEX.md
```

AI agent は command が作成した reference file の Notes / Source Material を執筆する。新規 reference file の直接作成は行わない。

---

## 16. cc-iasd profile update

### 16.1 目的

runtime profile、plugin metadata、adapter metadata を非破壊で補完する。

### 16.2 処理

```text
処理:
1. project-context root を解決する
2. rules/roles/ から role runtime manifest を生成する
3. runtime/profile.md を作成する
4. runtime/plugins.yaml を作成する
5. runtime/adapters/README.md を作成する
6. runtime/adapters/role-runtime.md を作成する
```

### 16.3 出力

```text
runtime/profile.md
runtime/plugins.yaml
runtime/adapters/README.md
runtime/adapters/role-runtime.md
```

既存 file は上書きしない。runtime profile files を再生成する場合は `--force` を明示する。

---

## 17. 初期 workflow

```text
0. project-context 作成
1. cc-iasd init
2. user/ に意図と制約を書く
3. cc-iasd ideal add で ideal artifact を作成し、本文 section を執筆する
4. cc-iasd feature add で feature scope を作成し、本文 section を執筆する
5. cc-iasd roadmap add で roadmap を作成し、本文 section を執筆する
6. cc-iasd spec add で spec / plan / tasks を作成し、本文 section を執筆する
7. cc-iasd campaign add で campaign を作成し、本文 section を執筆する
8. cc-iasd run start <id>
9. Worker runtime が src/ を編集する
10. open item が発生した場合は cc-iasd open-item add / resolve で metadata を管理する
11. campaign queue の run status は cc-iasd campaign mark-run で更新する
12. Reviewer runtime または人間が cc-iasd review add で review を記録する
13. ops/evidence/logs/ は cc-iasd command が event として更新する
14. 問題があれば cc-iasd escalate <scope-ref>
15. 完了したら cc-iasd report <scope-ref>
16. 古くなった product artifact は cc-iasd product outdate で outdated/ に退避する
17. 古くなった ops artifact は cc-iasd ops archive で archived/ に退避する
```

---

## 18. 実行 runtime への handoff

初期実装では、run handoff は run-local な Markdown packet とする。

```markdown
# Run Handoff

## Scope

## Source Root

src/

## Linked Product Artifacts

## Linked Scope Artifacts

## Constraints

## Do Not Change

## Expected Output

## Evidence To Record
```

---

## 19. Reviewer workflow

```text
Reviewer workflow:
1. Worker の変更を確認
2. product/specs/<id>/tasks.md の完了条件と照合
3. test / lint / build 結果を確認
4. scope 外変更がないか確認
5. review を ops/evidence/reviews/ に記録
6. run state または scope artifact に review ref を記録
7. bounded remediation か escalation かを判定
```

---

## 20. cc-iasd view

### 20.1 目的

正本ファイルを増やさず、AI または人間に渡すための一時 view を標準出力に生成する。

### 20.2 処理

```text
処理:
1. evidence view は campaign / run / review / report の関連 path を列挙する
2. current view は現行 product / scope / execution / recent evidence の path を列挙する
3. scope view は scope 境界レビュー用 view として、指定 id から linked feature / roadmap / spec / campaign / run を辿り、Planning Lead または Execution Manager が境界の重複、不足、実行対象のずれを確認するための artifact と関連 evidence をまとめる
4. run view は指定 run の state / handoff / knowledge をまとめる
5. 生成した view はファイルとして保存しない
```

### 20.3 出力

```text
cc-iasd view evidence
cc-iasd view current
cc-iasd view scope <id>
cc-iasd view run <id>
```

---

## 21. cc-iasd product outdate

### 21.1 目的

product 正本でなくなった ideal または spec を `outdated/` に退避する。

### 21.2 処理

```text
処理:
1. 対象 layer を ideal / spec から受け取る
2. 対象 id を受け取る
3. product/ideal/<id>.md を product/ideal/outdated/<id>.md に移動する
4. または product/specs/<id>/ を product/specs/outdated/<id>/ に移動する
5. ops/evidence/logs/ に product-outdate event を記録する
```

既存 destination は上書きしない。

---

## 22. cc-iasd ops archive

### 22.1 目的

ops artifact を、各 layer の `archived/` に退避する。

### 22.2 処理

```text
処理:
1. 対象 layer を feature / roadmap / campaign / run / log / review / report から受け取る
2. 対象 id を受け取る
3. 対応する active artifact を同一 layer の archived/ に移動する
4. ops/evidence/logs/ に ops-archive event を記録する
```

既存 destination は上書きしない。archive 済み artifact への log reference は、doctor が archived/ 側も解決候補として扱う。

---

## 23. cc-iasd doctor

### 23.1 目的

project-context の整合性を検査する。

### 23.2 処理

```text
検査例:
- src/ が存在するか
- product/ideal/ が存在するか
- product/specs/ が存在するか
- ops/scopes/ が存在するか
- ops/execution/ が存在するか
- ops/execution/campaigns/ が存在するか
- ops/execution/runs/ が存在するか
- ops/evidence/ が存在するか
- lock.json があるか
- linked tasks が解決できるか
- evidence references が壊れていないか
```

doctor は、project-context scaffold の必須パス、禁止パスの混入、product / ops の archive 規則、artifact 間参照を検査する。

doctor は framework 開発用資料の存在や参照を検査しない。開発資料の release 前整理は、project-context doctor とは別の管理方針で扱う。

---

## 24. command 設計の原則

```text
原則:
- 既存 framework command を再実装しない
- cc-iasd command は統合・委譲・状態管理を担う
- product 正本と ops transaction を混ぜない
- src/ root を常に明示する
- 自走前に scope と run を確認する
- 停止時は escalation report に変換する
- 完了時は completion report に変換する
- 横断 index を正本化しない
```
