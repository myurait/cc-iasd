# 05. Autonomy Protocol

作成日: 2026-05-04  
状態: 統合整理版 v0.3

---

## 1. この文書の目的

この文書は、cc-iasd における自走範囲、停止条件、Planning Lead と Execution Manager の権限境界を定義する。

cc-iasd の中核価値は、AI に無制限の自律性を与えることではない。

```text
cc-iasd の自走思想:
承認済み scope の内側では自走させ、
scope を越える判断では停止し、
後から読める packet として人間判断へ戻す。
```

---

## 2. 自走単位

標準的な自走実行単位は run である。

```text
標準:
- run

run が参照できる scope:
- campaign
- roadmap slice
- feature
- task set
- single task
- bugfix scope
- Execution Manager が Execution Entry Packet 内で安全と判断した bounded scope
```

自走単位を task に固定すると自走性が弱い。roadmap 全体に広げると権限が大きすぎる。cc-iasd では run を標準の実行単位とし、run が campaign や task set などの bounded scope を参照する。

---

## 3. Campaign

Campaign は、複数の run を段階的に消化するための上位計画概念である。

```text
campaign:
- roadmap / feature / task set を順番に処理する long-run 計画
- 各 run の bounded scope は維持する
- user experience outcome と feature / spec coverage を持つ
- impact map と cross-run non-regression focus を持つ
- Devil's Advocate Focus を持つ
- 次の run へ進む条件を明示する
- 停止条件に触れたら escalation へ切り替える
```

Campaign は巨大な run ではない。campaign は run を統合する計画 envelope であり、実行 transaction の最小単位は run である。

Campaign で定義するものは次である。

```text
campaign plan:
- 対象 feature / roadmap / task queue
- user experience outcome
- feature / spec coverage
- task selector
- 自動で次 run へ進めてよい条件
- 必ず停止して user decision に戻す条件
- impact map
- cross-run non-regression focus
- Devil's Advocate Focus
- 各 run の handoff に引き継ぐ情報
- campaign 全体の completion / escalation report 条件
```

Campaign の artifact model は次である。

```text
ops/execution/
  campaigns/
    cNNN-kebab-case/
      plan.md
      state.md
      queue.md
      aggregate-report.md
    archived/
      cNNN-kebab-case/
  runs/
    run_<timestamp>_<scope>/
      plan.md
      state.md
      handoff.md
      open-items.md
      knowledge.md
    archived/
      run_<timestamp>_<scope>/
```

Campaign の導入によって、Execution Manager は「高度な人間判断が必要な領域以外は、可能な限り段階的に進める」という指示を扱える。ただし、Execution Manager は Execution Entry Packet と campaign plan の外側へ自走範囲を拡大してはならない。

最初の run を開始する前に、Devil's Advocate は Design Launch Review mode で campaign 走行可否を検査する。これは code review ではない。campaign の coverage、task selector、stop / progression conditions、impact map、non-regression focus、人間判断が必要な infrastructure / cost / security / privacy / product value を確認する。

---

## 4. Entry Point Boundary

Planning Lead と Execution Manager は並立する entry point である。Planning Lead は planning phase を扱い、Execution Manager は execution phase を扱う。Planning Lead から Execution Manager を subagent として起動しない。

```text
Planning Lead の責務:
- Backtrack Request の中継
- ideal / feature / spec / roadmap の計画進行
- Designer / Design Reviewer の起動
- Execution Entry Packet の作成
- execution feedback の計画層への反映

Execution Manager の責務:
- run 内の進行管理
- task breakdown の調整
- Worker / execution Reviewer への割当
- 実装結果を踏まえた run-local 変更
- 自走継続可否の判断
- 停止・エスカレーション判断
- completion report の整理
- planning-layer feedback packet の作成
```

## 5. Execution Manager ができること

```text
Execution Manager can:
- run 内の task を分割する
- run 内の task を統合する
- run 内の作業順序を変更する
- run-local な handoff / knowledge を更新する
- アプリケーション開発チーム視点で決定可能な軽微判断を行う
- Worker / Reviewer の再実行を指示する
- review 結果に基づく bounded remediation を行う
- run 内で安全と判断できる範囲を自走させる
- campaign plan に明示された条件の範囲で次の run へ進める
- planning-layer feedback を Planning Lead または Human へ返す
```

---

## 6. Execution Manager ができないこと

```text
Execution Manager cannot:
- roadmap を自由に変更する
- product direction を変更する
- campaign の目的を変更する
- 技術 stack を大きく変更する
- infrastructure / cost / security decision を勝手に行う
- run scope を黙って拡大する
- campaign plan にない task set へ進む
- ユーザー価値判断が必要な仕様判断を代行する
- 既存 user decision を黙って上書きする
- ideal / feature / spec の品質判定を自分で肩代わりする
- 不足した上流 artifact を推測で補完して次工程へ進める
- Planning Lead を subagent として起動する
```

---

## 7. 自走開始条件

```text
自走開始条件:
- 対象 run と bounded scope が明示されている
- 対象 spec / tasks が存在する
- 成果物 root が src/ として解決できる
- 実行 runtime に渡す作業内容が明確である
- run handoff に selected tasks、expected local outcome、likely touched surfaces、related impact surfaces、non-regression focus、escalation triggers、local verification、open item routing がある
- campaign plan に user experience outcome、feature / spec coverage、task selector、stop / progression / completion conditions、impact map、cross-run non-regression focus、Devil's Advocate Focus がある
- Devil's Advocate Design Launch Review が完了している
- 人間判断が必要な未解決事項がない
- 既存 constraints に明確に反しない
```

---

## 8. 自走継続条件

```text
自走継続条件:
- 現在の作業が承認済み run scope 内にある
- roadmap 変更を伴わない
- campaign 目的変更を伴わない
- 技術スタック変更を伴わない
- 費用・外部サービス・セキュリティ決裁を伴わない
- ユーザー価値判断に依存しない
- 手戻りが局所的である
- review / audit により検出可能な形で進んでいる
- 判断内容が run state / logs / reviews / reports から追跡できる
```

campaign 内で次の run へ進む場合は、上記に加えて次を満たす必要がある。

```text
campaign progression 条件:
- 現 run が completed である
- blocking review finding がない
- unresolved open item が user decision を要求していない
- 次 task set が campaign plan に含まれている
- 前 run の handoff が作成されている
- campaign state に進行判断の根拠が残る
```

---

## 9. 停止・エスカレーション条件

```text
停止条件:
- campaign の目的変更が必要になった
- roadmap 変更が必要になった
- 技術スタック変更が必要になった
- infrastructure / cost / security に関わる決裁が必要になった
- ユーザー視点の仕様判断が必要になった
- 価値判断により選択肢が変わる
- 既存要求や user decision と矛盾した
- 大きな手戻りの可能性が高い
- review / audit で重大な未解決リスクが残った
- 成果物 project の root が不明で継続不能になった
- campaign plan の上限を越える必要が出た
```

停止時は、単に質問を返さず、Escalation Packet を生成する。

---

## 10. 軽微判断の扱い

軽微判断は、Execution Manager が run 内で行ってよい。ただし、run state、run-local knowledge、logs、reviews、reports のいずれか適切な artifact に残す。

```text
軽微判断の例:
- task 実行順序の変更
- 小さなファイル分割
- 既存 style に合わせた命名
- test 追加範囲の局所調整
- implementation detail の選択
```

```text
軽微判断ではない例:
- public API の変更
- data model の大きな変更
- 外部 service の導入
- セキュリティ boundary の変更
- product UX の方向転換
```

---

## 11. 自走結果の扱い

自走結果は completion report にまとめる。

```text
completion report に含めるもの:
- 実施した task
- 実装内容
- test / lint / build 結果
- review 結果
- 軽微判断
- 残リスク
- 未完了事項
- 人間確認点
```

campaign を使う場合、各 run の completion report に加えて、campaign 全体の aggregate report を作る。

```text
campaign aggregate report:
- 消化した run / task set
- 自動で次 run へ進めた根拠
- 停止または escalation した理由
- campaign 中に発生した user decision candidates
- 次に人間が確認すべき事項
```

---

## 12. Autonomy Protocol の初期固定項目

初期実装では、次を固定する。

```text
初期固定項目:
- Planning Lead / Execution Manager can / cannot
- 自走開始条件
- 自走継続条件
- 停止条件
- escalation packet 生成条件
- completion report 必須項目
- campaign / run artifact model
```

複雑な multi-role workflow や compliance workflow は後段でよい。
