# 09. ledger 将来構想

作成日: 2026-05-04  
状態: 統合整理版 v0.1

---

## 1. この文書の位置づけ

この文書は、初期実装には含めないが、ledger の将来構想として保持する内容を整理する。

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
```

---

## 3. plugin architecture

初期実装では plugin は設定上の差し替え点に留める。将来的には plugin architecture を整備する。

```text
plugin 候補:
- spec kernel plugin
- implementation loop plugin
- reviewer plugin
- audit plugin
- documentation plugin
```

### 3.1 spec kernel plugin

Spec Kit 以外の spec-driven framework を扱う可能性がある。

### 3.2 implementation loop plugin

cc-sdd、Claude Code、Codex、独自 shell runner などを差し替える。

### 3.3 reviewer plugin

独立 reviewer、test runner、static analysis、security review などを扱う。

---

## 4. role expansion

将来的には、初期 role set を必要に応じて分割できる。

```text
追加候補:
- Code Quality Auditor
- Compliance Auditor
- Security Reviewer
- Documentation Reviewer
- Architect
```

---

## 5. project policy override

将来的には、標準 rules を project 単位で override する機能を持てる。

```text
対象:
- coding conventions
- testing policy
- language policy
- review policy
- project-specific constraints
```

override は標準 rules を暗黙に上書きしない。project-context 内に明示的な差分として残す。

---

## 6. multi-runtime orchestration

将来的には、複数 runtime の使い分けを ledger が制御する可能性がある。

```text
例:
- Claude Code: large local edit / reasoning
- Codex: code generation / refactor
- Claude Code / Codex 以外の runtime: project-specific implementation loop
- alternate runtime: code generation / review runner
- local tools: test / lint / build
- reviewer model: independent review
```

ただし、ledger は runtime そのものを実装しない。何を渡し、何を受け取り、何を evidence として残すかを定義する。

---

## 7. Advanced Evidence / Audit

初期実装では `cc-iasd view evidence` による一時 view を用いる。将来的には、より強い監査性を追加できる。

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

## 8. UI

ledger 自体に UI を持つかは将来構想に留める。

可能性は次である。

```text
A. CLI + Markdown のみ
B. 独立 Web UI
C. IDE / editor extension
```

初期実装では A とする。

---

## 9. Profile update / migration

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

初期実装では lock を記録する。

---

## 10. Knowledge promotion

将来的には、milestone 完了後に得られた知識を project-local knowledge に昇格する仕組みを持てる。

```text
knowledge promotion:
- recurring issue
- coding convention
- architecture decision
- test pattern
- agent instruction improvement
```

初期実装では、completion report の残項目として記録する。

---

## 11. Source provenance support

成果物 project の由来管理は project 固有であり、ledger が一律に定義しない。

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

## 12. 将来構想の境界

次は将来構想であり、初期実装へ混入させない。

```text
初期実装へ混入させない:
- plugin marketplace
- full multi-agent orchestration
- enterprise audit UI
- automatic roadmap generation
- autonomous product decision
- long-term memory service
- visual workflow editor
```
