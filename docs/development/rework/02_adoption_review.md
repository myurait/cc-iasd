# rework 02. 採用検討メモ（いいとこどりレビュー）

作成日: 2026-07-03  
状態: 推奨判断レビュー待ち v0.1

---

## 1. この文書の目的

`01_prior_art_survey.md` の調査結果から、cc-iasd に取り込む価値のある機構を抽出し、項目ごとに 採用 / 保留 / 不採用 の推奨と理由、反映先を記載する。

判断の原則は次である。

```text
判断原則:
- cc-iasd の非目標（01_requirements.md 5 章）に反するものは採用しない
- 正本の一元化（07_framework_integration.md）を崩すものは採用しない
- src isolation を破るものは採用しない
- 既存概念で充足しているものは重複導入しない
- 初期実装の範囲を過剰に広げるものは 10_todo.md 行きにする
```

各項目の記載形式は次である。

```text
- 出典: 参照元フレームワークと機構名
- 内容: 何であるか
- 適用案: cc-iasd のどの概念にどう取り込むか
- 反映先: 反映対象のドキュメント / テンプレート / ロール定義
- 推奨: 採用 / 保留 / 不採用
- 確定: （人間レビュー後に記入）
```

---

## 2. 採用推奨

### A1. Default-FAIL 契約（証拠読取の強制）

- 出典: Anthropic long-running harness 参照実装（cwc-long-running-agents）
- 内容: 検証結果を pass に更新する前に、証拠（テスト出力・ログ・スクリーンショット）を実際に読むことを強制する。読んでいなければ完了宣言できない。
- 適用案: run の local verification と Completion Report に「検証結果の記載は、参照する evidence artifact の存在と読取を前提とする」規約を追加する。Worker / Reviewer のロール定義に、証拠なしの完了宣言・レビュー通過を禁止する条項を加える。cc-iasd は hook 機構を持たないため、まず規約と template の必須欄（evidence 参照欄）で表現し、CLI 検査（doctor / report 時の参照存在チェック）を将来項目にする。
- 反映先: 05_autonomy_protocol.md、06_artifact_and_evidence_model.md、roles/worker.md、roles/design-reviewer.md、templates/completion_report_template.md、10_todo.md（CLI 検査）
- 推奨: 採用
- 理由: evidence layer の「参照でつながる」設計を、「参照が実際に読まれ判断の根拠になった」まで強める。cc-iasd の中核価値（事後トレーサビリティ）を直接補強し、既存設計と衝突しない。
- 確定: Go

### A2. 停止条件語彙の拡充（無進捗検出・予算枯渇・キルスイッチ）

- 出典: Anthropic long-running harness（変化なしサイクル / トークン・時間予算 / AGENT_STOP / STEER.md）、GSD（スコープ過大時の再計画）
- 内容: 自走の停止条件として、成果物に変化がないサイクルの検出、トークン・時間予算の枯渇、人間が置くキルスイッチファイル、走行中の人間ステアリングを定義する。
- 適用案: campaign / run の停止条件語彙に「no-progress cycle」「budget exhaustion」「human stop file」を標準項目として追加する。campaign plan template と run plan template の停止条件欄に選択肢として明記する。
- 反映先: 05_autonomy_protocol.md、templates/campaign_plan_template.md、templates/run_state_template.md
- 推奨: 採用
- 理由: 現行の停止条件は「人間判断が必要な領域に触れたら止まる」中心で、「進んでいないのに走り続ける」事故への防御が薄い。長時間自走の実運用で最初に必要になる語彙である。
- 確定: Go

### A3. 却下回数ベースの remediation 階梯

- 出典: cc-sdd（auto-debug: reviewer が 2 回却下したら根本原因調査モードへ切り替え）
- 内容: Worker の修正と Reviewer の却下が規定回数を超えたら、同じ修正の反復をやめ、根本原因調査（または escalation）に切り替える。
- 適用案: Worker / Reviewer 間の bounded remediation に反復上限を設ける。上限到達時は「根本原因調査 task を起こす」か「open item + escalation に切り替える」の分岐を Execution Manager の判断項目として定義する。
- 反映先: 12_role_design.md、roles/worker.md、roles/execution-manager.md、05_autonomy_protocol.md
- 推奨: 採用
- 理由: 修正ループの無限反復は自走の典型的な失敗モードであり、A2 の no-progress 検出の run 内版として整合する。回数という機械的な基準で判定できるため AI に委ねてよい判断に収まる。
- 確定: Go

### A4. リスク段階による escalation trigger の分類

- 出典: Factory.ai（Autonomy Level: 安全な編集 / 可逆的変更 / 危険操作の段階制）、Cursor Auto-review（帰結ベースの裁定）
- 内容: アクションや変更を「帰結の可逆性・リスク」で分類し、低リスクは自動、境界越えのみ減速・承認要求とする。
- 適用案: escalation trigger を「不可逆性」「影響範囲（impact map 外か）」「人間専権領域（infrastructure / cost / security / product value）該当」の 3 軸で分類する語彙を導入する。run handoff に「この run で自動続行してよい変更の性質」を明示する欄を設ける。
- 反映先: 05_autonomy_protocol.md、templates/run_handoff_template.md
- 推奨: 採用
- 理由: 現行設計は人間専権領域の列挙が中心で、「専権領域ではないが不可逆・広範囲」という中間帯の扱いが不明確である。成熟した商用実装が共通して採る分類法であり、語彙として輸入するだけで既存の escalation 設計を精緻化できる。
- 確定: Go

### A5. 決定単位の証拠十分性という evidence 品質観点（DEMM）

- 出典: Decision Evidence Maturity Model（arXiv:2605.04093）
- 内容: 「エビデンスデータが存在すること」と「その決定を監査できること」は別である（container fallacy）。証拠は決定単位で十分性を評価する。
- 適用案: evidence の品質観点として「各判断（軽微判断・review 判定・escalation 判断）に対し、根拠となる evidence への参照が決定単位で揃っているか」を Design Reviewer / Devil's Advocate のチェック観点に追加する。ログの量ではなく判断の追跡可能性で evidence を評価する原則を 06 に明記する。
- 反映先: 06_artifact_and_evidence_model.md、roles/devils-advocate.md、templates/review_template.md
- 推奨: 採用
- 理由: cc-iasd の evidence bridge 思想（複製ではなく参照）の理論的裏付けになり、Campaign Completion Review の「証跡の十分性」確認に具体的な判定基準を与える。
- 確定: Go

### A6. context 注入型ハンドオフの必須欄整備

- 出典: BMAD（story ファイル: PRD・アーキテクチャの関連コンテキストを注入して Dev に渡す）、CCPM（構造化タスクファイル: 明示的技術判断 + 受け入れ基準 + 依存宣言）
- 内容: 実装者に渡すハンドオフ文書へ、上流成果物から関連コンテキストを選別・注入し、受け入れ基準と技術判断を明示する。
- 適用案: Execution Entry Packet と run handoff の template に「上流からの注入コンテキスト（該当 spec 節・feature 優先度・関連 decision）」「受け入れ基準」「確定済み技術判断」「未確定事項（推測禁止対象）」の必須欄を定義する。外部配置（src isolation）ゆえに runtime がコンテキストを自然に読めない弱点への直接の対策と位置づける。
- 反映先: templates/run_handoff_template.md、08_commands_and_workflows.md、roles/planning-lead.md、roles/execution-manager.md
- 推奨: 採用
- 理由: 調査で確認した「repo 内配置の実利（エージェントが自然に読める）を捨てる代償」に対する cc-iasd の回答がここになる。先行 2 例が実運用で有効性を示している形式であり、Backtrack Request（未確定事項の明示）とも接続する。
- 確定: Go

### A7. トレーサビリティ原則の明文化

- 出典: CCPM（すべてのコード行は spec に遡れなければならない）
- 内容: 実装変更が必ず上流成果物（spec / task）へ遡れることを原則として宣言する。
- 適用案: 06 の evidence bridge に「run の変更は task を経由して spec へ、campaign を経由して feature / ideal へ遡れる」ことを検査可能な原則として明記し、Completion Report に「対応 task / spec への参照」を必須欄化する。
- 反映先: 06_artifact_and_evidence_model.md、templates/completion_report_template.md
- 推奨: 採用
- 理由: 既存設計が暗黙に前提している性質を、検査可能な一文にするだけで済む。Devil's Advocate の「impact map 外の変更」検出の判定根拠にもなる。
- 確定: Go

---

## 3. 保留

### B1. spec 内 [NEEDS CLARIFICATION] マーカー

- 出典: GitHub Spec Kit
- 内容: spec テンプレートが曖昧箇所へのマーカー記載を強制し、clarify ステップが構造化質問として人間に返す。
- 適用案: spec template に未確定マーカーを導入し、マーカーが残る spec は downstream に進めない規約とする。
- 反映先: templates（spec 系）、02_conceptual_design.md 3 章
- 推奨: 保留
- 理由: Backtrack Request（差し戻し）と役割が重なる。マーカーは「作成時に自分で埋め込む事前明確化」、Backtrack Request は「下流が検知して返す事後差し戻し」であり相補的だが、両方を同時導入すると TBD / unresolved の既存規約と 3 重になる。既存の TBD 扱いとの統合整理を先に行うべきである。
- 確定: clarify ステップ相当の概念はあってもいいが、管理方針は既存と統合するなどとして可能な限り少ない規約での管理とする。統合できないなら導入しない。

### B2. 進捗の外部可視化 adapter（GitHub Issues 等への書き戻し）

- 出典: CCPM（GitHub Issue コメントへの進捗書き戻し）
- 内容: run の進捗・完了報告を、人間が普段見るツール（GitHub Issues 等）へ書き戻して可視化する。
- 適用案: evidence 正本は ops/evidence/ のまま、外部ツールへの投影を adapter として提供する。
- 反映先: 09_future_vision.md（adapter 候補）、10_todo.md
- 推奨: 保留（将来構想に記載）
- 理由: 非常駐ユーザーへの到達性を高める価値はあるが、初期実装の範囲を超え、正本の二重化リスク管理（投影は正本でない）の設計が先に必要である。
- 確定: 実施しない。外部サービスへの依存度はプロジェクトの持つ制約に依存する。これはこのシステムの根幹からは分離すべき論点。

### B3. 機械可読 state の強化（Markdown 計画への批判対応）

- 出典: Beads（Markdown プランはエージェントに不向き、依存グラフ DB にせよ、というアンチテーゼ）
- 内容: タスク・依存・状態を Markdown ではなく機械可読ストアで管理し、ready-work 検出やアトミックな作業クレームを可能にする。
- 適用案: cc-iasd は Markdown 正本を維持しつつ、CLI が state / queue を機械的に検査・生成できる範囲を広げる（view の拡充、frontmatter の構造化）。全面的な DB 化はしない。
- 反映先: 10_todo.md（観察後に判断する事項）
- 推奨: 保留
- 理由: 批判は妥当な面がある（長大な Markdown は run が増えると劣化する）が、現段階では運用実績がなく、どこが劣化するかの観察が先である。反論と対応方針を 10_todo に記録しておく価値はある。
- 確定: 評価保留

### B4. Confidence スコア型の事前自己申告

- 出典: Devin 2.1（Confidence 緑黄赤。緑以外は計画承認待ちで停止）
- 内容: 実行前に AI が自信度を申告し、低ければ承認待ちに倒す。
- 適用案: run 開始前の handoff に「前提の確度」欄を設け、低確度なら escalation または Backtrack Request に倒す。
- 反映先: templates/run_handoff_template.md、05_autonomy_protocol.md
- 推奨: 保留
- 理由: 発想は Backtrack Request と同根であり、確度の自己申告は較正が難しく形骸化しやすい。A4（リスク段階分類）と A6（未確定事項の明示欄）で実質をカバーできる見込みが立ってから再検討する。
- 確定: 自己申告を評価しない。成果物や開発ログ、あるいは専用の中間成果物からConfidenceを推定する機能はあっていいかもしれないが、推論的振る舞いを推論的に判断することは意図しないループや早期終了の原因となりうるだろう。決定論的にこれに対処できる提案があれば再検討する。

---

## 4. 不採用

### C1. ランタイム型ロール実装

- 出典: MetaGPT / ChatDev / CrewAI / AG2 / claude-flow（Ruflo）
- 内容: ロールをコードとして実装し、フレームワークがエージェント実行を駆動する。
- 推奨: 不採用
- 理由: 非目標「実行 runtime の代替にならない」に反する。cc-iasd のロールは責務分離の文書定義であり、実行は runtime へ委譲する設計を維持する。
- 確定: 不採用で確定

### C2. repo 内配置への回帰

- 出典: Spec Kit / Kiro / cc-sdd / GSD / Agent OS ほか大半のツール
- 内容: 成果物・計画・状態をプロダクトリポジトリ内（.specify/ .kiro/ .planning/ 等）に置く。
- 推奨: 不採用
- 理由: src isolation は cc-iasd の絶対制約であり、最大の差別化点である。repo 内配置の実利（エージェントが自然に読める）には A6（context 注入型ハンドオフ）で応える。
- 確定: 不採用で確定

### C3. 外部サービスの SSoT 化

- 出典: CCPM（GitHub Issues を SSoT とする）
- 内容: 進行管理の正本を GitHub Issues 等の外部サービスに置く。
- 推奨: 不採用
- 理由: 正本の一元化（領域ごとに正本は一つ、ops/execution/ が実行正本）に反する。外部ツールは B2 の投影先に留める。
- 確定: 不採用で確定

### C4. spec-as-source

- 出典: Tessl
- 内容: spec をコードの上位ソースとし、コードを生成物として扱う。
- 推奨: 不採用
- 理由: cc-iasd の spec は project-context の一成果物であり、src/ 内のコードは runtime と人間が所有する。哲学が根本的に異なり、部分採用の余地もない。
- 確定: 不採用で確定

### C5. インフラ / カーネルレベル統制の内製

- 出典: Ona（ネットワーク制限、ファイルシステムロック、実行バイナリ制御）
- 内容: 技術的な実行環境統制で自律性を制限する。
- 推奨: 不採用
- 理由: cc-iasd はプロセス / 文書レイヤーの harness であり、環境統制は実行 runtime・実行環境側の責務である。低結合の非機能要件に従い、責務外として明記するに留める。
- 確定: 不採用で確定

### C6. 無応答時オートアプルーブ

- 出典: Jules（無応答時に計画を自動承認して進行、との第三者報告）
- 内容: 人間が応答しない場合、一定時間で自動的に承認扱いにして進める。
- 推奨: 不採用
- 理由: cc-iasd は非常駐ユーザーを前提に「Escalation Packet を残して待つ」方向に設計を倒しており、正反対の思想である。停止条件に触れた run は人間判断まで再開しない原則を維持する。
- 確定: 不採用で確定

### C7. 実行前批評エージェントの追加導入

- 出典: Jules（Planning Critic: 実行前に別エージェントが計画を批評）
- 内容: 最初の実行前に独立エージェントが計画を批評・改善する。
- 推奨: 不採用（既存で充足）
- 理由: Devil's Advocate の Design Launch Review が同じ責務を既に担っている。調査結果は既存設計の妥当性を裏付けるものとして扱い、新規機構は足さない。
- 確定: 不採用で確定

---

## 5. 対外ポジショニングへの反映（付随提案）

調査で確定した空白地帯（survey 8 章）は、README と 00_index.md の対外説明に使える。

```text
差別化として明示できる 3 点:
- src isolation を成果物スキーマ・ライフサイクル・CLI 込みで製品化していること
- Escalation Packet を一次概念として持つこと
- Backtrack Request（推測補完の禁止と構造化差し戻し）を持つこと
```

- 反映先: README.md、README.ja.md、00_index.md
- 推奨: 採用（表現は事実ベースに留め、比較優位の断定は避ける）
- 確定: Go（ただし個別反映は行わない。今回の rework 論点が全て整理された後に README を全体的に再構築し、その中で差別化 3 点を織り込む）

---

## 6. 反映順序の提案

採用確定後の反映は、依存の少ない順に次を提案する。

```text
反映順序案:
1. A2 / A3 / A4（05_autonomy_protocol.md と template への語彙追加。独立性が高い）
2. A1 / A5 / A7（06_artifact_and_evidence_model.md と review 系の規約強化。相互に関連）
3. A6（run handoff / Execution Entry Packet の template 改訂。1〜2 の語彙を前提にする）
4. 5 章の対外ポジショニング反映
5. B 群を 09_future_vision.md / 10_todo.md へ記載
```

（2026-07-03 追記）rework/04 の kernel 構想採用により、A 群は旧本編への個別反映ではなく kernel 設計の構造として実装される（04 の 11 章参照）。本順序案は 04 不採用時の代替として記録のみ残す。
