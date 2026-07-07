---
id: {{id}}
refs: []
---

# vision: {{slug}}

<!-- vision は product 正本の起点であり、何を作り何を作らないかの canon を定める。
     ライフサイクル状態は journal が持つ。本ファイルは authored content のみを書く。
     出力言語は {{docLang}} とする。 -->

## Target Experience

<!-- 利用者が到達すべき体験を記す。実装手段ではなく、達成された状態として書く。 -->

## Non-Goals

<!-- この vision で意図的に扱わないことを列挙する。範囲の外縁を確定させる。 -->

## Boundaries

<!-- 越えてはならない設計境界（infrastructure / cost / security / product value 等）を記す。
     handoff 合成時に該当 Boundaries が worker へ抜粋される。 -->

## Capabilities

<!-- 提供すべき機能能力の構造化チェックリスト。coverage 追跡の突合キーになる。
     記法（1 capability = 1 チェックリスト項目。id は cap-<slug> で安定させる）:
       - [ ] cap-<slug>: 説明
     spec / campaign は frontmatter refs に covers（to=<cap-id>）を宣言してこの
     capability を被覆する。遷移時に journal へ取り込まれ、covers 射影の正本になる。
     どの spec / campaign も covers しない capability は status --plan で
     未カバーとして可視化される。以下は記入例（実際の capability に置き換える）。 -->

- [ ] cap-example: この vision が提供すべき能力の一例（説明を書き、id は cap- で始める）

## Human Decision Points

<!-- 人間専権の判断が必要になる点を列挙する。決着済みは decision へのリンクで示し、
     未決は gap（needs-human-decision）として起票して参照する。 -->
