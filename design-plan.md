# Artifact plan — fill every <…> before building

type: web
subject: K8s Triage Lab — a simulated Kubernetes cluster where four production incidents (Pending pod, CrashLoopBackOff, etcd storage full, 404 through Ingress) are each diagnosed by issuing kubectl-style commands, reading the output, picking a diagnosis, and applying the fix while the engine grades order of operations
audience: engineers and SREs who run Kubernetes in production, readers of the companion LinkedIn article on four production failures
job: let the visitor work each incident like a real on-call drill — run commands, read events, diagnose, fix — and get graded on whether they read before they touched
constraints: zero runtime dependencies, pure Node stdlib + browser ES modules; static host with /health and /version; dark terminal aesthetic that still reads as a designed product; all fixture data obviously fake; works at 390 px width; diagnosis logic must be a pure ES module importable by node:test
direction: terminal-ledger
direction_reason: a kubectl triage lab is exactly CLI-flavored technical tooling — near-black ground, phosphor green accent, monospace details fit "read kubectl output, then act" without pretending to be a real terminal
accent: keep
accent_reason: the direction's phosphor green (#22C55E) is the terminal-ledger signature — it doubles as the "command accepted / incident resolved" signal color
headline: Four incidents are live in this cluster. Triage them.
primary_action: Start triage — pick an incident
bold_moment: the incident console itself — a wide phosphor-on-black output pane where each issued command drops realistic kubectl output, framed by a score badge
sections:
- hero with incident brief and safety note (simulated cluster, all fixtures)
- cluster-status strip: four incident cards with live state badges (Pending, CrashLoopBackOff, NOSPACE alarm, 404)
- triage workspace: incident picker, command console, output pane, diagnosis options, fix actions, grading badge
- "what you should have learned" recap grid tying each incident back to the article's decision trees
- footer links to guide and source
layout:
```text
nav | hero (headline + lede + warning)          |
[incident cards x4: name + symptom + state badge]
[triage workspace: picker row | console left, output right]
  console: command buttons -> appended output
  diagnosis radio options -> fix buttons -> grade
[recap grid x4: failure -> first command -> fix]
[footer: guide link, source link]
```
mobile_layout: single column — incident cards stack, console and output stack vertically with output below, command buttons wrap to full-width rows ≥44 px tall
tablet_layout: two-column workspace collapses at ~900 px; incident cards go 2×2
responsive: fluid max-width container, panels stack under 900 px, command buttons keep ≥44 px tap targets, output pane scrolls internally rather than widening the page
generic_check: No, every panel is a real kubectl drill with fixture cluster state (node names, events, exit codes, etcd revisions), and grading reacts to actual command order
not_doing:
- not a real cluster or shell — commands are scenario fixtures, no arbitrary input, no network calls
- not a terminal emulator skin — it is a designed lab page that happens to render monospace output
