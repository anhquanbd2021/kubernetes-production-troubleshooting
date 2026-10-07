// prove.mjs — drives all four incidents down their correct path and prints
// the verdicts. `npm run prove` — the same engine the browser lab drives.

import { INCIDENTS, getIncident } from '../public/incidents.mjs';
import { createSession, runCommand, submitDiagnosis, applyFix, gradeSession } from '../public/triage.mjs';

const PATHS = {
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

const mark = (ok) => (ok ? 'PASS' : 'FAIL');
const lines = [];
let allOk = true;

for (const inc of INCIDENTS) {
  const path = PATHS[inc.id];
  const incident = getIncident(inc.id);
  const s = createSession(incident);

  for (const c of path.commands) runCommand(s, incident, c);
  const evidenceRead = s.log.filter((e) => e.kind === 'command' && e.evidence).length;
  lines.push([`INC-${inc.order}`, `read ${s.log.length} command(s), ${evidenceRead} evidence-bearing`]);

  const d = submitDiagnosis(s, incident, path.diagnosis);
  lines.push([`INC-${inc.order}`, `${mark(d.correct)} diagnosis "${path.diagnosis}" accepted`]);

  for (const f of path.fixes) {
    const r = applyFix(s, incident, f);
    lines.push([`INC-${inc.order}`, `${mark(r.ok)} ${f}`]);
  }

  const g = gradeSession(s, incident);
  const ok = g.status === 'pass' && s.resolved && g.faults.length === 0;
  allOk = allOk && ok;
  lines.push([`INC-${inc.order}`, `${mark(ok)} graded ${g.status}${g.score != null ? ` · score ${g.score}` : ''}`]);
}

console.log('\n  K8s Triage Lab — four incident proofs\n');
for (const [m, line] of lines) console.log(`  ${m.padEnd(7)} ${line}`);
console.log(`\n  ${allOk ? 'ALL PASS' : 'FAILURES PRESENT'}\n`);
process.exit(allOk ? 0 : 1);
