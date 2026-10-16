# 0012. One Worker for the API, public forms and delivery in the MVP

Date: 2026-10-16

## Status

Accepted

## Context

The original target layout split the edge API (`apps/api`), the queue consumer (`apps/worker-delivery`) and the public renderer (`packages/renderer`). In the MVP all three share the same bindings (D1, the delivery queue, the hold store, the master key) and the same Google client, and none of them has a second consumer yet.

## Decision

- `apps/api` is one Cloudflare Worker with three entry points: `fetch` (auth, forms API, public forms), `queue` (delivery consumer) and `scheduled` (hourly maintenance).
- The public renderer lives in `apps/api/src/public` and the consumer in `apps/api/src/delivery`.
- Code that another deployable will need goes to `packages/*` first. The consumer moves to its own Worker when its CPU, scaling or deploy cadence differ from the API's; the renderer moves to `packages/renderer` when the embed script or the builder preview needs it.

## Consequences

- One deploy, one set of secrets and one local dev server.
- A bug or a heavy batch in the consumer shares the Worker's version with the API; Cloudflare still runs `queue` and `fetch` invocations independently.
- Splitting later is a packaging change, not a redesign, because the entry points already share nothing but bindings.
