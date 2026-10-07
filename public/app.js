// app.js — wires the triage engine to the lab UI.
// All logic lives in triage.mjs / incidents.mjs; this file only renders.

import { INCIDENTS, getIncident } from './incidents.mjs';
import { createSession, runCommand, submitDiagnosis, applyFix, gradeSession, gradeSummary } from './triage.mjs';

const $ = (id) => document.getElementById(id);
const picker = $('incident-picker');
const symptomEl = $('ws-symptom');
const cmdList = $('cmd-list');
const diagList = $('diag-list');
const diagSubmit = $('diag-submit');
const fixList = $('fix-list');
const term = $('term');
const gradeBadge = $('grade-badge');
const gradeDetail = $('grade-detail');
const wsTitle = $('ws-title');

let incident = null;
let session = null;

function appendTerm(text) {
  const trimmed = term.textContent.trimEnd();
  term.textContent = `${trimmed}\n\n${text}`;
  term.scrollTop = term.scrollHeight;
}

function prompt(text) { appendTerm(`triage-lab ~ $ ${text}`); }
function out(text) { appendTerm(text); }
function note(text) { appendTerm(`:: ${text}`); }

function refreshGrade() {
  const g = gradeSession(session, incident);
  gradeBadge.classList.remove('ok', 'bad');
  if (g.status === 'pass') {
    gradeBadge.classList.add('ok');
    gradeBadge.textContent = `resolved · PASS ${g.score}`;
  } else if (g.status === 'fail') {
    gradeBadge.classList.add('bad');
    gradeBadge.textContent = `FAIL — ${g.faults[0].code}`;
  } else {
    gradeBadge.textContent = session.diagnosis ? 'diagnosed — apply the fix' : 'in progress';
  }
  const lines = [
    ...g.faults.map((f) => `✗ ${f.detail}`),
    ...g.notes.map((n) => `· ${n}`),
  ];
  gradeDetail.textContent = g.faults.length || g.notes.length ? lines.join(' ') : '';
  const card = document.querySelector(`.incident-card[data-incident="${incident.id}"]`);
  if (card && session.resolved) {
    const b = card.querySelector('[data-badge]');
    b.textContent = g.status === 'pass' ? 'resolved' : 'resolved · graded fail';
    b.className = `state-badge ${g.status === 'pass' ? 'ok' : 'bad'}`;
  }
  return g;
}

function renderCommands() {
  cmdList.innerHTML = '';
  for (const c of incident.commands) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmd';
    b.textContent = c.label;
    b.addEventListener('click', () => {
      const r = runCommand(session, incident, c.id);
      if (!r.ok) { note(r.error); return; }
      prompt(r.label);
      out(r.output);
      refreshGrade();
    });
    cmdList.appendChild(b);
  }
}

function renderDiagnoses() {
  diagList.innerHTML = '';
  diagSubmit.disabled = true;
  let picked = null;
  for (const d of incident.diagnoses) {
    const label = document.createElement('label');
    label.className = 'diag-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'diagnosis';
    radio.value = d.id;
    radio.addEventListener('change', () => { picked = d.id; diagSubmit.disabled = !!session.diagnosis; });
    const span = document.createElement('span');
    span.textContent = d.label;
    label.append(radio, span);
    diagList.appendChild(label);
  }
  diagSubmit.onclick = () => {
    if (!picked) return;
    const r = submitDiagnosis(session, incident, picked);
    if (!r.ok) { note(r.error); return; }
    note(`diagnosis: ${r.label}`);
    note(r.correct
      ? 'the evidence supports that. Now apply the fix.'
      : 'the evidence does not support that — grade will reflect it.');
    diagSubmit.disabled = true;
    for (const input of diagList.querySelectorAll('input')) input.disabled = true;
    refreshGrade();
  };
}

function renderFixes() {
  fixList.innerHTML = '';
  for (const f of incident.fixes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmd fix';
    b.textContent = f.label;
    b.addEventListener('click', () => {
      const r = applyFix(session, incident, f.id);
      prompt(f.label);
      out(r.output || r.error);
      if (r.resolved) note(`incident resolved — ${gradeSummary(gradeSession(session, incident))}`);
      refreshGrade();
    });
    fixList.appendChild(b);
  }
}

function selectIncident(id) {
  incident = getIncident(id);
  session = createSession(incident);
  wsTitle.textContent = `INC-${incident.order} · ${incident.title}`;
  symptomEl.textContent = `${incident.symptom} — ${incident.context}`;
  for (const b of picker.querySelectorAll('button')) {
    const active = b.dataset.incident === id;
    b.setAttribute('aria-selected', String(active));
    b.classList.toggle('active', active);
  }
  renderCommands();
  renderDiagnoses();
  renderFixes();
  note(`── INC-${incident.order} ${incident.title} ──`);
  note(incident.symptom);
  refreshGrade();
}

for (const inc of INCIDENTS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.incident = inc.id;
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-selected', 'false');
  b.textContent = `INC-${inc.order} · ${inc.tag}`;
  b.addEventListener('click', () => selectIncident(inc.id));
  picker.appendChild(b);
}
for (const card of document.querySelectorAll('.incident-card')) {
  card.addEventListener('click', () => selectIncident(card.dataset.incident));
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectIncident(card.dataset.incident); }
  });
}
