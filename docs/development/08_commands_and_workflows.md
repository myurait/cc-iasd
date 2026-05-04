# 08. Commands / Workflows

作成日: 2026-05-04  
状態: 統合整理版 v0.1

---

## 1. この文書の目的

この文書は、ledger の主要 command と workflow を定義する。

MVP では、command は完全な実行基盤でなくてよい。Markdown scaffold、外部 framework 呼び出し、テンプレート生成、状態更新を行う薄い CLI で成立させる。

---

## 2. 主要 command

```text
cc-iasd init
cc-iasd run milestone <id>
cc-iasd escalate <id>
cc-iasd report <id>
cc-iasd index evidence
cc-iasd log event
cc-iasd feature add <id>
cc-iasd roadmap add <id>
cc-iasd spec add <id>
```

後段候補は別扱いにする。

```text
後段候補:
cc-iasd doctor
cc-iasd sync
cc-iasd update-profile
cc-iasd add-plugin
cc-iasd audit
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
6. ops/ を作成する
7. ops/features/ を作成する
8. ops/specs/ を作成する、または Spec Kit 初期化を実行する
9. ops/logs/ を作成する
10. src/ を作成する
11. 最小 template を配置する
12. framework version を記録する
```

### 3.4 出力

```text
project-context/
  runtime/
  rules/
  user/
  ops/
  src/
```

`rules/templates/` には、feature index、feature backlog、milestone status、milestone evidence、milestone handoff、review の最小テンプレートを配置する。

---

## 4. cc-iasd run milestone <id>

### 4.1 目的

対象 milestone の自走実行を開始、または実行に必要な handoff packet を作る。

### 4.2 MVP での扱い

MVP では、完全自動実行でなくてよい。

```text
MVP の run:
- 対象 spec / tasks を解決する
- linked roadmap / feature を確認する
- 自走条件を確認する
- 実行 runtime に渡す prompt / task packet を生成する
- status を更新する
- evidence の空枠を作る
```

MVP の初期実装では、`ops/milestones/<id>/status.md`、`ops/milestones/<id>/evidence.md`、`ops/milestones/<id>/handoff.md`、`ops/milestones/<id>/reviews/README.md` を作る。既存の milestone record は上書きしない。
実行時には `ops/logs/` に run event を記録する。
`--feature`、`--roadmap`、`--spec`、`--tasks` が指定された場合は、`status.md` と `handoff.md` の linked planning artifacts に初期記録する。

### 4.3 処理

```text
処理:
1. milestone id を解決
2. linked spec を確認
3. linked tasks を確認
4. autonomy protocol を確認
5. blocker の有無を確認
6. 実行 runtime 用の作業内容を作成
7. status.md を更新
8. evidence.md に run 開始を記録
```

### 4.4 停止条件

次の場合は run を開始せず escalation を促す。

```text
停止:
- 対象 spec がない
- tasks がない
- milestone scope が曖昧
- user decision が未解決
- src/ root が解決不能
- roadmap / milestone 目的変更が必要
```

---

## 5. cc-iasd escalate <id>

### 5.1 目的

人間判断が必要な停止状態を Escalation Packet に整形する。

### 5.2 処理

```text
処理:
1. status.md から blocker を読む
2. linked spec / tasks を読む
3. evidence.md を読む
4. 停止理由を整理する
5. 選択肢を整理する
6. 推奨案を出す
7. escalation.md に追記する
```

### 5.3 出力

```text
ops/milestones/<milestone-id>/escalation.md
```

MVP の初期実装では、`status.md` の blocker と linked spec / tasks、`evidence.md` を集約し、判断事項、選択肢、推奨案、影響、再開条件の空欄を持つ `escalation.md` を作る。既存の `escalation.md` は上書きしない。
実行時には `ops/logs/` に escalation event を記録する。

---

## 6. cc-iasd report <id>

### 6.1 目的

milestone 完了報告を生成する。

### 6.2 処理

```text
処理:
1. status.md を読む
2. evidence.md を読む
3. completed tasks を集計する
4. test / lint / build 結果を整理する
5. ops/milestones/<id>/reviews/ の review / audit 結果を整理する
6. 軽微判断を整理する
7. 残リスクを整理する
8. completion-report.md を生成する
```

### 6.3 出力

```text
ops/milestones/<milestone-id>/completion-report.md
```

MVP の初期実装では、`status.md`、`evidence.md`、`reviews/` の review ファイル一覧を集約し、既存の `completion-report.md` は上書きしない。
実行時には `ops/logs/` に report event を記録する。

---

## 7. cc-iasd index evidence

### 7.1 目的

milestone ごとの証跡成果物を走査し、project-context 全体の evidence index を再生成する。

### 7.2 処理

```text
処理:
1. ops/milestones/ 配下の milestone を列挙する
2. status.md / evidence.md / escalation.md / completion-report.md を確認する
3. reviews/ 配下の review file を確認する
4. ops/evidence-index.md を再生成する
```

### 7.3 出力

```text
ops/evidence-index.md
```

MVP の初期実装では、明示的に `cc-iasd index evidence` を実行したときだけ index を再生成する。`run`、`escalate`、`report` からの自動更新は行わない。実行時には `ops/logs/` に index event を記録する。

---

## 8. cc-iasd log event

### 8.1 目的

project-context 全体の時系列作業台帳へ、明示的な log event を追加する。

### 8.2 処理

```text
処理:
1. event type を受け取る
2. summary を受け取る
3. 任意で related milestone / related evidence を受け取る
4. ops/logs/log_<timestamp>_<type>.md を作成する
```

### 8.3 出力

```text
ops/logs/log_<timestamp>_<type>.md
```

MVP の初期実装では、新規 log file を作る。既存 log file への追記は行わない。

---

## 9. cc-iasd feature add <id>

### 9.1 目的

ideal と roadmap の間に置く feature planning layer へ、最小 feature record を追加する。

### 9.2 処理

```text
処理:
1. feature id を受け取る
2. kind を epic / supporting から選ぶ
3. summary と ideal pillar を受け取る
4. ops/features/epics/ または ops/features/supporting/ に feature file を作成する
5. ops/logs/ に feature event を記録する
```

### 9.3 出力

```text
ops/features/epics/<id>.md
ops/features/supporting/<id>.md
```

MVP の初期実装では、既存 feature file は上書きしない。

---

## 10. cc-iasd roadmap add <id>

### 10.1 目的

feature layer を入力にして、milestone へ切り出す前の roadmap 正本を追加する。

### 10.2 処理

```text
処理:
1. roadmap id を受け取る
2. summary と goal を受け取る
3. ops/roadmaps/ に roadmap file を作成する
4. ops/logs/ に roadmap event を記録する
```

### 10.3 出力

```text
ops/roadmaps/<id>.md
```

MVP の初期実装では、既存 roadmap file は上書きしない。

---

## 11. 初期 workflow

## 11. cc-iasd spec add <id>

### 11.1 目的

Spec Kit 互換の spec / plan / tasks 正本の最小受け皿を作成する。

### 11.2 処理

```text
処理:
1. spec id を受け取る
2. summary を受け取る
3. ops/specs/<id>/requirements.md を作成する
4. ops/specs/<id>/plan.md を作成する
5. ops/specs/<id>/tasks.md を作成する
6. ops/logs/ に spec event を記録する
```

### 11.3 出力

```text
ops/specs/<id>/requirements.md
ops/specs/<id>/plan.md
ops/specs/<id>/tasks.md
```

MVP の初期実装では、既存 spec file は上書きしない。

---

## 12. 初期 workflow

```text
0. project-context 作成
1. cc-iasd init
2. user/ に意図と制約を書く
3. ops/ideal/ を作成または更新する
4. ops/features/ で feature layer を整理する
5. ops/roadmaps/ で roadmap を定義する
6. Spec Kit で requirements / plan / tasks を ops/specs/ に作る
7. milestone を定義する
8. 必要に応じて ops/milestones/<id>/planning-package.md を作る
9. cc-iasd run milestone <id>
10. Worker runtime が src/ を編集する
11. Reviewer runtime または人間が ops/milestones/<id>/reviews/ に review を記録する
12. ops/logs/ と evidence.md を更新する
13. 問題があれば cc-iasd escalate <id>
14. 完了したら cc-iasd report <id>
```

---

## 13. 実行 runtime への handoff

MVP では、runtime handoff は単純な Markdown packet でよい。

```markdown
# Implementation Handoff

## Scope

## Source Root

src/

## Linked Spec

## Linked Tasks

## Constraints

## Do Not Change

## Expected Output

## Evidence To Record
```

---

## 14. Reviewer workflow

```text
Reviewer workflow:
1. Worker の変更を確認
2. tasks.md の完了条件と照合
3. test / lint / build 結果を確認
4. scope 外変更がないか確認
5. review を ops/milestones/<id>/reviews/ に記録
6. review への参照と要約を evidence.md に記録
7. bounded remediation か escalation かを判定
```

---

## 15. ChatLobby 連携時の workflow

ChatLobby 連携は MVP では必須ではない。

将来的には次になる。

```text
ChatLobby:
  ユーザー入力を受ける
  対象 project-context を特定する
  ledger に作業依頼を渡す

ledger:
  milestone / spec / tasks を解決する
  run / escalate / report を行う

ChatLobby:
  escalation / report を conversation に表示する
```

---

## 16. cc-iasd doctor

### 16.1 目的

project-context の整合性を検査する。

### 16.2 処理

```text
検査例:
- src/ が存在するか
- ops/features/ が存在するか
- ops/specs/ が存在するか
- ops/logs/ が存在するか
- lock.json があるか
- linked tasks が解決できるか
- evidence references が壊れていないか
```

MVP の初期実装では、project-context scaffold の必須パスと旧 ledger 由来パスの混入を検査する。
`cc-iasd index evidence` 実装後は、`ops/evidence-index.md` 内の `ops/` 参照が実在することも検査する。
`cc-iasd log event` 実装後は、`ops/logs/log_<timestamp>_<type>.md` の命名と log 内の related evidence 参照が実在することも検査する。
milestone の `Linked Feature`、`Linked Roadmap`、`Linked Spec`、`Linked Tasks` が `TBD` でない場合は、対応する `ops/` 配下の参照が実在することも検査する。
feature file は、file名、`Kind`、`Summary`、`Ideal Pillar` の最低限を検査する。
roadmap file は、file名、`Summary`、`Goal`、`Status` の最低限を検査する。
spec directory は、directory名、`requirements.md`、`plan.md`、`tasks.md` の存在と、`tasks.md` 内の checklist item の存在を検査する。

### 16.3 cc-iasd sync

Spec Kit / plugin / evidence index の参照整合を更新する。

### 16.4 cc-iasd update-profile

ledger profile を更新する。ただし、過去実行時の lock は上書きしない。

### 16.5 cc-iasd audit

長期的な evidence / decision / review の整合性を確認する。

---

## 12. command 設計の原則

```text
原則:
- 既存 framework command を再実装しない
- ledger command は統合・委譲・状態管理を担う
- src/ root を常に明示する
- 自走前に scope を確認する
- 停止時は escalation に変換する
- 完了時は completion report に変換する
```
