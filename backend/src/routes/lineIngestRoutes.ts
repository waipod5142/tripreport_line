import { Router } from "express";
import { ingestLineMessage } from "../controllers/lineIngestController";
import { lineWebhook } from "../controllers/lineWebhookController";

const router = Router();

// Native LINE webhook — authenticated by x-line-signature inside the controller.
// Point the LINE console "Webhook URL" at https://<host>/api/line/webhook.
router.post("/webhook", lineWebhook);

// Legacy X-Ingest-Key path (Apps Script relay / manual replay) — same core.
router.post("/ingest", ingestLineMessage);

export default router;
