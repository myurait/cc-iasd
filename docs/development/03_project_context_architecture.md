# 03. project-context アーキテクチャ

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. 基本構造

cc-iasd の基本構造は次である。

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

`project-context` は cc-iasd が所有する開発文脈である。`src/` は成果物 project の root である。

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
    profile.md
    plugins.yaml
    adapters/
      README.md
      role-runtime.md

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
      run-handoff.md
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
      iNNN-<ideal-slug>.md
      outdated/
        iNNN-<ideal-slug>.md
    specs/
      sNNN-<spec-slug>/
        spec.md
        plan.md
        research.md
        data-model.md
        contracts/
        tasks.md
      outdated/
        <spec-id>/
          spec.md
          plan.md
          research.md
          data-model.md
          contracts/
          tasks.md

  ops/
    scopes/
      features/
        <feature-id>.md
        archived/
          <feature-id>.md
      roadmaps/
        rNNN-<roadmap-slug>.md
        archived/
          rNNN-<roadmap-slug>.md
    execution/
      campaigns/
        cNNN-<campaign-slug>/
          plan.md
          state.md
          queue.md
          aggregate-report.md
        archived/
          cNNN-<campaign-slug>/
      runs/
        run_<timestamp>_<task-or-scope>/
          plan.md
          handoff.md
          state.md
          open-items.md
          knowledge.md
      archived/
        run_<timestamp>_<task-or-scope>/
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

実際の `product/specs/` 構造は Spec Kit の artifact vocabulary に寄せる。cc-iasd は Spec Kit tooling の成果物正本性や lifecycle には依存しない。

---

## 3. runtime/

`runtime/` は、framework provenance と adapter 設定を持つ。

```text
runtime/ の責務:
- cc-iasd profile version
- framework lock
- plugin 定義
- adapter 設定
- role runtime manifest
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

`rules/` に昇格するのは、個別 scope や run に閉じない再利用可能な規則である。

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

`run` 内で得た知見は、恒常化できる場合だけ `rules/` に昇格する。未成熟な知見を `rules/` に直接置かない。

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

cc-iasd はこの領域を勝手に上書きしない。AI が整理する場合も提案として扱い、人間判断を経て反映する。

`user/decisions.md` は人間判断の正本である。AI や開発運用上の軽微判断は、発生した run、review、report の文脈に閉じる。

---

## 6. product/

`product/` は、プロダクト正本レイヤーである。

```text
product/
  ideal/
  specs/
```

`product/` 以下の正本は、古くなった場合に `outdated/` へ退避する。`outdated/` は正本性を失った成果物を残す領域であり、理由の記録は必須ではない。

project-context 運用時、AI agent は `product/` 以下に新規ファイルを直接作成しない。新規 ideal / spec は cc-iasd command が ID、metadata、required sections を作成し、その後 AI agent が本文 section を執筆する。

### 6.1 product/ideal/

```text
product/ideal/
  iNNN-<ideal-slug>.md
  outdated/
    iNNN-<ideal-slug>.md
```

ideal は、ユーザー入力を開発判断に使える形へ正規化したプロダクト正本である。

ideal ID は `iNNN-<ideal-slug>` とする。ideal は後から追加されることがあり、追加機能方針、localization、外部環境への対応など、複数の ideal が同時に正本性を持ち得る。そのため、ideal も人間が参照しやすいように番号を持つ。

番号は順序管理の補助であり、唯一の正本を意味しない。`outdated/` に入っていない ideal が現行参照対象である。

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
    spec.md
    plan.md
    research.md
    data-model.md
    contracts/
      README.md
    tasks.md
  outdated/
    <spec-id>/
      spec.md
      plan.md
      research.md
      data-model.md
      contracts/
        README.md
      tasks.md
```

spec は、`spec / plan / tasks` を中心とする束として正本性を持つ。したがって、旧化は原則として spec 単位で行う。

個別ファイルだけを `outdated/` に落とすと、spec は現行だが plan / tasks は旧、という混在状態を作る。これは spec-driven development の実行モデルと相性が悪い。

軽微な修正は同じ spec 内で更新してよい。spec、plan、tasks の対応関係が崩れる場合、または実施対象から外れる場合は、spec ごと `product/specs/outdated/<spec-id>/` に移す。

---

## 7. ops/

`ops/` は、scope / transaction layer と evidence layer だけを持つ。

```text
ops/
  scopes/
  execution/
  evidence/
```

必要な情報は、発生した scope / execution / evidence artifact 内に閉じるか、恒常化できる場合は `rules/` に昇格し、正本でない資料は `reference/` に退避する。

### 7.1 ops/scopes/

```text
ops/scopes/
  features/
  roadmaps/
```

scope layer は、何を、どの範囲で、どの順序として扱うかを管理する。

```text
features:
  ideal と roadmap の間の feature planning layer。構造化 backlog を持つ

roadmaps:
  実現順序と投資順序
```

milestone は廃止する。task の実行選択、停止条件、進行条件は campaign / run 側に置く。

`archived/` に入っていないものが通常参照対象である。

### 7.2 ops/execution/

```text
ops/execution/
  campaigns/
    cNNN-<campaign-slug>/
      plan.md
      state.md
      queue.md
      aggregate-report.md
  runs/
    run_<timestamp>_<task-or-scope>/
      plan.md
      handoff.md
      state.md
      open-items.md
      knowledge.md
    archived/
      run_<timestamp>_<task-or-scope>/
```

execution layer は campaign と run で構成する。spec-driven development 的には実装進行の中心は spec / task であり、campaign / run はその実行を cc-iasd の project-context に接続する transaction artifact である。

campaign は複数 run の進行制御を持つ。user experience outcome、feature / spec coverage、task selector、stop condition、progression condition、cross-run non-regression focus、impact map、Devil's Advocate Focus、Devil's Advocate Design Launch Review、completion condition、run queue を持つが、runtime output は持たない。

campaign queue は operation artifact である。run 登録、status 更新、進行状態の変更は cc-iasd command が行う。AI agent は queue の自由編集によって進行状態を変更しない。

run は task の実行選択と runtime context を持つ。旧 cycle 概念は run に置き換える。run は実装者に禁止領域を過度に与えるのではなく、likely touched surfaces、related impact surfaces、non-regression focus、escalation triggers によって局所実行境界を示す。

```text
campaign:
  user experience outcome、feature / spec coverage、task selector、stop condition、progression condition、cross-run non-regression focus、impact map、Devil's Advocate Focus、Devil's Advocate Design Launch Review、completion condition、run queue、aggregate report を持つ

state.md:
  Status、active blocker、open items、related spec、related tasks、related campaign、related logs、related reviews、related reports を持つ

handoff.md:
  selected tasks、expected local outcome、likely touched surfaces、related impact surfaces、non-regression focus、escalation triggers、local verification、open item routing を含む Worker / runtime 向け実行入力 packet

open-items.md:
  run-local unresolved context の正本を持つ

knowledge.md:
  run 内で判明した次 run / reviewer / worker に渡す局所知識。feature backlog へ昇格し得る観察もここに残す
```

中断、失敗、blocked、escalated は `state.md` の `Status` として表現する。

現在作業は `ops/execution/runs/` の未 archive run と `state.md` から判断する。AI に渡す入口が必要な場合は CLI が一時 view を生成する。

backlog は feature scope の planning context である。open item は run-local runtime context である。run 終了時、open item は `resolved / escalated / promoted / deferred` のいずれかへ分類する。`promoted` は feature backlog への昇格を意味する。

open item は hybrid artifact である。ID、kind、status、source run、target、resolution などの metadata は cc-iasd command が管理する。背景、選択肢、推奨案、Planning Feedback Routing、補足説明は AI agent が執筆できる。metadata だけで planning-layer feedback を完了扱いにしてはならない。

### 7.3 ops/planning-feedback/

```text
ops/planning-feedback/
  pfNNN-<feedback-slug>.md
  archived/
```

planning-feedback layer は、execution entry から planning entry へ戻す planning-layer follow-up の正本である。Completion Report は evidence layer に残し、Planning Feedback Packet は planning artifact へ戻すべき項目だけを分類する。

`ops/planning-feedback/` 直下の packet は active handoff である。処理後は `cc-iasd planning-feedback resolve` により `absorbed / rejected / deferred` のいずれかへ更新し、`archived/` へ退避する。`routed` は resolution としない。role や human へ渡しただけでは planning feedback が閉じたとは限らないためである。

### 7.4 ops/evidence/

```text
ops/evidence/
  logs/
  reviews/
  reports/
```

evidence layer は、発生した事実、検査、報告を記録する。

```text
logs:
  global chronological cc-iasd

reviews:
  scope 横断の review record

reports:
  completion、escalation、progress などの人間向け report
```

reviews は特定 scope 以下に置かない。review scope は spec、task、run、campaign、roadmap、rules、project-context など複数あり得るため、`ops/evidence/reviews/` を正本配置とする。

run、campaign、spec などは review 本体を内包せず、review ID または path を参照する。

logs / reviews / reports は証跡であり、active / inactive という状態を持たない。古くなった証跡は `archived/` に退避する。

report は正本 artifact の全文複製ではない。Source Artifact、Source Run、Review refs、Related Reports などの参照 metadata は cc-iasd command が作成し、人間判断に必要な要約・解釈だけを AI agent が執筆する。

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

historical documents、外部資料、調査メモは `reference/` に置く。`reference/` の内容は、直接実装判断の正本にしない。必要な内容は `product/`、`ops/`、`rules/` の適切な場所へ昇格する。

`reference/` も project-context 管理領域である。AI agent は新規 reference file を直接作成せず、cc-iasd command が作成した entry に本文を追記する。

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

cc-iasd は `src/` 内の技術スタックを一律に規定しない。

`src/` は AI agent が通常の実装作業としてファイル作成・編集できる領域である。一方、`product/`、`ops/`、`rules/`、`runtime/`、`user/`、`reference/` は cc-iasd-managed 領域であり、project-context 運用時の新規 artifact 作成、移動、archive、outdate、lifecycle metadata 更新は cc-iasd command または明示的人間操作で行う。

AI agent は cc-iasd-managed 領域で writer にはなれるが artifact owner ではない。AI agent が編集してよいのは、CLI が作成した artifact の authored content section であり、tool-owned metadata、ID、status、source refs、archive/outdate 位置は直接変更しない。

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
  ideal は current.md にしない。product/ideal/iNNN-<ideal-slug>.md を正本とする。

Rule 6:
  spec の旧化は原則として spec directory 単位で行う。

Rule 7:
  milestone は廃止する。

Rule 8:
  自走実行の task 選択と runtime context は run に閉じる。

Rule 9:
  reviews は特定 scope 配下に固定しない。ops/evidence/reviews/ に置き、scope refs で関連付ける。

Rule 10:
  logs / reviews / reports は evidence layer に置く。

Rule 11:
  decisions / knowledge を ops 直下の横断ファイルに集約しない。

Rule 12:
  aborted は directory ではなく run state として表現する。

Rule 13:
  横断一覧が必要な場合は CLI 生成 view とし、正本化しない。

Rule 14:
  project-context 運用時、AI agent は cc-iasd-managed 領域に新規ファイルを直接作成しない。

Rule 15:
  tool-owned metadata と lifecycle state は cc-iasd command が管理し、AI agent は authored content section を執筆する。

Rule 16:
  docs/development/ は cc-iasd 開発期間中だけ存在する開発用資料であり、cc-iasd の文書管理方針、project-context artifact、runtime rules の対象外とする。リリース時には削除するか、別管理方針へ委譲する。

Rule 17:
  docs/development/ への参照は docs 配下の開発資料に閉じる。README、rules、roles、templates、CLI 生成物、project-context artifact に漏れ出してはならない。
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
    execution/
      campaigns/
      runs/
    evidence/
      logs/
      reviews/
      reports/

  reference/

  src/
```

この段階では、plugin の完全実装、multi-runtime adapter、複雑な update mechanism は不要である。
