# 0014. The hosted beta runs on Workers Free

Date: 2026-10-16

## Status

Accepted. Refines [ADR 0011](0011-hold-store-for-blocked-deliveries.md), which assumed Workers Paid.

## Context

ADR 0011 relied on queue retention above 24 hours, which needs Workers Paid. The other Workers Free limits that matter here (checked 2026-10-16): queue messages are kept for 24 hours, the queue allows 10,000 operations a day (about 3,300 responses, at three operations each), each invocation may make 50 subrequests and use 10 ms of CPU, and the account gets 100,000 requests a day. A beta stays well inside the volume limits, and only the retention and subrequest limits conflict with the design.

A self-managed server was considered and rejected for the hosted service: similar cost, but OS updates, TLS, backups, DDoS protection and uptime become ours, and one machine is a single point of failure for every form.

## Decision

- The hosted service starts on Workers Free and moves to Workers Paid when it approaches a free limit or before the public launch, whichever comes first.
- **Retention:** a transient retry whose next attempt would fall later than the queue's retention minus one hour is moved to the hold store (KV, expiring at the 7-day deadline) instead of being retried in the queue. The hourly job re-sends held deliveries of destinations that are `OK`. The 72-hour transient window and the 7-day deadline of ADR 0008 do not change. `QUEUE_RETENTION_HOURS` (default 24) tells the Worker the configured retention.
- **Subrequests:** the consumer counts its Google calls and sends groups that would exceed `GOOGLE_CALL_BUDGET` (default 40) back to the queue without delay, to be delivered by the next invocation.
- Moving to Workers Paid is a configuration change: raise the queue's retention and both variables.

## Consequences

- No hosting cost during the beta.
- After about a day of transient failures, retries happen at most hourly instead of on the backoff schedule.
- The 10 ms CPU limit is the main open risk; consumer CPU time is to be measured during the beta.
- Running on a plain Node.js server (Hono runs there too, with SQLite or Postgres and a database-backed queue) remains the self-hosting path, not the hosted one.
