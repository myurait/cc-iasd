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

<!-- 提供すべき機能能力の構造化チェックリスト。coverage 追跡の基準になる。
     各 capability は spec / campaign が covers ref で参照し、未カバーは status --plan の
     射影で空欄として可視化される。 -->

## Human Decision Points

<!-- 人間専権の判断が必要になる点を列挙する。決着済みは decision へのリンクで示し、
     未決は gap（needs-human-decision）として起票して参照する。 -->
