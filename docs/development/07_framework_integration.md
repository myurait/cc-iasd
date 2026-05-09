# 07. 既存フレームワーク統合方針

作成日: 2026-05-04  
状態: 統合整理版 v0.2

---

## 1. この文書の目的

cc-iasd は、既存 AI 開発フレームワークを単に再実装するものではない。

cc-iasd は、既存フレームワークを正本または参照元として取り込み、所有権が衝突しないように統合する。

---

## 2. 統合原則

```text
統合原則:
- 既存フレームワークを丸ごと重ねない
- 正本は領域ごとに一つにする
- 使えるものは標準化 vocabulary として参照する
- cc-iasd は不足領域だけを固有機能として提供する
- 各 framework の責務衝突を cc-iasd が調停する
- src/ 配下へ cc-iasd 管理 artifact を持ち込まない
```

---

## 3. Spec Kit

Spec Kit は、cc-iasd の spec-driven development 互換性における主要な標準化参照元である。

```text
Spec Kit から参照する:
- specification
- spec
- plan
- tasks
- specification-first workflow
- clarify / plan / tasks / implement の段階分割
```

cc-iasd は Spec Kit の成果物正本性を採用しない。Spec Kit tooling は通常、実装対象 repository 側に `.specify/` や `specs/` を作り、Git branch から active feature を判定する。この前提は、`src/` 配下を cc-iasd 管理 artifact で汚染しないという cc-iasd の絶対制約と衝突する。

```text
cc-iasd が行う:
- product/specs/ に cc-iasd-owned spec artifact を保持する
- Spec Kit の artifact vocabulary に可能な限り寄せる
- milestone 自走と evidence を product/specs/ の外側に重ねる
- src/ isolation を破らない範囲で実行 runtime へ渡す
```

---

## 4. 実行 runtime

Claude Code、Codex、その他の shell runner は autonomous implementation runtime の候補である。

```text
実行 runtime が担当し得る:
- tasks.md 起点の long-running implementation
- task 単位の実装ループ
- task-local review
- bounded remediation
- 人間判断が必要な場合の停止
```

cc-iasd は実行 runtime を project-context 全体の所有者にはしない。

```text
cc-iasd と実行 runtime の関係:
- cc-iasd: project-context、milestone、自走境界、evidence、escalation
- runtime: task implementation loop
```

---

## 5. BMAD Method

BMAD は、上流工程・ロール・ワークフローの参照元または optional plugin として扱う。

```text
BMAD を参照しやすい領域:
- ideation
- planning workflow
- agent role catalog
- guided workflow
```

ただし、BMAD を全面採用すると Spec Kit の spec / plan / tasks と責務が衝突する可能性がある。

```text
採用方針:
- 初期実装では全面統合しない
- role / planning の参考に留める
- 導入する場合も Spec Kit の正本を上書きしない
```

---

## 6. MetaGPT / ChatDev 系

MetaGPT / ChatDev 系は、AI 開発チームを組織として扱う思想的参照元である。

```text
参照する思想:
- Software Company as Multi-Agent System
- PM / Architect / Engineer / Reviewer 的なロール分離
- SOP による開発進行
```

cc-iasd は、MetaGPT / ChatDev をそのまま runtime として取り込むのではなく、責務分離の設計に参照する。

---

## 7. AI Governance / FINOS 系

AI Governance 系は、証跡、監査、判断ログ、説明責任の参照元である。

```text
参照する領域:
- quality gates
- audit trail
- decision logging
- compliance review
- accountability
```

cc-iasd では、これを重厚な規制対応としてではなく、非常駐ユーザーと AI 開発チームの間で後から作業・判断・リスクを追跡可能にする evidence model として取り込む。

---

## 8. Claude Code / Codex / Copilot

これらは実行 runtime であり、cc-iasd の置き換え対象ではない。

```text
実行 runtime が担当する:
- code edit
- test execution
- local reasoning
- PR / diff generation
- tool execution

cc-iasd が担当する:
- 何を渡すか
- どの scope で自走させるか
- どこで止めるか
- 何を evidence として残すか
- 何を人間判断に戻すか
```

---

## 9. 正本割当表

| 領域 | 正本 | cc-iasd の役割 |
|---|---|---|
| spec | product/specs/ | Spec Kit 互換 dialect として保持 |
| plan | 未決定 | product/specs/ 内 artifact として維持するか、別名にするか検討 |
| tasks | product/specs/ | cycle / runtime へ接続 |
| ideal | product/ideal/ | user/ 入力を正規化した product 正本 |
| features | ops/scopes/features/ | ideal と roadmap の間の scope layer |
| roadmap | ops/scopes/roadmaps/ | ideal から milestone への計画 artifact |
| implementation loop | 実行 runtime | 委譲・結果集約 |
| role / SOP | rules/ + BMAD / MetaGPT 参照 | 最小定義 |
| milestone | ops/scopes/milestones/ | roadmap 上の到達点または計画境界 |
| cycle autonomy | ops/cycles/ | 自走実行単位 |
| escalation | ops/evidence/reports/ | 固有定義 |
| logs / reviews / reports | ops/evidence/ | evidence layer |
| user decisions | user/decisions.md | 参照、勝手に変更しない |
| source project | src/ | 外側から操作 |

---

## 10. 悪い統合

```text
避ける構成:
- BMAD も丸ごと入れる
- Spec Kit も丸ごと入れる
- MetaGPT も丸ごと入れる
- AI Governance も丸ごと入れる
- それぞれが spec / tasks / workflow を持つ
- cc-iasd も重複する spec / tasks を持つ
- src/ 配下に cc-iasd 管理の仕様、runtime、evidence を置く
```

この構成では、正本が複数になり、AI がどれを信じるべきか不明になる。

---

## 11. 良い統合

```text
良い構成:
- Spec Kit を spec-driven artifact vocabulary の参照元にする
- product/specs/ を cc-iasd-owned spec 正本にする
- 実行 runtime を task implementation loop に使う
- BMAD / MetaGPT は role / SOP の参照元に留める
- AI Governance は evidence / accountability の参照元にする
- cc-iasd は project-context ownership、src isolation、cycle autonomy、escalation、evidence bridge に集中する
```

---

## 12. 初期統合レベル

初期実装では、統合を浅くする。

```text
初期統合:
- Spec Kit 互換 dialect としての product/specs/ 構造
- ops/scopes/features/ による feature scope 管理
- tasks 起点の runtime 実行想定
- role / SOP は rules/ 内の最小文書
- governance は rules/ の制約と ops/evidence/ の logs / reviews / reports に限定
```

実際の plugin 実行、複数 framework の自動起動、複雑な adapter は後段でよい。

---

## 13. Spec Kit artifact 互換性の課題

Spec Kit artifact との互換性を完全に維持しようとすると、次の課題が生じる。

```text
主要課題:
- artifact location
- branch-based active spec
- constitution ownership
- plan.md の語義衝突
- quickstart.md の不要性
- source tree vocabulary
- generated script / command lifecycle
```

### 13.1 artifact location

Spec Kit は実装対象 repository 内の `specs/<feature>/` を前提にする。cc-iasd は `product/specs/<spec-id>/` を前提にする。

完全互換を目指すと、`src/` 配下に Spec Kit artifact を置く必要が出る。これは src isolation に反するため採用しない。

### 13.2 branch-based active spec

Spec Kit は Git branch から active feature を検出する。cc-iasd は Git 管理を責務にしない。

そのため、cc-iasd では active spec を branch ではなく scope / cycle / explicit ref で決める必要がある。

### 13.3 constitution ownership

Spec Kit の constitution は project-level rule である。cc-iasd には `rules/` と project-policies がある。

両方を正本にすると制約が二重化する。cc-iasd では `rules/` を正本にし、Spec Kit 互換 layer が必要な場合はそこから投影する。

### 13.4 plan.md

`plan.md` は Spec Kit 標準 artifact だが、cc-iasd には roadmap、milestone、cycle handoff がある。

`plan.md` を維持する場合は、implementation plan に限定し、roadmap / milestone / cycle state を含めない。衝突が大きい場合は別名を検討する。

### 13.5 quickstart.md

Spec Kit の `quickstart.md` は実装済み feature の利用確認に寄る artifact である。

cc-iasd では completion report、review、evidence がその責務を担うため、初期 artifact としては作らない。

### 13.6 source tree vocabulary

Spec Kit の plan template における `src/` は repository root 内の source code directory を意味する。一方 cc-iasd の `src/` は成果物 project container である。

この語義差は互換性の最大リスクである。cc-iasd の template は、source target を `src/<repo-id>/` として明示し、Spec Kit 標準の source tree 例をそのまま持ち込まない。

### 13.7 generated script / command lifecycle

Spec Kit は command と template が artifact を生成する。cc-iasd がこれを再現すると再実装になる。

cc-iasd は command lifecycle の完全再現ではなく、artifact schema、参照形式、cycle 接続だけを互換対象にする。
