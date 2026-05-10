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
```

---

## 4. Scenario Test A で観測した残課題

以下は `/tmp/cc-iasd-scenario-test-a` の走行で観測した未対応課題である。scratch 記録、root 直下 `OVERVIEW.md`、scratch 記録内のローカルパス抽象化は、この一覧の対象外とする。

1. CLI command surface の肥大化を抑える。単一 CLI が全レイヤーの操作を露出することで、AI に不要な横断コンテキストを与えない設計を検討する。

2. 不足 role の有無を検討する。product decision escalation、open item routing、campaign progression 判定を既存 role に吸収できるか、将来 role として分けるべきかを判断する。

3. campaign `aggregate-report.md` の更新 workflow を定義する。いつ、誰が、どの command または authored section として campaign aggregate を更新するかを決める。

4. roadmap / feature の planning context が薄いまま downstream へ進むことを防ぐ。roadmap の Campaigns / Runs、Feature Inputs、Deferred、feature の Scope、Roadmap Notes について、最低限の充足条件を定義する。

5. open item の Background、Options、Recommendation、Notes を高密度 feedback として執筆・検査する workflow を定義する。metadata routing だけで完了扱いにならないようにする。

6. open item kind の語彙を実運用に合わせて再検討する。`spec-gap` のような自然発生語彙を許可値へ追加するか、既存語彙への mapping rule を明確にする。

7. completion report から campaign / roadmap / feature へ進捗や残課題を戻す workflow を定義する。report 作成で止めず、planning layer へ反映する接続を明確にする。

8. reference artifact の Canonical Successor 管理を強化する。reference が product / ops / rules に昇格した場合の追跡方法を定義する。

9. 自走開始前の readiness check を定義する。ideal、roadmap、feature、spec、tasks、campaign plan、run selected tasks のどこが薄いかを判定し、interview / planning / implementation のどこへ戻るかを決められるようにする。
