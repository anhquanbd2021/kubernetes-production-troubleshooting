// triage.mjs — pure diagnosis/grading engine for K8s Triage Lab.
// No DOM, no IO — the same module drives the browser lab, the CLI
// (scripts/prove.mjs), and the unit tests.

/**
 * A session is the ordered log of everything the operator did:
 *   { kind:'command', id, evidence, at }
 *   { kind:'diagnosis', id, correct, at }        — first submission locks
 *   { kind:'fix', id, resolves, beforeDiagnosis, at }
 *   { kind:'fix-attempt', id, missing, at }      — refused: prerequisites unmet
 */
export function createSession(incident) {
  return {
    incidentId: incident.id,
    seq: 0,
    log: [],
    applied: new Set(),     // accepted fix ids
    diagnosis: null,        // { id, correct, at } — first answer stands
    resolved: false,
  };
}

const byId = (list, id) => list.find((x) => x.id === id);

export function runCommand(session, incident, commandId) {
  const cmd = byId(incident.commands, commandId);
  if (!cmd) return { ok: false, error: `unknown command: ${commandId}` };
  session.log.push({ kind: 'command', id: cmd.id, evidence: !!cmd.evidence, at: session.seq++ });
  return { ok: true, label: cmd.label, output: cmd.output };
}

export function submitDiagnosis(session, incident, diagnosisId) {
  if (session.diagnosis) return { ok: false, error: 'diagnosis locked — the first answer stands' };
  const d = byId(incident.diagnoses, diagnosisId);
  if (!d) return { ok: false, error: `unknown diagnosis: ${diagnosisId}` };
  session.diagnosis = { id: d.id, correct: !!d.correct, at: session.seq };
  session.log.push({ kind: 'diagnosis', id: d.id, correct: !!d.correct, at: session.seq++ });
  return { ok: true, correct: !!d.correct, label: d.label };
}

function sequenceComplete(incident, session) {
  const seq = incident.fixSequence || [];
  return seq.length > 0 && seq.every((id) => session.applied.has(id));
}

export function applyFix(session, incident, fixId) {
  const fix = byId(incident.fixes, fixId);
  if (!fix) return { ok: false, error: `unknown fix: ${fixId}` };
  if (session.applied.has(fix.id)) return { ok: false, error: 'already applied' };

  const missing = (fix.requires || []).filter((r) => !session.applied.has(r));
  if (missing.length) {
    session.log.push({ kind: 'fix-attempt', id: fix.id, missing, at: session.seq++ });
    return { ok: false, refused: true, missing, label: fix.label, output: fix.refusedOutput };
  }

  const beforeDiagnosis = !session.diagnosis;
  session.applied.add(fix.id);
  session.log.push({ kind: 'fix', id: fix.id, resolves: !!fix.resolves, beforeDiagnosis, at: session.seq++ });
  if (fix.resolves || sequenceComplete(incident, session)) session.resolved = true;
  return { ok: true, label: fix.label, output: fix.output, resolved: session.resolved };
}

const labelOf = (incident, kind, id) =>
  byId(kind === 'fix-attempt' || kind === 'fix' ? incident.fixes : incident.commands, id)?.label || id;

/**
 * Grade the session. Hard faults fail the run even if the incident was
 * eventually resolved — this is a drill about order of operations:
 *   fix-before-diagnosis   you touched the cluster before naming the cause
 *   no-evidence            you named a cause before reading anything that proves it
 *   wrong-diagnosis        first submitted diagnosis was wrong
 *   fix-out-of-order       a fix was attempted before its prerequisites
 * Ineffective fixes after a correct diagnosis are soft faults — score, not fail.
 */
export function gradeSession(session, incident) {
  const log = session.log;
  const diag = log.find((e) => e.kind === 'diagnosis');
  const faults = [];
  const notes = [];

  if (!diag) {
    return {
      status: session.resolved ? 'fail' : 'incomplete',
      score: session.resolved ? 0 : null,
      resolved: session.resolved,
      faults: [{ code: 'no-diagnosis', detail: 'the incident was never diagnosed' }],
      notes,
    };
  }

  const diagIdx = log.indexOf(diag);

  const earlyFix = log.slice(0, diagIdx).find((e) => e.kind === 'fix');
  if (earlyFix) {
    faults.push({
      code: 'fix-before-diagnosis',
      detail: `applied "${labelOf(incident, 'fix', earlyFix.id)}" before submitting a diagnosis`,
    });
  }

  const evidenceBefore = log.slice(0, diagIdx).some((e) => e.kind === 'command' && e.evidence);
  if (!evidenceBefore) {
    faults.push({
      code: 'no-evidence',
      detail: 'diagnosis submitted before running any evidence-bearing command',
    });
  }

  if (!diag.correct) {
    const picked = byId(incident.diagnoses, diag.id);
    faults.push({
      code: 'wrong-diagnosis',
      detail: `diagnosed "${picked ? picked.label : diag.id}" — the evidence points elsewhere`,
    });
  }

  const refused = log.filter((e) => e.kind === 'fix-attempt');
  for (const r of refused) {
    faults.push({
      code: 'fix-out-of-order',
      detail: `"${labelOf(incident, 'fix-attempt', r.id)}" attempted before ${r.missing.join(', ')}`,
    });
  }

  const seq = incident.fixSequence || [];
  const ineffective = log.filter(
    (e) => e.kind === 'fix' && !e.resolves && !seq.includes(e.id),
  );
  for (const f of ineffective) {
    notes.push(`"${labelOf(incident, 'fix', f.id)}" had no effect — not the cause`);
  }

  if (faults.length) {
    return { status: 'fail', score: 0, resolved: session.resolved, faults, notes };
  }
  if (!session.resolved) {
    return { status: 'incomplete', score: null, resolved: false, faults, notes };
  }
  const score = Math.max(60, 100 - 15 * ineffective.length);
  return { status: 'pass', score, resolved: true, faults, notes };
}

/** Human-readable grade line for the badge / prove output. */
export function gradeSummary(grade) {
  if (grade.status === 'pass') return `resolved · clean triage · score ${grade.score}`;
  if (grade.status === 'fail') return `graded fail — ${grade.faults[0].code}`;
  return 'in progress';
}
