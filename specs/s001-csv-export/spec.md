---
id: s001
refs: []
---

# spec: csv-export

<!-- spec は開発対象の仕様単位である。Surfaces と Checks は verification の入力になる。
     未確定箇所は本文に埋めず [UNRESOLVED: gNNN] で gap 台帳を参照する。
     台帳に存在しない裸のマーカーは doctor が違反として検出する。
     出力言語は Japanese とする。 -->

## Requirements

<!-- 満たすべき要件を記す。未確定要件は [UNRESOLVED: gNNN] で該当 gap を参照する。 -->

## Acceptance

<!-- 受け入れ条件を記す。Checks が機械検証する対象と対応づける。 -->

## Surfaces

<!-- 変更してよい面（write）と触れてはならない面（forbid）を glob で宣言する。
     multi-repo では src/<repo>/ プレフィックスを含む。verify が base commit からの
     git diff を照合し、forbid 該当は機械 FAIL、write glob 外は off-surface として列挙する。 -->

```text
write:  ["src/<repo>/<path>/**"]
forbid: ["src/**/infra/**", "src/**/.env*"]
```

## Checks

<!-- 検証コマンドを構造化欄で宣言する。各 check は id / run / cwd / expect を持つ。
     verify が CLI 自身で子プロセス実行し exit code を expect と照合する。
     cc-iasd.yaml の command allowlist に適合しない check を含む spec は
     spec ready ガードで decision 承認を要求する。 -->

```text
- id: <check-id> ; run: "<command>" ; cwd: src/<repo> ; expect: { exit: 0 }
```

## Tasks

<!-- 実装 runtime に委譲可能な作業単位を列挙する。run open の --tasks で選択され、
     review の単位にもなる。 -->
