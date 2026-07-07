import fs from 'node:fs';
import path from 'node:path';
import { ulid } from './ulid.js';
import { journalDir } from './paths.js';
import { write } from './writePath.js';

// event type の closed set（設計 06 3.2）。
export const EVENT_TYPES = new Set([
  'created',
  'revised',
  'transitioned',
  'verify.recorded',
  'review.recorded',
  'gap.opened',
  'gap.closed',
  'decision.recorded',
  'session.started',
  'session.resumed',
  'commit.observed',
  'note.appended',
  'baseline.recorded',
]);

// event を 1-event-1-file で追記する。id / ts は append が付与する。
// event: { type, subject, actor:{kind,session?}, data?, payload?:{path,sha256}, refs?:[{rel,to}] }
export function append(root, event) {
  if (!event || typeof event !== 'object') {
    throw new Error('journal.append: event が不正です');
  }
  if (!EVENT_TYPES.has(event.type)) {
    throw new Error(`journal.append: 未知の event type: ${event.type}`);
  }
  if (!event.subject || typeof event.subject !== 'string') {
    throw new Error('journal.append: subject が必須です');
  }
  if (!event.actor || typeof event.actor.kind !== 'string') {
    throw new Error('journal.append: actor.kind が必須です');
  }

  const id = ulid();
  const record = {
    id,
    ts: new Date().toISOString(),
    actor: event.actor,
    type: event.type,
    subject: event.subject,
  };
  if (event.data !== undefined) record.data = event.data;
  if (event.payload !== undefined) record.payload = event.payload;
  if (event.refs !== undefined) record.refs = event.refs;

  const rel = path.join('journal', `${id}.json`);
  write(root, rel, JSON.stringify(record, null, 2) + '\n');
  return id;
}

// journal の全 event を ULID 昇順（時系列）で返す。
export function readAll(root) {
  const dir = journalDir(root);
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort(); // ULID は辞書順 = 時系列順
  const events = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      events.push(JSON.parse(raw));
    } catch {
      throw new Error(`journal.readAll: 破損した event file: ${f}`);
    }
  }
  return events;
}

// subject が指す type を返すヘルパ（例 "spec:s001" -> "spec"）。
export function subjectKind(subject) {
  const idx = String(subject).indexOf(':');
  return idx === -1 ? subject : subject.slice(0, idx);
}

// subject の id 部分を返す（例 "spec:s001" -> "s001"）。
export function subjectId(subject) {
  const idx = String(subject).indexOf(':');
  return idx === -1 ? '' : subject.slice(idx + 1);
}
