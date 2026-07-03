# rework 03. 語彙統合検討メモ

作成日: 2026-07-03  
状態: 推奨判断レビュー待ち v0.1

---

## 1. この文書の目的

先行事例（`01_prior_art_survey.md`）と cc-iasd の語彙を突き合わせ、概念が実質同一のものは先行側の確立した語彙へ統合し、cc-iasd 固有概念のみ独自語彙を維持する方針を検討する。

背景: cc-iasd の開発開始時点で参照できなかった、または有名でなかった先行事例が独自に語彙を確立しており、同一概念に別語彙を使い続けると、利用者と実行 runtime（LLM）双方の理解コストが増える。LLM は学習済みの一般語彙（vision、roadmap、epic 等）に強い事前知識を持つため、語彙の選択はプロンプト効率にも影響する。

---

## 2. 語彙統合の判断原則

```text
判断原則:
- 概念が実質同一で、先行語彙が複数ツール間で収斂している場合は
  外部語彙に合わせる（de facto 準拠）
- 概念が cc-iasd 固有の意味構造を持つ場合は独自語彙を維持し、
  対応表（本文書 5 章）で先行語彙との関係を説明する
- 独自語彙は差別化概念に限定する。差別化でない箇所に独自語彙を
  増やさない
- 先行側でも語彙が割れている・流動的である場合は、最も一般的な
  語（product management の慣用語）を選ぶ
- リネームは v0.x の現段階でのみ低コストである。確定を先送りする
  ほど移行コストが増えることを判断材料に含める
```

---

## 3. 検討対象語彙と推奨

### V1. ideal

- cc-iasd での意味: product 正本の起点。Product Ideal / Experience Principles / Boundaries / Non-Goals / Priority Signals / Human Decision Points / Downstream Feature Inputs を含む文書。複数持てる（i001-core 等）。
- 先行事例の対応語彙:
  - GSD: PROJECT.md 内の vision（後継の Open GSD では milestone ベースの loop に再編されており、上流語彙は流動的）
  - Agent OS: mission.md（mission / users / differentiators）
  - BMAD: brief（product brief）、その下流に PRD
  - Kiro: steering の product 文書
- 概念一致度: 高いが完全一致ではない。先行側の vision / mission は「方向性の宣言」が中心であるのに対し、cc-iasd の ideal は boundaries / non-goals / priority signals / 人間判断点まで含む「product canon のエントリ」である。ただし artifact type 名としての用途（起点文書の種別名）は同じ。
- 推奨: **vision へリネーム（採用）**
- 理由:
  - 先行側は vision / mission / brief に割れているが、product management の慣用語として最も一般的なのは vision であり、LLM の事前知識も最も強い。ideal は一般語彙として「起点文書」を想起させず、初見者と runtime の双方に説明コストがかかる。
  - cc-iasd 固有の意味構造（boundaries / non-goals 等）は文書のセクション構成として保持されるため、リネームで失われない。固有性は語彙ではなくセクション定義と Quality Requirements が担っている。
  - 差別化概念ではない（起点文書を持つこと自体は Agent OS / GSD / BMAD にある）ため、判断原則「差別化でない箇所に独自語彙を増やさない」に該当する。
- 影響範囲: 44 ファイル・約 445 箇所（CLI 実装 64 箇所を含む）。
  - CLI: `ideal add` -> `vision add`、`product outdate ideal` -> `product outdate vision`
  - ディレクトリ: `product/ideal/` -> `product/vision/`
  - ID 接頭辞: `i001-` -> `v001-`（既存 project-context の移行は doctor での検出 + 手動移行手順の案内とする）
  - ロール: `roles/ideal-interviewer.md` -> `roles/vision-interviewer.md`（他ロール・docs 内の参照も一括更新）
  - テンプレート: `ideal_template.md` -> `vision_template.md`、`ideal_interview_packet_template.md` -> `vision_interview_packet_template.md`
  - README / docs 01〜13 の記述
- 留意点: 02_conceptual_design.md 2 章の「cc-iasd の ideal」のように、cc-iasd 自身の理想を指す一般名詞用法が混在している。artifact type としての ideal のみをリネームし、一般名詞用法は文脈に応じて残すか言い換える。
- 確定: 承認（vision へリネーム。ID 接頭辞は vNNN、後方互換なし、一般名詞用法は維持）

### V2. feature

- cc-iasd での意味: ideal と roadmap の間の scope layer。`--kind epic` を持つ。
- 先行事例の対応語彙: feature は Spec Kit（specs/NNN-feature）、Kiro（feature ごとの spec）等で標準。epic は CCPM / BMAD / Spec-Flow で scope の大きい作業単位として標準。
- 概念一致度: 高。
- 推奨: **維持（統合済みとみなす）**
- 理由: すでに de facto と一致している。kind としての epic も先行と整合する。
- 確定: 承認（維持。なお rework/04 採用により feature は独立 artifact から外れ、語彙は spec 単位の文脈で維持される）

### V3. roadmap

- cc-iasd での意味: ideal から campaign / run への計画 artifact。
- 先行事例の対応語彙: GSD ROADMAP.md、Agent OS roadmap.md。
- 概念一致度: 高。
- 推奨: **維持（統合済みとみなす）**
- 確定: 承認（維持。なお rework/04 採用により roadmap は独立 artifact から外れ、順序宣言は charter の depends_on ガードへ移る）

### V4. spec / plan / tasks

- cc-iasd での意味: Spec Kit 互換 dialect の正本（07_framework_integration.md で設計済み）。
- 先行事例の対応語彙: Spec Kit / Kiro / cc-sdd 等でほぼ収斂。
- 概念一致度: 高（意図的に合わせている）。
- 推奨: **維持（統合済みとみなす）**
- 留意点: plan.md の語義衝突（roadmap / campaign との混同リスク）は 07 の 13.4 節で既に管理されている。
- 確定: 承認（語彙は維持。互換深度は rework/04 の Q2 承認により「artifact vocabulary 互換」へ後退し、ファイル構成は単一 spec.md + attachments/ に統合）

### V5. campaign

- cc-iasd での意味: 複数 run を束ねる上位実行計画。user experience outcome / coverage / task selector / stop・progression conditions / impact map / Devil's Advocate Focus を持つ。
- 先行事例の対応語彙: 完全な対応語なし。近いのは GSD の phase、Open GSD の milestone、CCPM / Spec-Flow / BMAD の epic。
- 概念一致度: 低〜中。phase / milestone は「順序・時点」の含意が強く、stop conditions や impact map を持つ実行 envelope の含意はない。epic は scope の語であり実行計画の語ではない。さらに cc-iasd では epic を feature の kind として既に使用しており、campaign を epic に変えると衝突する。
- 推奨: **維持（独自語彙として保持）**
- 理由: 差別化概念（調査 8 章の空白地帯 2 に該当）であり、判断原則「固有の意味構造を持つ場合は独自語彙を維持」に該当する。先行語彙へ寄せると概念が痩せる。
- 対応表で「BMAD / CCPM の epic、GSD の phase に近いが、停止条件・影響マップ・非退行焦点を持つ実行計画 envelope である」と説明する。
- 確定: 承認（独自語彙として維持）

### V6. run

- cc-iasd での意味: AI 自走の実行 transaction 単位。
- 先行事例の対応語彙: run は一般的（CI の run、agent run）。Devin / Codex cloud は session。
- 概念一致度: 高。
- 推奨: **維持（統合済みとみなす）**
- 理由: session は対話の含意が強く、bounded transaction の含意は run の方が正確。
- 確定: 承認（維持）

### V7. evidence

- cc-iasd での意味: logs / reviews / reports を参照で結ぶ証跡層。
- 先行事例の対応語彙: Kosli が evidence（evidence chain）、監査文脈では audit trail。
- 概念一致度: 高。
- 推奨: **維持（統合済みとみなす）**
- 理由: 規制産業向けの最有力先行（Kosli）と同語であり、すでに収斂側にいる。
- 確定: 承認（維持）

### V8. escalation packet / backtrack request / planning feedback

- cc-iasd での意味: それぞれ、非同期意思決定文書 / 構造化上流差し戻し / 実行結果の計画層への還流。
- 先行事例の対応語彙: 対応する確立語彙なし（調査 8 章の空白地帯 3・4）。HITL 言説に「decision-ready context package」という表現はあるが、artifact 名としては未確立。
- 概念一致度: 対応なし。
- 推奨: **維持（独自語彙として保持し、対外的に定義を発信する）**
- 理由: cc-iasd の中核差別化概念であり、語彙ごと確立させる対象である。
- 確定: 承認（独自語彙として維持し、対外発信の対象とする）

### V9. open item

- cc-iasd での意味: run 中に発生した未解決事項の routing 単位。
- 先行事例の対応語彙: open item / follow-up は PM 一般語。
- 推奨: **維持**
- 確定: 承認（維持。なお rework/04 採用により open item は gap 台帳へ統合される）

### V10. rules / project-policies（参考: Spec Kit constitution）

- cc-iasd での意味: 安定的な policy・role・template の置き場。
- 先行事例の対応語彙: Spec Kit の constitution が近いが、07 の 13.3 節で「rules/ を正本にし、互換 layer が必要なら投影する」と設計済み。
- 推奨: **維持（設計済み）**。対応表に constitution との関係を記載する。
- 確定: 承認（維持）

---

## 4. 推奨サマリ

```text
リネーム採用推奨:
- V1: ideal -> vision（起点文書の artifact type。44 ファイル・約 445 箇所）

維持（すでに de facto と一致）:
- V2 feature / V3 roadmap / V4 spec・plan・tasks / V6 run / V7 evidence / V9 open item

維持（差別化概念のため独自語彙を保持）:
- V5 campaign / V8 escalation packet・backtrack request・planning feedback

維持（設計済み）:
- V10 rules（constitution との対応は対応表に記載）
```

---

## 5. 語彙対応表（対外説明用の下書き）

採用確定後、README または docs に置く対応表の下書きである。

```text
cc-iasd の語彙 : 先行事例での近い語彙
vision（旧 ideal） : GSD の vision、Agent OS の mission、BMAD の brief
feature : Spec Kit / Kiro の feature、kind=epic は BMAD / CCPM の epic
roadmap : GSD / Agent OS の roadmap
spec / plan / tasks : Spec Kit の spec / plan / tasks（互換 dialect）
campaign : 対応語なし。BMAD / CCPM の epic、GSD の phase に近いが、
           停止条件・影響マップ・非退行焦点を持つ実行計画 envelope
run : 一般的な agent run。Devin / Codex cloud の session に相当
evidence : Kosli の evidence、監査文脈の audit trail
escalation packet : 対応語なし。HITL 言説の decision-ready context package に相当
backtrack request : 対応語なし
rules : Spec Kit の constitution に相当（rules/ が正本）
```

---

## 6. V1 リネームの実施手順案（採用確定後）

```text
実施手順案:
1. bin/cc-iasd.js の command / path / ID 接頭辞を vision へ変更
   （後方互換 alias `ideal` を 1 リリース残すかは要判断）
2. templates / roles のファイル名と内容を更新
3. docs/development/ 01〜13 と README を更新
   （一般名詞用法の ideal は文脈判断で残す）
4. test/cli-flow.test.js を更新
5. 既存 project-context 向けの移行手順（product/ideal/ -> product/vision/）を
   README または doctor の警告として用意
```

---

## 7. 未決事項

```text
- V1 の CLI 後方互換 alias（ideal -> vision）を残すか
    - 0.x時点では後方互換は一切考慮不要
- ID 接頭辞を v001- に変えるか i001- のまま許容するか
  （vNNN は roadmap の rNNN と視認上紛れないか要確認 -> r と v で区別可能）
    - vに変える
- 一般名詞としての「ideal（理想）」を docs 内でどこまで言い換えるか
    - docs内においては、一般名詞としての理想を維持する。あくまでも成果物命名としての表現を既存に寄せる認識
```
