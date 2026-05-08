import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { matches, matchCompetitors } from "../db/schema";
import { hub } from "../ws/hub";
import { registerSlotKey, issueSlotKey } from "../ws/slotKey";
import { startMatch, endMatch } from "../lib/lifecycle";
import { batcher } from "../lib/eventBatcher";

const router = Router();

// ─── POST /api/matches ────────────────────────────────────────────────────────

const CreateMatchSchema = z.object({
  durationSec: z.number().int().positive().optional().default(1800),
});

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateMatchSchema.parse(req.body);
    const matchId = nanoid();
    const createdAt = new Date().toISOString();

    await db.insert(matches).values({
      id: matchId,
      status: "lobby",
      durationSec: body.durationSec,
      createdAt,
    });

    // Create 4 slot entries with keys
    const slots: { slot: number; slotKey: string }[] = [];
    for (let i = 0; i < 4; i++) {
      const slotKey = issueSlotKey();
      slots.push({ slot: i, slotKey });
      await db.insert(matchCompetitors).values({
        matchId,
        slot: i,
        displayName: `Slot ${i}`,
        slotKey,
        joinedAt: createdAt,
        ready: false,
      });
      registerSlotKey(slotKey, matchId, i);
    }

    // Ensure room exists in hub
    hub.ensureRoom(matchId);

    res.status(201).json({ matchId, slots });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/matches/:id ─────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, req.params.id),
    });
    if (!match) {
      res.status(404).json({ error: "match not found" });
      return;
    }

    const competitors = await db.query.matchCompetitors.findMany({
      where: eq(matchCompetitors.matchId, req.params.id),
    });

    res.json({ match, competitors });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/matches/:id/slots/:slot/join ───────────────────────────────────

const JoinSchema = z.object({
  displayName: z.string().min(1).max(50),
});

router.post(
  "/:id/slots/:slot/join",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const matchId = req.params.id;
      const slot = parseInt(req.params.slot, 10);
      if (isNaN(slot) || slot < 0 || slot > 3) {
        res.status(400).json({ error: "invalid slot" });
        return;
      }

      const slotKey = extractBearer(req);
      if (!slotKey) {
        res.status(401).json({ error: "missing authorization" });
        return;
      }

      const competitor = await db.query.matchCompetitors.findFirst({
        where: and(
          eq(matchCompetitors.matchId, matchId),
          eq(matchCompetitors.slot, slot),
          eq(matchCompetitors.slotKey, slotKey)
        ),
      });
      if (!competitor) {
        res.status(403).json({ error: "invalid slot key" });
        return;
      }

      const body = JoinSchema.parse(req.body);

      await db
        .update(matchCompetitors)
        .set({ displayName: body.displayName, joinedAt: new Date().toISOString() })
        .where(
          and(
            eq(matchCompetitors.matchId, matchId),
            eq(matchCompetitors.slot, slot)
          )
        );

      batcher.push({
        matchId,
        slot,
        kind: "slot.joined",
        payload: { displayName: body.displayName },
        ts: new Date().toISOString(),
      });

      await broadcastLobbyState(matchId);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/matches/:id/slots/:slot/ready ──────────────────────────────────

router.post(
  "/:id/slots/:slot/ready",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const matchId = req.params.id;
      const slot = parseInt(req.params.slot, 10);
      if (isNaN(slot) || slot < 0 || slot > 3) {
        res.status(400).json({ error: "invalid slot" });
        return;
      }

      const slotKey = extractBearer(req);
      if (!slotKey) {
        res.status(401).json({ error: "missing authorization" });
        return;
      }

      const competitor = await db.query.matchCompetitors.findFirst({
        where: and(
          eq(matchCompetitors.matchId, matchId),
          eq(matchCompetitors.slot, slot),
          eq(matchCompetitors.slotKey, slotKey)
        ),
      });
      if (!competitor) {
        res.status(403).json({ error: "invalid slot key" });
        return;
      }

      await db
        .update(matchCompetitors)
        .set({ ready: true })
        .where(
          and(
            eq(matchCompetitors.matchId, matchId),
            eq(matchCompetitors.slot, slot)
          )
        );

      batcher.push({
        matchId,
        slot,
        kind: "slot.ready",
        payload: {},
        ts: new Date().toISOString(),
      });

      await broadcastLobbyState(matchId);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/matches/:id/start ──────────────────────────────────────────────

router.post("/:id/start", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const matchId = req.params.id;

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });
    if (!match) {
      res.status(404).json({ error: "match not found" });
      return;
    }
    if (match.status !== "lobby") {
      res.status(400).json({ error: "match is not in lobby" });
      return;
    }

    const competitors = await db.query.matchCompetitors.findMany({
      where: eq(matchCompetitors.matchId, matchId),
    });

    const readyCount = competitors.filter((c) => c.ready).length;
    if (readyCount < 2) {
      res.status(400).json({ error: "at least 2 slots must be ready" });
      return;
    }

    await startMatch(matchId);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/matches/:id/cancel ─────────────────────────────────────────────

router.post("/:id/cancel", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const matchId = req.params.id;

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });
    if (!match) {
      res.status(404).json({ error: "match not found" });
      return;
    }
    if (match.status === "ended" || match.status === "cancelled") {
      res.status(400).json({ error: "match is already ended or cancelled" });
      return;
    }

    await db
      .update(matches)
      .set({ status: "cancelled", endedAt: new Date().toISOString() })
      .where(eq(matches.id, matchId));

    await endMatch(matchId, "host_cancel");

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function broadcastLobbyState(matchId: string): Promise<void> {
  const competitors = await db.query.matchCompetitors.findMany({
    where: eq(matchCompetitors.matchId, matchId),
  });

  hub.broadcastToViewers(matchId, {
    type: "match.lobby_state",
    matchId,
    slots: competitors.map((c) => ({
      slot: c.slot,
      occupied: true,
      displayName: c.displayName,
      ready: c.ready ?? false,
    })),
  });
}

function extractBearer(req: Request): string | null {
  const auth = req.headers["authorization"];
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export default router;
