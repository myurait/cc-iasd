# 13. Simulation Scenario Tests

作成日: 2026-05-09  
状態: 初期テスト手順

---

## 1. この文書の目的

この文書は、cc-iasd の artifact 境界、run の進み方、未実装 artifact の扱い、feedback の漏れ方を確認するための再利用可能なシミュレーションテスト手順を定義する。

ここにある内容は、シミュレーションの方向性を決定するための要件定義ではない。cc-iasd の governance framework が、複合機能、未決定事項、debt、spec への戻し、実行単位の境界を扱えるかを確認するための結合テスト手順である。

この文書で固定するものは、入力シナリオ、実行手順、観察観点、判定観点である。シミュレーション中に実際に作成される artifact の一覧や具体的な分割結果は、テストの出力結果として観察する。

---

## 2. Scenario Test A: Rich Memo Web App

### 2.1 想定プロダクト

WYSIWYG を持つリッチなメモ Web アプリ。

主要機能:

- WYSIWYG editor
- dashboard
- external API
- AI agent adapter
- MCP support
- schedule feature
- smartphone support
- notification delivery

### 2.2 テスト目的

このテストでは、次を観察する。

```text
観察対象:
- product 正本から scope / spec / run へ分解される粒度
- spec-local plan が、上位の進行計画や runtime state と衝突しないか
- run が、実装単位として過不足なく機能するか
- 複数 run をまとめる campaign artifact が必要になるか
- run feedback が、どの責務の文書へ移管されるべきか
- debt や follow-up を二重管理せず、単一の所有先に分類できるか
```

### 2.3 実行環境

```text
Scratch project-context:
  <scratch-project-context>

前提:
  cc-iasd の現行 CLI を使う
  実装コードは書かない
  artifact は実行結果として観察する
```

### 2.4 実行手順

この手順では、artifact の具体的な ID や個数を先に固定しない。実行者は、想定プロダクトを入力として読み、cc-iasd の現行コマンドで必要な artifact を作成する。

記録するもの:

```text
- 実際に実行したコマンド
- 作成された artifact
- 途中で既存 artifact では不足した箇所
- 手書きまたは暫定で補った artifact
- 実行後に見直した分解
```

初期化する。

```bash
cc-iasd init <scratch-project-context> --doc-lang Japanese --dev-lang TypeScript --force
cc-iasd doctor <scratch-project-context>
```

product 入力を作成する。

```text
2.1 の想定プロダクトを入力として、現行 rules が定める product artifact を作成する。
```

scope / progression / spec を作成する。

```bash
cc-iasd feature add <feature-id> --kind <kind> --summary <summary> --pillar <pillar> --root <scratch-project-context>
cc-iasd roadmap add <roadmap-id> --summary <summary> --goal <goal> --root <scratch-project-context>
cc-iasd spec add <spec-id> --summary <summary> --root <scratch-project-context>
```

campaign / run を作成する。

```bash
cc-iasd campaign add <campaign-id> --roadmap <roadmap-id> --summary <summary> --root <scratch-project-context>
cc-iasd run start <run-source-id> --root <scratch-project-context>
```

review、report を実行する。

```bash
cc-iasd review add <run-id> --type <type> --summary <summary> --result <result> --root <scratch-project-context>
cc-iasd report <run-id> --root <scratch-project-context>
```

検査する。

```bash
cc-iasd doctor <scratch-project-context>
cc-iasd view current --root <scratch-project-context>
cc-iasd view evidence --root <scratch-project-context>
```

---

## 3. 観察手順

### 3.1 作成された artifact の観察

実行後に、作成された artifact を列挙する。

観察するもの:

```text
- product 正本として何が作られたか
- scope artifact として何が作られたか
- spec artifact として何が作られたか
- campaign / run として何が作られたか
- runtime I/O として何が作られたか
- evidence として何が作られたか
- 未実装 artifact の代替物として何が作られたか
```

ここでは、期待一覧と実出力を一致させることを目的にしない。実出力が、cc-iasd の責務境界に照らして説明可能かを確認する。

### 3.2 scope 分解

scope 分解では、プロダクト入力がどの粒度へ分解されたかを観察する。

観察するもの:

```text
- scope が大きすぎて実行境界を曖昧にしていないか
- scope が細かすぎて上位文脈を失っていないか
- debt / refactor / research が feature 名に押し込まれていないか
- backlog は詳細本文ではなく参照と routing 状態に留まっているか
```

Artifact Quality Requirements の観察では、AI が次を判断できるかを見る。

```text
- ideal trace が feature に残っているか
- included / excluded / deferred / blocked scope が分離されているか
- priority、experience tie、impact scope、blockers、source が backlog item にあるか
- spec 化に必要な情報が欠けている場合、Feature Scope Designer が推測で補完せず Backtrack Request を返せるか
```

debt を受ける artifact が作られた場合、それはテスト出力として記録する。あらかじめ特定の artifact 名や個数を正解として固定しない。

### 3.3 progression plan

progression plan では、複数の実行境界の順序と依存関係が表現できるかを観察する。

観察するもの:

```text
- 実行順序が product 正本や spec と矛盾していないか
- 実行状態や runtime output を保持していないか
- 途中で新しい scope や spec が必要になった場合の扱いが説明できるか
```

### 3.4 run

run では、現行 rules に従って作成した実行単位が、シナリオ入力を実行可能な単位へ切れているかを観察する。

観察するもの:

```text
- run が大きすぎて進行不能になっていないか
- run が細かすぎてレビューや報告の意味を失っていないか
- run が product / scope / spec のいずれかを不自然に変更していないか
- 人間判断が必要な内容を自走対象に含めていないか
```

spec / tasks から run へ進む際の観察項目は次である。

```text
- spec が feature / ideal trace を持つか
- tasks から expected local outcome、likely touched surfaces、related impact surfaces、non-regression focus、local verification を導けるか
- 未解決の product / human decision が task に埋め込まれていないか
- spec が薄い場合、Spec Designer または Design Reviewer が Backtrack Request を返せるか
```

### 3.5 未実装 artifact

CLI 未実装の artifact が必要になった場合は、現行 rules で扱いきれない箇所として記録する。

```text
- 既存 artifact では不足した理由
- 暫定 artifact を置いた理由
- 暫定 artifact がなければ観察できなかった内容
- 既存 artifact へ吸収できそうか
- 正式 artifact として設計判断が必要そうか
```

複数 run をまとめる artifact が必要になった場合に観察するもの:

```text
- 複数 run の進行条件
- 自動進行してよい範囲
- 人間判断で停止すべき条件
- aggregate report が必要な理由
- orchestration と runtime output が混ざっていないか
```

この節は、campaign の詳細構造を先に正解として固定しない。未実装 artifact の必要性を観察するための手順である。

---

## 4. Feedback と Debt Routing の観察

このテストで観察する中心は、runtime feedback が run 内に閉じないことである。

観察する feedback の例:

```text
- 実装中に判明した設計不足
- acceptance criteria の不足
- contract / data model の不足
- test strategy の不足
- user decision が必要な未決定事項
- 実行境界の切り直しが必要な作業
- 将来対応でよいが忘れてはならない debt
```

観察時の分類単位は次である。

```text
runtime feedback
  -> run-local open item
  -> classified
  -> exactly one owner
```

owner の分類観点:

```text
- その run 内で閉じるもの
- product / spec 正本へ戻すもの
- scope backlog へ参照として残すもの
- 人間判断として提示するもの
- review finding として記録するもの
- completion / progress report に載せるもの
```

失敗として記録するもの:

```text
- feedback を run に閉じ込めて死蔵する
- backlog に詳細本文を集約して肥大化させる
- 正本と backlog に同じ内容を二重記載する
- owner のない TBD を残す
- 状況に応じて判断する、という未分類のまま残す
```

---

## 5. 判定観点

このテストで確認する原則:

```text
- 現行 rules に従って実行したとき、artifact 責務が混ざらないか
- 現行 rules に従って実行したとき、未実装 artifact の不足が説明可能か
- 現行 rules に従って実行したとき、feedback の所有先を一意に説明できるか
```

判定時に確認する点:

```text
- 作成された artifact が、事前想定ではなく実行結果として説明できるか
- 未実装 artifact が、temporary / experimental として扱われているか
- runtime I/O が run 以外へ漏れていないか
- feedback が exactly one owner へ分類されているか
- evidence / review / report が実行証跡として追跡できるか
- context 肥大化を起こす artifact が作られていないか
```

---

## 6. テスト完了条件

このテストは、次を満たせば完了とする。

```text
- cc-iasd doctor が通る
- view current で product / scope / execution / evidence が追える
- view evidence で campaign / run -> review/report の関係が追える
- 未実装 artifact を使った場合、その必要性と責務境界が説明されている
- feedback / debt が exactly one owner に分類されている
- 作成された artifact 一覧が、テスト出力として別途記録されている
```

---

## 7. 実行結果の保存

このテストを実行した場合は、実行者が選んだ scratch project-context の外に依存しない形で overview を保存する。

```text
<scratch-project-context>/SIMULATION_OVERVIEW.md
```

保存する overview は、作成された artifact 一覧、実行したコマンド、未実装 artifact の扱い、feedback / debt routing の観察結果を記録する。特定のローカル絶対パスは正本化しない。

---

## 8. Scenario Test B Prompt: Planning / Execution Entry Handoff

### 8.1 目的

この prompt は、Planning Lead と Execution Manager を並立 entry point として分離した後、entry point 切り替え時の context pressure と runtime handoff の妥当性を検証するために使う。

この prompt は scratch project-context の実行入力であり、project-context artifact へそのまま貼り付ける正本文書ではない。

### 8.2 Prompt

```text
あなたは cc-iasd の scenario test runner である。

目的:
Planning Lead と Execution Manager が並立 entry point として分離された状態で、Planning -> Execution -> Planning の handoff が過不足なく成立するかを検証せよ。実装コードは書かない。artifact 作成、role handoff、feedback routing、context pressure の観察を行う。

重要制約:
1. `src/` には実装コードを書かない。
2. cc-iasd-managed artifact の新規作成は、必ず `cc-iasd` command または明示的人間操作で行う。
3. AI が自由に新規ファイルを作成してよいのは、scratch overview など明示された観察記録に限る。
4. scratch project-context 内の artifact に、ローカル絶対パス、開発用文書パス、またはこの prompt 自体の保存場所を書かない。
5. completion report から roadmap / feature / spec / ideal を直接更新しない。
6. Execution Manager は Planning Feedback Packet を返すだけで、planning artifact を直接編集しない。
7. Planning Lead は Planning Feedback Packet を入力として別 entry point で再開し、必要な planning role へ分類する。

題材:
WYSIWYG を持つリッチなメモ Web アプリを想定する。機能には dashboard、external API、AI agent adapter、MCP support、schedule feature、smartphone support、notification delivery が含まれる。

実行フェーズ:

Phase 1: Planning Entry
- scratch project-context を初期化する。
- product ideal を作成し、薄すぎる場合は ideal interview が必要だった箇所を記録する。
- feature scope、roadmap、spec を作成する。
- Design Reviewer が返すべき不足や Backtrack Request があれば、推測で補完せず記録する。
- Execution Entry Packet を作成する。
- Execution Entry Packet は、reviewed feature、roadmap、spec、task refs、relevant ideal excerpt、human decisions、known exclusions、escalation triggers、expected execution boundary だけを含める。
- Planning Entry の最後に、Execution Manager へ渡すための context が過剰でないかを評価する。

Phase 2: Execution Entry
- Execution Entry Packet だけを起点として Execution Manager を開始した想定で進める。
- Execution Manager が full ideal、full feature backlog、full spec package、full logs、full reviews を読まずに campaign / run を作れるかを確認する。
- campaign を `cc-iasd campaign add <campaign-id> --feature <feature-id> --roadmap <roadmap-id> ...` で作成し、feature link が抜けないことを確認する。
- Devil's Advocate Design Launch Review は `cc-iasd review add <campaign-id> --type full --review-mode design-launch ...` で記録する。
- run を開始する。
- 実装は行わず、実装中に発生しそうな feedback を open item として作成する。
- open item には Background、Options、Recommendation、Planning Feedback Routing、Notes を執筆する。
- `spec-gap`、`feature-gap`、`roadmap-gap`、`implementation-debt`、`follow-up` のうち適切な kind を使う。
- promoted する open item は `cc-iasd open-item resolve <run-id> <item-id> --resolution promoted ...` で解決してから report / aggregate-report に反映する。
- Devil's Advocate Campaign Completion Review は `cc-iasd review add <run-id-or-campaign-id> --type full --review-mode campaign-completion ...` で記録する。
- completion report を作成する。
- campaign aggregate-report を、run、open item、review、report の集約として更新する。
- Planning Feedback Packet を作成する。
- Planning Feedback Packet は roadmap-update / feature-backlog / spec-refinement / ideal-gap / human-decision / debt / no-planning-action のいずれかへ各 feedback item を分類する。
- 各 feedback item は Type を 1 つだけ持つ。複数 type にまたがる観測は item を分割する。

Phase 3: Planning Re-entry
- Planning Feedback Packet だけを起点として Planning Lead を再開した想定で進める。
- Planning Lead が full run directory や full evidence history を読まずに routing できるか確認する。
- 各 feedback item を、Planning Lead、Feature Scope Designer、Spec Designer、Ideal Interviewer、Human、none のいずれか 1 つへ分類する。複数 role にまたがる観測は item を分割する。
- 人間判断が必要なものと、runtime handoff だけで進められるものを分ける。
- planning artifact を更新する必要がある場合も、直接更新せず、どの role に narrow context packet を渡すべきかを記録する。

観察して記録すること:
1. Planning Entry で読んだ context
2. Execution Entry に渡した Execution Entry Packet の内容
3. Execution Entry が追加で読まざるを得なかった context
4. completion report と Planning Feedback Packet の境界
5. Planning Re-entry が読んだ context
6. Human Decision と Runtime Handoff の区別
7. context pressure が増えた箇所
8. packet が薄すぎて詰まった箇所
9. artifact 責務が混ざった箇所
10. cc-iasd command surface が role に対して過剰に見えた箇所

出力:
scratch project-context 直下に `SIMULATION_OVERVIEW.md` を作成し、次を記録せよ。

- Scenario Name: Planning / Execution Entry Handoff
- Commands Run
- Artifacts Created
- Execution Entry Packet Summary
- Planning Feedback Packet Summary
- Context Read By Planning Entry
- Context Read By Execution Entry
- Context Read By Planning Re-entry
- Human Decision Items
- Runtime Handoff Items
- Context Pressure Findings
- Artifact Boundary Findings
- Command Visibility Findings
- Recommended Framework Fixes

完了条件:
1. `cc-iasd doctor` が通る。
2. `cc-iasd view current` で product / scope / execution / evidence が追える。
3. `cc-iasd view evidence` で review / report が追える。
4. Execution Entry Packet だけで execution を始められたかが記録されている。
5. Planning Feedback Packet だけで planning re-entry を始められたかが記録されている。
6. 人間判断が必要な項目と runtime handoff で足りる項目が分離されている。
7. completion report が planning artifact を直接更新していない。
```
