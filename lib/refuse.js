// ガード拒否は例外オブジェクトとして表現し、CLI 層が捕捉して exit 2 で出力する。
// これによりライブラリ内で process.exit を呼ばずにテスト可能にする。
export class Refusal extends Error {
  constructor(command, missing, next) {
    const summary = (missing || [])
      .map((m) => `- ${m.input}: ${m.detail}`)
      .join('\n');
    super(`拒否: ${command}\n${summary}`);
    this.name = 'Refusal';
    this.isRefusal = true;
    this.command = command;
    this.missing = missing || [];
    this.next = next || [];
    this.exitCode = 2;
  }

  // 人間可読テキスト（欠落した型付き入力 + 次に打つコマンド）。
  toHuman() {
    const lines = [`拒否: ${this.command}`];
    lines.push('欠けている入力:');
    if (this.missing.length === 0) {
      lines.push('  (なし)');
    } else {
      for (const m of this.missing) {
        lines.push(`  - ${m.input}: ${m.detail}`);
      }
    }
    lines.push('次に打つコマンド:');
    if (this.next.length === 0) {
      lines.push('  (なし)');
    } else {
      for (const n of this.next) {
        lines.push(`  $ ${n}`);
      }
    }
    return lines.join('\n');
  }

  toJSON() {
    return {
      ok: false,
      command: this.command,
      missing: this.missing,
      next: this.next,
    };
  }
}

// 拒否を生成する。呼び出し側は throw して CLI 層に伝播させる。
// missing: [{input, detail}], next: [command string...]
export function refuse(command, missing, next) {
  return new Refusal(command, missing, next);
}
