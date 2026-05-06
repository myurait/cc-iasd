# 03. project-context アーキテクチャ

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. 基本構造

ledger の基本構造は次である。

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

`project-context` は ledger が所有する開発文脈である。`src/` は成果物 project の root である。

この構造では、次の境界を固定する。

```text
runtime:
  framework provenance と runtime adapter 設定

rules:
  恒常的な制約、role、template、checklist

user:
  人間由来の raw input、制約、明示判断

product:
  プロダクト正本。ideal と spec を置く

ops:
  scope / transaction layer と evidence layer

reference:
  正本ではない補助資料、旧文書、外部資料

src:
  成果物 project
```

`ops/` は万能置き場ではない。実態として ops であるもの、すなわち scope / transaction と evidence だけを置く。

---

## 2. 推奨ディレクトリ構造

```text
project-context/
  runtime/
    cc-iasd.yaml
    lock.json
    framework-version.md
    plugins/
      spec-kit.yaml
      cc-sdd.yaml
      bmad.yaml
    adapters/
      agent-runtime.yaml
    commands/
      init.md
      run-cycle.md
      escalate.md
      report.md

  rules/
    policies/
      autonomy-policy.md
      escalation-policy.md
      evidence-policy.md
      language-policy.md
      testing-policy.md
    roles/
      planning-lead.md
      worker.md
      reviewer.md
      auditor.md
    templates/
      escalation-packet.md
      completion-report.md
      review-report.md
      cycle-handoff.md
    checklists/
      reviewer-checklist.md
      auditor-checklist.md

  user/
    product-intent.md
    constraints.md
    decisions.md
    preferences.md
    scratch.md

  product/
    ideal/
      <ideal-id>.md
      outdated/
        <ideal-id>.md
    specs/
      <spec-id>/
        requirements.md
        plan.md
        tasks.md
      outdated/
        <spec-id>/
          requirements.md
          plan.md
          tasks.md

  ops/
    scopes/
      features/
        <feature-id>.md
        archived/
          <feature-id>.md
      roadmaps/
        <roadmap-id>.md
        archived/
          <roadmap-id>.md
      milestones/
        <milestone-id>.md
        archived/
          <milestone-id>.md
    cycles/
      cycle_<timestamp>_<scope>/
        state.md
        handoff.md
        knowledge.md
      archived/
        cycle_<timestamp>_<scope>/
          state.md
          handoff.md
          knowledge.md
    evidence/
      logs/
        log_<timestamp>_<type>.md
        archived/
          log_<timestamp>_<type>.md
      reviews/
        review_<timestamp>_<scope>.md
        archived/
          review_<timestamp>_<scope>.md
      reports/
        report_<timestamp>_<scope>.md
        archived/
          report_<timestamp>_<scope>.md

  reference/
    INDEX.md
    historical-documents/
    external/
    notes/

  src/
    package.json
    composer.json
    go.mod
    app/
    tests/
```

実際の `product/specs/` 構造は Spec Kit の生成物に合わせる。ledger は Spec Kit の構造を壊さない。

---

## 3. runtime/

`runtime/` は、framework provenance と adapter 設定を持つ。

```text
runtime/ の責務:
- ledger profile version
- framework lock
- plugin 定義
- adapter 設定
- command 定義
- project-context の実行設定
```

`runtime/` は証跡や正本を持たない。実行時にどの規約・adapter・plugin を使うかを示す。

---

## 4. rules/

`rules/` は、cc-iasd の恒常的な制約レイヤーである。

```text
rules/
  policies/
  roles/
  templates/
  checklists/
```

`rules/` に昇格するのは、個別 scope や cycle に閉じない再利用可能な規則である。

```text
rules に置くもの:
- 自走範囲
- 停止条件
- escalation 条件
- evidence 記録規律
- role の責務と権限
- review / audit checklist
- output template
```

`cycle` 内で得た知見は、恒常化できる場合だけ `rules/` に昇格する。未成熟な知見を `rules/` に直接置かない。

---

## 5. user/

`user/` は、人間が与えた入力と判断を置く領域である。

```text
user/
  product-intent.md
  constraints.md
  decisions.md
  preferences.md
  scratch.md
```

ledger はこの領域を勝手に上書きしない。AI が整理する場合も提案として扱い、人間判断を経て反映する。

`user/decisions.md` は人間判断の正本である。AI や開発運用上の軽微判断は、発生した cycle、review、report の文脈に閉じる。

---

## 6. product/

`product/` は、プロダクト正本レイヤーである。

```text
product/
  ideal/
  specs/
```

`product/` 以下の正本は、古くなった場合に `outdated/` へ退避する。`outdated/` は正本性を失った成果物を残す領域であり、理由の記録は必須ではない。

### 6.1 product/ideal/

```text
product/ideal/
  <ideal-id>.md
  outdated/
    <ideal-id>.md
```

ideal は、ユーザー入力を開発判断に使える形へ正規化したプロダクト正本である。

`outdated/` に入っていない `ideal/<ideal-id>.md` が事実上の現行 ideal である。

複数 ideal は同時に存在できる。

```text
例:
- core-experience.md
- onboarding-experience.md
- operations-experience.md
```

### 6.2 product/specs/

```text
product/specs/
  <spec-id>/
    requirements.md
    plan.md
    tasks.md
  outdated/
    <spec-id>/
      requirements.md
      plan.md
      tasks.md
```

spec は、`requirements / plan / tasks` の束として正本性を持つ。したがって、旧化は原則として spec 単位で行う。

個別ファイルだけを `outdated/` に落とすと、requirements は現行だが plan / tasks は旧、という混在状態を作る。これは Spec Kit / cc-sdd 的な spec 実行モデルと相性が悪い。

軽微な修正は同じ spec 内で更新してよい。requirements、plan、tasks の対応関係が崩れる場合、または実施対象から外れる場合は、spec ごと `product/specs/outdated/<spec-id>/` に移す。

---

## 7. ops/

`ops/` は、scope / transaction layer と evidence layer だけを持つ。

```text
ops/
  scopes/
  cycles/
  evidence/
```

必要な情報は、発生した scope / cycle / evidence artifact 内に閉じるか、恒常化できる場合は `rules/` に昇格し、正本でない資料は `reference/` に退避する。

### 7.1 ops/scopes/

```text
ops/scopes/
  features/
  roadmaps/
  milestones/
```

scope layer は、何を、どの範囲で、どの順序または到達点として扱うかを管理する。

```text
features:
  ideal と roadmap の間の feature planning layer。構造化 backlog を持つ

roadmaps:
  実現順序と投資順序

milestones:
  roadmap 上の到達点または計画境界
```

`milestone` は自走実行ログの入れ物ではない。実行状態、handoff、実行中の知見は `ops/cycles/` に置く。

`archived/` に入っていないものが通常参照対象である。

### 7.2 ops/cycles/

```text
ops/cycles/
  cycle_<timestamp>_<scope>/
    state.md
    handoff.md
    knowledge.md
  archived/
    cycle_<timestamp>_<scope>/
      state.md
      handoff.md
      knowledge.md
```

cycle は、AI 自走の実行単位である。Kiro / cc-sdd 的には実装進行の中心は spec / task であり、cycle はその実行を cc-iasd の project-context に接続する transaction artifact である。

```text
state.md:
  Status、active blocker、open items、related spec、related tasks、related milestone、related logs、related reviews、related reports を持つ

handoff.md:
  Worker / runtime に渡す実行入力 packet

knowledge.md:
  cycle 内で判明した次 cycle / reviewer / worker に渡す局所知識。feature backlog へ昇格し得る観察もここに残す
```

中断、失敗、blocked、escalated は `state.md` の `Status` として表現する。

現在作業は `ops/cycles/` の未 archive cycle と `state.md` から判断する。AI に渡す入口が必要な場合は CLI が一時 view を生成する。

backlog は feature scope の planning context である。open item は cycle-local runtime context である。cycle 終了時、open item は `resolved / escalated / promoted / deferred` のいずれかへ分類する。`promoted` は feature backlog への昇格を意味する。

### 7.3 ops/evidence/

```text
ops/evidence/
  logs/
  reviews/
  reports/
```

evidence layer は、発生した事実、検査、報告を記録する。

```text
logs:
  global chronological ledger

reviews:
  scope 横断の review record

reports:
  completion、escalation、progress などの人間向け report
```

reviews は milestones 以下に置かない。review scope は spec、task、cycle、milestone、roadmap、rules、project-context など複数あり得るため、`ops/evidence/reviews/` を正本配置とする。

milestone、cycle、spec などは review 本体を内包せず、review ID または path を参照する。

logs / reviews / reports は証跡であり、active / inactive という状態を持たない。古くなった証跡は `archived/` に退避する。

---

## 8. reference/

`reference/` は、正本ではない補助資料を置く。

```text
reference/
  INDEX.md
  historical-documents/
  external/
  notes/
```

旧文書、外部資料、調査メモ、移行資料は `reference/` に置く。`reference/` の内容は、直接実装判断の正本にしない。必要な内容は `product/`、`ops/`、`rules/` の適切な場所へ昇格する。

---

## 9. src/

`src/` は成果物 project root である。

```text
src/ に置くもの:
- application code
- tests
- package manager files
- build config
- lint config
- runtime config
```

ledger は `src/` 内の技術スタックを一律に規定しない。

---

## 10. archive / outdated 原則

旧文書の退避は、レイヤーごとに名前を統一する。

```text
product/ 以下:
  outdated/

ops/ 以下:
  archived/
```

`product/` の `outdated/` は、正本性を失った product artifact を意味する。

`ops/` の `archived/` は、transaction / evidence artifact の退避を意味する。

一覧ファイルは原則として正本にしない。適切な archive が機能すれば、未 archive の artifact を列挙するだけで現在参照対象を得られる。必要な一覧は CLI が生成する。

---

## 11. 設計 rule

今回の構造整理から、次を project-context architecture の rule とする。

```text
Rule 1:
  product 正本と ops transaction を混ぜない。

Rule 2:
  product/ 以下の旧化は outdated/ に統一する。

Rule 3:
  ops/ 以下の退避は archived/ に統一する。

Rule 4:
  archived/ に入っていない artifact を通常参照対象とする。

Rule 5:
  ideal は current.md にしない。product/ideal/<ideal-id>.md を正本とする。

Rule 6:
  spec の旧化は原則として spec directory 単位で行う。

Rule 7:
  milestone は実行証跡の入れ物ではなく、roadmap 上の到達点または計画境界である。

Rule 8:
  自走実行の状態、handoff、局所知識は cycle に閉じる。

Rule 9:
  reviews は milestone 配下に固定しない。ops/evidence/reviews/ に置き、scope refs で関連付ける。

Rule 10:
  logs / reviews / reports は evidence layer に置く。

Rule 11:
  decisions / knowledge を ops 直下の横断ファイルに集約しない。

Rule 12:
  aborted は directory ではなく cycle state として表現する。

Rule 13:
  横断一覧が必要な場合は CLI 生成 view とし、正本化しない。
```

---

## 12. 最小構成

初期構成は次である。

```text
project-context/
  runtime/
    lock.json
    cc-iasd.yaml

  rules/
    policies/
    roles/
    templates/

  user/
    product-intent.md
    constraints.md
    decisions.md
    scratch.md

  product/
    ideal/
    specs/

  ops/
    scopes/
      features/
      roadmaps/
      milestones/
    cycles/
    evidence/
      logs/
      reviews/
      reports/

  reference/

  src/
```

この段階では、plugin の完全実装、multi-runtime adapter、複雑な update mechanism は不要である。
