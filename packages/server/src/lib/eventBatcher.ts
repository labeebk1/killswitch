import { db } from "../db";
import { matchEvents } from "../db/schema";
import { nanoid } from "nanoid";

interface EventRecord {
  matchId: string;
  slot?: number;
  kind: string;
  payload: unknown;
  ts: string;
}

class EventBatcher {
  private queue: EventRecord[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly flushIntervalMs = 1000) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      this.flush().catch((err) => {
        process.stderr.write(`[eventBatcher] flush error: ${String(err)}\n`);
      });
    }, this.flushIntervalMs);
    // Allow process to exit even if interval is active
    if (this.timer.unref) this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  push(event: EventRecord): void {
    this.queue.push(event);
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    const rows = batch.map((e) => ({
      id: nanoid(),
      matchId: e.matchId,
      slot: e.slot ?? null,
      kind: e.kind,
      payload: JSON.stringify(e.payload),
      ts: e.ts,
    }));
    try {
      await db.insert(matchEvents).values(rows);
    } catch (err) {
      process.stderr.write(`[eventBatcher] insert error: ${String(err)}\n`);
      // Re-queue failed events at the front
      this.queue.unshift(...batch);
    }
  }
}

export const batcher = new EventBatcher();
batcher.start();
