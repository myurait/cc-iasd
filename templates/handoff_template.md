---
id: {{runId}}
refs: []
---

# handoff: {{runId}}

<!-- handoff は run の実行入力であり、CLI が run open 時に上流成果物から機械合成する。
     AI は handoff を執筆しない。本雛形は合成先セクションの skeleton である。
     必須フィールドの合成に失敗した場合（上流セクションの欠落・空・blocking gap あり）、
     run open は欠落セクションを列挙して拒否し、backtrack request の生成を誘導する。
     出力言語は {{docLang}} とする。 -->

## Requirements

<!-- 合成元: spec の Requirements。 -->

## Acceptance

<!-- 合成元: spec の Acceptance。 -->

## Surfaces

<!-- 合成元: spec の Surfaces（write / forbid glob）。multi-repo では対象 repo の
     レイアウト（repo 一覧・各 base commit・対象 glob）を含めて合成される。 -->

## Checks

<!-- 合成元: spec の Checks（id / run / cwd / expect）。 -->

## Tasks

<!-- 合成元: spec の対象 Tasks（run open の --tasks で選択）。 -->

## Risk Tiers

<!-- 合成元: charter の Risk Tiers。 -->

## Non-Regression Focus

<!-- 合成元: charter の Non-Regression Focus。 -->

## Stop Conditions

<!-- 合成元: charter の Stop Conditions。 -->

## Decisions

<!-- 合成元: 関連する decision の確定事項。 -->

## Boundaries

<!-- 合成元: vision の該当 Boundaries 抜粋。 -->

## Worker Role Card

<!-- 合成元: worker role card と許可コマンド表。 -->

## Exit Protocol

<!-- 完了を宣言する手段はない。実装後に run verify を要求せよ。
     終端は accept / block / escalate のみである。 -->
