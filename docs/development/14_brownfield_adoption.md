# 14. 既存コードベースへの導入（brownfield adoption）

作成日: 2026-07-07  
状態: kernel 正本 v1.0

---

## 1. この文書の目的

この文書は、コードベースのリポジトリが先に存在するプロジェクトへ cc-iasd を追加導入するときの、context 成果物（vision / spec / campaign / journal / 既存ドキュメント）の取り扱いを定める。

vision から始める新規開発の標準ワークフローは 04 が正本である。この文書は 04 の前段、つまり「文書がゼロでコードだけがある」状態から 04 の運用に合流するまでの導入経路を扱う。状態機械・ガード・event schema はこの文書では変更しない（それぞれ 05 / 06 が正本のまま）。

---

## 2. 前提: 物理配置

project-context は既存リポジトリとは独立のディレクトリ（独立の git リポジトリ）として作成し、既存リポジトリは `init --repo <name>:<path>` で登録する。path は相対・絶対とも任意であり、既存リポジトリの物理移動は要求しない。

```text
配置の規則:
- project-context は独立リポジトリとして init する（監査履歴とコード履歴を分離する）
- 既存リポジトリは path 登録のみで管理下に入る。Surfaces の src/<repo>/... glob は
  論理名前空間であり、実パスと独立に解決される
- 既存リポジトリの内部に project-context を埋め込まない。journal は遷移ごとに
  commit されるため、コードの履歴が監査イベントで汚染される
```

---

## 3. 原則: as-built の扱い

brownfield 導入で最も鋭く効く不変条件は推測補完の禁止である。コードから vision / spec を AI に逆生成させ、そのまま「承認済みの真実」として扱うことは推測補完そのものであり、禁止する。一方で、既存システム全体の文書を人間が書き終えるまで run を止める設計も採らない。両立の原則は次である。

```text
- 一括逆生成しない。既存領域の文書は、その領域に変更を加えるときに初めて起こす
  （just-in-time 回収）
- AI がコードから起草した as-built 文書は、gate（review record / decide）を通るまで
  「主張」であって真実ではない。greenfield の spec と同じゲートを通す
- as-built spec の Checks には既存のテストコマンドを指定する。文書とコードの一致は
  AI の目視ではなく CLI 実行で検証される
- 文書化されていない領域は covers 射影上「未カバー」として正直に可視化し続ける。
  未カバーは負債の在庫表示であって、導入の失敗ではない
- 調査で意図が判らなかった箇所は gap（needs-info）として台帳に在庫化し、
  [UNRESOLVED: gNNN] マーカーで spec に穴として残す。推測で埋めない
```

---

## 4. 段階導入ラダー

導入は次の 4 段階で進める。各段階は前段の完了を待たず並走してよいが、Stage 0 だけは最初に完了させる。

```text
Stage 0（初日）: 足場
  - init を既存リポジトリの隣で実行し、--repo で全対象リポジトリを登録する
  - 既存 CI のテスト・lint コマンドを cc-iasd.yaml の checks_allowlist に登録する
  - 壊してはいけない領域（生成コード・マイグレーション済み schema 等）に
    forbid glob を設定する
  -> この時点で adhoc run が使える。spec がゼロでも、src 隔離・証跡記録・
     Default-FAIL の verify・Surfaces 照合はすべて機能する

Stage 1: vision の在庫化
  - brownfield の vision を Capabilities 在庫表として起こす。既存 capability は
    - [x]（提供済み）、これから作るものは - [ ]（未提供）で列挙する
  - 既存 capability の列挙は粒度の粗い事実確認であり、詳細仕様の逆生成ではない。
    人間が decide で承認する
  -> status --plan の covers 射影が「既存 capability のうち spec 未カバーのもの」
     = 未文書化領域の負債マップとして稼働する

Stage 2: spec の just-in-time 回収
  - 変更が触る領域から順に as-built spec を回収する。手順は
    spike run（読み取り専用調査）-> AI が draft 起草 -> spec gate -> 既存テストを
    Checks に指定 -> 不明点は needs-info gap
  - 触らない領域は未カバーのまま残してよい

Stage 3: 通常運用への合流
  - 新規機能は 04 の標準ワークフロー（vision の未提供 capability -> spec ->
    campaign -> run）で greenfield と同一に扱う
```

adhoc run は spec チェーンの例外経路であると同時に、brownfield 導入の正面玄関を兼ねる。導入初期に adhoc 比率が高いのは想定内であり、doctor の昇格促し（adhoc 比率表示）は Stage 2 以降の回収の進捗指標として読む。

---

## 5. context 成果物ごとの取り扱い

### 5.1 vision

brownfield の vision は「これから作るもの」の宣言ではなく「何が既に在り、どこへ向かうか」の台帳である。Capabilities 節のチェックリスト記法（06 / vision_template）をそのまま使い、`- [x]` を既存、`- [ ]` を計画とする。承認・改稿の機構は greenfield と同一である。

### 5.2 spec

既存領域の spec（as-built spec)は 4 章 Stage 2 の手順で回収する。as-built spec は spec の一種であり、専用の種別・状態は設けない。greenfield の spec との違いは Checks が既存テストを指す点と、起草の情報源がコードである点のみで、ガード・遷移は同一である。

### 5.3 campaign / run

greenfield と同一。差分はない。

### 5.4 journal

journal は導入時点から始める。導入前の git 履歴は journal へ遡及取込しない。証跡管理主義の対象は kernel 監督下で起きた事象であり、導入前の歴史は各リポジトリの git が既に正本である。導入時点の各リポジトリ HEAD が baseline であり、run 単位の base commit 記録（06）がその後の差分の基準になる。

### 5.5 既存ドキュメント（README / ADR / 設計書）

既存リポジトリ内のドキュメントはコードと同じく src 名前空間の中身であり、project-context へコピーしない。コピーは二重管理と即時陳腐化を招く。spec から参照する場合はリポジトリ内パスを本文中で参照する（参照形式の確定は 10_todo 参照）。

---

## 6. アンチパターン

```text
- 一括リバースドキュメント生成:
    導入時に AI へコードベース全体の spec 逆生成をさせる。検証されない大量の
    「主張」が真実の顔をして台帳に載り、推測補完禁止が骨抜きになる
- product repo 内への project-context 埋め込み:
    監査履歴とコード履歴の分離が壊れる（2 章）
- 既存リポジトリの物理移動の強制:
    path 登録で足りる。移設を導入要件にしない
- 既存ドキュメントの project-context への移設:
    二重管理になる（5.5 章）
```

---

## 7. 未確定事項

次は本文書の運用に関わるが、具体形が未確定である。実装候補は 10_todo で管理する。

```text
- 導入時 baseline イベント:
    init 時に各登録リポジトリの HEAD と dirty 状態を journal へ刻むか
- doctor の導入時検査:
    登録リポジトリが dirty のまま運用開始していないか等の検査を doctor に足すか
- 既存ドキュメントの参照形式:
    spec 本文からの相対参照で足りるか、read-only の持ち込み領域を設けるか
```
