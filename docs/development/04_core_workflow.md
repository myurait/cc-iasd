# 04. コアワークフロー

作成日: 2026-07-05  
状態: kernel 正本 v1.0（Phase 1 レビュー待ち）

---

## 1. この文書の目的

この文書は、kernel の標準ワークフローを 1 機能を作り切る遷移列として通しで示す。各遷移の成立条件（ガード）は 05、コマンド定義は 08、packet と evidence の schema は 06 に置く。標準フローの図は `standard_flow_overview.mmd` に置く。

すべての前進はガードを通過した型付き遷移であり、ロールが状態を進めることはない。planner は執筆し、worker は実装し、reviewer は判断材料を返すだけである。

---

## 2. 標準フロー: 1 機能を作り切る

```text
フェーズ 1: 計画と gate
  new vision -> planner が執筆 -> decide（human 承認）-> vision approved
  new spec   -> planner が執筆。未確定は gap 起票 + [UNRESOLVED: gNNN]
             -> blocking gap があれば spec ready は拒否され、decide か編集 + 再 review で解消
             -> review record（gate=spec）-> spec ready
  new campaign -> planner が charter を執筆（Coverage / Depends On / Stop Conditions /
                  Risk Tiers / Cross-Checks）
             -> review record（gate=launch）-> campaign launch
                （depends_on の全 campaign が closed であることをガードが検査）

フェーズ 2: run サイクル（campaign 内で task が尽きるまで反復。並列可）
  run open   -> handoff を CLI が機械合成。上流欠落なら欠落列挙 + 拒否（backtrack 誘導）
             -> claim event / write glob 交差ガード / 停止条件ガードを通過して開始
  実装        -> worker が handoff を入力に src/ のみを編集し、notes と gap 起票で報告
  run return -> CLI が repo 別 git diff snapshot を実測記録
  run verify -> CLI が Checks を子プロセス実行し、Surfaces と diff を照合。
                verification evidence を生成（forbid 違反は機械 FAIL）
  review record（gate=run）-> run accept
                （verification pass / review 鮮度 / blocking gap 0 / reject 上限内）

フェーズ 3: 締め
  review record（gate=completion）-> report（completion）
  -> human が report と review を読む -> campaign close
     （全 run accepted / 全 task 消化 / gap 全処理 / cross-checks pass / completion review）
```

このフローの各所で、完了を偽装する経路は構造的に閉じている。worker には完了宣言コマンドがなく、verification は CLI 実行でのみ生成され、review record は content-hash の鮮度をカーネルが判定する。

---

## 3. 差し戻しと決裁の流れ

run の終端は accept / block / escalate の 3 択であり、block が最も安価な合法出口である。

```text
block（上流不足）:
  run block -> backtrack request 生成 -> blocked
  -> 人間または planner が上流 artifact を編集（hash 更新）+ 該当 gate の再 review
  -> run 再開

escalate（人間判断要）:
  run escalate -> escalation packet 生成 -> escalated
  -> 人間が都合のよいタイミングで packet を読み decide（actor=human 刻印）
  -> run 再開

自動停止:
  no-progress / budget 超過 / STOP ファイル / reject 上限到達は、
  run open・verify のガードが機械判定して停止させる（詳細は 05）
```

---

## 4. adhoc からの導入フロー

フル chain を初日から要求しない。adhoc run が導入の入口である。

```text
init -> run open --adhoc "<goal>" --check "<cmd>" -> session start
```

adhoc run は spec を要求しないが、guard / journal / verify / 終端 3 択はすべて有効であり、3 不変条件は初日から守られる。規模が増えたら spec / campaign へ昇格する（doctor が促す）。探索作業には spike run を使う（コマンド列と導入手順の詳細は 08）。

---

## 5. 詳細仕様の参照先

```text
- 02: 概念設計（ノード・journal・gap・終端 3 択の「なぜ」）
- 05: 状態遷移表と全ガード / 停止条件 / gate review 既定 / 並列 run 排他規則
- 06: handoff 合成規則 / verification 生成規則 / packet 必須欄
- 08: コマンド定義 / 導入フローの実コマンド列
- 12: ロールの責務境界
```
