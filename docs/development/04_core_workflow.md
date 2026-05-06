# 04. Core Workflow

作成日: 2026-05-04
状態: 統合整理版 v0.3

---

## 1. この文書の目的

この文書は、cc-iasd の基本ワークフローと完了条件を定義する。

ディレクトリ構造は `03_project_context_architecture.md`、artifact model は `06_artifact_and_evidence_model.md`、command 詳細は `08_commands_and_workflows.md` に置く。この文書は、それらを実際の開発進行としてどう接続するかだけを扱う。

---

## 2. 基本ワークフロー

```text
1. cc-iasd init
2. user/ に product intent と constraints を記述する
3. product/ideal/ に ideal 正本を作成または更新する
4. ops/scopes/features/ で feature scope を整理する
5. ops/scopes/roadmaps/ で roadmap を定義する
6. product/specs/ で requirements / plan / tasks を作る
7. cc-iasd milestone add <id> で milestone scope を定義する
8. cc-iasd run cycle <id>
9. Worker runtime が src/ を編集する
10. Reviewer runtime または人間が ops/evidence/reviews/ に review を記録する
11. 必要に応じて cc-iasd escalate <scope-ref>
12. 人間判断後に再開する
13. cc-iasd report <scope-ref>
14. 必要な一時 context は cc-iasd view ... で生成する
15. 完了した cycle / evidence / scope artifact を cc-iasd ops archive で archived/ へ退避する
16. 正本でなくなった product artifact を cc-iasd product outdate で outdated/ へ退避する
```

---

## 3. 成立条件

```text
成立条件:
- project-context の構造が安定している
- 成果物 project が src/ に分離されている
- product 正本と ops transaction が分離されている
- ideal / spec の正本が product/ にある
- features / roadmap / milestone が scope artifact として整理されている
- cycle が自走実行単位として定義されている
- logs / reviews / reports が evidence layer にある
- spec / plan / tasks の正本が二重化していない
- Escalation Packet が人間判断に足る情報を持つ
- Completion Report が作業結果と残リスクを示す
- artifact 間参照から作業経緯を追える
```

---

## 4. 人間判断に残す事項

次の判断は、AI runtime が自動決定しない。

```text
人間判断:
- ideal の目的変更
- roadmap 変更
- milestone 目的変更
- spec の大幅変更
- 技術スタック変更
- 外部サービス導入
- 費用が発生する判断
- セキュリティ境界に関わる判断
- 成果物 project の repository 方針
```

---

## 5. 実装姿勢

cc-iasd は、重い runtime 統合よりも、文書構造と運用規律を優先する。

```text
優先:
- Markdown templates
- deterministic directory structure
- simple CLI
- explicit root path
- product / ops layer separation
- archive / outdated rule
- report generation
```
