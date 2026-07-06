---
id: {{id}}
refs: []
---

# charter: {{slug}}

<!-- charter は campaign の authored 媒体である。複数 run を束ね、ユーザー体験や機能
     まとまりが成立するかを制御する上位境界を定める。実行状態・handoff・局所知識は
     run に置く。ライフサイクル状態は journal が持つ。出力言語は {{docLang}} とする。 -->

## UX Outcome

<!-- この campaign を通じて成立させるユーザー体験の成果を記す。 -->

## Coverage

<!-- この campaign が覆う spec / capability を covers ref で参照する。
     launch ガードは coverage の全 spec が ready であることを検査する。 -->

## Depends On

<!-- 先行して closed である必要がある campaign を depends_on として宣言する。
     launch ガードが依存 campaign の closed を検査し、実現順序を決定論的に強制する。
     依存がなければ空とする。 -->

```text
depends_on: []
```

## Stop Conditions

<!-- この campaign 配下の run が自走を止めるべき条件を記す。
     handoff 合成時に worker へ焼き込まれる。 -->

## Risk Tiers

<!-- run の risk tier を A4 の 3 軸（帰結の不可逆性 / 影響範囲（surface 内外・impact）/
     人間専権領域該当）で分類する。run gate の緩和（risk-tier 連動オプトダウン）は
     ここで宣言する。宣言の妥当性は launch review が検査する。 -->

## Non-Regression Focus

<!-- run をまたいで保持すべき既存挙動を記す。handoff 合成時に worker へ焼き込まれる。 -->

## Cross-Checks

<!-- campaign 全体で横断的に確認すべき観点を記す。completion gate の review 対象になる。 -->
