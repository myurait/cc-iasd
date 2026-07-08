# 05. 自律プロトコル

作成日: 2026-07-05  
状態: kernel 正本 v1.0（Phase 1 レビュー待ち）

---

## 1. この文書の位置づけ

この文書は、cc-iasd kernel の執行プロトコルの一次責任文書である。ノードごとの状態列、遷移ガード、gap のライフサイクル、停止条件と reject 階梯、risk tier、gate review 既定、人間の介入モデル、decide の機構、並列 run の排他規則、review 鮮度の dirty 検出、session lifecycle を規定する。

kernel は、3 不変条件を LLM の遵守に依存せず状態機械のガードで執行する（概念は 02）。本文書のガードはすべて決定論的判定であり、LLM の自己申告を一切評価しない。前進は常にガードを通過した遷移であり、停止は常に型付き packet として journal に残る。

event の JSON 形状・verification の生成手順の詳細は 06、コマンド構文は 08、ディレクトリ配置は 03 に置く。本文書はそれらを参照するにとどめ、再掲しない。

---

## 2. ノードと状態列

kernel が扱うノードは 6 種である（ノードの概念定義は 02）。各ノードのライフサイクル状態列は次である。

```text
vision:    draft -> approved -> retired
spec:      draft -> ready -> in-campaign -> done / retired
campaign:  draft -> active -> closed / halted
run:       created -> handed-off -> returned -> verified ->
           accepted / blocked（backtrack）/ escalated
decision:  open -> decided
gap:       open -> closed / routed / deferred
```

状態はすべて journal の event が正本であり、Markdown の frontmatter は状態欄を持たない（02 の journal 正本化）。ある状態から次の状態への前進は、対応する遷移ガードを通過した transitioned event の追記としてのみ成立する。decision の open -> decided は decide コマンドのみが起こせる（9 章）。gap の終端は 4 章で規定する。

---

## 3. 遷移ガード表

主要遷移とガードの対応は次である。ガードはすべて決定論的であり、判定材料はファイル存在・必須セクションの非空パース・子プロセスの exit code・hash 一致・journal イベントのカウントに限られる。LLM の完了報告文・自己申告・confidence 値は一切ガードの入力にしない。

```text
遷移                ガード（すべてコード判定）
vision approve      必須セクション非空 / 対応する decision 記録あり（人間承認）
spec ready          必須セクション非空 / blocking gap = 0 / 上流 vision = approved /
                    gate=spec の review record が現在の content-hash と一致 /
                    Checks が allowlist 適合または decision 承認済み
campaign launch     charter 構造化欄完備 / coverage の全 spec = ready /
                    depends_on の全 campaign = closed /
                    gate=launch の review record が hash 一致 / blocking gap = 0
run open            campaign = active / 対象 task 未完 / handoff 機械合成成功
                    （合成失敗 = 欠落セクション列挙 + backtrack 誘導）/
                    stop-file 不在 / budget 残 / no-progress 上限未達 /
                    write glob 交差ガード通過（7 章）/
                    coverage 順序制約の充足（charter の Coverage が対象 spec に
                    after: [spec-ref] を宣言する場合、列挙 spec の全 task が
                    accepted 済みであること）
run return          notes.md 存在 / base commit からの git diff snapshot 取得成功
run verify          spec の Checks を CLI が子プロセス実行し exit code を期待値と照合 /
                    生出力を evidence へ捕捉 /
                    diff を Surfaces と照合し forbid 該当は機械 FAIL、
                    write glob 外は off-surface として report に自動列挙
run accept          verification = pass / gate=run の review record が hash 一致 /
                    run の blocking gap = 0 / reject 回数 < 上限
reject 上限到達      accept 封鎖。escalate のみ許可
campaign close      全 run = accepted / 全 task チェック済 / gate=completion の
                    review record あり / gap 全て closed | routed | deferred（要 decision）/
                    completion report 存在 / charter の Cross-Checks 全件が CLI 実行で
                    pass（記法は spec の Checks と同一。Default-FAIL。結果は guard_results に焼込）
escalated -> 再開    対応する decision 記録の存在
blocked -> 再開      上流 artifact の編集（hash 更新）+ 該当 gate の再 review
```

遷移 event には guard の判定結果（guard_results）が焼き込まれ、doctor が事後に再計算して一致を検証できる。guard_results の event schema は 06 に置く。

各ガードで参照する構造（Checks の CLI 実行と Surfaces 照合、handoff の機械合成、gate review、content-hash 鮮度）は本文書の後続章および 06 で規定する。verification の生成手順の詳細は 06、各遷移を起こすコマンドの構文は 08 に置く。

---

## 4. gap のライフサイクルと終端条件

gap は未解決事項の台帳エントリであり、needs-human-decision / needs-upstream-fix / needs-info / candidate の 4 種を単一台帳で管理する（属性の一覧は 02）。本章は gap の終端条件・blocking gap の効果・裸マーカーの禁止を規定する。

### 4.1 gap の終端条件

gap の終端は closed / routed / deferred の 3 状態であり、それぞれの成立条件は次である。

```text
closed:
  decision へのリンク、または対象 artifact の編集 + 再 review で成立する。
  対象 artifact の編集による close は、編集で content-hash が更新され、
  該当 gate の再 review record が新しい hash と一致することを要する

routed:
  blocking = false かつ route が none でない場合に、decision 不要で成立する。
  gap は route 先の計画在庫として台帳に残り続け、status --plan の射影に現れ続ける。
  blocking gap を routed にはできない。routed へ移す前に、decision または
  上流編集で blocking を先に解消する

deferred:
  decision へのリンクを必須とする。campaign close ガードの
  「gap 全て closed | routed | deferred（要 decision）」における deferred と整合する
```

routed は close ではない。route=vision の routed gap 一覧が、中期計画在庫（campaign 未満・vision 超過の粒度のアイデア）の受け皿になる（02 の順序と coverage の決定論化）。

### 4.2 blocking gap による下流遷移の全拒否

blocking = true の gap が open である間、その gap の対象 artifact を入力とする下流遷移はコードレベルで全拒否される。これが不変条件 3（推測補完の禁止）の執行の一部である。

```text
効果:
- blocking gap を持つ spec は spec ready を通過できない
- blocking gap を持つ artifact を coverage に含む campaign は campaign launch を
  通過できない
- blocking gap を持つ run は run accept を通過できない
- 上流に blocking gap があると handoff の機械合成が失敗し、run open が拒否される
  （欠落として列挙され backtrack が誘導される）
```

blocking gap の解消経路は、decision へのリンクによる close、または対象 artifact の編集と再 review による close のみである。

### 4.3 裸マーカーの禁止

authored 本文中の未確定箇所は、gap を参照する形でのみ記す。台帳に存在しない裸の未確定マーカー（gap 参照を伴わない TBD / UNRESOLVED 記述）は doctor が違反として検出する。未確定箇所は必ず先に gap を起票し、本文はその gap を参照する。gap 参照記法の具体形と doctor の検出仕様は 06 に置く。

---

## 5. 停止条件と reject 階梯

### 5.1 停止条件

run の進行は 3 種の停止条件で機械的に止まる。いずれも run open / run verify のガードから journal を機械判定する。

```text
no-progress:
  直近 N 個の run で diff / task 進捗がゼロの状態。journal の commit.observed と
  task チェック状態から判定する。上限に達すると run open が拒否される

budget:
  cc-iasd.yaml が宣言する予算の超過。超過すると run open が拒否される

STOP ファイル:
  人間が runs/<id>/STOP を置くキルスイッチ。guard がファイル存在を検出し、
  以降の遷移を拒否する。コマンドですらなく、人間が学習を要さない緊急停止手段である
```

no-progress の N・budget の値は cc-iasd.yaml で宣言する（配置は 03）。

### 5.2 reject 階梯（accept 封鎖 -> escalate のみ）

同一 check の連続失敗・reject が閾値（既定 2）に達すると、その run の accept はガードで封鎖され、以降は escalate のみが許可される。reject 回数は journal のカウントから機械判定する。

```text
階梯:
- reject 回数 < 上限:  run accept のガードは通常どおり評価される
- reject 回数 = 上限:  accept 封鎖。合法な出口は escalate のみ
```

これは、推測で埋めて完了を装う経路を反復で稼げないようにする決定論的な階梯である。閉塞した run は escalation packet を残して人間決裁へ戻る以外に前進できない。終端 3 択（accept / block / escalate）のコスト勾配の概念は 02、escalation packet の必須欄は 06 に置く。

---

## 6. risk tier と gate review 既定

### 6.1 risk tier

run の risk tier は 3 軸で分類し、charter が宣言する。

```text
3 軸:
- 可逆性:       可逆か（低リスク）／不可逆か（高リスク）
- surface:      surface 内で完結するか／surface を越えるか
- 公開契約:     公開契約（public API 等）に触れないか／触れるか

low tier:
  可逆・surface 内・公開契約に触れない、の 3 条件を満たす run
medium 以上:
  上記いずれかを外れる run
```

off-surface（run verify の diff が spec の write glob 外に及ぶこと）が検出された run は、charter の tier 宣言に関係なく medium 以上へ強制昇格する。tier は自己申告ではなく、charter の宣言と verify の機械検出から決定論的に確定する。

### 6.2 gate review 既定

gate review の主体は fresh-context の AI reviewer であり、人間の稟議ではない（reviewer の詳細は 12）。既定は堅く倒す。

```text
既定:
  spec / launch / run / completion の 4 gate すべてで review record を必須とする

charter 単位の risk-tier オプトダウン:
  charter は「run gate を risk-tier 連動にする」と宣言できる。
  low tier の run は verification のみで accept 可、medium 以上は reviewer 必須。
  宣言の妥当性は launch review が検査する。
  off-surface 検出時は tier に関係なく reviewer 必須へ強制昇格する
  （6.1 と連動する決定論的オプトダウン）

緩和下限:
  launch と completion は config でも外せない。
  checks の信頼境界検査（launch）と完走判定の総点検（completion）が
  消えるため、オプトダウンの対象外である

v0 非搭載:
  「特定 gate の review record に actor=human を要求する」宣言は v0 に搭載しない。
  人間関与点を decide と campaign close に絞る設計を維持し、必要性は運用観察後に再判断する
```

review record の有効性判定（hash 一致・鮮度）はカーネルが行う。gate ごとの review record を求めるガードは 3 章の表に含まれる。review の鮮度判定方式は 8 章で規定する。

---

## 7. 並列 run の排他規則

multi-repo な src/ と並列 run は v0 の前提要件である（02）。並列可否はすべて決定論ガードで判定し、task の二重取りは run open 時の claim event で機械的に排他する。

```text
並列可否の判定:
- 対象 repo が互いに素:      常に並列可
- 同一 repo を共有する場合:   Surfaces の write glob 交差が空なら並列可。
                            交差する run open は、先行する run が終端するまで拒否される

verify lock:
  同一 repo を共有する並列 run の verify は、repo 単位の lock で直列化する。
  テスト・ビルド実行の相互干渉を防ぐ

claim event:
  run open は対象 task に対する claim event を journal に追記して二重取りを排他する。
  同一 task を対象とする後続 run open は claim 済みとして拒否される
```

run の対象 repo 集合は Surfaces の glob（repo プレフィックス）から導出される。1 run = 1 repo に固定せず横断 run を許す。base commit の記録・diff snapshot・surface 照合を repo ごとに行う点、adapter による worktree 隔離は multi-repo 構成の詳細として 03 に置く。

worktree 隔離は上記の排他規則を置換せず上乗せする。claim / write glob 交差 / verify lock は worktree の有無に関わらず常に適用され、worktree は同一 repo を共有する並列 run に対して物理的な作業ツリー分離を追加で与える。

```text
worktree 隔離の上乗せ関係（既存の排他規則を置換しない）:
- claim / write-glob-cross:  run open 時に常に評価する。worktree の有無で変わらない
- verify lock:               repo 単位で verify を直列化する。worktree 有無で変わらない
- worktree 隔離（追加層）:    run open --worktree で対象 repo ごとに隔離ブランチ + worktree を張り、
                            worker の作業を隔離ツリー内に閉じる

merge conflict の機械検出:
  worktree 隔離 run は accept 時に隔離ブランチを base ブランチへ merge する。
  conflict は accept 前の verify 段で merge dry-run により検出し、conflict があれば
  verify の verdict.pass を false に倒す。pass=false の verification は accept ガードを
  自動封鎖するため、conflict した run は accept できない（09 4.3「conflict は verify 失敗
  として機械検出」の実装形）。dry-run は base ブランチ側 repo 本体で行い working tree を汚さない
```

---

## 8. review 鮮度の dirty 検出

review record は対象の content-hash を刻印し、鮮度を機械判定する。content-hash は frontmatter を除外し空白を正規化した本文に対して計算し、軽微な整形では stale 化しないようにする。

遷移ガードが review record を要求するとき（3 章の spec ready / campaign launch / run accept / campaign close）、カーネルは現在の対象 content-hash と review record 刻印の hash の一致を検査する。編集で hash が変わっていれば review record は stale とみなされ、次の遷移時に再 review を要求する。これが dirty 検出方式であり、Markdown の直接編集を常に安全にする（02 の journal 正本化）。

seal による凍結方式（編集のたびに再承認の連鎖が走る方式）は採らない。seal は人間承認の形骸化（承認連鎖の惰性化）を招くためである。編集されたら次の遷移時に再 review を要求する dirty 検出のほうが、承認の意味を保つ。content-hash の正規化仕様の詳細は 06 に置く。

---

## 9. decide の機構と人間の介入モデル

### 9.1 人間の介入モデル（4 類型）

人間の役割は「著者と決裁者」であり「操作者」ではない。run open / return / verify / accept / review record などの進行操作は agent が実行するものであり、人間がコマンド体系を学習しなければ回らない状態は設計バグとして扱う。介入は 4 類型である（概要は 02、本章が詳細定義の一次責任）。

```text
起点（稀）:
  vision の本文を執筆する。または planner セッションとの対話で書かせて直す。
  承認は decide 一発で行い、vision が draft から approved へ遷移する

呼ばれたとき（非同期決裁。非常駐人間の中核介入）:
  escalation packet / blocking gap（needs-human-decision）/ allowlist 外 checks の
  発生時、自走は packet を残して停止する。人間は都合のよいタイミングで packet
  （選択肢・推奨・各選択肢の影響・放置した場合の影響・再開条件）を読み、decide で答える。
  答えた瞬間に、対応する decision が記録され、該当 run / spec / campaign の
  再開条件（3 章の escalated -> 再開 / blocked -> 再開 / gap close）が満たされる

節目（campaign ごと）:
  campaign close。completion report と completion review を読んで受け入れる。
  PBI 単位の受け入れに相当する。campaign close は人間の専権であり、
  gate=completion の review record と completion report を前提に成立する（3 章）

随時（要求されない任意介入）:
  inbox で覗く / Markdown を直接編集する / STOP ファイルで緊急停止する /
  gap や adhoc run を起票する。Markdown の直接編集は dirty 検出（8 章）が
  次の遷移で再 review を強制するため、人間の直接編集は常に安全である
```

人間が覚える定常動線は 1 文に収束する。気になったら inbox、答えるは decide、止めるは STOP、直すは Markdown。inbox / decide / STOP の human-facing 上限の仕様は 08 に置く。

### 9.2 decide の機構

decide は decision の open -> decided を起こせる唯一の経路であり、journal に actor=human を刻印する。

```text
TTY 既定:
  decide は既定で TTY を必須とする。headless で走る agent は物理的に
  自己承認できない。actor=human の刻印は TTY 経由の応答によって成立する

decision ファイル取込の非同期経路:
  非同期・リモート決裁のために、人間が decisions/ に decision ファイルを配置し、
  それを取り込む経路を v0 から用意する（cc-iasd.yaml で有効化）。
  取込は adopt 経由であることを journal に記録し、doctor が一覧表示する。
  非常駐人間が都合のよいタイミングで decision を残せる escape hatch である

actor=human 刻印:
  TTY 応答・adopt 取込のいずれの経路でも、記録される decision event には
  actor=human が刻印される。agent が自らを human と偽って decide を記録する
  経路は可視コマンドに存在しない
```

threat model は明記する。この機構が防ぐのは善意のドリフト（agent が流れで自己承認してしまうこと）であり、擬似 TTY の確保や decision ファイルの偽造を行う敵対的 runtime には耐えない。敵対的 runtime を仮定する統制はカーネルの責務外であり、実行環境側（sandbox / 権限分離）に委ねる。decision ファイルの必須欄・event schema は 06、decide のコマンド構文と adopt の指定は 08 に置く。

---

## 10. session lifecycle

session は runtime を起動して worker が src/ を実装する期間であり、journal の event で開始・再開・停止を追跡する。

```text
開始:
  session start が実行 bundle を compile し、base commit と session metadata を
  journal に記録して runtime を起動する。runtime 指定がなければ手順のみを出力する

中断:
  特別な後始末を要求しない。status は「running だが journal に一定時間 event なし」を
  stale として決定論表示する。stale 判定は journal の最終 event 時刻から機械算定する

resume:
  session resume が resume brief（base commit からの git diff 概要 / 最終 verification
  結果 / 未終端 event）を再コンパイルして runtime を再起動する。圧縮要約やロール文書の
  リロード規約に依存せず、journal と git から機械的に再構成する

STOP:
  runs/<id>/STOP ファイル（人間が置く）を guard が検出し、以降の遷移を拒否する
  （5.1 と同一の停止条件）
```

start の base commit 記録は commit.observed event で行う。session start は起動時点の各対象 repo の HEAD を再観測し、observe した HEAD を commit.observed の data.repos に載せて追記する。state 導出は commit.observed を run.repos へ畳み込むため、以降の return / verify / diff snapshot は起動時点を新 base として基準にする（UNCOMMITTED な repo は観測をスキップする）。session start 自体は run.status を進めない（session.started は状態列を進めない event）。

resume brief は次の 3 要素を journal と git から機械再構成する（確定形）。

```text
resume brief の再コンパイル内容:
- git diff 概要:      各 repo の最新 base（commit.observed）からの変更ファイル一覧と件数
- 最終 verification:  最後の verify.recorded の pass と checks（id / exit / expect / pass）
- 未終端 event 要約:   note.appended / session.started / session.resumed / commit.observed の履歴
```

resume は resume brief を out/<run-id>/resume-brief.md に書き、bundle を再 compile して session.resumed を追記する。resume も run.status を進めない。

session の中断は明示的な操作を要さず、状態は常に journal から導出される。したがって中断・再開はプロセスの生死に依存せず、いつでも安全に行える。session 起動 bundle の compile 出力先（out/）と adapter の起動設定は 03、resume brief の生成に用いる event の schema は 06 に置く。
