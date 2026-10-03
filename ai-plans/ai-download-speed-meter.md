# Download Speed Meter — real-time scrolling graph in AI chat panel

## Goal

During `load_phase === 'downloading'` the AI chat panel shows a live throughput
meter — a scrolling line graph (game-launcher style) plotting MB/s over a time
window that scrolls left, with the current MB/s + Mbps readout and an
auto-scaling Y axis ("nice" cuts). The graph component is **generic**: it
receives sampled values and renders them — reusable for any real-time metric.

## Data source (real network bytes, not %)

`resumable-fetch.ts` already sees every byte flowing from the CDN:

- Fresh path: `teeStream(resp.body, shardWriter…)` — chunks enqueued to the
  transformer consumer = network bytes.
- Resume path: `shardReplayStream` — the live `value.length` chunks
  (`live_delivered`). **Cache-replayed shards are NOT counted** (local reads
  would spike the graph with fake GB/s).

### Change 1 — `src/lib/ai/resumable-fetch.ts`

- Module-level reporter hook:

```ts
export type ByteReporter = (delta_bytes: number) => void;
let report_bytes: ByteReporter | null = null;
/** Worker registers a sink once; called for every live-network chunk. */
export function setByteReporter(fn: ByteReporter | null) { report_bytes = fn; }
```

- In `teeStream`'s enqueue path (fresh download): `report_bytes?.(chunk.length)`
  — count only chunks flowing from the network response, not the writer side.
- In `shardReplayStream` live section, where `live_delivered += value.length`:
  also `report_bytes?.(value.length)`.

### Change 2 — `src/lib/ai/ai-worker.ts`

- After `env.fetch = resumableFetch`, register:

```ts
setByteReporter((n) => {
  net_bytes += n;
  const now = performance.now();
  if (now - last_tick >= 250) {          // throttle ~4 msg/s
    last_tick = now;
    post({ type: 'download_bytes', bytes: net_bytes });
  }
});
```

- Reset `net_bytes = 0` at each new `load` (per model switch / reload).

### Change 3 — `src/lib/components/ui/smart-ai/use-ai-assistant.svelte.ts`

- Message union: add `{ type: 'download_bytes'; bytes: number }`.
- `_state.download_bytes: number` + `_state.download_bytes_ts: number` —
  store cumulative bytes + last tick timestamp (or a small ring buffer of
  `{t, bytes}` capped ~40 samples).
- Derived getters:
  - `download_mbs` — MB/s over a ~3 s sliding window
    (`Δbytes / Δt / 1e6`, clamped ≥ 0, 0 when stale > 2 s).
  - `download_mbps` — `download_mbs * 8`.
- Reset on load start / ready / error / cancel alongside `file_progress`.

## New generic component — `src/lib/components/ui/realtime-meter/`

`realtime-meter.svelte` (+ `index.ts` barrel). Pure presentational:

```ts
interface Props {
  value: number;              // latest sample (parent pushes; component buffers)
  unit?: string;              // e.g. "MB/s"
  label?: string;             // e.g. "Download"
  secondary?: string;         // preformatted second readout, e.g. "240 Mbps"
  window_ms?: number;         // visible time span, default 30_000
  height?: number;            // px, default 56
  testid?: string;
}
```

Behavior:

- On each `value` change, pushes `{t: performance.now(), v}` into an internal
  ring buffer (cap = window_ms / min interval).
- `<canvas>` + `requestAnimationFrame` draw loop (paused via `$effect` cleanup
  on destroy): x-axis = time, right edge = now; points older than `window_ms`
  scroll off left. Line + soft gradient fill under the line (same
  sky→indigo→violet gradient palette as the progress bars).
- **Auto Y scale**: max over visible window → snapped up to the next "nice"
  cut (`1 / 2 / 2.5 / 5 × 10^n`), with 2–3 horizontal gridlines + tiny muted
  labels. Smooth transitions when the cut changes (lerp the scale factor).
- Header row: `{label}` left, `{value.toFixed(1)} {unit}` + `{secondary}`
  right (tabular-nums).
- `data-testid="{testid}-graph"` on the canvas.

## Panel integration — `ai-chat-panel.svelte`

Inside the `load_phase === 'downloading'` block, under the aggregate progress
bar and above the per-file list:

```svelte
<RealtimeMeter
  value={ai.download_mbs}
  unit="MB/s"
  secondary="{ai.download_mbps.toFixed(0)} Mbps"
  testid="{testid_prefix}-dl-meter"
/>
```

Width `w-full max-w-xs` to match the existing bars. Rendered only during
downloading (replay-only resumes produce a brief flat line — acceptable and
honest).

## Acceptance criteria

- During a real model download the meter shows a live scrolling line, MB/s and
  Mbps readouts updating ~4×/s, Y axis re-scaling on nice cuts.
- Cache replay / VRAM phase: meter hidden (phase-gated).
- `pnpm run check` clean; component documented via `pnpm extract-docs`.
- No i18n strings needed (units are universal) — label prop only.

## Out of scope

- Persisting speed history to DB.
- Changes to `LIVE_MAX` or download scheduling.
