import express from "express";
import cors from "cors";
import path from "path";

import { ENV } from "./config/env";
import { clerkMiddleware } from "@clerk/express";

import userRoutes from "./routes/userRoutes";
import tripRoutes from "./routes/tripRoutes";
import lineDriverRoutes from "./routes/lineDriverRoutes";
import lineMessageRoutes from "./routes/lineMessageRoutes";
import lineIngestRoutes from "./routes/lineIngestRoutes";

const app = express();

app.use(cors({ origin: ENV.FRONTEND_URL, credentials: true }));
app.use(clerkMiddleware()); // attaches auth to req; does not block unauthenticated requests
// 25mb: LINE photos arrive as base64 (~1.33x the binary size).
// `verify` captures the raw body so the LINE webhook can check x-line-signature.
app.use(
  express.json({
    limit: "25mb",
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.json({
    message: "TripReport API — PostgreSQL · Drizzle · Clerk · Claude",
    endpoints: {
      users: "/api/users",
      trips: "/api/trips",
      lineDrivers: "/api/line-drivers",
      lineMessages: "/api/line-messages",
      lineWebhook: "/api/line/webhook",
      ingest: "/api/line/ingest",
    },
  });
});

app.use("/api/users", userRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/line-drivers", lineDriverRoutes);
app.use("/api/line-messages", lineMessageRoutes);
app.use("/api/line", lineIngestRoutes);

if (ENV.NODE_ENV === "production") {
  const __dirname = path.resolve();
// serve static files from the frontend build directory
  app.use(express.static(path.join(__dirname, "../frontend/dist")));
// serve index.html for any route that doesn't match an API route - react app
  app.get("/{*any}", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });
}

app.listen(ENV.PORT, () => console.log("Server is up and running on PORT:", ENV.PORT));
