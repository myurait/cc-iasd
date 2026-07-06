# 13. 机上検証シナリオ

作成日: 2026-07-06  
状態: kernel 正本 v1.0（Phase 1 レビュー待ち。1-E 机上検証の結果を含む）

---

## 1. この文書の目的

この文書は、kernel の状態機械・ガード・packet が実運用の代表シナリオを破綻なく通せるかを、実装前に机上で検証するための再利用可能なシナリオ集である。各シナリオは、前提・遷移列・働くガード・期待される journal event を固定し、設計文書（02 / 05 / 06 / 08）との矛盾を検出する。

P1 実装後は、同じシナリオが結合テストの台本になる（rework/05 4.1 章の 2-E）。

1-E 机上検証の結果は 8 章に記録する。

---

## 2. S1: PBI 並列完走（multi-repo・並列 run）

PBI「多言語対応」を campaign c010 に写像し、spec 3 本（s010-ui / s011-api / s012-migration）を 2 repo（src/web, src/api）で並列消化する。s012 は s011 の後でなければ意味をなさない論理依存を持つ。

```text
前提:  vision approved / s010-s012 ready / charter の Coverage が
       s012 に after: [s011] を宣言 / c010 launch 済み
遷移列:
  run open（s010, agent A）と run open（s011, agent B）を同時実行
    -> s010.write（src/web/**）と s011.write（src/api/**）は交差なし -> 両方成立
    -> 各 run に claim event、repo 別 base commit（commit.observed）が記録される
  run open（s012）を同時に試行
    -> coverage 順序制約ガードが拒否（after: [s011] の task が未 accepted）
  A・B が実装 -> run return（repo 別 diff snapshot）-> run verify（repo 別 surface 照合。
    同一 repo を共有しないため verify lock の競合なし）
  -> review record（gate=run）-> 両 run accept
  -> run open（s012）が成立（順序制約充足）-> 同様に accept
  -> cross-checks（e2e）pass -> completion review -> campaign close
検証観点:
  - 並列可否の判定が write glob 交差と repo 素集合のみで決定論的に下せるか -> 可
  - 論理依存（glob 非交差）の直列化が宣言 + ガードで強制されるか
    -> coverage 順序制約（after）で可。1-E で検出した設計の穴への対応（8 章）
  - task 二重取りが claim event で排他されるか -> 可（journal は 1-event-1-file で衝突なし）
```

---

## 3. S2: backtrack（推測補完の禁止）

spec の欠落を worker が実装中に検知するケースと、run open 時点で handoff 合成が失敗するケースの 2 経路を検証する。

```text
経路 1（open 時検出）:
  spec s020 の Acceptance が空のまま ready を試行
    -> spec ready ガードが必須セクション非空パースで拒否（そもそも run に到達しない）
  ready を経ずに run open を試行 -> campaign coverage 外 / spec 未 ready で拒否
経路 2（実装中検出）:
  run 実行中、worker が「エラー時挙動が spec にない」ことを検知
    -> cc-iasd run block --missing "specs/s020/spec.md#エラー時挙動"
    -> backtrack request（blocked stage / 欠落上流 ref / 継続不能理由 /
       推測継続時のリスク / 再開条件）が生成され、run は blocked
  -> planner が spec を編集（content-hash 更新）-> gate=spec の再 review
  -> run 再開（resume brief が base commit からの diff・最終 verification を再構成）
検証観点:
  - 推測で埋める主体が存在しないか -> 可（handoff は機械合成、worker は block が最安の出口）
  - blocked からの再開条件が決定論的か -> 可（hash 更新 + 再 review の 2 条件）
  - 期待 event: gap.opened（needs-upstream-fix）/ transitioned（run -> blocked,
    guard_results 焼込）/ revised（spec）/ review.recorded / transitioned（再開）
```

---

## 4. S3: escalation と非同期決裁（非常駐人間）

外部サービス選定（人間専権領域）が実装中に必要になるケース。

```text
遷移列:
  worker がメール送信の外部サービス選定が必要と判明
    -> gap add（kind=needs-human-decision, blocking）
    -> cc-iasd run escalate -> escalation packet（停止理由 / 選択肢 / 各選択肢の影響 /
       放置した場合の影響 / 推奨 / 再開条件 / 関連証跡）が生成され、run は escalated
  人間は不在。run は packet を残して待つ（オートアプルーブは存在しない）
  翌朝、人間が cc-iasd（inbox）で要対応を確認 -> packet を読み decide
    -> decision.recorded（actor=human 刻印）-> gap close -> run 再開
検証観点:
  - 非常駐人間が packet だけで判断できる情報が揃うか -> 必須欄（06）が担保
  - agent の自己承認が物理遮断されるか -> decide の TTY 既定 + actor 刻印で可
  - 人間の介入動線が inbox / decide に収まるか -> 可（08 の human-facing 上限）
```

---

## 5. S4: 中断と再開（中断耐性）

長時間 run の途中でプロセスが死ぬケース。

```text
遷移列:
  run r-X の session 実行中に runtime プロセスが死ぬ（後始末なし）
  -> journal には open 時の claim / base commit / それまでの event が残存
  -> status が「running だが journal に N 分イベントなし」を stale として表示
  -> session resume r-X が resume brief（base commit からの git diff --stat /
     最終 verification 結果 / 未終端 event）を決定論的に再コンパイルして再開
  -> 以降は通常フロー（return / verify / accept）
検証観点:
  - 中断時点の状態が Markdown の手動更新に依存しないか -> 可（journal が正本）
  - 残作業の導出が機械的か -> 可（spec tasks の未チェック + open gap + journal）
  - 再開 context がエージェントの記憶に依存しないか -> 可（resume brief は導出物）
```

---

## 6. S5: 停止条件と reject 階梯（無進捗の遮断）

修正ループが空転するケース。

```text
遷移列:
  run r-Y の verify が fail -> worker 修正 -> review record が reject（1 回目）
  -> 再修正 -> reject（2 回目、既定上限到達）
  -> accept が封鎖され、escalate のみ許可される（A3 階梯）
  -> escalation packet に reject 履歴（verification / review への参照）が含まれる
別経路:
  直近 N run で diff / task 進捗ゼロ -> no-progress ガードが run open を拒否
  人間が runs/<id>/STOP を配置 -> guard が検出し以降の遷移を拒否
検証観点:
  - 「進んでいないのに走り続ける」経路が閉じているか -> 可（journal カウントで機械判定）
  - 判定に LLM の自己申告が混入しないか -> 可（exit code / diff hash / チェック状態のみ）
```

---

## 7. S6: gap ライフサイクルの終端 3 種

未解決事項の 3 つの出口を検証する。

```text
closed:   blocking gap（needs-human-decision）を decide で解消 -> gap close は
          decision へのリンクで成立。下流遷移の封鎖が解ける
routed:   実装中に見つかった改善候補（kind=candidate, blocking=false）を
          gap route --to vision -> route 先の計画在庫として台帳に残り、
          status --plan に現れ続ける。decision 不要
deferred: 今回は扱わないと人間が決めた gap -> decision へのリンク必須で deferred
          -> campaign close ガードの「deferred（要 decision）」を充足
検証観点:
  - blocking gap を routed にする抜け道がないか -> 可（05 の終端条件が禁止）
  - campaign close 時に未処理 gap が残らないか -> 可（close ガードが全 gap の
    closed | routed | deferred を要求）
```

---

## 8. 1-E 机上検証の結果

上記 S1〜S6 を 02 / 05 / 06 / 08 のガード・schema と突き合わせた結果は次である。

```text
検証結果:
- S2〜S6: 設計文書の範囲で矛盾なく通せることを確認した
- S1: 設計の穴を 1 件検出した。campaign 内の spec 間論理依存（write glob が
  交差しないため並列ガードでは直列化されない依存）を強制する機構が存在しなかった。
  rework/04 の確定（coverage 順序制約 after: [spec-ref] と run open ガードへの追加）
  により解消済み。本文書 S1 と 05 の遷移ガード表に反映されている
残課題（実装時に検証する事項。机上では確定できない）:
- 並列 run の verify lock が長時間 check で滞留した場合のスループット
- resume brief の情報量が長大 run で十分か（journal event の粒度に依存）
- no-progress 判定の N と diff hash 比較の粒度（P1 実装時の数値既定。rework/04 14 章）
```
