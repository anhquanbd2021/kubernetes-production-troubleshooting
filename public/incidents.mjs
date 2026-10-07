// incidents.mjs — the four scenario definitions for K8s Triage Lab.
// Pure data: commands, outputs, diagnosis options, fixes, grading metadata.
// Every name, address, and revision below is a fixture — nothing real.

export const INCIDENTS = [
  {
    id: 'pending-pod',
    order: 1,
    tag: 'scheduling',
    title: 'payments-api stuck Pending',
    symptom: 'payments-api-7d9c4f6b8-x2vqm has been Pending for 22 minutes. The deploy window is closing.',
    context: 'namespace shop · 3 worker nodes · the container has never started',
    commands: [
      {
        id: 'get-pods',
        label: 'kubectl get pods -n shop',
        evidence: false,
        output:
`NAME                             READY   STATUS    RESTARTS   AGE
payments-api-7d9c4f6b8-x2vqm     0/1     Pending   0          22m
storefront-6f7c8d9b5-k4ntp       1/1     Running   0          3d
orders-worker-59b7d6f8c7-m2rjx   1/1     Running   0          3d`,
      },
      {
        id: 'logs',
        label: 'kubectl logs payments-api-7d9c4f6b8-x2vqm -n shop',
        evidence: false,
        output:
`Error from server (BadRequest): container "payments-api" in pod
"payments-api-7d9c4f6b8-x2vqm" is waiting to start: PodInitializing

(nothing ever ran — a Pending pod has no logs)`,
      },
      {
        id: 'describe-pod',
        label: 'kubectl describe pod payments-api-7d9c4f6b8-x2vqm -n shop',
        evidence: true,
        output:
`Name:             payments-api-7d9c4f6b8-x2vqm
Namespace:        shop
Node:             <none>
Status:           Pending
Containers:
  payments-api:
    Image:    registry.example.com/shop/payments-api:2.4.1
    Requests:
      cpu:        3800m
      memory:     512Mi
Events:
  Type     Reason            Age   From               Message
  ----     ------            ----  ----               -------
  Warning  FailedScheduling  22m   default-scheduler  0/3 nodes are available: 3 Insufficient cpu. preemption: 0/3 nodes are available: 3 No preemption victims found for incoming pod.
  Warning  FailedScheduling  20m   default-scheduler  0/3 nodes are available: 3 Insufficient cpu.`,
      },
      {
        id: 'describe-node',
        label: 'kubectl describe node ip-10-0-3-47.ec2.internal',
        evidence: true,
        output:
`Name:               ip-10-0-3-47.ec2.internal
Roles:              worker
Capacity:
  cpu:                4
  memory:             8Gi
Allocatable:
  cpu:                3920m
  memory:             7708Mi
Allocated resources:
  cpu requests        3890m (99%)
  memory requests     4210Mi (55%)
Taints:             <none>`,
      },
      {
        id: 'get-pvc',
        label: 'kubectl get pvc -n shop',
        evidence: false,
        output:
`NAME             STATUS   VOLUME      CAPACITY   ACCESS MODES   AGE
payments-cache   Bound    pv-0f41a2   1Gi        RWO            40d`,
      },
    ],
    diagnoses: [
      { id: 'requests', correct: true,
        label: 'requests.cpu 3800m fits nowhere — every node is at ~99% allocated (Insufficient cpu)' },
      { id: 'taint', correct: false,
        label: 'A node taint is repelling the pod — it needs a toleration' },
      { id: 'pvc', correct: false,
        label: 'The PersistentVolumeClaim is unbound — no volume matches it' },
      { id: 'image', correct: false,
        label: 'The image tag is wrong — an ErrImagePull is hiding in the Events' },
    ],
    fixes: [
      {
        id: 'patch-requests', resolves: true,
        label: 'kubectl patch deploy payments-api -- requests.cpu: 3800m → 500m',
        output:
`deployment.apps/payments-api patched
payments-api-7d9c4f6b8-x2vqm   Bound to ip-10-0-3-112.ec2.internal
NAME                           READY   STATUS    RESTARTS   AGE
payments-api-7d9c4f6b8-x2vqm   1/1     Running   0          11s`,
      },
      {
        id: 'add-toleration', resolves: false,
        label: 'kubectl patch deploy — add a toleration for node taints',
        output:
`deployment.apps/payments-api patched
…still Pending. describe node shows Taints: <none> —
there was never a taint to tolerate.`,
      },
      {
        id: 'delete-pod', resolves: false,
        label: 'kubectl delete pod — force a fresh reschedule',
        output:
`pod "payments-api-7d9c4f6b8-x2vqm" deleted
payments-api-7d9c4f6b8-t9wkr created → Pending
(the replacement carries the same 3800m request — same refusal)`,
      },
    ],
    takeaway: 'Pending is a scheduling failure, not a runtime failure — describe events name the blocker.',
  },

  {
    id: 'crashloop',
    order: 2,
    tag: 'runtime',
    title: 'orders-worker in CrashLoopBackOff',
    symptom: 'orders-worker restarts every couple of minutes. RESTARTS is 14 and climbing.',
    context: 'namespace shop · container starts, exits, kubelet backs off · the crash window is short',
    commands: [
      {
        id: 'get-pods',
        label: 'kubectl get pods -n shop',
        evidence: false,
        output:
`NAME                             READY   STATUS             RESTARTS     AGE
orders-worker-59b7d6f8c7-m2rjx   0/1     CrashLoopBackOff   14 (3m ago)  38m
storefront-6f7c8d9b5-k4ntp       1/1     Running            0            3d`,
      },
      {
        id: 'logs',
        label: 'kubectl logs orders-worker-59b7d6f8c7-m2rjx -n shop',
        evidence: true,
        output:
`2024-05-14T09:41:02Z  INFO   orders-worker 1.9.0 booting
2024-05-14T09:41:02Z  INFO   loading config: configmap/orders-config
2024-05-14T09:41:03Z  FATAL  config: required environment variable QUEUE_URL is not set
(process exited — this is the *current* attempt; it will crash the same way)`,
      },
      {
        id: 'logs-previous',
        label: 'kubectl logs orders-worker-59b7d6f8c7-m2rjx -n shop --previous',
        evidence: true,
        output:
`2024-05-14T09:38:57Z  INFO   orders-worker 1.9.0 booting
2024-05-14T09:38:57Z  INFO   loading config: configmap/orders-config
2024-05-14T09:38:58Z  FATAL  config: required environment variable QUEUE_URL is not set
stream closed: EOF  (terminated, exit status 1 — same crash, 14 times in a row)`,
      },
      {
        id: 'describe-pod',
        label: 'kubectl describe pod orders-worker-59b7d6f8c7-m2rjx -n shop',
        evidence: true,
        output:
`Name:         orders-worker-59b7d6f8c7-m2rjx
Namespace:    shop
Containers:
  orders-worker:
    Image:      registry.example.com/shop/orders-worker:1.9.0
    State:      Waiting   Reason: CrashLoopBackOff
    Last State: Terminated
      Reason:     Error        ← not OOMKilled
      Exit Code:  1
      Started:    09:38:57Z    Finished: 09:38:58Z
    Restart Count: 14
    Liveness:     http-get :8080/healthz delay=10s period=10s
Events:
  Type    Reason   Age   From     Message
  ----    ------   ----  ----     -------
  Warning BackOff  2m    kubelet  Back-off restarting failed container`,
      },
      {
        id: 'describe-deploy',
        label: 'kubectl describe deploy orders-worker -n shop',
        evidence: false,
        output:
`Name:         orders-worker
Pod Template:
  Containers:
   orders-worker:
    Environment:
      QUEUE_URL:  <set from configMapKeyRef 'orders-config' key 'queue-url'>  ← key reference
      LOG_LEVEL:  info`,
      },
      {
        id: 'get-cm',
        label: 'kubectl get configmap orders-config -n shop -o yaml',
        evidence: true,
        output:
`apiVersion: v1
kind: ConfigMap
metadata:
  name: orders-config
  namespace: shop
data:
  queue-host: rabbitmq.shop.svc.cluster.local   ← key exists…
  log-level:  info
  (no key named "queue-url" — the Deployment references a key that was never created)`,
      },
    ],
    diagnoses: [
      { id: 'config', correct: true,
        label: 'Config bug — the app exits 1 because env QUEUE_URL maps to a ConfigMap key that does not exist' },
      { id: 'oom', correct: false,
        label: 'OOMKilled — the memory limit is too small for the workload' },
      { id: 'probe', correct: false,
        label: 'The liveness probe is killing it before startup finishes' },
      { id: 'image', correct: false,
        label: 'The image is bad — this will become ImagePullBackOff' },
    ],
    fixes: [
      {
        id: 'patch-cm', resolves: true,
        label: 'kubectl patch configmap orders-config — add the missing queue-url key',
        output:
`configmap/orders-config patched
orders-worker-59b7d6f8c7-m2rjx  → Running (restart count frozen at 14)
INFO queue consumer connected to rabbitmq.shop.svc.cluster.local`,
      },
      {
        id: 'raise-memory', resolves: false,
        label: 'kubectl patch deploy — memory limit 256Mi → 1Gi',
        output:
`deployment.apps/orders-worker patched
…still exits 1. Last State was Terminated/Error, never OOMKilled —
memory was never the cause.`,
      },
      {
        id: 'probe-delay', resolves: false,
        label: 'kubectl patch deploy — liveness initialDelaySeconds 10 → 60',
        output:
`deployment.apps/orders-worker patched
…still crashes at t+1s. The probe never even fired —
the process dies on its own before any probe runs.`,
      },
      {
        id: 'rollback', resolves: false,
        label: 'kubectl rollout undo deploy/orders-worker',
        output:
`deployment.apps/orders-worker rolled back to revision 8
…still CrashLoopBackOff — the missing ConfigMap key
was never part of the rollout.`,
      },
    ],
    takeaway: 'CrashLoopBackOff has a paper trail — logs --previous plus the exit code separates app, config, limits, and probes.',
  },

  {
    id: 'etcd-nospace',
    order: 3,
    tag: 'control-plane',
    title: 'etcd storage full — writes frozen',
    symptom: 'kubectl apply times out, new Deployments stall, Secrets will not create — but kubectl get still works.',
    context: '3-node control plane · etcd 3.5.9 · quota-backend-bytes = 2 GiB',
    commands: [
      {
        id: 'get-nodes',
        label: 'kubectl get nodes',
        evidence: false,
        output:
`NAME                            STATUS   ROLES           AGE   VERSION
ip-10-0-1-11.ec2.internal       Ready    control-plane   90d   v1.29.4
ip-10-0-1-12.ec2.internal       Ready    control-plane   90d   v1.29.4
ip-10-0-1-13.ec2.internal       Ready    control-plane   90d   v1.29.4
ip-10-0-3-47.ec2.internal       Ready    worker          90d   v1.29.4

(everything Ready — the cluster *looks* healthy)`,
      },
      {
        id: 'apply-canary',
        label: 'kubectl apply -f canary.yaml',
        evidence: true,
        output:
`Error from server: error when creating "canary.yaml":
etcdserver: request timed out

(writes hang; reads keep working — the signature of a frozen store)`,
      },
      {
        id: 'healthz-etcd',
        label: 'kubectl get --raw=/healthz/etcd',
        evidence: true,
        output:
`{"health":"false","reason":"ALARM NOSPACE"}`,
      },
      {
        id: 'endpoint-status',
        label: 'etcdctl --endpoints=https://etcd-0.etcd.svc.cluster.local:2379 endpoint status -w table',
        evidence: false,
        output:
`+-------------------------------+------------------+---------+---------+-----------+
|           ENDPOINT            |        ID        | VERSION | DB SIZE | IS LEADER |
+-------------------------------+------------------+---------+---------+-----------+
| etcd-0.etcd.svc.cluster.local | 8e9e05c52164694d |  3.5.9  | 2.1 GB  |   true    |
| etcd-1.etcd.svc.cluster.local | 7c4d12b9a03fe811 |  3.5.9  | 2.1 GB  |   false   |
| etcd-2.etcd.svc.cluster.local | 2b8f60e4d17a9c02 |  3.5.9  | 2.0 GB  |   false   |
+-------------------------------+------------------+---------+---------+-----------+

(DB size is at the 2 GiB backend quota)`,
      },
      {
        id: 'alarm-list',
        label: 'etcdctl alarm list',
        evidence: true,
        output:
`memberID:8211f1d0f64f3269 alarm:NOSPACE
memberID:2329a4bc07e16f55 alarm:NOSPACE
memberID:59d0a58b3fa99c20 alarm:NOSPACE

(NOSPACE on every member — writes are rejected cluster-wide)`,
      },
    ],
    diagnoses: [
      { id: 'nospace', correct: true,
        label: 'etcd hit its backend quota — the NOSPACE alarm rejects writes while reads still serve' },
      { id: 'apiserver', correct: false,
        label: 'kube-apiserver is down — restart it' },
      { id: 'rbac', correct: false,
        label: 'RBAC is denying the writes' },
      { id: 'net', correct: false,
        label: 'A network partition cuts workers off from the control plane' },
    ],
    fixSequence: ['defrag', 'compact', 'disarm'],
    fixes: [
      {
        id: 'defrag', resolves: false,
        label: 'etcdctl defrag — reclaim deleted-object space',
        output:
`Finished defragmenting etcd member[https://etcd-0.etcd.svc.cluster.local:2379]
Finished defragmenting etcd member[https://etcd-1.etcd.svc.cluster.local:2379]
Finished defragmenting etcd member[https://etcd-2.etcd.svc.cluster.local:2379]
DB size 2.1 GB → 960 MB on every member.`,
      },
      {
        id: 'compact', resolves: false, requires: ['defrag'],
        refusedOutput: 'compaction rewrites live keys onto a fragmented file — defrag first so there is room to work.',
        label: 'etcdctl compact 1843204 — drop old revision history',
        output:
`compacted revision 1843204
backend no longer grows on every write — headroom restored.`,
      },
      {
        id: 'disarm', resolves: true, requires: ['defrag', 'compact'],
        refusedOutput: 'alarm disarm refused: NOSPACE is still active — disarming now re-alarms on the next write. Free space first: defrag → compact.',
        label: 'etcdctl alarm disarm — clear NOSPACE now that space is free',
        output:
`memberID:8211f1d0f64f3269 alarm:NOSPACE disarmed
memberID:2329a4bc07e16f55 alarm:NOSPACE disarmed
memberID:59d0a58b3fa99c20 alarm:NOSPACE disarmed
kubectl apply -f canary.yaml → deployment.apps/canary created
(writes accepted again)`,
      },
      {
        id: 'restart-apiserver', resolves: false,
        label: 'systemctl restart kube-apiserver on each control-plane node',
        output:
`kube-apiserver restarted on all three members
…apply still times out — the alarm lives in etcd,
not in the apiserver process.`,
      },
    ],
    takeaway: 'A full etcd freezes writes while reads still work — defrag, compact, disarm, in that order.',
  },

  {
    id: 'ingress-404',
    order: 4,
    tag: 'routing',
    title: '404 through the Ingress',
    symptom: 'Users get 404 Not Found at https://shop.example.com/checkout — pods are Running, the cluster is healthy.',
    context: 'namespace shop · nginx ingress · the request arrives and gets routed wrong — walk the chain',
    commands: [
      {
        id: 'get-ingress',
        label: 'kubectl get ingress -n shop',
        evidence: false,
        output:
`NAME       CLASS   HOSTS               ADDRESS         PORTS   AGE
shop-web   nginx   shop.example.com    203.0.113.44    80      40d`,
      },
      {
        id: 'describe-ingress',
        label: 'kubectl describe ingress shop-web -n shop',
        evidence: false,
        output:
`Name:      shop-web
Namespace: shop
Rules:
  Host               Path   Backends
  ----               ----   --------
  shop.example.com
                     /checkout   web:80 (<error: endpoints "web" not found>)`,
      },
      {
        id: 'get-svc',
        label: 'kubectl get svc web -n shop',
        evidence: false,
        output:
`NAME   TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
web    ClusterIP   198.51.100.77   <none>        80/TCP    40d

(service exists — so far so good)`,
      },
      {
        id: 'describe-svc',
        label: 'kubectl describe svc web -n shop',
        evidence: true,
        output:
`Name:              web
Namespace:         shop
Selector:          app=web
Type:              ClusterIP
Port:              http  80/TCP
TargetPort:        8080/TCP
Endpoints:         <none>   ← the chain breaks here
Session Affinity:  None`,
      },
      {
        id: 'get-endpoints',
        label: 'kubectl get endpoints web -n shop',
        evidence: true,
        output:
`NAME   ENDPOINTS   AGE
web    <none>      40d

(empty — no pod currently matches the Service selector)`,
      },
      {
        id: 'get-pods-labels',
        label: 'kubectl get pods -n shop --show-labels',
        evidence: true,
        output:
`NAME                           READY   STATUS    RESTARTS   AGE   LABELS
web-6c9f8d5b7-qv4md            1/1     Running   0          3d    app=web-frontend,tier=ui
web-6c9f8d5b7-x8hjb            1/1     Running   0          3d    app=web-frontend,tier=ui
orders-worker-59b7d6f8c7-m2rjx 1/1     Running   0          3d    app=orders-worker

(selector wants app=web; the pods carry app=web-frontend — zero matches)`,
      },
      {
        id: 'check-app',
        label: 'kubectl exec web-6c9f8d5b7-qv4md -n shop -- curl -s -o /dev/null -w "%{http_code}" localhost:8080/checkout',
        evidence: false,
        output:
`200

(the app serves /checkout fine — the request just never reaches it)`,
      },
    ],
    diagnoses: [
      { id: 'selector', correct: true,
        label: 'Selector mismatch — Service selects app=web but pods are labeled app=web-frontend, so Endpoints is empty' },
      { id: 'ingress-rule', correct: false,
        label: 'The Ingress rule is wrong — /checkout points at the wrong Service' },
      { id: 'targetport', correct: false,
        label: 'targetPort 8080 does not match the container port' },
      { id: 'approute', correct: false,
        label: 'The app itself has no /checkout route' },
    ],
    fixes: [
      {
        id: 'fix-selector', resolves: true,
        label: 'kubectl patch svc web -- selector: app=web → app=web-frontend',
        output:
`service/web patched
kubectl get endpoints web → 192.0.2.17:8080, 192.0.2.29:8080
GET https://shop.example.com/checkout → 200 OK`,
      },
      {
        id: 'fix-port', resolves: false,
        label: 'kubectl patch svc web -- targetPort: 8080 → 80',
        output:
`service/web patched
Endpoints still <none> — ports were never the problem;
a Service with zero endpoints cannot forward anything.`,
      },
      {
        id: 'edit-ingress', resolves: false,
        label: 'kubectl edit ingress — repoint /checkout at service storefront',
        output:
`ingress.networking.k8s.io/shop-web edited
still 404 — and now the rule points at the wrong backend on top of it.`,
      },
      {
        id: 'restart-pods', resolves: false,
        label: 'kubectl rollout restart deploy/web -n shop',
        output:
`deployment.apps/web restarted
new pods carry the same app=web-frontend labels —
Endpoints still <none>.`,
      },
    ],
    takeaway: 'A 404 means the request reached something — trace Ingress → Service → Endpoints → Pod labels → app routes.',
  },
];

export function getIncident(id) {
  return INCIDENTS.find((i) => i.id === id);
}
