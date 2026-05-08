import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { matchCompetitors, matches } from "../db/schema";
import matchesRouter from "./matches";

const router = Router();

router.use("/api/matches", matchesRouter);

// Slot lookup — must be a top-level route to avoid matching /api/matches/:id
router.get("/api/slots/:slotKey", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const competitor = await db.query.matchCompetitors.findFirst({
      where: eq(matchCompetitors.slotKey, req.params.slotKey),
    });
    if (!competitor) {
      res.status(404).json({ error: "slot key not found" });
      return;
    }

    const match = await db.query.matches.findFirst({
      where: eq(matches.id, competitor.matchId),
    });

    res.json({
      matchId: competitor.matchId,
      slot: competitor.slot,
      matchStatus: match?.status ?? "unknown",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
