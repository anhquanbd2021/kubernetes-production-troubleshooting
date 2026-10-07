import test from 'node:test';
import assert from 'node:assert/strict';
import { INCIDENTS, getIncident } from '../public/incidents.mjs';
import { createSession, runCommand, submitDiagnosis, applyFix, gradeSession } from '../public/triage.mjs';

// The clean run each incident expects: read evidence, diagnose, fix — in order.
const CLEAN_PATHS = {
  'pending-pod': {
    commands: ['get-pods', 'logs', 'describe-pod', 'describe-node', 'get-pvc'],
    diagnosis: 'requests',
    fixes: ['patch-requests'],
  },
  'crashloop': {
    commands: ['get-pods', 'logs', 'logs-previous', 'describe-pod', 'describe-deploy', 'get-cm'],
    diagnosis: 'config',
    fixes: ['patch-cm'],
  },
  'etcd-nospace': {
    commands: ['get-nodes', 'apply-canary', 'healthz-etcd', 'endpoint-status', 'alarm-list'],
    diagnosis: 'nospace',
    fixes: ['defrag', 'compact', 'disarm'],
  },
  'ingress-404': {
    commands: ['get-ingress', 'describe-ingress', 'get-svc', 'describe-svc', 'get-endpoints', 'get-pods-labels', 'check-app'],
    diagnosis: 'selector',
    fixes: ['fix-selector'],
  },
};

function play(id, path) {
  const incident = getIncident(id);
  const s = createSession(incident);
  for (const c of path.commands || []) {
    const r = runCommand(s, incident, c);
    assert.equal(r.ok, true, `command ${c} should run`);
  }
  if (path.diagnosis) submitDiagnosis(s, incident, path.diagnosis);
  const results = [];
  for (const f of path.fixes || []) results.push(applyFix(s, incident, f));
  return { incident, s, results };
}

test('all four incidents are defined with the article structure', () => {
  assert.equal(INCIDENTS.length, 4);
  for (const inc of INCIDENTS) {
    assert.ok(inc.commands.some((c) => c.evidence), `${inc.id} needs an evidence command`);
    assert.ok(inc.diagnoses.some((d) => d.correct), `${inc.id} needs a correct diagnosis`);
    assert.ok(inc.diagnoses.some((d) => !d.correct), `${inc.id} needs distractors`);
    assert.ok(inc.fixes.some((f) => f.resolves) || inc.fixSequence, `${inc.id} needs a resolution`);
  }
});

test('every incident passes on the correct order of operations', () => {
  for (const id of Object.keys(CLEAN_PATHS)) {
    const { incident, s } = play(id, CLEAN_PATHS[id]);
    const g = gradeSession(s, incident);
    assert.equal(g.status, 'pass', `${id} should pass, got ${g.status}: ${JSON.stringify(g.faults)}`);
    assert.equal(s.resolved, true);
    assert.equal(g.score, 100);
    assert.deepEqual(g.faults, []);
  }
});

test('wrong first diagnosis fails even if the fix is right', () => {
  const { incident, s } = play('pending-pod', {
    commands: ['describe-pod'],
    diagnosis: 'taint',
    fixes: ['patch-requests'],
  });
  const g = gradeSession(s, incident);
  assert.equal(g.status, 'fail');
  assert.ok(g.faults.some((f) => f.code === 'wrong-diagnosis'));
});

test('applying a fix before diagnosing fails', () => {
  const incident = getIncident('crashloop');
  const s = createSession(incident);
  runCommand(s, incident, 'logs-previous');
  applyFix(s, incident, 'patch-cm');           // touches the cluster first — wrong
  submitDiagnosis(s, incident, 'config');
  const g = gradeSession(s, incident);
  assert.equal(g.status, 'fail');
  assert.ok(g.faults.some((f) => f.code === 'fix-before-diagnosis'));
});

test('diagnosing with no evidence fails even when the guess is right', () => {
  const { incident, s } = play('ingress-404', { diagnosis: 'selector', fixes: ['fix-selector'] });
  const g = gradeSession(s, incident);
  assert.equal(g.status, 'fail');
  assert.ok(g.faults.some((f) => f.code === 'no-evidence'));
});

test('etcd fix sequence is enforced — disarm before defrag/compact is refused and fails the run', () => {
  const incident = getIncident('etcd-nospace');
  const s = createSession(incident);
  runCommand(s, incident, 'alarm-list');
  submitDiagnosis(s, incident, 'nospace');
  const early = applyFix(s, incident, 'disarm');
  assert.equal(early.ok, false);
  assert.equal(early.refused, true);
  applyFix(s, incident, 'defrag');
  applyFix(s, incident, 'compact');
  applyFix(s, incident, 'disarm');
  assert.equal(s.resolved, true);
  const g = gradeSession(s, incident);
  assert.equal(g.status, 'fail');
  assert.ok(g.faults.some((f) => f.code === 'fix-out-of-order'));
});

test('an ineffective fix after a correct diagnosis costs points, not the pass', () => {
  const { incident, s } = play('pending-pod', {
    commands: ['describe-pod'],
    diagnosis: 'requests',
    fixes: ['delete-pod', 'patch-requests'],
  });
  const g = gradeSession(s, incident);
  assert.equal(g.status, 'pass');
  assert.ok(g.score < 100);
  assert.ok(g.notes.length > 0);
});

test('unresolved incidents grade incomplete, diagnosis locks after first submit', () => {
  const { incident, s } = play('pending-pod', { commands: ['describe-pod'], diagnosis: 'requests' });
  assert.equal(gradeSession(s, incident).status, 'incomplete');
  const again = submitDiagnosis(s, incident, 'taint');
  assert.equal(again.ok, false);
});

test('unknown commands and fixes are rejected', () => {
  const incident = getIncident('pending-pod');
  const s = createSession(incident);
  assert.equal(runCommand(s, incident, 'rm -rf /').ok, false);
  assert.equal(applyFix(s, incident, 'nuclear').ok, false);
  assert.equal(submitDiagnosis(s, incident, 'vibes').ok, false);
});
