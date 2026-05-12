# 10. TODO

作成日: 2026-05-04
状態: 統合整理版 v0.4

---

## 1. この文書の目的

この文書は、通常の設計文書へ混ぜない未実装項目と未決定事項を管理する。

通常設計として確定済みの構造、artifact model、command workflow は、それぞれの設計文書に置く。未実装、未決定、観察後に判断する内容だけをこの文書に置く。

---

## 2. 未決定事項

```text
TODO:
- product/specs/ で plan.md 名を維持するか別名にするかを決める
- feature と debt の artifact 境界を最終確認する
- user/decisions.md がユーザー指摘や決定の蓄積先として肥大化しないよう、decisions を仕様正本や scope / execution 文書へ展開する flow を定義する
- user/product-intent.md に置かれた内容を、適切なタイミングで product/ideal/ に吸収する flow を定義する
- user/ 配下に保持すべき情報の種類、寿命、正本への展開先、残すべき一時情報の境界を整理する
- 既存リポジトリに後から cc-iasd を導入する際の ideal と feature の初期定義方法を整理する
```

---

## 3. 観察後に判断する事項

```text
TODO:
- evidence の粒度が粗すぎるか細かすぎるか確認する
- completion report が人間の後続判断に足りるか確認する
- tasks 起点の implementation loop が run / evidence と過不足なく接続できるか確認する
- 開発用資料を project-context doctor から切り離し、release 前の削除または別管理方針への委譲を扱う検査を別系統にする
- Feature Scope Designer / Spec Designer の role prompt を強化するため、著名な agent / spec-driven development / planning assistant repository の designer・planner・architect 系 prompt を調査し、cc-iasd の role boundary、command visibility、artifact discipline に適合する要素だけを抽出する
- Devil's Advocate の `Design Launch Review` / `Campaign Completion Review` mode を CLI / adapter の role invocation metadata として明示的に渡す仕組みを実装する。
```

---

## 4. Scenario Test A で観測した残課題

以下は `/tmp/cc-iasd-scenario-test-a` の走行で観測した未対応課題である。scratch 記録、root 直下 `OVERVIEW.md`、scratch 記録内のローカルパス抽象化は、この一覧の対象外とする。

1. CLI command surface の肥大化を抑える。単一 CLI が全レイヤーの操作を露出することで、AI に不要な横断コンテキストを与えない設計を検討する。

2. Planning Lead と Execution Manager を並立 entry point として分離した後、command visibility と runtime handoff が context pressure を増やしていないかを scenario test で検証する。

3. reference artifact の Canonical Successor 管理を強化する。reference が product / ops / rules に昇格した場合の追跡方法を定義する。

4. Artifact Quality Requirements / Backtrack Request を実際の scenario test で観察し、AI が不足を推測補完せず適切に Backtrack Request を返せるか検証する。
