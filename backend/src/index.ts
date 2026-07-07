import express from "express";
import cors from "cors";
import path from "path";

import { ENV } from "./config/env";
import { clerkMiddleware } from "@clerk/express";

import userRoutes from "./routes/userRoutes";
import tripRoutes from "./routes/tripRoutes";
import lineDriverRoutes from "./routes/lineDriverRoutes";

const app = express();

app.use(cors({ origin: ENV.FRONTEND_URL, credentials: true }));
app.use(clerkMiddleware()); // attaches auth to req; does not block unauthenticated requests
// 25mb: LINE photos arrive as base64 (~1.33x the binary size)
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.json({
    message: "TripReport API — PostgreSQL · Drizzle · Clerk · Claude",
    endpoints: {
      users: "/api/users",
      trips: "/api/trips",
      lineDrivers: "/api/line-drivers",
      ingest: "/api/line/ingest",
    },
  });
});

app.use("/api/users", userRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/line-drivers", lineDriverRoutes);

if (ENV.NODE_ENV === "production") {
  const __dirname = path.resolve();

  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("/{*any}", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });
}

app.listen(ENV.PORT, () => console.log("Server is up and running on PORT:", ENV.PORT));
