import { eq } from "drizzle-orm";
import { db } from "../db";
import { matches } from "../db/schema";
import { hub } from "../ws/hub";
import { batcher } from "./eventBatcher";

type EndReason = "timer" | "host_cancel" | "all_disconnected";

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export async function startMatch(matchId: string): Promise<void> {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!match) throw new Error(`Match ${matchId} not found`);
  if (match.status !== "lobby") throw new Error(`Match ${matchId} is not in lobby`);

  const startedAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + match.durationSec * 1000).toISOString();

  await db
    .update(matches)
    .set({ status: "live", startedAt })
    .where(eq(matches.id, matchId));

  hub.broadcastToViewers(matchId, {
    type: "match.started",
    matchId,
    startedAt,
    durationSec: match.durationSec,
    endsAt,
  });

  batcher.push({
    matchId,
    kind: "match.started",
    payload: { startedAt, durationSec: match.durationSec },
    ts: startedAt,
  });

  const timer = setTimeout(() => {
    endMatch(matchId, "timer").catch((err) => {
      process.stderr.write(`[lifecycle] endMatch error: ${String(err)}\n`);
    });
  }, match.durationSec * 1000);

  // Don't block process exit
  if (timer.unref) timer.unref();
  timers.set(matchId, timer);
}

export async function endMatch(matchId: string, reason: EndReason): Promise<void> {
  const existing = timers.get(matchId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(matchId);
  }

  const endedAt = new Date().toISOString();

  await db
    .update(matches)
    .set({ status: "ended", endedAt })
    .where(eq(matches.id, matchId));

  hub.broadcastToViewers(matchId, {
    type: "match.ended",
    matchId,
    endedAt,
    reason,
  });

  batcher.push({
    matchId,
    kind: "match.ended",
    payload: { endedAt, reason },
    ts: endedAt,
  });
}

export function clearAllTimers(): void {
  for (const [, timer] of timers) {
    clearTimeout(timer);
  }
  timers.clear();
}
