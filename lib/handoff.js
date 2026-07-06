import { stripFrontmatter } from './hash.js';

// Markdown 本文から `## <heading>` セクション本体を抽出する。
// コメント行（<!-- ... -->）と空白のみの本体は「空」とみなす。
export function extractSection(markdown, heading) {
  const body = stripFrontmatter(markdown || '').replace(/\r\n/g, '\n');
  const lines = body.split('\n');
  const norm = (h) => h.replace(/\s+/g, ' ').trim().toLowerCase();
  const target = norm(heading);
  let capturing = false;
  const collected = [];
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      const level = m[1].length;
      const title = norm(m[2]);
      if (capturing && level <= 2) break;
      if (level === 2 && title === target) {
        capturing = true;
        continue;
      }
    }
    if (capturing) collected.push(line);
  }
  if (!capturing) return null;
  const stripped = collected
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  return stripped;
}

function hasSection(markdown, heading) {
  const s = extractSection(markdown, heading);
  return s != null && s.length > 0;
}

// handoff を機械合成する。必須合成元の欠落があれば { ok:false, missing:[...] }。
export function synthesize(sources) {
  const {
    spec,
    charter,
    vision,
    decisions = [],
    roleCard,
    runId = '',
    tasks = [],
    repos = {},
    docLang = 'Japanese',
    spike = false,
    adhoc = null,
  } = sources || {};

  const missing = [];
  const requiresSpec = !adhoc;

  if (requiresSpec) {
    const specSections = ['Requirements', 'Acceptance', 'Surfaces', 'Checks', 'Tasks'];
    if (spec == null) {
      missing.push({ input: 'spec', detail: 'spec 本文が渡されていません' });
    } else {
      for (const sec of specSections) {
        if (sec === 'Tasks' && (spike || tasks.length === 0)) continue;
        if (!hasSection(spec, sec)) {
          missing.push({ input: `spec.${sec}`, detail: 'セクションが欠落または空です' });
        }
      }
    }
  } else {
    if (!adhoc.goal) missing.push({ input: 'adhoc.goal', detail: 'goal が指定されていません' });
    if (!spike && !adhoc.check) {
      missing.push({ input: 'adhoc.check', detail: 'check が指定されていません' });
    }
  }

  if (requiresSpec) {
    const charterSections = ['Risk Tiers', 'Non-Regression Focus', 'Stop Conditions'];
    if (charter == null) {
      missing.push({ input: 'charter', detail: 'charter 本文が渡されていません' });
    } else {
      for (const sec of charterSections) {
        if (!hasSection(charter, sec)) {
          missing.push({ input: `charter.${sec}`, detail: 'セクションが欠落または空です' });
        }
      }
    }
    if (vision == null) {
      missing.push({ input: 'vision', detail: 'vision 本文が渡されていません' });
    } else if (!hasSection(vision, 'Boundaries')) {
      missing.push({ input: 'vision.Boundaries', detail: 'セクションが欠落または空です' });
    }
  }

  if (!roleCard || roleCard.trim().length === 0) {
    missing.push({ input: 'roleCard', detail: 'worker role card が渡されていません' });
  }

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const md = renderHandoff({
    spec,
    charter,
    vision,
    decisions,
    roleCard,
    runId,
    tasks,
    repos,
    docLang,
    spike,
    adhoc,
  });
  return { ok: true, markdown: md };
}

function block(heading, contentOrNull) {
  const content = contentOrNull == null || contentOrNull === '' ? '(N/A)' : contentOrNull;
  return `## ${heading}\n\n${content}\n`;
}

function renderHandoff(s) {
  const parts = [];
  parts.push(`---\nid: ${s.runId}\nrefs: []\n---\n`);
  parts.push(`# handoff: ${s.runId}\n`);

  if (s.adhoc) {
    parts.push(block('Requirements', s.adhoc.goal));
    parts.push(block('Acceptance', s.adhoc.check ? `Check: ${s.adhoc.check}` : '(spike)'));
    parts.push(block('Surfaces', s.spike ? 'write: [] (spike: src 不変)' : '(adhoc)'));
    parts.push(block('Checks', s.adhoc.check || '(spike: notes/report の存在確認)'));
  } else {
    parts.push(block('Requirements', extractSection(s.spec, 'Requirements')));
    parts.push(block('Acceptance', extractSection(s.spec, 'Acceptance')));
    parts.push(block('Surfaces', extractSection(s.spec, 'Surfaces')));
    parts.push(block('Checks', extractSection(s.spec, 'Checks')));
    parts.push(
      block(
        'Tasks',
        s.tasks.length ? s.tasks.map((t) => `- ${t}`).join('\n') : extractSection(s.spec, 'Tasks')
      )
    );
    parts.push(block('Risk Tiers', extractSection(s.charter, 'Risk Tiers')));
    parts.push(block('Non-Regression Focus', extractSection(s.charter, 'Non-Regression Focus')));
    parts.push(block('Stop Conditions', extractSection(s.charter, 'Stop Conditions')));
    parts.push(block('Boundaries', extractSection(s.vision, 'Boundaries')));
  }

  const decisionBodies = (s.decisions || [])
    .map((d) => extractSection(d, '決定事項'))
    .filter((x) => x && x.length > 0);
  parts.push(block('Decisions', decisionBodies.length ? decisionBodies.join('\n\n---\n\n') : null));

  const repoEntries = Object.entries(s.repos || {});
  const repoText = repoEntries.length
    ? repoEntries.map(([name, base]) => `- ${name}: base=${base}`).join('\n')
    : '(none)';
  parts.push(block('Repos', repoText));

  parts.push(block('Worker Role Card', s.roleCard.trim()));

  parts.push(
    block(
      'Exit Protocol',
      '完了を宣言する手段はない。実装後に run verify を要求せよ。終端は accept / block / escalate のみである。'
    )
  );

  return parts.join('\n');
}
