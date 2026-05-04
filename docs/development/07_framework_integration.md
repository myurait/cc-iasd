# 07. 既存フレームワーク統合方針

作成日: 2026-05-04  
状態: 統合整理版 v0.1

---

## 1. この文書の目的

ledger は、既存 AI 開発フレームワークを単に再実装するものではない。

ledger は、既存フレームワークを正本または参照元として取り込み、所有権が衝突しないように統合する。

---

## 2. 統合原則

```text
統合原則:
- 既存フレームワークを丸ごと重ねない
- 正本は領域ごとに一つにする
- 使えるものは正本として使う
- ledger は不足領域だけを固有機能として提供する
- 各 framework の責務衝突を ledger が調停する
```

---

## 3. Spec Kit

Spec Kit は、ledger の spec-driven development kernel である。

```text
Spec Kit が担当する:
- specification
- requirements
- plan
- tasks
- specification-first workflow
```

ledger は Spec Kit を再実装しない。

```text
ledger が行う:
- project-context に対して Spec Kit を初期化する
- specs / requirements / plan / tasks を正本として参照する
- milestone 自走と evidence を外側に重ねる
- src/ isolation adapter を提供する
```

---

## 4. cc-sdd

cc-sdd は autonomous implementation plugin の候補である。

```text
cc-sdd が担当し得る:
- tasks.md 起点の long-running implementation
- task 単位の実装ループ
- task-local review
- bounded remediation
- 人間判断が必要な場合の停止
```

ledger は cc-sdd を project-context 全体の所有者にはしない。

```text
ledger と cc-sdd の関係:
- ledger: project-context、milestone、自走境界、evidence、escalation
- cc-sdd: task implementation loop
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
- MVP では全面統合しない
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

ledger は、MetaGPT / ChatDev をそのまま runtime として取り込むのではなく、責務分離の設計に参照する。

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

ledger では、これを重厚な規制対応としてではなく、非常駐ユーザーと AI 開発チームの間で後から作業・判断・リスクを追跡可能にする evidence model として取り込む。

---

## 8. Claude Code / Codex / Copilot

これらは実行 runtime であり、ledger の置き換え対象ではない。

```text
実行 runtime が担当する:
- code edit
- test execution
- local reasoning
- PR / diff generation
- tool execution

ledger が担当する:
- 何を渡すか
- どの scope で自走させるか
- どこで止めるか
- 何を evidence として残すか
- 何を人間判断に戻すか
```

---

## 9. 正本割当表

| 領域 | 正本 | ledger の役割 |
|---|---|---|
| requirements | Spec Kit | 初期化・参照 |
| plan | Spec Kit | 初期化・参照 |
| tasks | Spec Kit | milestone / plugin へ接続 |
| ideal | ops/ideal/ | user/ 入力を正規化した開発判断の正本 |
| roadmap | ops/roadmaps/ | ideal から milestone への計画正本 |
| implementation loop | cc-sdd または同等 plugin | 委譲・結果集約 |
| role / SOP | rules/ + BMAD / MetaGPT 参照 | 最小定義 |
| milestone autonomy | ledger | 固有定義 |
| escalation | ledger | 固有定義 |
| evidence index | ops/evidence-index.md | 各正本への索引 |
| user decisions | user/decisions.md | 参照、勝手に変更しない |
| source project | src/ | 外側から操作 |

---

## 10. 悪い統合

```text
避ける構成:
- BMAD も丸ごと入れる
- Spec Kit も丸ごと入れる
- cc-sdd も丸ごと入れる
- MetaGPT も丸ごと入れる
- AI Governance も丸ごと入れる
- それぞれが requirements / tasks / workflow を持つ
- ledger も独自 requirements / tasks を持つ
```

この構成では、正本が複数になり、AI がどれを信じるべきか不明になる。

---

## 11. 良い統合

```text
良い構成:
- Spec Kit を spec / plan / tasks の正本にする
- cc-sdd を task implementation loop plugin とする
- BMAD / MetaGPT は role / SOP の参照元に留める
- AI Governance は evidence / accountability の参照元にする
- ledger は project-context ownership、src isolation、milestone autonomy、escalation、evidence bridge に集中する
```

---

## 12. MVP での統合レベル

MVP では、統合を浅くする。

```text
MVP 統合:
- Spec Kit 互換の ops/specs/ 構造
- cc-sdd 互換の tasks 実行想定
- role / SOP は rules/ 内の最小文書
- governance は rules/ の制約と ops/ の evidence index / report に限定
```

実際の plugin 実行、複数 framework の自動起動、複雑な adapter は後段でよい。
