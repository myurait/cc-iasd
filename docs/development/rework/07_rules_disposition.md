# rework 07. rules 処分表

作成日: 2026-07-06  
状態: 1-D 作業記録 v1.0

---

## 1. この文書の位置づけ

この文書は、旧 `rules/` 配下の 5 ファイル（AI_RUNTIME_RULES.md / testing.md / development-process.md / coding-conventions.md / language-policy.md）が定めていた各規定を、kernel（rework/04 承認確定版）のどこへ振り替えるかを判定した処分表である。

kernel の project-context（03 のフラット構成）には `rules/` 領域が存在しない。旧 `rules/` が担っていた規律は次の 4 つの行き先のいずれかへ移る。行き先の記号は本文書全体で共通である。

```text
(a) role card:      roles/ の 3 role card（planner / worker / reviewer）の can / cannot へ吸収
(b) cc-iasd.yaml:   設定既定（checks allowlist / decision policy / gate 要否 / budgets /
                    runtime adapter / doc-lang / 登録 repo）へ吸収。P1 実装対象
(c) handoff 焼込:   handoff.md の合成元（spec / charter / decision / vision / worker role card /
                    exit protocol）へ焼き込む in-band 知識として吸収（06 の合成元）
(d) 廃止:            kernel のガード・状態機械・write-path allowlist・journal が構造で代替するため、
                    ルール文書としては不要
```

判定の基本原則は kernel の中核主張に従う。旧 rules の規律の大半は「Markdown に書かれた約束」であり、破る経路が構造上開いていた。kernel はこれらを「約束」ではなく「構造」で守る。したがって「構造が代替するもの」は (d) 廃止、「LLM の判断に残るもの」は (a) role card、「設定として持つもの」は (b) cc-iasd.yaml、「起動時に in-band で供給するもの」は (c) handoff 焼込へ振り分ける。

判定の材料は rework/04（承認確定版）と kernel 正本（02 / 03 / 06 / 08 / 12）である。rework/04 に存在しない設計判断は本文書に持ち込まず、最終報告の open question として親へ返す。

---

## 2. AI_RUNTIME_RULES.md の処分

旧 AI_RUNTIME_RULES.md は「無条件ルール」として破壊操作・prompt injection・test 安全・file 操作を定めていた。kernel ではこの多くが write-path allowlist と journal 一本化により構造で代替される。

```text
規定: 1. Destructive Operation Safety（rm -rf / git force / sudo 等の破壊操作の禁止・確認）
行き先: (d) 廃止（一部 (b) へ残余）
理由: 破壊操作の禁止は kernel の src/ 隔離と write-path allowlist で構造化される。CLI の全書き込みは
      単一 write-path モジュールを通り、管理領域 allowlist 外への書き込みは例外で拒否される（03 5 章）。
      src/ への書き込みは worker が実装 runtime で行い、CLI は読み取りと verify 実行のみ（03 6 章）。
      破壊コマンド一般（rm -rf / git force 等）を実行するのは実装 runtime であり、その統制は
      threat model 上「実行環境側（sandbox / 権限分離）に委ねる」と kernel が明記している（04 9.2 章）。
      ルール文書での禁止列挙は kernel の責務外。ただし verify の Checks は任意 shell であり信頼境界に
      なるため、危険コマンドの締め出しは cc-iasd.yaml の command allowlist（prefix match）が担う。
      Checks allowlist 外は spec ready ガードで decision 承認を要求する（06 4.2 章）。破壊操作統制の
      「設定として残る部分」はこの allowlist であり (b) へ振る。

規定: 2. Prompt Injection Defense（ファイル内容を data として扱う / 埋め込みコマンドを実行しない）
行き先: (d) 廃止
理由: kernel の worker は handoff を入力に src/ のみを編集する（12 3.2）。project-context の管理領域は
      write-path allowlist が保護し、reference/ は状態機械の入力にしない（03 3 章）。ルール文書での
      注意喚起は runtime の一般的な安全規律であり、kernel が新規に定義する規律ではない。実行環境側の
      責務（04 9.2 章の threat model と同じ切り分け）。

規定: 3. Test Execution Safety（前提確認 / skip test を incomplete 扱い / testing.md 参照）
行き先: (d) 廃止
理由: kernel では完了経路が「CLI 自身が Checks を子プロセス実行して生成した verification の成立」のみ
      （04 7.1 章 / 06 4 章）。worker が「テストは通った」と書いても verification 記録がなければ accept
      ガードが拒否する。test の前提確認・skip 判定を「読む義務」として課す必要が構造上なく、verify が
      exit code を期待値と機械照合する。skip test を incomplete 扱いにするルールは、Checks の期待
      exit code 照合が代替する。

規定: 4. File Operation Rule（読んでから書く / src/ は編集可 / product・ops・rules 等は AI 直接操作禁止 /
      tool-owned metadata の free-edit 禁止）
行き先: (d) 廃止
理由: これは kernel の tool-owned metadata と AI-authored content の分離原則（04 3.2 で「残すもの」）を、
      旧 6 分割構成の言葉で書いたものである。kernel では frontmatter は id と refs のみで status 欄を
      持たず、ライフサイクル状態は journal のみが正本（04 4 章要点 1・2）。「AI が状態を書き換える経路を
      物理的に消す」ため、free-edit 禁止をルールで課す必要が消える。管理領域への直接操作禁止は
      write-path allowlist（03 5 章）が物理境界として代替する。したがってルール文書としては不要。
```

補足: AI_RUNTIME_RULES.md 全体は「約束を Markdown に書く」旧設計の典型であり、kernel が「構造で守る」と宣言した対象そのものである。ファイル単位で廃止でよい。残余は Checks allowlist（(b)）のみ。

---

## 3. testing.md の処分

旧 testing.md は test の scope / coverage / design / naming / execution / isolation / regression / manual を定めていた。kernel では test は spec の Checks と verify の verification に構造化され、ルール文書としての多くが不要になる。

```text
規定: 1. Test Scope / 2. Test Coverage / 3. Test Design（unit / integration / actor 分析 / 環境差分検査）
行き先: (c) handoff 焼込（worker への in-band 供給）
理由: 何をどう test するかの意図は spec の Requirements / Acceptance / Surfaces / Checks に構造化され、
      handoff が spec のこれらセクションを機械合成して worker に渡す（06 5.1 章）。worker は handoff の
      scope 内で実装する（12 3.2）。test scope / design の指針は、ルール文書として常駐させるのではなく、
      当該 spec の Checks と Acceptance に落ちて handoff 経由で worker に届く。汎用の test 設計原則を
      worker に事前学習させる必要はなく、in-band 供給で足りる（04 10.1 章 agent-facing の思想）。

規定: 4. Test Naming（英語 / development language 併記 / should ... when ... 形式）
行き先: (b) cc-iasd.yaml（言語部分）+ (c) handoff 焼込（命名規約部分）
理由: test 名の言語は language 設定に従属する。kernel では doc-lang を cc-iasd.yaml が持ち、role card の
      出力言語は init の --doc-lang から生成時に確定する（04 14 章「決定済み」/ 03 3.6 章）。言語の正本は
      cc-iasd.yaml へ移る（(b)）。「should ... when ...」の命名形式そのものは spec の Checks / Acceptance
      に付随する実装規約であり、handoff 経由で worker へ供給する（(c)）。ルール文書として常駐させない。

規定: 5. Test Execution（新コードに test / 全 test pass を完了条件に）
行き先: (d) 廃止
理由: 「新コードに test」「全 test pass で完了」は kernel の verify + accept ガードが構造で強制する。
      accept は verification pass を必須とし（04 7.2 章）、verification は Checks の exit code 照合で成立
      する（06 4 章）。ルールで課す完了条件を状態機械が代替する。

規定: 6. Test Isolation（DI / skip の分類タグ agent-driven|manual|future）
行き先: (d) 廃止（一部 spike run へ）
理由: DI による隔離は実装 runtime の設計判断であり kernel の責務外。skip の分類タグのうち
      「事前に検証コマンドを宣言できない探索作業」は kernel の spike run が受け皿として最初から
      定義される（04 7.3 章 / 08 の spike run）。spike run は surfaces.write を空または notes 限定にし、
      Checks の最低要件を「調査成果の存在チェック」とする。旧 skip タグの機能は spike run 構造が代替する。

規定: 7. Regression Checks（fix 後の test gap 検査 / behavior change に test 必須 / actor 再分析）
行き先: (c) handoff 焼込
理由: non-regression の焦点は charter の Non-Regression Focus に構造化され、handoff の合成元に含まれる
      （06 5.1 章 / 04 8.1 章）。fix が誰の workflow を変えるかの actor 再分析は、当該 run の handoff に
      焼き込まれる non-regression focus として worker に届く。ルール文書としての常駐は不要。

規定: 8. Manual Tests（reference/ に保存 / manual 理由と自動化要件を記録）
行き先: (d) 廃止
理由: kernel の reference/ は非管理の自由領域で状態機械の入力にしない（03 3 章）。manual test シナリオを
      reference/ に置くこと自体は利用者の自由だが、それをルールとして課す層は存在しない。事前に検証
      コマンドを宣言できない探索は spike run が受ける（04 7.3 章）。manual test の管理をルール文書で
      規定する必要は消える。
```

補足: testing.md は「test をどう書くか」の汎用規約だが、kernel では test は spec の Checks / Acceptance へ構造化され、handoff で worker に届く（(c)）か、verify + accept ガードが完了条件を代替する（(d)）。言語だけが cc-iasd.yaml へ残る（(b)）。ファイルとしては廃止でよい。

---

## 4. development-process.md の処分

旧 development-process.md は 6 step の開発フロー / review 起動規則 / 2-tier review / 証跡規約 / decision escalation / documentation 規約 / file 分類 / backlog format / run knowledge / user communication を定めていた。この文書は旧 10 ロール体系・6 分割構成・prompted logging を前提にしており、kernel でほぼ全面的に構造へ移管される。

```text
規定: 1.1 Mandatory Steps（Read/Implement/Test/Log/Review/Commit の 6 step 強制）
行き先: (d) 廃止
理由: 進行順序の強制は kernel の状態機械の遷移ガードが決定論的に代替する（12 2.1 判定権限のコード移管）。
      Log step（prompted logging）は kernel が廃止し、遷移・検証・決裁を自動で journal に記録する
      （04 3.1「log event を含む prompted logging の廃止」）。順序を Markdown ルールで課す層が消える。

規定: 1.1.1 Artifact Quality Requirements（下流が進めるかで品質評価 / AI が判定してよい・してはいけない観点）
行き先: (a) role card
理由: 「下流が missing context を発明せず進めるか」の判定は reviewer の spec gate に吸収される
      （12 3.3 reviewer / 12 4 章 spec gate）。AI が判定してよい観点・してはならない観点（product value /
      UX / infra / cost / security 等）は、planner・reviewer の cannot と human の専権として role card に
      落ちる（12 3.1 / 3.3 / 3.4）。ルール文書ではなく role card の can / cannot が正本になる。

規定: 1.1.2 Backtrack Request（必須欄 10 項目）
行き先: (d) 廃止（kernel の backtrack request 必須欄へ再定式化済み）
理由: kernel は backtrack request を run block の終端 packet として再定式化し、必須欄を
      「blocked stage / 欠落上流 ref / 継続不能理由 / 推測継続時のリスク / 再開条件」に確定した
      （04 14 章「決定済み」/ 06 7.1 章）。旧 10 項目のうち廃止したロール中継系の欄（Recommended Return
      Role 等）を除いて再定式化済み。skeleton は report コマンドが生成する（08）。ルール文書としての
      旧定義は廃止し、kernel 側の必須欄定義（06）が正本。

規定: 1.1.3 Context Compression Recovery（圧縮後の context reload / 保存必須 context / reload behavior）
行き先: (d) 廃止
理由: kernel は 3 ロールとも fresh-context 起動を前提とする（04 14 章「決定済み」/ 12 4 章）。planner は
      narrow context packet、worker は handoff、reviewer は gate 入力を起動時に与えられ、過去 session の
      文脈を引き継がない。role card に履歴・手順を書かない規約の根拠であり（12 5 章）、「圧縮後に context を
      reload する」という手順自体が構造から消える。旧 reload behavior（cc-iasd doctor / view current 等の
      再実行）は廃止コマンドを前提にしており不要。

規定: 1.2 Review Launch Rules（Worker は review を起動しない / nested subagent 禁止 / Planning Lead が起動）
行き先: (d) 廃止
理由: Planning Lead / Execution Manager の entry point ロールは廃止され、review の起動順序・ゲート判定は
      状態機械が代替する（12 7 章）。orchestrator ロールが存在しないため nested subagent 問題が問題ごと
      消滅する（04 9.1 章 / 12 7 章）。「誰が review を起動するか」のルールは不要になる。

規定: 1.3 Trigger Steps A-E（新機能 / architecture 変更 / doc 構造変更 / full review / Planning Lead）
行き先: (d) 廃止
理由: trigger 条件による分岐（どの review をいつ起動するか）は kernel の gate（spec / launch / run /
      completion）と各遷移ガードが決定論的に代替する（12 4 章・6 章）。gate review の既定は
      「4 gate すべて必須 + charter 単位のオプトダウン」で確定済み（04 5.2 章）。Trigger E（Planning Lead）
      は廃止ロールが前提。条件分岐ルールを状態機械が構造で持つ。

規定: 1.4 Development Log Entry（ops/evidence/logs/ への記録 / ファイル名規約 / 必須フィールド / 20 件上限）
行き先: (d) 廃止
理由: prompted logging は kernel が廃止（04 3.1）。遷移・検証・決裁はすべて自動で journal に記録される。
      journal は append-only の 1-event-1-file で、ライフサイクル状態の唯一の正本（04 4 章）。手動 log entry
      の記録・ファイル名規約・20 件上限退避はすべて不要。証跡は journal と evidence（verifications /
      reviews）が構造で持つ。

規定: 2.1 Two-Tier Review Process（light / full review のロール・scope・trigger・順序）
行き先: (d) 廃止
理由: 2-tier の役割分担（Compliance Auditor / Code Quality Auditor / Devil's Advocate）は reviewer 1 ロール
      に統合され、gate 種別（spec / launch / run / completion）で区別される（12 3.3）。light / full の
      trigger と順序は状態機械のゲート判定が代替する（05 が成立条件の一次責任）。旧 2-tier 定義は廃止。

規定: 2.2 Review Checklist（role-specific ownership の項目分担）
行き先: (a) role card
理由: 各 review 項目（credentials 混入なし / doc 更新 / 言語 / format / naming / test pass / error handling /
      構造の正当化 / 説明可能性）のうち、LLM 判断が残るもの（構造の正当化・説明可能性・言語・doc 妥当性）は
      reviewer role card の「判断してよい観点」に吸収される（12 3.3）。credentials 混入・src 汚染など機械
      検査可能なものは doctor / verify（Surfaces 照合）が代替する（06 4.4 章）。checklist をルール文書に
      持つのではなく、reviewer の can へ落とす。

規定: 2.3 Review Process（建設的 feedback / critical by default / 承認は全 concern 解消時 / 応答計画）
行き先: (a) role card
理由: review の姿勢（critical by default、全 concern 解消まで承認しない）は reviewer role card の判断観点
      として残る LLM 判断である（12 3.3）。ただし「応答計画を記録してから fix」の手順部分は、gate ごとの
      review record と再 review をカーネルが強制するため（content-hash 鮮度で対象編集後は再 review 強制。
      06 6 章）、手順として書く必要はない。姿勢のみ (a) へ。

規定: 2.4 Review Evidence（1 thread 1 file / ファイル名 / 保存先 ops/evidence/reviews/ / 5 件上限 /
      記録項目 severity・Base Commit・Reviewer 等 / テーブル禁止）
行き先: (d) 廃止
理由: review 証跡は kernel の evidence/reviews/ に review record として構造化され、対象の content-hash
      刻印つきで保存される（03 4 章 / 06 4 章・6 章）。「1 thread 1 file」「5 件上限で archived/ へ移動」の
      退避規約は、ファイルを動かさず journal 上の retired 状態で表現する kernel 方針が代替する
      （04 3.1「archived/ outdated/ へのファイル移動による退避規約の廃止」）。Base Commit / Reviewer /
      severity は review record の schema（06）が持つ。ルール文書としての証跡規約は不要。

規定: 2.5 Review Finding Severity（Critical/High は commit 前必須 / Medium は fix or 記録 / debt 起票）
行き先: (a) role card + (d) 廃止
理由: blocking finding と non-blocking finding の区別は reviewer の「判断してよい観点」に残る（12 3.3）。
      「Critical/High は commit 前必須」の強制は run gate と accept ガードが構造で持つ（accept は blocking
      finding 0 が必要。04 7.2 章）。「debt を feature scope に type:debt で起票」は feature/roadmap 廃止に
      伴い gap 台帳（route 付き）へ統合される（04 3.1 / 06 7.2 章）。severity 判断は (a)、強制と起票先は
      構造代替で (d)。

規定: 2.6 Post-Fix Re-Review（fix 後の再 review 必須 / follow-up entry / remaining risk の disposition）
行き先: (d) 廃止
理由: 対象が review 後に編集されたら再 review を強制するのは content-hash 鮮度判定が構造で行う（06 6 章）。
      review record は対象の content-hash と一致しなければガードが通らない。「fix 後に再 review」を
      ルールで課す層が消える。remaining risk の disposition（accepted / deferred / 要 decision / 未解決）は
      gap 台帳の終端条件（closed / routed / deferred）へ統合される（04 14 章「決定済み」gap 終端条件）。

規定: 3. Decision Escalation Rules（長期選択は user 決裁 / full・lightweight consultation / 自走条件）
行き先: (a) role card + (d) 廃止
理由: 人間専権（infra / cost / security / product value / canonical 構造変更）の判断は charter の Risk Tiers
      に事前宣言され、該当時は decision を経ずに進めない（12 3.4 / 04 9.1 章）。escalate は escalation packet
      を生成して decision 待ちにする終端であり（04 7.2 章）、「いつ escalate するか」の判断は role card の
      cannot（planner/worker が human 専権を判断しない）に落ちる（(a)）。escalation packet の必須欄・decide
      機構は kernel 側（06 7.1 章 / 04 9.2 章）が持つため、consultation format のルール定義は (d) 廃止。

規定: 4. Documentation Rules（repo が正本 / user/decisions.md・run state / knowledge 昇格 / roadmap 配置 /
      ops archive / product outdate / view / historical documents 保存）
行き先: (d) 廃止
理由: この規定群は旧 6 分割構成（user/ product/ ops/ reference/）と廃止コマンド（ops archive / product
      outdate / view / log event / ideal add / feature add / roadmap add）を前提にしている。kernel は
      フラット構成に再編し（04 4 章 / 03 3 章）、退避は retire（ファイル移動なし・journal retired 状態）に
      一本化する（04 3.1 / 08）。decisions は decisions/ に decide のみが登録し（04 4 章）、run-local
      知見は notes.md（authored）へ、knowledge 昇格は role card 資産の移植として扱う（04 14 章 open
      question）。roadmap は廃止（04 3.1）。旧構成前提の documentation 規約は全面的に不要。

規定: 4. Artifact Creation Authority（AI は src/ のみ / product・ops・rules 等は AI 直接操作禁止 /
      tool-owned metadata / campaign mark-run / open-item add・resolve）
行き先: (d) 廃止（原則の一部は (a) role card へ）
理由: AI_RUNTIME_RULES.md 4 と同じく tool-owned / authored 分離原則を旧構成の言葉で書いたもの。kernel は
      write-path allowlist（03 5 章）で src/ 外への worker 書き込みを物理拒否し、状態は journal のみが正本
      （04 4 章）。campaign mark-run は廃止（run 終端が journal に記録。04 2.5）、open-item add/resolve は
      gap add/close/route へ置換（04 2.5）。「AI は src/ のみ編集」の原則は worker role card の cannot
      （src/ 外への書き込み禁止）として残る（(a)。12 3.2）。旧コマンド前提の規定は (d)。

規定: 5. File Classification（Master Rule Files / Project Progress Files / Project Configuration Files の 3 分類）
行き先: (d) 廃止
理由: 旧 6 分割構成のファイル分類そのものであり、kernel のフラット構成（vision / specs / campaigns / runs /
      decisions / gaps / evidence / cc-iasd.yaml が同一階層。03 3 章）で置換される。rules/ 領域自体が
      存在しないため「Master Rule Files」分類が成立しない。言語規則（Master は英語 / Progress は doc-lang）は
      cc-iasd.yaml の doc-lang と role card 出力言語に集約される（本表 6 章参照）。

規定: 6. Backlog Format（feature / debt の tag 統合 / 必須フィールド / Experience Tie / Impact Scope）
行き先: (d) 廃止
理由: feature / roadmap の独立 artifact は廃止され（04 3.1）、中期計画在庫は gap 台帳（route=vision,
      kind=candidate）と status --plan 射影に吸収される（04 5.1 章 / 06 7.2 章）。feature backlog という
      artifact 概念が消えるため、その format 規約は不要。debt は gap（route 付き）へ統合。coverage 追跡は
      vision の Capabilities（構造化チェックリスト）+ covers 射影が代替する（04 2.1 補強 2）。

規定: 7. Run Knowledge Management（worker が knowledge.md へ追記 / Compliance Auditor が昇格提案 /
      承認で master rule へ移動 / worker の必読に global knowledge を含めない）
行き先: (d) 廃止（残余は (c) / open question）
理由: run の 5 ファイル構成（plan/handoff/state/open-items/knowledge）は廃止され、knowledge.md は
      notes.md（authored）へ統合される（04 3.1 / 2.1）。Compliance Auditor は reviewer に統合（12 3.3）。
      「worker の必読に global knowledge を含めず、context は handoff / 昇格で届く」という原則は、kernel の
      in-band 供給思想（handoff 焼込。(c)）と一致する（04 10.1 章 agent-facing）。ただし旧 roles/ の prompt
      資産（narrow context packet 等）を 3 cards へどこまで移植するかは rework/04 14 章の open question で
      未確定であり、knowledge 昇格の具体機構はそこに従属する。

規定: 8. Testing Rules（testing.md が canonical と宣言）
行き先: (d) 廃止
理由: testing.md 自体が廃止対象（本表 3 章）。参照宣言も不要。test は spec の Checks / Acceptance と verify
      に構造化される。

規定: 9. User Communication Principles（Runtime-Origin / message structure / blocker 報告 / completion 報告 /
      autonomous decision 事後報告）
行き先: (a) role card + (c) handoff 焼込
理由: 「結果を runtime origin に返す」「blocker 報告の構造（何が起きた/影響/試行/要判断）」は、kernel では
      終端 packet（escalation packet / backtrack request / report）の必須欄として構造化される（06 7.1 章）。
      packet の skeleton は report コマンドが生成する（08）。人間向けメッセージの構造原則（user-visible
      meaning を先に / 1 message 1 topic / 進捗と決裁を混ぜない）は、planner・worker・reviewer が human /
      runtime へ返すときの判断観点として role card に残せる部分（(a)）と、exit protocol として handoff に
      焼き込む部分（(c)）に分かれる。exit protocol（完了宣言の手段はない / verify を要求せよ / 終端は
      accept・block・escalate のみ）は handoff の合成元に含まれる（04 8.1 章）。
```

補足: development-process.md は旧 10 ロール体系・6 分割構成・prompted logging・廃止コマンドを前提とする文書であり、kernel が「約束を構造へ」移管した対象の中心である。大半が (d) 廃止、LLM 判断が残る品質評価・review 姿勢・severity 区別・communication 原則が (a) role card、非同期報告の構造が (c) handoff / packet 側へ移る。

---

## 5. coding-conventions.md の処分

旧 coding-conventions.md は operating stance / language policy 参照 / quality principles / naming / file 構成 / import order / error handling / comments / commit / branch / TS 規約 / batch protocol / critical thinking 等を定めていた。これらは実装 runtime（worker）が src/ を書く際の規約であり、kernel は実装ループを runtime に委譲するため、大半が (c) handoff 焼込か runtime 側の責務になる。

```text
規定: 1. Operating Stance / 3. Quality Principles / 4. Naming Conventions / 5. File Organization /
      6. Import Order / 7. Error Handling / 8. Code Comments / 9. Function Documentation /
      12. TypeScript/JavaScript / 13. Transparency / 14. Security Practices / 15. Performance /
      16. Deprecation / 17. Semantic Versioning / 19. Critical Thinking / 20. File Operation Rule
行き先: (c) handoff 焼込
理由: これらは src/ の実装品質規約であり、kernel は実装ループを実行 runtime に委譲する（04 3.2「残すもの」
      = 実装ループの実行 runtime への委譲）。worker は handoff を入力に src/ を実装する（12 3.2）。
      コーディング規約は project 固有の実装指針として、当該 spec / worker role card 経由で handoff に
      焼き込まれ、in-band で worker に供給される（04 8.1 章の合成元 = worker role card を含む）。kernel が
      汎用のコーディング規約を rules/ に常駐させる層は存在しない。品質は spec の Checks（lint 等の exit code
      照合。06 4.2 章）と reviewer の run gate（12 3.3）が検証する。20. File Operation Rule（読んでから書く）は
      worker の実装作法であり同様に (c)。

規定: 2. Language Policy（language-policy.md 参照 / code-internal は英語固定 / commit format / 例外処理）
行き先: (b) cc-iasd.yaml（言語設定）+ (c) handoff 焼込（code-internal 英語固定）
理由: language-policy.md 自体の処分は本表 6 章。development language / documentation language の設定値は
      cc-iasd.yaml へ集約される（doc-lang は cc-iasd.yaml が持つ。03 3.6 章 / 04 14 章）（(b)）。
      code-internal を英語固定にする規約は実装作法として handoff に焼き込まれる（(c)）。

規定: 10. Commit Policy（single-line / <type>: <summary> / doc-lang で summary / body なし / 72 字 / type 集合）
行き先: (c) handoff 焼込 + (b) cc-iasd.yaml（言語部分）
理由: commit の作法（single-line / type prefix / 72 字上限）は worker が src/ に commit する際の実装作法で
      あり handoff に焼き込まれる（(c)）。summary の言語は doc-lang に従属し cc-iasd.yaml が正本（(b)）。
      kernel の journal は project-context 側の改竄検出を git に委譲するが（04 4 章要点 3）、src/ 側の commit
      作法は runtime の責務。ルール文書としての常駐は不要。

規定: 11. Branch Strategy（main / feature/ / fix/ ブランチ / merge 後削除）
行き先: (c) handoff 焼込
理由: ブランチ戦略は src/ 側の runtime 作法。kernel は run open で対象 repo ごとに base commit を journal に
      記録し（03 7 章）、adapter が run ごとの git worktree 隔離を提供できる（04 7.4 章）が、ブランチ命名
      規約そのものは実装 runtime の責務であり handoff 経由で供給される。

規定: 18. Batch Processing Protocol（30+ item の batch 分割 / batch 1 QC gate / 再試行手順）
行き先: (c) handoff 焼込 + (d) 廃止
理由: 大量 item 処理の batch protocol は worker の実装作法として handoff に焼き込める（(c)）。ただし kernel の
      停止監視は journal から機械判定する（no-progress / budget / STOP。04 7.2 章）。batch の暴走抑止は
      budget ガードと no-progress 検出が構造で持つため、QC gate をルールで課す部分は (d) で代替される。
```

補足: coding-conventions.md はほぼ全体が「src/ をどう書くか」の実装規約であり、kernel が runtime に委譲した領域である。したがって大半が (c) handoff 焼込（worker role card 経由の in-band 供給）。言語設定のみ cc-iasd.yaml へ（(b)）。品質検証は Checks（lint 等）と reviewer が構造で担う。

---

## 6. language-policy.md の処分

旧 language-policy.md は言語ドメイン（development / documentation / code-internal / product）の定義と、ファイル分類ごとの言語規則、writing rules、例外処理を定めていた。kernel では言語設定の正本が cc-iasd.yaml へ移り、role card の出力言語は生成時に確定する。

```text
規定: Project Policy（project-policies.md が言語設定の canonical source と宣言 / code-internal は英語固定）
行き先: (b) cc-iasd.yaml
理由: 旧設計は project-policies.md（cc-iasd init 後は rules/project-policies.md）を言語設定の正本にして
      いた。kernel には rules/ 領域が存在せず、設定は cc-iasd.yaml が唯一の設定ファイルである（03 3.6 章）。
      doc-lang は cc-iasd.yaml が持ち、role card の出力言語は init の --doc-lang から生成時に確定する
      （04 14 章「決定済み」）。言語設定の canonical source は cc-iasd.yaml へ移る。P1 実装対象。

規定: Language Categories（Development / Documentation / Code-Internal / Product Language の 4 分類定義）
行き先: (b) cc-iasd.yaml（設定値）+ (d) 廃止（分類定義文書）
理由: 4 言語ドメインの設定値（development language / doc-lang / product language）は cc-iasd.yaml へ集約
      される（(b)）。code-internal = 英語固定は変わらない既定。分類の概念定義を独立ルール文書として持つ
      必要はなく、cc-iasd.yaml のスキーマ（doc-lang 等の設定項目）とその意味づけ（05 / 08）が代替する（(d)）。

規定: File Classification and Language Rules（Master Rule Files は英語 / Project Progress Files は doc-lang /
      Configuration Files / README / Template Documents の言語規則）
行き先: (d) 廃止（一部 (c) role card 生成へ）
理由: ファイル分類自体が旧 6 分割構成前提であり kernel のフラット構成で消える（本表 4 章 File
      Classification と同じ）。Master Rule Files（rules/ roles/ templates/）が英語という規則は、kernel では
      role card template が言語をプレースホルダ {{docLang}} で持ち、生成後の card に具体言語が明示される
      構造が代替する（04 14 章「決定済み」/ 12 5 章 出力言語明示）。README / Template の言語規則は
      出荷資産（roles/ template）の生成規約に吸収され、独立ルール文書としては不要。

規定: Writing Rules（doc-lang / user-facing / commit / code-internal / product の各 writing rule）
行き先: (b) cc-iasd.yaml（言語設定）+ (c) handoff 焼込（code-internal・commit の作法）
理由: どの出力をどの言語で書くかは cc-iasd.yaml の言語設定に従属する（(b)）。code-internal を英語で書く・
      commit summary を doc-lang で書く等の実装作法は worker への in-band 供給として handoff に焼き込まれる
      （(c)。coding-conventions.md 2・10 と同じ振り先）。user-facing communication の言語は role card の
      出力言語欄が確定する（04 14 章）。

規定: Exception Handling（一時例外の理由・scope 記録 / 暗黙運用の禁止 / 長期化時は ADR 反映）
行き先: (d) 廃止
理由: 言語例外を記録・追跡する仕組みは、kernel では decision（decide 経由）と gap 台帳が代替する。言語に
      関する人間判断が必要なら decision に記録され（decide のみが登録。04 4 章）、未確定なら gap として
      起票される（04 6 章）。ルール文書としての例外処理規約は不要。
```

補足: language-policy.md は言語設定の正本を project-policies.md（rules/ 配下）に置く旧設計前提の文書である。kernel は言語設定を cc-iasd.yaml へ集約し（(b) P1 実装対象）、role card の出力言語を生成時に {{docLang}} から確定する。ファイル分類ベースの言語規則は旧構成前提で (d) 廃止。code-internal・commit の言語作法は handoff 焼込（(c)）。

---

## 7. (b) cc-iasd.yaml 既定に吸収される規定（P1 実装対象の明示）

行き先が (b) cc-iasd.yaml の規定は、P1 実装（rework/05 4 章の P1 実装項目 / rework/04 14 章の「P1 実装時に確定する事項」）で cc-iasd.yaml のスキーマとして実装される対象である。以下に集約する。

```text
- AI_RUNTIME_RULES.md 1（破壊操作統制の残余）:
    Checks の command allowlist（prefix match）。allowlist 外の check は spec ready ガードで decision 承認を
    要求する。cc-iasd.yaml の checks allowlist 項目として実装（03 3.6 章 / 06 4.2 章）。

- testing.md 4（test 名の言語）/ coding-conventions.md 2・10（言語設定・commit summary 言語）/
  language-policy.md 全般（言語設定の canonical source）:
    doc-lang（および development / product language 設定）。role card 出力言語は init の --doc-lang から
    生成時に {{docLang}} を確定する。cc-iasd.yaml の doc-lang 項目として実装（03 3.6 章 / 04 14 章「決定済み」）。

補足（P1 実装で確定する隣接事項。rework/04 14 章 open question の範囲）:
    cc-iasd.yaml は runtime adapter / budgets / checks allowlist / decision policy / gate 要否 / 登録 repo /
    doc-lang を持つ（03 3.6 章）。上記の allowlist と doc-lang はその一部であり、repo 登録スキーマ・数値既定
    （no-progress の N / budget / session stale 閾値）等は P1 実装時に確定する（04 14 章）。本表は「旧 rules の
    どの規定が cc-iasd.yaml へ行くか」までを示し、スキーマ詳細は P1 実装に委ねる。
```

---

## 8. 行き先の要約

```text
AI_RUNTIME_RULES.md    -> ほぼ全体 (d) 廃止。残余は Checks allowlist の (b)
testing.md             -> (c) handoff 焼込（scope/design/regression）+ (d) 廃止（execution/isolation/manual）
                          + (b) 言語部分。isolation の skip は spike run 構造が代替
development-process.md  -> 大半 (d) 廃止（順序強制・logging・review 起動・証跡規約・file 分類・backlog）。
                          品質評価・review 姿勢・severity 区別・communication 原則は (a) role card。
                          非同期報告構造は (c) / packet 側
coding-conventions.md   -> ほぼ全体 (c) handoff 焼込（実装作法）。言語設定のみ (b)。batch QC は一部 (d)
language-policy.md      -> (b) cc-iasd.yaml（言語設定の正本）+ (d) 廃止（分類定義・例外処理）+
                          (c)（code-internal・commit 作法）
```

kernel では rules/ 領域が存在しないため、5 ファイルはいずれもファイル単位で削除対象である。旧 rules が担っていた規律は、構造（(d) ガード・write-path allowlist・journal・状態機械）、設定（(b) cc-iasd.yaml）、in-band 供給（(c) handoff 焼込）、LLM 判断（(a) role card）のいずれかへ移り、Markdown ルール文書としての常駐は解消される。
