---
id: roles-readme
refs:
  - doc:12
  - doc:08
  - doc:03
---

# roles

このディレクトリは cc-iasd kernel の 3 枚の role card を収める。role card は AI に人格を与える persona ではなく、project-context 内での責務分離単位である。card が定めるのは「判断してよい観点」と「判断してはならない観点」（can / cannot）だけであり、手順・進行順序は書かない。順序・ゲート判定・証跡完全性検査はカーネルが状態機械のガードで強制するため、card に手順を書くと二重管理になる。

## 3 role card

- planner.md — vision / spec / charter の authored content を執筆する。人間との vision 対話も担う。
- worker.md — handoff を入力に src/ のみを編集し、notes と gap 起票で報告する。
- reviewer.md — gate 種別（spec / launch / run / completion）ごとに fresh-context で起動され、review record を返す。

3 ロールとも fresh-context 起動を前提とする。planner は narrow context packet、worker は handoff、reviewer は gate 入力を起動時に与えられ、過去 session の文脈を引き継がない。したがって card には履歴を書かない。

決裁者かつ著者としての human は role card を持たない。human の専権（vision approve / decide / campaign close）はカーネルと 12 が定める。

## 生成と override

これらの card は init が出荷資産として project-context へ配布する。card の出力言語欄はプレースホルダ {{docLang}} で持ち、init の doc-lang（cc-iasd.yaml）から生成時に具体言語へ確定する。init 後は project がこれらのファイルを所有し、変更はファイルを直接編集して行う。card は `cc-iasd role show planner|worker|reviewer` で stdout へ出力される。

## card 規約

card は次の規約に従う。詳細は 12 の 5 章を参照する。

- 各 card は 50 行以内とする。
- 出力言語を明示する（プレースホルダ {{docLang}}）。
- 手順・進行順序を書かない。
- 判断してよい観点と判断してはならない観点（can / cannot）のみを書く。
- 全プロジェクト履歴・全 spec 全文・他ロールの詳細責務を書かない。
- frontmatter は id と refs のみとし、ライフサイクル情報を Markdown に書かない。

card の配置場所と compile 生成物（out/）の扱いは 03 を参照する。
