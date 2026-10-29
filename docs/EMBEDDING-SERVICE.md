# Shared embedding service

Last recorded infrastructure changes: 2026-10-24. Documentation reconciled with
application 0.28.0 on 2026-10-29; this review did not inspect/reconfigure the LXC.
Ollama01 is the shared TowerCube GPU service. Mimers Brain switched embeddings on
2026-10-22. Storage System uses its vision fallback, but **not production embeddings**.
The frozen embedding comparison passed; the native authenticated route and independent
application decision acceptance remain open. See [Semantic runtime](SEMANTIC-RUNTIME.md).

The initial provisioning/GPU probes below are dated evidence. Their old resource
measurements are not current capacity/latency guarantees. The latest recorded resource
settings are 16 GiB container RAM, 14 GiB service memory and two loaded models.

## Vision model for Storage System

Added 2026-10-24 with the owner's approval, on the condition that Mimers Brain keeps working.

- Model `qwen3-vl:8b-instruct-16k`: `qwen3-vl:8b-instruct` (digest starts `70e58e37beb1`, 6.2 GB) with
  `PARAMETER num_ctx 16384`, so up to six photos and the instructions fit. The thinking variant
  `qwen3-vl:8b` was tried first and removed: it spent its answer budget on reasoning.
- `OLLAMA_MAX_LOADED_MODELS=2` (drop-in `40-models.conf`) keeps bge-m3 loaded beside the vision
  model; both report 100% GPU, about 10 of 20 GB VRAM together.
- Memory: the container now has 16 GiB and the service `MemoryMax=14G` (drop-in `50-memory.conf`).
  The old 6 GiB limit killed the whole service when the vision model loaded (peak 7.6 GB, mmap is
  disabled under memory pressure); one Mimers Brain embedding request failed during that restart.
- Nginx: `POST /v1/chat/completions` is exposed only for the Storage System key (map
  `/etc/nginx/chat-auth.map`, 403 for other valid keys), with a 24 MiB body limit and a 180 s read
  timeout. Embeddings keep their 2 MiB limit. The Mimers Brain key still lists models and embeds.
- The previous configuration is saved in the container under `/root/config-backup-20261024-220557`.
- First request after a restart takes about 9-10 s (load plus CUDA JIT); later requests about
  10-20 s per box with real photos.
- In the 15-box evaluation (see HISTORY 0.21.0-dev) the model answered every box once the app sent a
  strict JSON schema with the exact photo count and non-empty name and summary.

## Instance

| Setting | Value |
| --- | --- |
| Host / CT | TowerCube / 141 |
| Hostname | Ollama01 |
| Address | 10.0.0.47/24 |
| Gateway / DNS | 10.0.0.1 |
| Network interface MAC | BC:24:11:1C:8A:D7 |
| UniFi identity | CT - Ollama 01; fixed-IP reservation verified |
| OS | Ubuntu 26.04 LTS, unprivileged LXC |
| Allocation (last changed 2026-10-24) | 4 vCPU, 16 GiB RAM, 1 GiB swap, 40 GiB disk |
| Current storage | TowerCube `local-lvm` |
| Retained build copy | MiniCube CT 141 on `nvme`, stopped with `onboot: 0` |
| Operator | snille, SSH keys; Webmin on HTTPS port 10000 |
| API base | `http://10.0.0.47:11434/v1` |

The address is outside the LAN's 10.0.0.51-199 DHCP pool. UniFi known clients
and reservations, existing Proxmox configurations on all five nodes and an
active conflict probe were checked before creation. The owner approved this
exact address. No provisioning permissions or existing guests were changed.

## Runtime

Native Ollama 0.40.6 runs under a dedicated service account through systemd,
without Docker. The official Linux amd64 archive was verified against release
SHA-256 `c164ab8b1b28e2a247c29719b8e404c423c5b83ae64c3ab4e59d50c7ff7fc5e0`.
The recorded release lives under `/opt/ollama/0.40.6`; models live under
`/var/lib/ollama/models`. Service CPU quota is four CPUs; the 2026-10-24 change
raised its memory limit to 14 GiB inside the 16 GiB LXC. Cloud features are disabled.

The service permits two loaded models since the vision deployment. A startup
warm-up unit preloads embeddings; the first vision request can still incur loading/JIT. Keep-alive is indefinite. `ollama ps` reports
100% GPU on TowerCube. The original CPU build was verified on MiniCube.

`bge-m3:cpu4` uses `PARAMETER num_thread 4`; the name is preserved for Mimers
Brain compatibility and does not itself force CPU-only execution. Its digest
starts `9e26be65788c`, matching the existing Mimer Ollama instance. The base
model digest starts `790764642607`, with weight blob SHA-256
`daec91ffb5dd0c27411bd71f29932917c49cf529a641d0168496c3a501e3062c`.
Embeddings have 1024 dimensions. The observed loaded context is 4096 tokens.

The Storage System comparison used Hugging Face BGE-M3 through Sentence
Transformers. This Ollama artifact/runtime is a separate deployment candidate;
its model name and dimensionality alone do not establish equivalent retrieval.
The frozen comparison was repeated successfully on 2026-10-22 (see below); that
does not select application thresholds or permit semantic activation.

## API boundary

Native Ollama listens only on loopback. Nginx exposes the LAN API with separate
Bearer keys for Mimers Brain and Storage System. Credentials are maintained
outside this repository and are never included in reports or configuration
examples. The applications use separate keys/settings; Mimers Brain's approved cutover is
recorded below and Storage System's later vision route is described above.

The recorded routes are `GET /v1/models`, `POST /v1/embeddings` (2 MiB body) and,
since 2026-10-24, Storage-System-key-only `POST /v1/chat/completions` (24 MiB).
Requests without a valid key return 401. Native tags/embed routes returned 404 in
the last recorded check; verify them from the deployment before native runtime use.
Model management is available locally through SSH; proxy timeouts are bounded. The endpoint uses LAN HTTP;
it is not a public Internet service.

## TowerCube migration and GPU configuration

The stopped MiniCube instance was backed up to
`NAS:backup/vzdump-lxc-141-2026_10_21-20_59_44.tar.zst` and restored as CT 141
on TowerCube `local-lvm`. The 2.71 GiB archive restored 4.3 GiB of data. The
source stays stopped with automatic start disabled; never start both copies
with their identical IP/MAC. The target has automatic start enabled and is
included in the existing Sunday 01:00 NAS backup (last two backups, stop mode).

Seven NVIDIA character devices use Proxmox `dev0`-`dev6`, guest group 44
(`video`). The Ollama unit has `SupplementaryGroups=video`. Matching host CUDA,
NVML, PTX compiler, NVVM and GPU compiler libraries are mounted read-only under
`/usr/local/nvidia/lib64`, with `nvidia-smi` under `/usr/local/bin`. The service
and loader search this library directory. The host driver and other GPU guests
were not changed. Recheck library mount sources after host driver updates.

Offline-created directories in this unprivileged rootfs need mapped root
ownership 100000:100000. Host-root ownership initially prevented creation of
bind targets; correcting only the new directories/files resolved startup.

The pinned runtime showed multi-second delays for some new embedding input
lengths. Setting `GGML_CUDA_DISABLE_GRAPHS=1` in the Ollama unit removed those
outliers in the measured varied-input test while retaining GPU execution and
identical comparison vectors. Keep this deployment-specific workaround;
removing the variable restores defaults (setting it to `0` does not remove it).
The [upstream guard](https://github.com/ggml-org/llama.cpp/blob/master/ggml/src/ggml-cuda/common.cuh)
checks the variable's presence. This is not a general recommendation for other
GPU workloads.

Verified on 2026-10-22: with graphs disabled, short new inputs (for example 8,
11 or 15 tokens) still took 2.4-4.4 seconds once. Each slow request added one
file to the CUDA JIT cache in `/var/lib/ollama/.nv/ComputeCache`; repeats were
fast. The CUDA backend ships kernels that the driver JIT-compiles for this GPU
on first use of each kernel variant. The cache persists across service restarts
and reboots. Drop-in `30-cuda-cache.conf` sets `CUDA_CACHE_MAXSIZE=4294967296`
(the maximum) so entries are never evicted. A one-time sweep sent one request
per input length from 1 to 4094 tokens; only lengths of 8 and 11 tokens still
compiled (about 3 s each). The cache then held 28 entries (72 MiB). After a
service restart, five realistic queries took 26-100 ms and batches of 2-16
texts took 38-233 ms; no new cache entries appeared. Across the sweep, latency
rose from about 34 ms near 500 tokens to about 127 ms at 4000 tokens (worst
case 0.20 s).

A new NVIDIA driver version invalidates this cache. After a host driver update,
or if `ComputeCache` is deleted, rerun the sweep script
`data/infrastructure/ollama01/jit-sweep.py` before applications depend on low
first-request latency.

## Initial provisioning/GPU verification (2026-10-21/22)

- Standard provisioning verifies resources, reboot, networking, timezone,
  operator SSH/sudo, updates, Webmin and Postfix. Exactly one standard completion
  email with the installation log was accepted by the configured mail relay.
- Both client keys list models and return finite unit-normalized 1024-dimensional
  batch embeddings; missing/wrong keys and blocked native routes were checked.
- The existing `valv-app` container reaches the new endpoint and generated three
  synthetic comparison vectors without changing application settings. Against
  its current Ollama vectors, minimum cosine similarity was 0.99999966 and
  maximum absolute component difference was about 0.0000933. This is a smoke
  test, not a full recall, threshold or long-input evaluation.
- Portainer01 reaches the endpoint and receives the expected 401 without a key.
  This verifies the network route, not a deployed Storage System integration.
- A warm two-text API request from the laptop took about 104 ms after an initial
  load/request of about 1.6 seconds. These are individual observations, not a
  latency distribution or a CPU/GPU comparison.
- The local English UTF-8 locale is generated. Both service and startup warm-up
  are enabled and checked after reboot. GPU execution survives a target reboot.

- Both existing Plex/OpenWebUI guests still see the same RTX card and driver
  595.80. The new worker used approximately 844 MiB GPU memory at inspection.
- With CUDA graphs disabled, seven varied inputs (23-1500 characters), each
  requested twice through authenticated LAN HTTP, took 16.64-100.16 ms. Earlier
  graph-enabled first-input requests took up to 11.78 seconds. This is a small
  probe, not a throughput or concurrency benchmark.
- After a further LXC reboot with the final setting, three different inputs
  took 58-171 ms, and GPU inference, preload and all base services were active.
- Three Mimer CPU/new-GPU vectors have minimum cosine similarity 0.99999966
  and maximum component difference about 0.0000943, unchanged by the graph
  setting. At this initial probe full recall/threshold acceptance was pending;
  the later Mimers Brain cutover below records its completed comparison. No
  existing application settings were changed during this initial probe.
- Both API keys, operator credential and Ollama identity match their canonical
  copies after restore. API authentication and management-route rejection pass.
- The Proxmox Note was explicitly approved, written through Notes MCP and read
  back. It records purpose, GPU/model, resources, endpoints, access, weekly
  backup policy and the stopped source-copy boundary.
- GPU monitoring works for the operator `snille`: `nvidia-smi` detects the card,
  and a fresh btop 1.4.6 shows its utilization, memory and temperature. The owner
  confirmed that restarting btop resolved the missing GPU row. No driver,
  permission or service change was needed for this display issue.

Private provisioning scripts, API verification and comparison reports are under
ignored `data/infrastructure/ollama01/` on the development machine. The original
search-evaluation data is preserved separately. Installation logs are on the LXC
at `/var/log/infrastructure-gateway-install.log` and `/var/log/ollama-install.log`.

## Mimers Brain cutover

On 2026-10-22 a database backup (`valv-20261022-2217.sql.gz`) was taken and
a read-only comparison ran inside `valv-app` against both endpoints. Over 51
recall questions, CPU and GPU gave identical results: 80% hit@1, 93% hit@5,
MRR 0.853, and at the 0.55 hook floor 93% hit, 7% off target, 0% noise. Over
334 memories the lowest cosine between stored CPU vectors and new GPU vectors
was 0.99977. The pairs at or above the contradiction floor (467 at 0.65) and
the duplicate floor (5 at 0.82) were the same set, with a largest pair-score
difference of 0.0027. Embedding all memories took 790 s on CPU and 7 s on GPU.

The owner approved the switch. Mimer's Ollama provider now points at
`http://10.0.0.47:11434` with its own key; the model stays `bge-m3:cpu4`, so
no re-embedding happened and the thresholds stay the same. Role test, recall
hint and new memories were verified against Ollama01, and the CPU instance
received no further requests. The CPU Ollama container on CT 109 keeps running
as the fallback.

## Next steps

The Storage System frozen endpoint comparison passed on 2026-10-22: 22/24
top-1, 24/24 top-5, unchanged first-ranked boxes and 25/30 correct decisions.
See SEMANTIC-EVALUATION.md for saved evidence and HTTP timings. This exact
OpenAI-compatible route silently truncates at 2048 tokens, confirmed by usage
and identical vectors after changing the discarded tail. The current corpus
has a maximum of 869 tokens, so it fits. The observed loaded context of 4096
does not establish the route's effective input limit.

1. The optional 0.10.2-dev Storage System runtime now uses native Ollama with
   `truncate: false` and immutable digest checks; oversized input rejection is
   verified live. The last recorded authenticated gateway check returned 404 for native tags
   and embed paths, so the tested temporary SSH tunnel does not establish the
   deployment route. Validate an approved authenticated native route and complete
   application/failure acceptance before activation. See SEMANTIC-RUNTIME.md.
2. Collect untouched questions for the voice policy. GPU/server acceptance does
   not enable semantic search or verify speech. The two apps retain separate data.

References: [official Linux installation](https://docs.ollama.com/linux),
[embedding API](https://docs.ollama.com/api/embed),
[GPU inspection and model keep-alive](https://docs.ollama.com/faq), and
[the pinned release](https://github.com/ollama/ollama/releases/tag/v0.40.6).
