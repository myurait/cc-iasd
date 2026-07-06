---
id: {{ref}}
refs: []
---

# report: {{ref}}

<\!-- report は run / campaign の終端 packet であり、completion / escalation / backtrack の
     いずれか 1 つである。report コマンドが skeleton を生成し、tool-owned 欄は CLI が埋め、
     authored 欄は AI が執筆する。tool-owned 欄は自由編集しない。
     この雛形は 3 種の packet 全欄を含む。生成時に該当種別の欄が残る。
     出力言語は {{docLang}} とする。 -->

## tool-owned

<\!-- CLI が埋める。AI は編集しない。 -->

```text
source refs:            <対象 ref / source campaign / source run>
verification 結果への参照: <evidence/verifications への参照>
review record への参照:  <evidence/reviews への参照>
off-surface 変更面:      <verify が自動列挙した write glob 外の変更面>
gap への参照:            <起票・関連 gap への参照>
```

## authored

<\!-- AI が執筆する。completion report の authored 欄。 -->

### scope summary

<\!-- 実装・処理した範囲の要約を記す。 -->

### completion assessment

<\!-- 完了状態の評価を記す。 -->

### 軽微判断の記録

<\!-- run 内で自律的に下した軽微な判断を記す。 -->

### 残リスク

<\!-- 残存するリスクを記す。 -->

### 人間が確認すべき点

<\!-- 人間の確認を要する点を記す。planning 層への還流事項があれば
     gap を route 付きで起票する（本文には書かない）。 -->

## escalation packet

<\!-- run escalate の終端 packet。escalate 時のみ残る欄。 -->

### 停止理由

<\!-- なぜ自走を止めたかを記す。 -->

### 選択肢

<\!-- 取り得る選択肢を複数列挙する。 -->

### 各選択肢の影響

<\!-- 各選択肢を選んだ場合の影響を記す。 -->

### 放置した場合の影響

<\!-- 決裁されず放置された場合の影響を記す。 -->

### 推奨

<\!-- どの選択肢を推すか、その根拠を記す。 -->

### 再開条件

<\!-- どの decision が下されれば run が再開できるかを記す。 -->

### 関連証跡

<\!-- 判断に必要な evidence への参照を記す。 -->

## backtrack request

<\!-- run block の終端 packet。block 時のみ残る欄。handoff 合成失敗からも誘導される。 -->

### blocked stage

<\!-- どの段階で継続不能になったかを記す。 -->

### 欠落上流 ref

<\!-- 不足している上流成果物の参照を記す。handoff 合成失敗時に列挙された
     欠落セクションと対応する。 -->

### 継続不能理由

<\!-- 推測なしに続けられない理由を記す。 -->

### 推測継続時のリスク

<\!-- そのまま埋めて進んだ場合の危険を記す。 -->

### 再開条件

<\!-- 上流がどう修正されれば再開できるかを記す。 -->
