# 05. Autonomy Protocol

作成日: 2026-05-04  
状態: 統合整理版 v0.1

---

## 1. この文書の目的

この文書は、ledger における自走範囲、停止条件、Planning Lead の権限境界を定義する。

ledger の中核価値は、AI に無制限の自律性を与えることではない。

```text
ledger の自走思想:
承認済み scope の内側では自走させ、
scope を越える判断では停止し、
後から読める packet として人間判断へ戻す。
```

---

## 2. 自走単位

標準的な自走単位は milestone である。

```text
標準:
- milestone

例外:
- task set
- single task
- bugfix scope
- Planning Lead が安全と判断した bounded scope
```

自走単位を task に固定すると自走性が弱い。roadmap に広げると権限が大きすぎる。ledger では milestone を標準としつつ、bounded scope を許容する。

---

## 3. Planning Lead

Planning Lead は project-context 内の開発チームリーダーである。

```text
Planning Lead の責務:
- milestone 内の進行管理
- task breakdown の調整
- Worker / Reviewer への割当
- 実装結果を踏まえた局所計画変更
- 自走継続可否の判断
- 停止・エスカレーション判断
- completion report の整理
```

Planning Lead は ChatLobby の Frontdoor ではない。Frontdoor は ChatLobby 側の入口であり、ledger には非常駐ユーザー制約として現れる。

---

## 4. Planning Lead ができること

```text
Planning Lead can:
- milestone 内の task を分割する
- milestone 内の task を統合する
- milestone 内の作業順序を変更する
- milestone-local な implementation plan を更新する
- アプリケーション開発チーム視点で決定可能な軽微判断を行う
- Worker / Reviewer の再実行を指示する
- review 結果に基づく bounded remediation を行う
- milestone 内で安全と判断できる範囲を自走させる
```

---

## 5. Planning Lead ができないこと

```text
Planning Lead cannot:
- roadmap を自由に変更する
- product direction を変更する
- milestone の目的を変更する
- 技術 stack を大きく変更する
- infrastructure / cost / security decision を勝手に行う
- milestone scope を黙って拡大する
- ユーザー価値判断が必要な仕様判断を代行する
- 既存 user decision を黙って上書きする
```

---

## 6. 自走開始条件

```text
自走開始条件:
- 対象 milestone または bounded scope が明示されている
- 対象 spec / tasks が存在する
- 成果物 root が src/ として解決できる
- 実行 runtime に渡す作業内容が明確である
- 人間判断が必要な未解決事項がない
- 既存 constraints に明確に反しない
```

---

## 7. 自走継続条件

```text
自走継続条件:
- 現在の作業が承認済み milestone 内にある
- roadmap 変更を伴わない
- milestone 目的変更を伴わない
- 技術スタック変更を伴わない
- 費用・外部サービス・セキュリティ決裁を伴わない
- ユーザー価値判断に依存しない
- 手戻りが局所的である
- review / audit により検出可能な形で進んでいる
- 判断内容が evidence として追跡できる
```

---

## 8. 停止・エスカレーション条件

```text
停止条件:
- milestone の目的変更が必要になった
- roadmap 変更が必要になった
- 技術スタック変更が必要になった
- infrastructure / cost / security に関わる決裁が必要になった
- ユーザー視点の仕様判断が必要になった
- 価値判断により選択肢が変わる
- 既存要求や user decision と矛盾した
- 大きな手戻りの可能性が高い
- review / audit で重大な未解決リスクが残った
- 成果物 project の root / repository 方針が不明で継続不能になった
```

停止時は、単に質問を返さず、Escalation Packet を生成する。

---

## 9. 軽微判断の扱い

軽微判断は、Planning Lead が milestone 内で行ってよい。ただし、証跡に残す。

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

## 10. 自走結果の扱い

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

---

## 11. Autonomy Protocol の最小版

MVP では、次だけを固定すればよい。

```text
MVP 固定項目:
- Planning Lead can / cannot
- 自走開始条件
- 自走継続条件
- 停止条件
- escalation packet 生成条件
- completion report 必須項目
```

複雑な multi-role workflow や compliance gate は後段でよい。
