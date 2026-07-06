# 08. コマンドとワークフロー

作成日: 2026-07-05  
状態: kernel 正本 v1.0（Phase 1 レビュー待ち）

---

## 1. この文書の目的

この文書は、cc-iasd kernel の CLI コマンド一覧と、それらを使った導入・実行のワークフローを定義する。各コマンドについて、目的・入力・出力・起こす状態遷移を簡潔に示す。

kernel の CLI は完全な実行基盤ではない。ライフサイクル状態は append-only journal が正本であり（詳細は 03 / 06）、コマンドは遷移ガードを通過した場合にのみ journal に event を追記する薄い層である。ガードの内部成立条件は 05 に置き、この文書は「どのコマンドがどの遷移を起こすか」までを扱う。

この文書が扱う範囲と扱わない範囲は次である。

```text
扱う:
- コマンド一覧（各コマンドの目的・入力・出力・起こす遷移）
- 対象者 3 分類と human-facing 上限
- guard 拒否メッセージ仕様（欠けた型付き入力 + 次の一手を人間可読 + --json で返す）
- 導入フロー（5 分導入 / 1 機能を作り切るフロー）
- adhoc run / spike run の位置づけ

扱わない:
- 遷移ガードの内部成立条件（-> 05）
- event schema のフィールド定義（-> 06）
- ロールの責務・authority（-> 12）
```

---

## 2. コマンド一覧

kernel の CLI は約 17 のコマンドと、引数なし起動（human inbox）から成る。旧設計の約 25〜30 コマンドを縮約したものである。

```text
cc-iasd                                        # 引数なし = human inbox。要対応事項（open decisions /
                                               # escalations / stale runs / close 待ち campaign / 未読 report）を
                                               # 一覧し、その場で対話的に decide / close できる人間の定常入口

cc-iasd init                                   # scaffold + journal + git init
cc-iasd doctor                                 # 構造 / 参照 / src 汚染 / guard 再計算 / 証拠十分性の検査
cc-iasd status [--plan | <ref>]                # 導出 view（--plan は route=vision の gap と
                                               # campaign 順序から中期計画ビューを射影）

cc-iasd new vision|spec|campaign <slug>        # scaffold 作成（AI は authored 節を執筆）
cc-iasd spec ready <id>
cc-iasd campaign launch <id> / close <id>

cc-iasd run open <campaign-id> --tasks <T..> | --adhoc "<goal>" --check "<cmd>" [--spike]
cc-iasd run handoff <run-id>                   # stdout 出力（Tier 0 正本経路）
cc-iasd session start <run-id> [--runtime claude-code|codex|none] / resume <run-id>
cc-iasd run return <run-id>                    # diff snapshot の実測記録
cc-iasd run verify <run-id>                    # Checks の CLI 実行 + surface 照合
cc-iasd run accept <run-id> / block <run-id> --missing <ref> / escalate <run-id>

cc-iasd review record <ref> --gate spec|launch|run|completion
cc-iasd gap add <ref> / close <id> / route <id> --to <ref>
cc-iasd decide <decision-id> [--adopt <file>]
cc-iasd report <ref>                           # 終端 packet / progress の skeleton 生成
cc-iasd retire <ref>                           # 退避（ファイル移動なし。journal 状態のみ）
cc-iasd role show planner|worker|reviewer
```

各コマンドの目的・入力・出力・起こす遷移は 3 章以降で節ごとに定義する。

---

## 3. コマンド定義

各コマンドについて、目的・入力・出力・起こす遷移を示す。ガードの内部条件は列挙せず、遷移が起きる／拒否される事実までを記す（成立条件は 05）。

### 3.1 cc-iasd（inbox）

```text
目的: 人間の定常入口。要対応事項を一覧し、その場で decide / campaign close を対話実行する
入力: 引数なし
出力: open decisions / escalations / stale runs / close 待ち campaign / 未読 report の一覧
遷移: それ自体は起こさない。選択した項目に対して decide / campaign close を対話的に呼び出す
```

### 3.2 cc-iasd init

```text
目的: project-context を初期化する
入力: プロジェクト名 / --repo <src の git URL>（任意）
出力: project-context ディレクトリ（scaffold + journal + git init 済み）
遷移: journal を新規作成する。ノードの状態遷移は起こさない
```

ディレクトリツリーの詳細は 03 を参照。

### 3.3 cc-iasd doctor

```text
目的: project-context の整合性を検査する
入力: なし
出力: 検査結果（構造 / 参照整合 / src 汚染 / guard 再計算一致 / 証拠十分性）
遷移: 起こさない（読み取り検査のみ）
```

doctor は adhoc run の比率を表示して spec / campaign への昇格を促す（8.1 節）。検査観点の詳細は 06 を参照。

### 3.4 cc-iasd status

```text
目的: journal から導出したライフサイクル view を出力する
入力: なし | --plan | <ref>
出力: 現在状態の導出 view。--plan は route=vision の gap と campaign 順序から中期計画ビューを射影する
遷移: 起こさない（導出出力のみ）
```

status は各ノードの可能遷移を提示し、agent への in-band 知識供給の経路になる（9 章）。

### 3.5 cc-iasd new vision|spec|campaign

```text
目的: vision / spec / campaign の scaffold を作成する
入力: 種別 + <slug>
出力: 対応する authored ファイル（AI が authored 節を執筆する）
遷移: created event を記録する。vision は draft、spec は draft、campaign は draft で始まる
```

### 3.6 cc-iasd spec ready

```text
目的: spec を draft から ready へ遷移させる
入力: <spec-id>
出力: 成功時は spec ready への遷移、拒否時は guard 拒否メッセージ
遷移: spec draft -> ready（ガード通過時）
```

### 3.7 cc-iasd campaign launch / close

```text
launch:
  目的: campaign を実行開始可能にする
  入力: <campaign-id>
  出力: 成功時は active への遷移、拒否時は guard 拒否メッセージ
  遷移: campaign draft -> active（ガード通過時）

close:
  目的: campaign を締める（人間専権。inbox から対話実行できる）
  入力: <campaign-id>
  出力: 成功時は closed への遷移、拒否時は guard 拒否メッセージ
  遷移: campaign active -> closed（ガード通過時）
```

### 3.8 cc-iasd run open

```text
目的: run を開始し、handoff を機械合成する
入力: <campaign-id> --tasks <T..>（campaign 由来）
      | --adhoc "<goal>" --check "<cmd>"（spec なし。8.1 節）
      | 上記に [--spike] を付す（探索作業。8.2 節）
出力: 成功時は run 生成 + handoff 合成、上流欠落時は欠落セクションを列挙して拒否
遷移: run created -> handed-off（handoff 機械合成に成功した場合）。
      合成失敗は run を開始せず backtrack request の生成を誘導する
```

handoff の合成元と合成失敗時の扱いは 06、上流欠落の判定は 05 を参照。

### 3.9 cc-iasd run handoff

```text
目的: 合成済み handoff を stdout に出力する（Tier 0 の正本配布経路）
入力: <run-id>
出力: handoff 本文（stdout）
遷移: 起こさない（出力のみ）
```

### 3.10 cc-iasd session start / resume

```text
start:
  目的: run 用の bundle を compile して実行 runtime を起動する
  入力: <run-id> [--runtime claude-code|codex|none]
  出力: 起動された runtime session（--runtime none なら手順のみ出力）
  遷移: session.started event を記録する。base commit を journal に記録する

resume:
  目的: 中断した session を再開する
  入力: <run-id>
  出力: resume brief を再コンパイルして再起動した session
  遷移: session.resumed event を記録する
```

session lifecycle と bundle 生成の詳細は 03 / 05 を参照。

### 3.11 cc-iasd run return

```text
目的: worker の実装完了後、変更を実測記録する
入力: <run-id>
出力: base commit からの git diff snapshot
遷移: run handed-off -> returned（ガード通過時）
```

### 3.12 cc-iasd run verify

```text
目的: spec の Checks を CLI 自身が実行し、Surfaces と照合する
入力: <run-id>
出力: verification（verdict JSON + 生出力 + diff）。off-surface 変更は report に自動列挙
遷移: run returned -> verified（Checks 実行と surface 照合の成立時）
```

Checks 実行と surface 照合の生成規則は 06 を参照。

### 3.13 cc-iasd run accept / block / escalate

run の終端は次の 3 択のみである。

```text
accept:
  目的: run を受け入れて完了させる（最も高価）
  入力: <run-id>
  出力: 成功時は accepted への遷移、拒否時は guard 拒否メッセージ
  遷移: run verified -> accepted（verification pass + review record + blocking gap 0 のとき）

block:
  目的: 上流不足を理由に差し戻す（最も安価）
  入力: <run-id> --missing <ref>
  出力: backtrack request
  遷移: run -> blocked（--missing 指定で成立）

escalate:
  目的: 人間判断が必要な事項を戻す
  入力: <run-id>
  出力: escalation packet
  遷移: run -> escalated（decision 待ちになる）
```

block が最も安価な合法出口になるコスト勾配の思想は 02、reject 階梯・停止条件は 05 を参照。escalation packet / backtrack request の必須欄は 06 を参照。

### 3.14 cc-iasd review record

```text
目的: gate 種別ごとの review record を記録する
入力: <ref> --gate spec|launch|run|completion
出力: review record（対象 content-hash を刻印）
遷移: review.recorded event を記録する。gate 判定は spec ready / campaign launch /
      run accept / campaign close のガード入力になる
```

reviewer の起動と責務は 12、review record の鮮度判定は 05 / 06 を参照。

### 3.15 cc-iasd gap add / close / route

```text
add:
  目的: 未解決事項を gap 台帳に登録する
  入力: <ref>（+ kind / blocking などの属性）
  出力: gap 台帳エントリ
  遷移: gap.opened event を記録する（open 状態）

close:
  目的: gap を解消する
  入力: <gap-id>
  出力: 成功時は closed への遷移、拒否時は guard 拒否メッセージ
  遷移: gap open -> closed（decision へのリンク、または対象編集 + 再 review のとき）

route:
  目的: gap を計画層へ戻す
  入力: <gap-id> --to <ref>
  出力: 成功時は routed への遷移
  遷移: gap open -> routed（blocking=false かつ route が none でないとき。decision 不要）
```

gap の各終端条件（closed / routed / deferred）の詳細は 05 を参照。

### 3.16 cc-iasd decide

```text
目的: 人間決裁を記録する（人間専権。inbox から対話実行できる）
入力: <decision-id> [--adopt <file>]
出力: decision 記録（journal に actor=human を刻印）
遷移: decision open -> decided。該当する escalation / blocking gap の再開条件を満たす
```

decide の機構（TTY 既定 / --adopt による非同期取込 / threat model）は 05 を参照。

### 3.17 cc-iasd report

```text
目的: 終端 packet または progress の skeleton を生成する
入力: <ref>
出力: report skeleton（AI が authored 節を執筆する）
遷移: それ自体は状態遷移を起こさない（run / campaign 終端の記録は各終端コマンドが行う）
```

report の必須欄は 06 を参照。

### 3.18 cc-iasd retire

```text
目的: 使わなくなった artifact を退避する
入力: <ref>
出力: retired 状態への遷移（ファイルは移動しない）
遷移: 対象ノードを retired にする。旧設計の archived/ outdated/ へのファイル移動は行わない
```

### 3.19 cc-iasd role show

```text
目的: role card を stdout に出力する
入力: planner|worker|reviewer
出力: 該当 role card（stdout）
遷移: 起こさない（出力のみ）
```

role card の内容と規約は 12 を参照。

---

## 4. 対象者 3 分類と human-facing 上限

コマンドは対象者で 3 分類する。human-facing の上限を設計原則として固定する。

```text
human-facing（この 3 つが上限。超える human 必須操作の追加は設計バグとして扱う）:
  cc-iasd（inbox。decide と campaign close はここから対話実行できる）/
  decide / STOP ファイル（コマンドですらない）
  + Markdown 編集と git（独自ナレッジではない既存スキル）

agent-facing（人間は学習不要。知識は事前学習ではなく in-band で供給される —
  handoff への焼き込み、guard 拒否メッセージの次の一手提示、status の可能遷移提示）:
  new / spec ready / campaign launch / run open / run handoff / session start / resume /
  run return / run verify / run accept / block / escalate / review record /
  gap add / close / route / report / retire / role show

setup（初回と点検のみ）:
  init / doctor
```

human-facing が上限であることの意味は、人間が「気になったら cc-iasd、答えるは decide、止めるは STOP、直すは Markdown」の定常動線だけを覚えれば運用が回る、ということである。agent-facing コマンドは人間が事前学習する対象ではなく、agent が実行するものであり、その知識は in-band（handoff への焼き込み・guard 拒否メッセージ・status の可能遷移提示）で供給される。人間が agent-facing のコマンド体系を学習しなければ回らない状態は設計バグとして扱う。人間の介入モデル 4 類型の思想は 02、詳細定義は 05 を参照。

---

## 5. guard 拒否メッセージ仕様

遷移ガードが不成立の場合、コマンドは遷移を起こさず拒否メッセージを返す。拒否メッセージは 2 つの要素を必ず含む。

```text
1. どの型付き入力が欠けているか（欠落セクション / open な blocking gap / 未取得の review record 等）
2. 次に打つべきコマンド（差し戻しへ誘導する一手）
```

拒否メッセージは人間可読と機械可読の両方で返す。`--json` を付すと機械可読形式で同じ内容を返す。

差し戻しが、唯一のサンクションされた次の一手として提示される。ガード不成立時に agent が取れる正規の行動は、欠けた入力を上流で満たすか、block で差し戻すことである。推測で埋めて先へ進む経路はコマンド surface に存在しない。この設計により、agent は事前にコマンドの全成立条件を学習していなくても、拒否メッセージが提示する次の一手をたどるだけで正しい動線に戻れる（in-band 知識供給。9 章）。

拒否メッセージが列挙する「欠けている型付き入力」の内部判定条件は 05、handoff 合成失敗時の欠落列挙は 06 を参照。

---

## 6. 導入フロー: 5 分で最初の run

フル chain（vision -> spec -> campaign -> run）を初日から要求しない。adhoc run を導入の入口にする。

```bash
npx cc-iasd@latest init myapp --repo git@github.com:me/app.git
cd myapp
npx cc-iasd run open --adhoc "ログイン失敗時に 500 が出るのを修正" --check "npm test"
npx cc-iasd session start r-... --runtime claude-code
```

adhoc run は spec を要求しない。人間が直書きした goal は推測補完に当たらないためである。spec を経由しなくても、guard / journal / verify / 終端 3 択はすべて有効であり、3 不変条件は初日から守られる。規模が増えたら spec / campaign へ昇格する。adhoc run の位置づけは 8.1 節に詳しい。

---

## 7. 導入フロー: 1 機能を作り切る

vision から campaign close までの一連の遷移を、実コマンド列で示す。

```bash
# 計画
cc-iasd new vision core && $EDITOR vision/v001-core.md
cc-iasd decide d001-approve-vision           # 人間承認 -> vision approved
cc-iasd new spec csv-export && $EDITOR specs/s001-csv-export/spec.md
#   文字コード未確定 -> cc-iasd gap add spec:s001 --kind needs-human-decision --blocking
#   spec 本文には [UNRESOLVED: g001] を記載
cc-iasd spec ready s001    # => 拒否: blocking gap g001 が open。decide を促す
cc-iasd decide d002-csv-encoding             # 「BOM 付き UTF-8」を決裁。g001 close
cc-iasd review record spec:s001 --gate spec  # reviewer session が record
cc-iasd spec ready s001                      # => ready

cc-iasd new campaign reporting && $EDITOR campaigns/c001-reporting/charter.md
cc-iasd review record campaign:c001 --gate launch
cc-iasd campaign launch c001

# 実行
cc-iasd run open c001 --tasks T001,T002      # handoff 機械合成。上流欠落なら開始不能
cc-iasd session start r-xxx --runtime claude-code
#   （runtime 内で worker が src/ を実装）
cc-iasd run return r-xxx                     # diff snapshot 実測
cc-iasd run verify r-xxx                     # Checks 実行 + surface 照合 -> verification pass
cc-iasd review record run:r-xxx --gate run
cc-iasd run accept r-xxx                     # 全ガード通過 -> accepted

# 締め
cc-iasd review record campaign:c001 --gate completion
cc-iasd report campaign:c001
cc-iasd campaign close c001
```

このフロー全体で、AI が状態を進めた箇所は一つもない。すべての前進はガードを通過した遷移であり、すべての停止は型付き packet（decision / backtrack / escalation）として journal に残る。上の `cc-iasd spec ready s001` が一度拒否されている箇所が、5 章の guard 拒否メッセージの実例である。欠けている型付き入力（open な blocking gap g001）と次に打つべきコマンド（decide）が提示され、差し戻しへ誘導される。

---

## 8. adhoc run と spike run の位置づけ

kernel は、フル chain を通さない 2 種類の軽量 run を最初から定義する。いずれも spec を経由しないが、guard / journal / verify / 終端 3 択は有効であり、3 不変条件は守られる。

### 8.1 adhoc run

adhoc run は、spec を要求せず人間直書きの goal で開始する run である（6 章の導入フローの入口）。

```text
- 入力: --adhoc "<goal>" --check "<cmd>"（spec を経由しない）
- 人間が直書きした goal は推測補完に当たらないため、spec 不在でも不変条件 3 に抵触しない
- guard / journal / verify / 終端 3 択はすべて有効
- 規模が増えたら spec / campaign へ昇格する
```

doctor が adhoc run の比率を表示して昇格を促す。adhoc に留め続けることを禁じるのではなく、可視化して判断材料を提供する。

### 8.2 spike run

spike run は、事前に検証コマンドを宣言できない調査・探索作業の受け皿である。逃げ道を用意しないと現場で弱い Checks が乱造され、検証構造自体が骨抜きになるため、最初から定義する。

```text
- 入力: run open に [--spike] を付す
- src/ を変更しない（surfaces.write は空または notes 限定）
- Checks の最低要件は「調査成果（notes / report）の存在チェック」
- 終端は accept ではなく report 提出による close
- spike の成果から spec / gap を起票して通常 run に接続する
```

spike run の Surfaces / Checks の内部条件は 05 / 06 を参照。

---

## 9. in-band 知識供給

agent-facing コマンド（4 章）の使い方は、人間にも agent にも事前学習を要求しない。必要な知識は実行のたびに in-band で供給される。

```text
供給経路:
- handoff への焼き込み: run に必要な context・許可コマンド・exit protocol を handoff が持つ
- guard 拒否メッセージの次の一手提示: 欠けた入力と次に打つコマンドを返す（5 章）
- status の可能遷移提示: 現在状態から取れる遷移を status が示す（3.4 節）
```

この 3 経路により、agent は cc-iasd 固有のコマンド体系を事前に暗記していなくても、その場で提示される次の一手をたどって正しい動線を進める。独自ナレッジの事前供給を前提にする設計は避ける。handoff の合成規則は 06 を参照。

---

## 10. コマンド設計の原則

```text
原則:
- ライフサイクル状態を進めるのは、ガードを通過した遷移コマンドのみ
- コマンドは journal への event 追記を通じてのみ状態を変える（silent overwrite の経路なし）
- human-facing コマンドは inbox / decide / STOP を上限とし、超過は設計バグとして扱う
- guard 不成立時は差し戻しを唯一のサンクションされた次の一手として提示する
- 完了を宣言するコマンドは worker の可視 surface に存在しない
- 導入は adhoc run を入口にし、規模に応じて spec / campaign へ昇格する
```
