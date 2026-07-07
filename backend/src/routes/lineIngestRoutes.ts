import { Router } from "express";
import { ingestLineMessage } from "../controllers/lineIngestController";

const router = Router();

// Authenticated by X-Ingest-Key inside the controller — not a Clerk route
router.post("/ingest", ingestLineMessage);

export default router;
