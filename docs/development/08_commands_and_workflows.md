# 08. Commands / Workflows

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. この文書の目的

この文書は、ledger の主要 command と workflow を定義する。

command は完全な実行基盤ではない。Markdown scaffold、外部 framework 呼び出し、テンプレート生成、状態更新を行う薄い CLI として定義する。

---

## 2. 主要 command

```text
cc-iasd init
cc-iasd run cycle <id>
cc-iasd escalate <scope-ref>
cc-iasd report <scope-ref>
cc-iasd view evidence
cc-iasd view current
cc-iasd view scope <id>
cc-iasd view cycle <id>
cc-iasd log event
cc-iasd review add
cc-iasd feature add <id>
cc-iasd roadmap add <id>
cc-iasd milestone add <id>
cc-iasd spec add <id>
cc-iasd product outdate ideal|spec <id>
cc-iasd ops archive feature|roadmap|milestone|cycle|log|review|report <id>
cc-iasd doctor
```

横断 index は正本化しない。AI や人間に渡す要約が必要な場合は `cc-iasd view ...` が標準出力に一時 view を生成する。

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
8. product/specs/ を作成する、または Spec Kit 初期化を実行する
9. ops/scopes/ を作成する
10. ops/cycles/ を作成する
11. ops/evidence/ を作成する
12. reference/ を作成する
13. src/ を作成する
14. 最小 template を配置する
15. framework version を記録する
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

## 4. cc-iasd run cycle <id>

### 4.1 目的

対象 scope の自走実行 cycle を開始、または実行に必要な handoff packet を作る。

### 4.2 初期実装での扱い

初期実装では、完全自動実行を前提にしない。

```text
run:
- 対象 spec / tasks を解決する
- linked roadmap / feature / milestone を確認する
- 自走条件を確認する
- 実行 runtime に渡す handoff.md を生成する
- state.md を初期化する
- knowledge.md を用意する
- ops/evidence/logs/ に run event を記録する
```

初期実装では、`ops/cycles/cycle_<timestamp>_<scope>/state.md`、`handoff.md`、`knowledge.md` を作る。既存 cycle record は上書きしない。

### 4.3 処理

```text
処理:
1. cycle id を解決
2. linked spec を確認
3. linked tasks を確認
4. linked scope を確認
5. autonomy protocol を確認
6. blocker / open item の有無を確認
7. 実行 runtime 用の handoff.md を作成
8. state.md を更新
9. ops/evidence/logs/ に run event を記録
```

### 4.4 停止条件

次の場合は run を開始せず escalation を促す。

```text
停止:
- 対象 spec がない
- tasks がない
- cycle scope が曖昧
- user decision が未解決
- src/ root が解決不能
- roadmap / milestone 目的変更が必要
```

---

## 5. cc-iasd escalate <scope-ref>

### 5.1 目的

人間判断が必要な停止状態を Escalation Packet に整形する。

### 5.2 処理

```text
処理:
1. cycle state を読む
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

scope または cycle の完了報告を生成する。

### 6.2 処理

```text
処理:
1. cycle state を読む
2. linked product / scope artifacts を読む
3. related logs を確認する
4. related reviews を確認する
5. test / lint / build 結果を整理する
6. 軽微判断を整理する
7. 残リスクを整理する
8. cycle-local open item を resolved / escalated / promoted / deferred に分類する
9. ops/evidence/reports/ に completion report を作成する
10. ops/evidence/logs/ に report event を記録する
```

### 6.3 出力

```text
ops/evidence/reports/report_<timestamp>_completion.md
```

---

## 7. cc-iasd log event

### 7.1 目的

project-context 全体の時系列作業台帳へ、明示的な log event を追加する。

### 7.2 処理

```text
処理:
1. event type を受け取る
2. summary を受け取る
3. 任意で related product / scope / cycle / evidence refs を受け取る
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
4. summary と result を受け取る
5. ops/evidence/reviews/ に review file を作成する
6. ops/evidence/logs/ に review event を記録する
```

### 8.3 出力

```text
ops/evidence/reviews/review_<timestamp>_<scope>.md
```

review は milestone 配下に置かない。milestone、cycle、spec、roadmap などは review ID または path を参照する。

---

## 9. cc-iasd feature add <id>

### 9.1 目的

ideal と roadmap の間に置く feature scope を追加する。

### 9.2 処理

```text
処理:
1. feature id を受け取る
2. kind を epic / supporting などの metadata として受け取る
3. summary と ideal refs を受け取る
4. ops/scopes/features/ に feature file を作成する
5. ops/evidence/logs/ に feature event を記録する
```

### 9.3 出力

```text
ops/scopes/features/<id>.md
```

初期実装では、既存 feature file は上書きしない。

feature file は構造化 backlog を持つ。cycle-local open item が後続 planning 対象に昇格した場合は、feature backlog に `promoted` として記録する。

---

## 10. cc-iasd roadmap add <id>

### 10.1 目的

feature layer を入力にして、milestone へ切り出す前の roadmap scope を追加する。

### 10.2 処理

```text
処理:
1. roadmap id を受け取る
2. summary と goal を受け取る
3. ops/scopes/roadmaps/ に roadmap file を作成する
4. ops/evidence/logs/ に roadmap event を記録する
```

### 10.3 出力

```text
ops/scopes/roadmaps/<id>.md
```

初期実装では、既存 roadmap file は上書きしない。

---

## 11. cc-iasd milestone add <id>

### 11.1 目的

roadmap 上の到達点または計画境界として milestone scope を追加する。

### 11.2 処理

```text
処理:
1. milestone id を受け取る
2. linked roadmap / spec / tasks を受け取る
3. scope summary を受け取る
4. ops/scopes/milestones/ に milestone file を作成する
5. ops/evidence/logs/ に milestone event を記録する
```

### 11.3 出力

```text
ops/scopes/milestones/<id>.md
```

milestone は `evidence.md`、`handoff.md`、`reviews/` を内包しない。

---

## 12. cc-iasd spec add <id>

### 12.1 目的

Spec Kit 互換の spec / plan / tasks 正本の最小受け皿を作成する。

### 12.2 処理

```text
処理:
1. spec id を受け取る
2. summary を受け取る
3. product/specs/<id>/requirements.md を作成する
4. product/specs/<id>/plan.md を作成する
5. product/specs/<id>/tasks.md を作成する
6. ops/evidence/logs/ に spec event を記録する
```

### 12.3 出力

```text
product/specs/<id>/requirements.md
product/specs/<id>/plan.md
product/specs/<id>/tasks.md
```

初期実装では、既存 spec file は上書きしない。

---

## 13. 初期 workflow

```text
0. project-context 作成
1. cc-iasd init
2. user/ に意図と制約を書く
3. product/ideal/ に ideal を作成または更新する
4. ops/scopes/features/ で feature scope を整理する
5. ops/scopes/roadmaps/ で roadmap を定義する
6. product/specs/ で requirements / plan / tasks を作る
7. ops/scopes/milestones/ で milestone を定義する
8. cc-iasd run cycle <id>
9. Worker runtime が src/ を編集する
10. Reviewer runtime または人間が ops/evidence/reviews/ に review を記録する
11. ops/evidence/logs/ を更新する
12. 問題があれば cc-iasd escalate <scope-ref>
13. 完了したら cc-iasd report <scope-ref>
14. 古くなった product artifact は cc-iasd product outdate で outdated/ に退避する
15. 古くなった ops artifact は cc-iasd ops archive で archived/ に退避する
```

---

## 14. 実行 runtime への handoff

初期実装では、cycle handoff は cycle-local な Markdown packet とする。

```markdown
# Cycle Handoff

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

## 15. Reviewer workflow

```text
Reviewer workflow:
1. Worker の変更を確認
2. product/specs/<id>/tasks.md の完了条件と照合
3. test / lint / build 結果を確認
4. scope 外変更がないか確認
5. review を ops/evidence/reviews/ に記録
6. cycle state または scope artifact に review ref を記録
7. bounded remediation か escalation かを判定
```

---

## 16. cc-iasd view

### 16.1 目的

正本ファイルを増やさず、AI または人間に渡すための一時 view を標準出力に生成する。

### 16.2 処理

```text
処理:
1. evidence view は milestone / cycle / review / report の関連 path を列挙する
2. current view は現行 product / scope / cycle / recent evidence の path を列挙する
3. scope view は指定 id に対応する feature / roadmap / milestone / spec と関連 evidence をまとめる
4. cycle view は指定 cycle の state / handoff / knowledge をまとめる
5. 生成した view はファイルとして保存しない
```

### 16.3 出力

```text
cc-iasd view evidence
cc-iasd view current
cc-iasd view scope <id>
cc-iasd view cycle <id>
```

---

## 17. cc-iasd product outdate

### 17.1 目的

product 正本でなくなった ideal または spec を `outdated/` に退避する。

### 17.2 処理

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

## 18. cc-iasd ops archive

### 18.1 目的

ops artifact を、各 layer の `archived/` に退避する。

### 18.2 処理

```text
処理:
1. 対象 layer を feature / roadmap / milestone / cycle / log / review / report から受け取る
2. 対象 id を受け取る
3. 対応する active artifact を同一 layer の archived/ に移動する
4. ops/evidence/logs/ に ops-archive event を記録する
```

既存 destination は上書きしない。archive 済み artifact への log reference は、doctor が archived/ 側も解決候補として扱う。

---

## 19. cc-iasd doctor

### 19.1 目的

project-context の整合性を検査する。

### 19.2 処理

```text
検査例:
- src/ が存在するか
- product/ideal/ が存在するか
- product/specs/ が存在するか
- ops/scopes/ が存在するか
- ops/cycles/ が存在するか
- ops/evidence/ が存在するか
- lock.json があるか
- linked tasks が解決できるか
- evidence references が壊れていないか
```

doctor は、project-context scaffold の必須パス、旧 ledger 由来パスの混入、product / ops の archive 規則、artifact 間参照を検査する。

---

## 20. command 設計の原則

```text
原則:
- 既存 framework command を再実装しない
- cc-iasd command は統合・委譲・状態管理を担う
- product 正本と ops transaction を混ぜない
- src/ root を常に明示する
- 自走前に scope と cycle を確認する
- 停止時は escalation report に変換する
- 完了時は completion report に変換する
- 横断 index を正本化しない
```
