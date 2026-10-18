import { app } from "./app.js";
import { maintenance, processBatch } from "./delivery/consumer.js";
import { defaultDeps, type DeliveryMessage, type Env } from "./env.js";

export default {
  fetch: app.fetch,
  queue: (batch: MessageBatch<DeliveryMessage>, env: Env) => processBatch(batch, env, defaultDeps),
  scheduled: (_controller: ScheduledController, env: Env) =>
    maintenance(env, Date.now(), defaultDeps),
} satisfies ExportedHandler<Env, DeliveryMessage>;
