import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const ENV = {
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  FRONTEND_URL: process.env.FRONTEND_URL,
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  LINE_INGEST_KEY: process.env.LINE_INGEST_KEY,
  // Native LINE webhook (direct — no Apps Script relay):
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN, // download images, fetch names
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET,             // verify x-line-signature
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
};
