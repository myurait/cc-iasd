# 09. ledger 将来構想

作成日: 2026-05-04  
状態: 統合整理版 v0.1

---

## 1. この文書の位置づけ

この文書は、MVP には含めないが、ledger の将来構想として保持する内容を整理する。

ここに含まれるものは、初期実装の必須要件ではない。

---

## 2. 将来像

ledger の将来像は、project-context を中心に複数の既存 framework と実行 runtime を統合する agentic development framework である。

```text
将来像:
- Spec Kit を kernel とする
- cc-sdd などを implementation plugin とする
- Claude Code / Codex などを runtime として選択する
- role / SOP を plugin として拡張する
- evidence / escalation / report を一貫管理する
- ChatLobby から project-context を操作できる
```

---

## 3. plugin architecture

MVP では plugin は設定上の差し替え点でよい。将来的には plugin architecture を整備する。

```text
plugin 候補:
- spec kernel plugin
- implementation loop plugin
- reviewer plugin
- audit plugin
- documentation plugin
- ChatLobby integration plugin
- git / worktree plugin
```

### 3.1 spec kernel plugin

Spec Kit 以外の spec-driven framework を扱う可能性がある。

### 3.2 implementation loop plugin

cc-sdd、Claude Code、Codex、独自 shell runner などを差し替える。

### 3.3 reviewer plugin

独立 reviewer、test runner、static analysis、security review などを扱う。

---

## 4. multi-runtime orchestration

将来的には、複数 runtime の使い分けを ledger が制御する可能性がある。

```text
例:
- Claude Code: large local edit / reasoning
- Codex: code generation / refactor
- local tools: test / lint / build
- reviewer model: independent review
```

ただし、ledger は runtime そのものを実装しない。何を渡し、何を受け取り、何を evidence として残すかを定義する。

---

## 5. Advanced Evidence / Audit

MVP では evidence index で足りる。将来的には、より強い監査性を追加できる。

```text
将来候補:
- immutable event log
- decision lifecycle
- review finding lifecycle
- risk register
- evidence graph
- report diff
- profile version migration history
```

これは enterprise compliance platform を目指すものではなく、非常駐ユーザーと AI 開発チームの間で判断経緯を失わないための強化である。

---

## 6. ChatLobby 連携

ChatLobby との連携は将来構想である。

```text
ChatLobby 側:
- workspace-aware conversation
- user request
- project-context selection
- report display

ledger 側:
- project-context
- milestone run
- escalation packet
- completion report
```

将来的には、ChatLobby から ledger の状態を参照し、Escalation Packet や Completion Report を conversation に表示できる。

ただし、ledger の MVP は ChatLobby なしで成立させる。

---

## 7. UI

ledger 自体に UI を持つかは未決である。

可能性は次である。

```text
A. CLI + Markdown のみ
B. ChatLobby 上で表示
C. 独立 Web UI
D. IDE / editor extension
```

MVP では A とする。

---

## 8. Profile update / migration

project-context は作成時点の ledger profile を lock する。

将来的には、標準 profile の更新を project-context へ適用する仕組みが必要になる。

```text
必要になるもの:
- profile version
- migration guide
- local customization detection
- safe update
- diff review
```

MVP では lock を記録するだけでよい。

---

## 9. Knowledge promotion

将来的には、milestone 完了後に得られた知識を project-local knowledge に昇格する仕組みを持てる。

```text
knowledge promotion:
- recurring issue
- coding convention
- architecture decision
- test pattern
- agent instruction improvement
```

MVP では、completion report の残項目として記録する程度でよい。

---

## 10. Source provenance support

成果物 project の由来管理は project 固有であり、MVP の ledger が一律に定義しない。

将来的には、必要に応じて source provenance adapter を追加できる。

```text
将来候補:
- new project
- imported repository
- forked repository
- vendor source analysis
- generated prototype
```

ただし、これは ledger core ではなく adapter / profile の領域で扱う。

---

## 11. 将来構想の境界

次は将来構想であり、MVP へ混入させない。

```text
MVP へ混入させない:
- plugin marketplace
- full multi-agent orchestration
- enterprise audit UI
- automatic roadmap generation
- autonomous product decision
- long-term memory service
- ChatLobby tight integration
- visual workflow editor
```
