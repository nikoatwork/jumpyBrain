# Focused semantic-index RAM result — 2026-11-03

Retain one small change: Mac ARM64 embedding workers default to two QMD contexts when `QMD_EMBED_PARALLELISM` has no nonempty override. Other platforms, query pools, model, quantization and retrieval depth are unchanged. This addresses model-active indexing memory, not desktop idle memory. [Machine-readable evidence](2026-11-03-focused-index.json) retains identities and final drained samples.

| Matched fresh 10,000-note / 17,000-chunk run | Automatic contexts | Two contexts |
| --- | ---: | ---: |
| Sampled process-tree peak physical footprint, bytes | 5,459,260,416 | 2,093,800,384 |
| Sampled peak RSS, bytes | 2,519,810,048 | 2,073,444,352 |
| Index duration, seconds | 559.779 | 555.837 |
| Complete / incomplete active samples | 5,221 / 0 | 5,279 / 0 |
| Final observed process count | 0 | 0 |

Both runs reported fresh lexical+semantic readiness and all 17,000 chunks embedded. The approximately 62% lower sampled physical peak is directional evidence from one pair. Similar completion times are observational, not an established speed improvement. Sampling was every 100 ms using the corrected native whole-observed-tree physical-footprint/RSS sampler, excluding its own process. It is not a JS-heap measurement or a complete running Desktop measurement. Unrelated Podcasts indexing and VM activity were present; no unrelated process was stopped.

Runtime SHA-256: `43eca651cebd5d2499b6ebbd1ce8d4a8a5cfd15e9c126f02e7a7ed565de2805e`; corpus Markdown digest: `4d437565dae961d3d58b16dddece2518862837468302bb124bf9ac8acc8d091a`. Model: EmbeddingGemma 300M Q8_0, SHA-256 `b5ce9d77a3fc4b3b39ccb5643c36777911cc4eb46a66962eadfa3f5f60490d63`. Node 26.7.0, QMD 2.8.3, macOS 15.7.7, Apple M3 Pro/18 GiB. Both arms used the same frozen runtime, model, corpus and 900,000 ms backend deadline; only the supported context setting differed. Ignored raw results, source snapshot, identities, corpus manifests and traces remain in `.local-pack/ram-focused-20261103/`.

The automatic arm completed indexing and drained, but its collector waited for an already-fired stream-finish event and exited 13. Its child exit code was not persisted. The saved complete index result and complete process trace were inspected before continuing. The harness was corrected and resumed with strict identity checks; the control was not rerun. The candidate exited zero and its last sample also contained no process. This limitation remains in the evidence rather than treating the parent failure as a successful unqualified run.

The experimental clock began at 11:28:18 UTC, including the tiny explicit-model setup check; hard stop was 13:28:18 UTC. The ledger was recorded after that first launch, a procedural deviation. Both index arms and monitors ended by 11:56:31; the retained default was applied by 12:01:32, within a 34-minute window. No further RAM run was started after the cap. Administrative write-up resumed at 21:xx UTC following the conversation gap; this late closeout did not reset or extend the original allowance. No 1,000-note UI/graph comparison was needed for the selected index-only change. No long soak, universal RAM budget, 100 MB claim, leak-freedom claim or Intel/Linux performance claim is supported.

Index deadlines now share finite validation and defaults: 600,000 ms indexing and 60,000 ms search. Local CLI forwards its selected index deadline to the owning backend and waits with 10,000 ms transport headroom; HTTP/gateway use the same policy. Defaults were not widened. Mac launch paths explicitly forward the existing index timeout and device-local model-directory settings. Changing backend environment requires a restart. Cancellation, lock drain, publication and visible partial/failure outcomes retain their existing ownership rules; focused lifecycle, deadline and abort/body-consumption regressions cover these seams. The matched 900-second run does not imply all large corpora fit the default deadline.
