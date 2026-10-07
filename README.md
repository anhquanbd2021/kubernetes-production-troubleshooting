# K8s Triage Lab

A simulated Kubernetes cluster with four incidents live: a pod stuck **Pending**,
a workload in **CrashLoopBackOff**, a control plane frozen by an **etcd NOSPACE**
alarm, and a **404 through the Ingress**. You issue kubectl-style commands, read
the output, pick the diagnosis, and apply the fix — the engine grades your order
of operations. Companion demo for the article
*4 Kubernetes Failures Every Cluster Eventually Has*.

## Run it

```bash
npm start     # serve the lab on http://localhost:3000
npm test      # engine grading paths + server routes (node:test)
npm run prove # drive all four incidents correctly, print PASS lines
npm run check # tests + prove
```

Zero dependencies — Node stdlib and browser ES modules only. Node ≥20.

## Layout

| Path | What it is |
|---|---|
| `public/incidents.mjs` | The four scenarios: commands, canned outputs, diagnosis options, fixes, required sequences — pure data. |
| `public/triage.mjs` | Pure diagnosis/grading engine (no DOM): session log, diagnosis locking, fix prerequisites, order-of-operations faults. |
| `public/app.js` | Browser wiring — renders incidents, command buttons, the output pane, and the grade badge. |
| `app/server.js` | Static host plus `/health` and `/version`. No API calls; everything runs client-side. |
| `test/` | `node:test` — every incident's clean path passes; wrong order or wrong diagnosis fails; server routes. |
| `scripts/prove.mjs` | CLI proof — plays all four incidents correctly and prints the grade. |

## Grading rules

- Read **evidence-bearing** commands before you diagnose — a right guess with no
  evidence still fails.
- Diagnose before you fix — any fix applied before a submitted diagnosis is a fault.
- Fixes with prerequisites are refused out of order (etcd: defrag → compact →
  disarm) and the attempt is graded.
- Ineffective fixes after a correct diagnosis cost points, not the pass.

All fixture data is fake — `example.com` hosts, RFC 5737 documentation IPs,
invented cluster members. Nothing here is a real system.
