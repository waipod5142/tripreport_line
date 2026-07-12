// ============================================================
// LINE TRIP BOT — thin relay: LINE webhook → TripReport backend
//
// Deploy as Web App ("Execute as: Me", "Who has access: Anyone")
// and set the deployment URL as the LINE webhook.
//
// AI extraction, Cloudinary upload, and trip storage all happen in
// the TripReport backend (POST /api/line/ingest). This script only:
//   1. dedupes webhook redeliveries (6-hour message-ID cache)
//   2. logs every message to the LineUserCapture sheet (raw safety net)
//   3. downloads image bytes from LINE
//   4. fetches the sender's display name (cached)
//   5. forwards every message (text, base64-image, or bare type) to the
//      backend with X-Ingest-Key — the backend archives all, extracts trips
//
// Sheets used:
//   BotConfig       — key/value config (see CONFIG KEYS below)
//   LineUserCapture — raw log of every message + Forward Status column
//
// CONFIG KEYS (BotConfig: column A = key, column B = value)
//   LINE_TOKEN        LINE channel access token (falls back to A1 for
//                     backward compatibility with the old layout)
//   BACKEND_URL       full ingest URL, e.g. https://your-app.example.com/api/line/ingest
//   INGEST_KEY        must match LINE_INGEST_KEY in the backend env
//   GroupReplyEnabled TRUE/FALSE — reply with IDs in group chat
//   TARGET_GROUP_ID   optional — only forward messages from this group
// ============================================================

const TRIPBOT = {
  CAPTURE_SHEET: "LineUserCapture",
  CONFIG_SHEET:  "BotConfig",
  TZ:            "Asia/Bangkok"
};

const CAPTURE_HEADER = [
  "Timestamp", "Source Type", "LINE User ID", "Group ID", "Message Text", "Forward Status"
];

// ============================================================
// CONFIG HELPERS
// ============================================================
function tbConfigSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRIPBOT.CONFIG_SHEET);
  if (!sheet) throw new Error("BotConfig sheet not found");
  return sheet;
}

function tbGetConfig_(key) {
  const rows = tbConfigSheet_().getDataRange().getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) return String(rows[i][1]).trim();
  }
  return "";
}

function tbGetLineToken_() {
  const token = tbGetConfig_("LINE_TOKEN") || String(tbConfigSheet_().getRange("A1").getValue()).trim();
  if (!token) throw new Error("LINE_TOKEN missing in BotConfig");
  return token;
}

function tbGetSheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ============================================================
// ENTRY POINT
// ============================================================
function doPost(e) {
  try {
    const parsed = JSON.parse(e.postData ? e.postData.contents : "{}");
    (parsed.events || []).forEach(event => {
      try {
        handleEvent_(event);
      } catch (err) {
        Logger.log("Event error: " + err.toString());
      }
    });
    return tbRespond_({ status: "ok" });
  } catch (err) {
    Logger.log("doPost error: " + err.toString());
    return tbRespond_({ status: "error", message: err.toString() });
  }
}

function handleEvent_(event) {
  if (event.type !== "message" || !event.source) return;

  // LINE may redeliver the same webhook — skip already-processed messages.
  // The backend's unique lineMessageId is the second line of defense.
  const cache = CacheService.getScriptCache();
  const dedupeKey = "line_msg_" + event.message.id;
  if (cache.get(dedupeKey)) return;
  cache.put(dedupeKey, "1", 21600); // 6 hours

  const rowIndex = captureIds_(event);

  // Optionally restrict forwarding to one group
  const targetGroup = tbGetConfig_("TARGET_GROUP_ID");
  const groupId = event.source.groupId || event.source.roomId || "";
  if (targetGroup && groupId !== targetGroup) {
    setForwardStatus_(rowIndex, "skipped (other group)");
    return;
  }

  // Forward every message type — the backend archives all of them (stickers,
  // etc. are logged; only text/image go through AI extraction).
  const status = forwardToBackend_(event);
  setForwardStatus_(rowIndex, status);
}

// ============================================================
// CAPTURE — raw log of every message (safety net / replay source)
// ============================================================
function captureIds_(event) {
  const sheet = tbGetSheet_(TRIPBOT.CAPTURE_SHEET, CAPTURE_HEADER);

  const sourceType  = event.source.type    || "";
  const userId      = event.source.userId  || "";
  const groupId     = event.source.groupId || event.source.roomId || "-";
  const messageText = event.message
    ? (event.message.text || "(" + event.message.type + ")")
    : "(no message)";

  sheet.appendRow([new Date(), sourceType, userId, groupId, messageText, ""]);
  const rowIndex = sheet.getLastRow();

  const replyEnabled = tbGetConfig_("GroupReplyEnabled").toUpperCase() === "TRUE";
  if (replyEnabled || sourceType !== "group") {
    replyWithIds_(event.replyToken, userId, groupId, sourceType);
  }
  return rowIndex;
}

function setForwardStatus_(rowIndex, status) {
  try {
    tbGetSheet_(TRIPBOT.CAPTURE_SHEET, CAPTURE_HEADER).getRange(rowIndex, 6).setValue(status);
  } catch (err) {
    Logger.log("Forward status write failed: " + err.toString());
  }
}

function replyWithIds_(replyToken, userId, groupId, sourceType) {
  if (!replyToken) return;
  const text = sourceType === "group"
    ? ["✅ Group ID (C...):", groupId, "", "👤 Your User ID:", userId, "", "กรุณาส่งให้ผู้ดูแลระบบ"].join("\n")
    : ["✅ TripReport bot ทำงานอยู่", "", "👤 Your User ID:", userId].join("\n");

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + tbGetLineToken_()
    },
    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: "text", text: text }] }),
    muteHttpExceptions: true
  });
}

// ============================================================
// FORWARD → BACKEND
// Returns a short status string written to the Forward Status column.
// LINE always receives 200, so failed messages stay in the capture
// sheet for manual replay (backend dedupe makes replays idempotent).
// ============================================================
function forwardToBackend_(event) {
  const backendUrl = tbGetConfig_("BACKEND_URL");
  const ingestKey  = tbGetConfig_("INGEST_KEY");
  if (!backendUrl || !ingestKey) return "error: BACKEND_URL/INGEST_KEY missing in BotConfig";

  const msg = event.message;
  const payload = {
    messageId: msg.id,
    type: msg.type,
    lineUserId: event.source.userId || "",
    lineGroupId: event.source.groupId || event.source.roomId || "",
    senderDisplayName: getSenderName_(event),
    timestamp: event.timestamp
  };

  if (msg.type === "text") {
    if (!msg.text || !msg.text.trim()) return "skipped (empty)";
    payload.text = msg.text;
  } else if (msg.type === "image") {
    const res = UrlFetchApp.fetch("https://api-data.line.me/v2/bot/message/" + msg.id + "/content", {
      headers: { "Authorization": "Bearer " + tbGetLineToken_() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      return "error: LINE content fetch " + res.getResponseCode();
    }
    const blob = res.getBlob();
    payload.image = {
      base64: Utilities.base64Encode(blob.getBytes()),
      mediaType: blob.getContentType() || "image/jpeg"
    };
  }

  const resp = UrlFetchApp.fetch(backendUrl, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Ingest-Key": ingestKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();
  if (code === 200) {
    try {
      const body = JSON.parse(resp.getContentText());
      return body.stored ? "stored" : "ok (" + (body.reason || "not stored") + ")";
    } catch (err) {
      return "ok (unparsed response)";
    }
  }
  return "error: backend " + code + " " + resp.getContentText().slice(0, 180);
}

// ============================================================
// SENDER DISPLAY NAME — fetched from LINE, cached 6 hours
// ============================================================
function getSenderName_(event) {
  const userId = event.source.userId || "";
  if (!userId) return "";

  const cache = CacheService.getScriptCache();
  const cacheKey = "line_name_" + userId;
  const cached = cache.get(cacheKey);
  if (cached !== null) return cached;

  const groupId = event.source.groupId || "";
  const name = fetchLineDisplayName_(userId, groupId);
  cache.put(cacheKey, name, 21600);
  return name;
}

function fetchLineDisplayName_(userId, groupId) {
  const url = groupId
    ? "https://api.line.me/v2/bot/group/" + groupId + "/member/" + userId
    : "https://api.line.me/v2/bot/profile/" + userId;
  try {
    const res = UrlFetchApp.fetch(url, {
      headers: { "Authorization": "Bearer " + tbGetLineToken_() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText()).displayName || "";
    }
  } catch (err) {
    Logger.log("Profile fetch failed: " + err.toString());
  }
  return "";
}

// ============================================================
// HELPERS / TESTS
// ============================================================
function tbRespond_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run from the editor to verify BACKEND_URL + INGEST_KEY end-to-end.
// Expected log: "stored". Each run uses a fresh message ID, so it stores
// one test trip — delete it afterwards with the admin trash button in the
// dashboard's trips table.
function testForward() {
  const fakeEvent = {
    type: "message",
    timestamp: Date.now(),
    source: { type: "user", userId: "test-user-apps-script" },
    message: {
      id: "test-" + Date.now(),
      type: "text",
      text: "รถ 71-6213 ออกจากโรงงานสระบุรีไปส่งปูนที่ขอนแก่นครับ ถึงประมาณบ่ายสอง"
    }
  };
  Logger.log(forwardToBackend_(fakeEvent));
}
