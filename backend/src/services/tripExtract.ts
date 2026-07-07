import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "../config/env";

const DEFAULT_MODEL = "claude-opus-4-8";

// Ported verbatim from LINE_TripBot.gs — what the AI must return for every message/image
const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    is_trip_report: {
      type: "boolean",
      description:
        "true only if the message/image contains information about a truck trip, job assignment, loading/unloading, or a dispatching problem",
    },
    driver_name: { type: "string", description: "Driver name if mentioned, else empty string" },
    truck: { type: "string", description: "Truck plate/number, e.g. 71-6213. Empty string if not found" },
    origin: { type: "string", description: "Trip origin (ต้นทาง). Empty string if not found" },
    destination: { type: "string", description: "Trip destination (ปลายทาง). Empty string if not found" },
    status: {
      type: "string",
      description: "One of: รับงาน, ถึงต้นทาง, ขึ้นของ, ออกเดินทาง, ถึงปลายทาง, ลงของ, จบงาน, มีปัญหา, อื่นๆ",
    },
    problem: { type: "string", description: "Problem/challenge reported (ปัญหา), empty string if none" },
    notes: { type: "string", description: "Other useful details: cargo, weight, document numbers, times" },
  },
  required: ["is_trip_report", "driver_name", "truck", "origin", "destination", "status", "problem", "notes"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = [
  "You read messages from a Thai LINE group where truck drivers and supervisors",
  "report job progress: trips, loading/unloading, and problems during dispatching.",
  "Messages are mostly Thai, sometimes mixed with English. Images may be photos of",
  "delivery documents, weight slips, GPS screens, truck/cargo photos, or handwritten notes.",
  "Extract the trip information into the required JSON shape.",
  "Truck plates look like 71-6213 or 72-5535. Use an empty string for anything not present.",
  "If the content is just chat/greetings/stickers with no job information, set is_trip_report to false.",
].join(" ");

export type TripExtraction = {
  is_trip_report: boolean;
  driver_name: string;
  truck: string;
  origin: string;
  destination: string;
  status: string;
  problem: string;
  notes: string;
};

const SUPPORTED_MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof SUPPORTED_MEDIA)[number];

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!ENV.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (!client) client = new Anthropic({ apiKey: ENV.ANTHROPIC_API_KEY });
  return client;
}

export async function extractTrip(input: {
  text?: string;
  image?: { base64: string; mediaType: string };
}): Promise<TripExtraction | null> {
  const anthropic = getClient();

  const content: Anthropic.ContentBlockParam[] = [];
  if (input.image) {
    const mediaType: MediaType = (SUPPORTED_MEDIA as readonly string[]).includes(input.image.mediaType)
      ? (input.image.mediaType as MediaType)
      : "image/jpeg";
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: input.image.base64 },
    });
    content.push({
      type: "text",
      text: "Extract the trip information from this image sent in the drivers' LINE group.",
    });
  } else {
    content.push({
      type: "text",
      text: "Extract the trip information from this LINE message:\n\n" + (input.text ?? ""),
    });
  }

  const response = await anthropic.messages.create({
    model: ENV.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
    messages: [{ role: "user", content }],
  });

  // Check stop_reason before reading content — a refusal has empty/partial content
  if (response.stop_reason === "refusal") {
    console.warn("Claude refused the extraction request");
    return null;
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  try {
    return JSON.parse(textBlock.text) as TripExtraction;
  } catch {
    console.error("Failed to parse extraction JSON:", textBlock.text);
    return null;
  }
}
