# 10. TODO

作成日: 2026-05-04
状態: 統合整理版 v0.3

---

## 1. この文書の目的

この文書は、通常の設計文書へ混ぜない未実装項目と未決定事項を管理する。

通常設計として確定済みの構造、artifact model、command workflow は、それぞれの設計文書に置く。未実装、未決定、観察後に判断する内容だけをこの文書に置く。

---

## 2. 未実装項目

```text
TODO:
- Spec Kit 実体との連携方式を実装する
- role runtime の自動生成方式を実装する
- plugin / adapter 設定を runtime/ に接続する
- profile update / migration の方式を実装する
- source provenance adapter の扱いを定義する
- src/ 配下に複数リポジトリを並立させる場合の project 定義を project-policies に記述する
```

---

## 3. 未決定事項

```text
TODO:
- open item / backlog を feature scope と cycle-local context のどちらへ置くかを決める
- product/ideal/ の artifact schema を固定する
- product/specs/ の Spec Kit 委譲範囲を固定する
- ops/scopes/features/ の item schema を固定する
- ops/scopes/roadmaps/ の保存形式を固定する
- ops/scopes/milestones/ の保存形式を固定する
- ops/cycles/ の state / handoff / knowledge schema を固定する
- ops/evidence/logs/ の entry schema を固定する
- ops/evidence/reviews/ の review lifecycle を固定する
- ops/evidence/reports/ の report lifecycle を固定する
- milestone id の命名規則を固定する
- spec id と milestone id の対応規則を固定する
- tasks.md のどの粒度を実行単位にするかを決める
- escalation report の scope ref 形式を固定する
- completion report の scope ref 形式を固定する
- user decisions と cycle-local 軽微判断の分離形式を固定する
- reviewer findings の lifecycle を固定する
```

---

## 4. 観察後に判断する事項

```text
TODO:
- evidence の粒度が粗すぎるか細かすぎるか確認する
- completion report が人間の後続判断に足りるか確認する
- implementation plugin として cc-sdd 的な実装ループが適するか確認する
```
