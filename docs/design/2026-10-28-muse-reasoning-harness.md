# Muse fleet reasoning harness

UI update: Muse now lives inside Weather Simulator as an optional coordinator inspector. Inputs, decisions, exact prompts, raw replies and history expand independently. The old reasoning URL opens this shared simulator with the inspector expanded.

The reasoning dashboard (`?view=reasoning`) rehearses replacing a shore-based copilot with a coordinator on each master. It uses the same Weather Simulator state, failures, hardware and local recovery controller. No vessel or live weather service is connected.

## Control loop

Observe → escalation gate → Meta Muse Wonder → schema/freshness/dispatch validation → expiring local strategy → fleet feedback.

Routine conditions continue using local algorithms without automatic API requests. Automatic escalation is opt-in, only runs with adverse signals and an available coordinator, and has a 30-second wall-clock cooldown plus the model-requested simulation-time review interval (30–300 s). Manual evaluation can inspect routine conditions. Only one request may be in flight. A dashboard session allows 20 live requests, and the backend limits each process to six per minute. No automatic retries consume extra requests after errors. Local control continues during requests and errors.

Observations include current, wind, rain, swells, daylight, radio assumptions, received node reports, reported battery/faults, connected-node power, baseline recovery status and simulated cloud tracking. Lost-node truth coordinates and unreported damage/battery are excluded. Cloud observations use the Swarm configuration and seeded tracker as a separate advisory; Weather energy still uses its daylight/rain model. These sources are labeled explicitly. Unit bench hardware is shared; its motion and independent sun model are not represented as simultaneous fleet measurements.

Muse returns a bounded JSON strategy, brief rationale, evidence, uncertainty and review interval. The available primitives are baseline recovery, three-worker escort, whole-fleet ring, compute conservation, idle-thruster hold, physical retrieval request, and bounded drift-biased square search. The local planner still calculates and checks routes; Muse cannot issue arbitrary code, change equipment, invent a fresh fix, relax reserve thresholds or override hardware/ingress/wildlife interlocks. Search extrapolates a fresh satellite fix with estimated current and a small square sweep, limiting its offset to 10% of the assumed link radius. Existing relay-chain feasibility and per-step anchor clamps remain active. Target truth is not read; modeled detection is restored mesh contact. This first harness composes tested primitives rather than generating executable algorithms. Uncertain/stale or out-of-range targets retain the local retrieval policy. Larger expanding-area search and new maneuvers need separately tested primitives before execution.

Shadow mode is the default. Execution is explicit and applies only to the simulation. Policies expire after at most 120 simulated seconds, are ignored without the coordinator, and local feasibility checks run every physics step. Responses are discarded if adverse context changes, time goes backwards, the scenario/design changes, or their snapshot is older than 120 simulated seconds. High playback speeds can intentionally make responses expire; pause or slow the rehearsal to inspect a decision.

## Connection

Copy `.env.example` to `.env.local` and set:

```
MODEL_API_KEY=<Meta Model API key>
MUSE_MODEL=muse-wonder-1.0
MUSE_BASE_URL=https://api.meta.ai/v1
MUSE_ACCESS_TOKEN=<private dashboard access token>
```

Restart `npm run dev`. Open Muse Reasoning from Menu, select Meta Muse Wonder and enter the dashboard access token. The Meta key is never entered into the page or exposed through Vite variables. The access token stays in component memory. API status reports configuration, not a successful provider test.

Vite supplies the local `/api/muse` endpoint; `api/muse.ts` supplies the Vercel function. Set the same four environment variables in Vercel before deploying. `vite preview` serves static output without the API; use Vite development or the Vercel runtime for live calls. Production access is gated by the dashboard token. Process-local rate limits are not a global spending cap: configure provider spending limits and hosting ingress limits before distributing the dashboard to multiple users/instances.

The proxy validates inputs, builds the exact displayed prompt on the server, sends a single bounded Chat Completions request, times out after 45 seconds, validates returned JSON, and returns usage and latency. Provider error bodies and credentials are not returned. JSON/schema failures retain the bounded raw response for debugging. Credentials and access tokens are excluded from trace export. Traces are session-local and bounded to 40 entries; export JSON before leaving.

Meta documentation: [model availability](https://dev.meta.ai/docs/models), [quickstart](https://dev.meta.ai/docs/quickstart), [Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions). Muse Wonder API model ID is `muse-wonder-1.0`. Wonder Full is currently listed as Muse Code-only; it is not an interchangeable API model ID. Account access and actual inference remain to be verified using the hackathon key.

## Evaluation boundaries

A strategy executing is not proof that it improves outcomes. The dashboard exposes live fleet power, reachability, modes and the recovery plan below the decision trace. Model rationale is an explanatory output, not private chain of thought. The current harness does not establish maximum fleet-per-human capacity, agent superiority, a validated righting solution, radio reliability or deployment safety. Controlled paired baseline/agent trials, multiple seeds, cost accounting and validated new recovery/search primitives are the next evaluation layer.
