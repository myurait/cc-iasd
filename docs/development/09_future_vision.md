# 09. cc-iasd 将来構想

作成日: 2026-07-05  
状態: kernel 正本 v1.0（Phase 1 レビュー待ち）

---

## 1. この文書の位置づけ

この文書は、kernel の v0 スコープ外として確定した項目を将来構想として整理する。v0 の実装対象は 3 不変条件を構造で守る最小系（詳細は 02）であり、そこに含めないと判断した拡張・接続層の高度化・運用観察後に判断する事項をここに置く。

将来構想は 3 種に分ける。

```text
1. v0 スコープ外の拡張（4 章）:
   設計として v0 に載せないことが確定した機能。将来 adapter または上位層として追加できる

2. 運用観察後に判断する事項（5 章）:
   v0 の設計判断を確定しないまま運用に入り、実データを見てから足すか否かを決める項目

3. 実装フェーズの後段スコープ（6 章）:
   P1 の縦スライス以降に位置づく実装フェーズのうち、将来寄りのもの
```

v0 でどこまで作るか（P1）と、どのノードをいつ載せるか（P2 以降）の区別が要点である。vision / spec / campaign のノード化・review gates・covers 射影は P2 で入るため将来構想ではない（6 章）。ここに書くのは、P2 でも入らない、より外側の拡張である。

なお、旧設計の 09 は Spec Kit 互換の framework 統合像・plugin architecture・role expansion・multi-runtime orchestration を将来像として並べていた。これらの多くは kernel で v0 の構造に取り込まれたか（例: implementation runtime の差し替えは adapter として v0 に組み込む）、方針を変更した（例: role expansion は reviewer のチェックリスト差し替えに置き換える）。本文書は kernel 前提で全面的に書き直したものであり、旧 09 の項目立ては踏襲しない。

---

## 2. v0 スコープ外の位置づけ

kernel は 3 不変条件を Tier 0（全 runtime 共通の CLI ガードと git 監査）だけで閉じる（詳細は 02）。この Tier 0 で不変条件が成立するという境界が、将来構想を切り出す基準になる。

```text
v0 に入れる:
  3 不変条件を構造で守るために必要なもの。CLI ガード / journal / verify /
  終端 3 択 / decide / gap / doctor / multi-repo / 並列 run（詳細は 02）

v0 スコープ外にする:
  不変条件の成立に不要で、Tier 0 の外側で足せるもの。
  外部投影・gate 種別の追加要求・worktree 隔離の高度化・監査の再計算強化
```

不変条件の成立に必要ないものを v0 に載せないのは、kernel を小さく保つためである。外側で adapter または上位層として足せる構造にしておき、必要性が運用で確認されてから追加する。

---

## 3. adapter の位置づけ（capability manifest 型・Tier 1 optional）

将来構想の多くは adapter として実現する。kernel の adapter は、runtime を起動するための設定生成物を compile する compile ターゲットであり、capability manifest を持つ（詳細は 02 / 03 / 05）。

```text
adapter の性質:
- capability manifest を宣言する。contextInjection / writeGuard / stopGate / journal の
  各 capability を hook / wrapper / none のいずれかで表明する
- Tier 1（hook 対応 runtime 向けの optional 加速層）に属する。
  失敗を早めるだけであり、不変条件の成立には関与しない
- 特定 runtime の API に依存するため、enforcement の本体には決してしない（ロックイン回避）
```

将来の runtime 統合・外部投影・強い隔離は、この adapter 層に capability として追加する形で実装する。kernel core（Tier 0）には手を入れず、adapter が hook / wrapper で加速する構造を保つ。したがって「新しい runtime に対応する」「外部サービスへ投影する」といった拡張は、Tier 0 の不変条件を弱めずに載せられる。

---

## 4. v0 スコープ外の拡張

### 4.1 外部投影 adapter（B2）

実行の進捗を GitHub Issues などの外部サービスへ書き戻す外部投影を、v0 には導入しない。rework 02 B2（外部可視化）の確定は非導入であり、journal からの射影として将来 adapter 化できるが、kernel の根幹からは分離する。

```text
外部投影 adapter:
- 正本は journal のまま維持する。外部サービスへ書くのは journal からの投影であり、
  外部側を状態の入力にはしない
- GitHub Issues / project board などへ、run / campaign / gap の状態を書き戻す
- journal の refs と event から射影を生成し、外部サービスの adapter が反映する
```

外部投影を v0 に載せない理由は、外部サービス非依存の設計原則を守るためである。外部を状態正本にすると journal 一本化が崩れ、外部サービスの停止が kernel の動作条件になる。将来 adapter として足すときも、あくまで journal からの一方向投影に限り、外部を入力経路にはしない。

### 4.2 actor=human gate 要求オプション

特定の gate の review record に actor=human を要求する宣言は、v0 に搭載しない。gate review の主体は fresh-context の AI reviewer であり、人間の関与点は decide と campaign close に限定するという設計を維持する（gate review 既定は 05）。

```text
非搭載の内容:
- 「この gate は人間の review record でなければ通さない」という宣言を config / charter に置けるようにする案
- v0 では 4 gate すべてを AI reviewer の review record で判定し、
  人間専権は vision approve / decide / campaign close の 3 点に絞る
```

これを v0 に載せない理由は、人間 facing の操作を inbox / decide / STOP の上限に収める設計を守るためである（上限の仕様は 08）。gate ごとに人間 review を要求できるようにすると、人間が gate 種別と review 手順を学習しなければ回らなくなり、「人間は操作者ではない」という原則に反する。この必要性は運用観察後に再判断する（5.4 節）。

### 4.3 worktree 隔離 adapter の高度化

adapter は run ごとの git worktree 隔離を提供できる（同一 repo を共有する並列 run の強い隔離。accept 時に merge し、conflict は verify 失敗として機械検出する。詳細は 03）。この worktree 隔離そのものは P3 の接続層で入るが、その高度化は将来構想に置く。

```text
将来寄りの高度化:
- worktree の自動 GC / 世代管理（accept 済み worktree の整理方針の最適化）
- 同一 repo 多数並列時の worktree プール管理
- merge conflict の自動再試行戦略（現状は verify 失敗として機械検出するに留める）
```

v0（P3）で入れるのは、隔離の提供と accept 時 merge・conflict の機械検出までである。プール管理や自動再試行は不変条件の成立に不要であり、並列規模が実際に増えてから最適化する。

### 4.4 監査の再計算強化・Tier 1 adapter 拡充（P4 寄り）

guard_results の再計算検証と証拠十分性検査の拡充は、実装フェーズ P4（監査強化）に位置づく将来寄りのスコープである（フェーズの全体は 6 章）。

```text
監査強化（P4）:
- guard_results 再計算検証: 遷移 event に焼き込まれた guard 判定結果を、doctor が
  事後に再計算して一致を検証する範囲の拡充（基本形は 02 / 06 に既にある）
- 証拠十分性検査の拡充: DEMM 証拠十分性検査（詳細は 06）の観点追加

Tier 1 adapter 拡充:
- claude-code 以外の runtime に対する Tier 1 hook adapter の追加
- capability manifest の充足度に応じた加速層の拡張
```

これらは Tier 0 で閉じている不変条件を強化・加速するものであり、v0 の最小系には含めない。Tier 1 hook の runtime API 追従コストは optional 層に閉じ込めても恒常的に発生するため（5.5 節）、adapter 拡充は runtime の実利用に合わせて段階的に行う。

---

## 5. 運用観察後に判断する事項

次の項目は、v0 の設計を先に確定せず運用に入り、実データを見てから足すか否か・どう足すかを決める。rework 04 14 章の open questions のうち、観察後判断とされた項目をここに移したものである。

### 5.1 status --plan の中期計画耐性

vision Capabilities + covers 射影と route=vision の gap による中期計画ビュー（status --plan の射影出力。詳細は 05）が、中期計画の実運用に耐えるかを運用で観察する。

```text
観察対象:
- status --plan の射影が、複数 campaign にまたがる中期計画の把握に十分か
- 耐えない場合に足すのは、専用 artifact の復活か charter 拡張か

判断待ちの理由:
- 中期計画在庫は gap 台帳（route=vision, kind=candidate）に集約する設計だが、
  この射影だけで計画運用が回るかは実データがないと判定できない
```

### 5.2 auto-commit 粒度

project-context repo の auto-commit（遷移のたびに git commit し改竄検出とタイムラインを git に委譲する。詳細は 03）の粒度を、運用で観察してから調整する。

```text
観察対象:
- 遷移ごとに commit するか、複数遷移をまとめて commit するか
- 遷移ごとだと commit 数が過大にならないか、まとめると監査粒度が粗くならないか

判断待ちの理由:
- 粒度は監査性（細かいほど追跡可能）と履歴の見通し（粗いほど読みやすい）の
  トレードオフであり、実際の遷移頻度を見てから決める
```

### 5.3 journal 肥大化対策

journal event の粒度（closed set の設計。詳細は 06）が、監査の穴と肥大化のバランスとして適切かを観察する。

```text
観察対象:
- event 粒度が粗いと監査に穴、細かいと journal が肥大化する
- 肥大化した場合の対策（古い event の圧縮・アーカイブ方針など）が必要か

判断待ちの理由:
- 1-event-1-file の構造（詳細は 03）は並行安全だが、長期運用での file 数増加が
  実運用で問題になるかは観察してから判断する
```

### 5.4 actor=human gate 要求の必要性

4.2 節の actor=human gate 要求オプションを v0 に載せないことは確定しているが、その必要性は運用観察後に再判断する。人間関与点を decide と campaign close に絞った設計で、AI reviewer の gate 判定が実務に耐えるかを見る。

### 5.5 Tier 1 hook の runtime API 追従コスト

Tier 1 hook は特定 runtime の API に依存するため、runtime 側の API 変更に追従するコストが optional 層に閉じ込めても恒常的に発生する。このコストが adapter 拡充（4.4 節）の速度をどれだけ律速するかを運用で見る。

---

## 6. 実装フェーズの後段スコープ

kernel の実装フェーズは、P1 の縦スライスから段階的に積み上がる。将来寄りに位置づくのは P4 とその周辺であり、P2・P3 は将来構想ではなく v0 の実装対象である。

```text
P1（縦スライス。v0 の最小系）:
  journal / 状態機械 / write-path allowlist / adhoc run / handoff 機械合成 /
  run verify / 終端 3 択 / decide / gap / doctor / multi-repo / 並列 run。
  adhoc run だけで 3 不変条件と並列安全が構造で守られる最小系を成立させる

P2（chain。v0 の実装対象。将来構想ではない）:
  vision（Capabilities）/ spec / campaign（depends_on）のノード化、review gates、
  report、covers 射影（status --plan）。
  この層が入って初めて計画チェーンが機能する。ここは将来構想に置かない

P3（接続層）:
  claude-code adapter（Tier 1 hooks）、session resume、worktree 隔離 adapter。
  隔離の提供と accept 時 merge・conflict 機械検出まで（高度化は 4.3 節）

P4（監査強化。将来寄り）:
  guard_results 再計算検証、証拠十分性検査の拡充（4.4 節）
```

P2 のノード化を将来構想と誤認しないことが重要である。vision / spec / campaign のノード化と review gates は、kernel の計画チェーンの本体であり v0 に入る。将来構想として切り出すのは、この本体の外側にある拡張（4 章）と、確定を保留して観察に回す事項（5 章）、および P4 の監査強化に限る。

実装フェーズの一次記述は 10 に置く。本文書は将来寄りのフェーズ（P4）とスコープ外拡張の関係を示すに留める。

---

## 7. 将来構想の境界

次は将来構想の範囲外であり、v0 にも将来構想にも混入させない。cc-iasd が目指さないものの宣言である。

```text
目指さない:
- enterprise compliance platform 化（監査は非常駐人間と AI の間で判断経緯を
  失わないための最小限に留める）
- 外部サービスを状態正本にする統合（journal 一本化を崩さない。4.1 節）
- 自律的な product 意思決定（product value の判断は human 専権。詳細は 12）
- automatic roadmap generation（順序は charter depends_on、coverage は vision
  Capabilities で決定論化済み。散文 roadmap の自動生成は導入しない。詳細は 02）
- 敵対的 runtime を仮定する統制（decide の threat model が防ぐのは善意のドリフトまで。
  敵対的 runtime は実行環境側に委ねる。詳細は 05）
```

これらを境界として明示するのは、将来構想が kernel の設計原則（外部サービス非依存 / journal 正本化 / 人間専権の限定 / 決定論主義）を侵さない範囲に留まることを保証するためである。将来 adapter を足すときも、この境界の内側で行う。
