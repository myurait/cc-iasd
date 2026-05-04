# 11. 情報源統合・採否整理

作成日: 2026-05-04  
状態: 統合整理版 v0.1

---

## 1. この文書の目的

この文書は、これまでの ledger 関連情報源をどのように採用・修正・退避・除外したかを整理する。

対象は次である。

```text
対象:
- ledger 再設計に向けた前提整理
- ledger 再定義: project-context full-stack agentic development framework
- ChatLobby 側の optional ledger overview
- Frontdoor / ChatLobby 境界に関する過去整理
- 過去会話での判断
```

---

## 2. 正本として採用する定義

採用する定義は次である。

```text
ledger
  = project-context full-stack agentic development framework
```

より詳細には次である。

```text
ledger は、
Spec Kit を spec-driven development kernel とし、
cc-sdd を autonomous implementation plugin とし、
BMAD / MetaGPT 的な role / SOP 思想を参照し、
成果物 project を src/ に隔離し、
milestone 自走・エスカレーション・証跡索引を独自に提供する、
project-context full-stack agentic development framework である。
```

---

## 3. 旧整理から採用した要素

旧整理では、ledger は project-local agentic SDLC harness とされていた。

この整理から次を採用する。

```text
採用:
- ledger は AI 実行 runtime ではない
- ChatLobby Frontdoor は project 内ロールではない
- 非常駐ユーザー前提
- Planning Lead は milestone 内で裁量を持つ
- Planning Lead は roadmap を勝手に変更できない
- 自走開始 / 継続 / 停止条件が必要
- Escalation Packet が必要
- Completion Report が必要
- Evidence / review / decision の追跡が必要
- no silent overwrite の原則
```

---

## 4. 旧整理から修正した要素

旧整理では、ledger を成果物 project 内に展開する project-local harness として見ていた。

この点は修正する。

```text
修正前:
app-project/
  runtime/
  rules/
  user/
  ops/
  src/

修正後:
project-context/
  runtime/
  rules/
  user/
  ops/
  src/  ← 成果物 project
```

ledger は project に埋め込まれる規約集ではなく、成果物 project を内包する project-context を所有する framework として扱う。

---

## 5. 新整理から採用した要素

新整理から次を採用する。

```text
採用:
- project-context ownership
- src/ isolation
- Spec Kit as spec-driven development kernel
- cc-sdd as autonomous implementation plugin
- BMAD / MetaGPT as role / SOP reference
- AI Governance as evidence / accountability reference
- Evidence Bridge
- user-authored area
- cc-iasd init / run / escalate / report
- 既存 framework を丸ごと重ねない原則
```

---

## 6. ChatLobby 側整理から採用した境界

ChatLobby 側では、ledger は MVP 対象外の optional とされている。

この境界を採用する。

```text
ChatLobby:
- Workspace
- Conversation
- Message
- Search / Summary
- Workspace Assignment
- 軽量 Frontdoor

ledger:
- project-context
- spec / plan / tasks
- milestone 自走
- review / audit
- escalation packet
- evidence bridge
- completion report
```

ledger は ChatLobby の会話管理を持たない。ChatLobby は ledger の実装規律を持たない。

---

## 7. 退避した要素

次は将来構想へ退避した。

```text
将来構想へ退避:
- full multi-agent orchestration
- plugin marketplace
- Hermes / ChatLobby tight integration
- advanced audit trail
- immutable event log
- visual UI
- source provenance adapter
- profile migration automation
- knowledge promotion automation
```

---

## 8. 除外した要素

次は ledger の責務から除外する。

```text
除外:
- ChatLobby Frontdoor の実装
- ChatLobby Workspace / Conversation / Message 管理
- AI runtime そのものの実装
- MCP protocol そのものの実装
- AGENTS.md / CLAUDE.md の単純代替
- GitHub Actions の代替
- roadmap 自動変更
- product decision の自動決裁
- source provenance policy の一律定義
```

---

## 9. 採否対応表

| 論点 | 採否 | 現在の扱い |
|---|---:|---|
| project-local harness | 部分採用 | 非常駐ユーザー、自走、証跡思想を採用 |
| project-context framework | 採用 | 正本定義 |
| 成果物 project 内への ledger 埋め込み | 修正 | project-context が src/ を内包する形へ変更 |
| Spec Kit | 採用 | spec / plan / tasks の kernel |
| cc-sdd | 採用候補 | implementation plugin 候補 |
| BMAD | 参照 | role / planning 参照元。MVP では全面統合しない |
| MetaGPT / ChatDev | 参照 | multi-agent role 思想の参照元 |
| AI Governance | 参照 | evidence / accountability の参照元 |
| Escalation Packet | 採用 | ledger 固有中核 |
| Evidence Bridge | 採用 | ledger 固有中核 |
| Completion Report | 採用 | ledger 固有中核 |
| Hermes | 後段 | ChatLobby / Frontdoor 側候補。ledger MVP には入れない |
| ChatLobby 連携 | 後段 | ledger 単体で成立後に接続 |
| source provenance policy | 除外 | project profile / adapter 側の将来論点 |

---

## 10. 統合後の最終整理

ledger は、次の一点に価値を集約する。

```text
ユーザーが常駐しない前提で、
既存 AI 開発フレームワーク群を正本として統合し、
成果物 project を src/ に隔離した project-context を構成し、
Planning Lead が milestone 単位で安全な自走範囲を管理し、
必要な場合だけ十分な文書情報を伴って人間判断へ戻し、
作業・判断・レビュー・残リスクを後から追跡可能にすること。
```

この定義を、ledger 開発ドキュメント群の正本とする。
