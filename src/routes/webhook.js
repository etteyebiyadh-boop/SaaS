const crypto = require("crypto");
const express = require("express");
const { getDb } = require("../db");
const { generateAiReply } = require("../services/ai");
const { sendWhatsAppMessage } = require("../services/whatsapp");

const router = express.Router();
const FREE_DAILY_LIMIT = 30;
const LIMIT_MESSAGE = "Please contact the business owner for more information.";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function extractMessageText(message) {
  if (!message) return "";
  if (message.type === "text") return message.text?.body || "";
  if (message.type === "button") return message.button?.text || "";
  if (message.type === "interactive") {
    return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "";
  }
  return "";
}

function isSignatureValid(req) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return true;
  }

  const signatureHeader = req.get("x-hub-signature-256");
  if (!signatureHeader || !req.rawBody) {
    return false;
  }

  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex")}`;
  const headerBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);

  if (headerBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(headerBuffer, expectedBuffer);
}

async function getDailyReplies(db, businessId, usageDate) {
  const row = await db.get(
    "SELECT replies_sent FROM daily_usage WHERE business_id = ? AND usage_date = ?",
    businessId,
    usageDate
  );
  return row ? row.replies_sent : 0;
}

async function incrementDailyReplies(db, businessId, usageDate) {
  await db.run(
    `INSERT INTO daily_usage (business_id, usage_date, replies_sent)
     VALUES (?, ?, 1)
     ON CONFLICT (business_id, usage_date)
     DO UPDATE SET
       replies_sent = replies_sent + 1,
       updated_at = CURRENT_TIMESTAMP`,
    businessId,
    usageDate
  );
}

async function handleIncomingMessage({ phoneNumberId, customerPhone, incomingText, waMessageId }) {
  const db = await getDb();

  const business = await db.get(
    "SELECT * FROM businesses WHERE whatsapp_phone_number_id = ?",
    phoneNumberId
  );
  if (!business) {
    return;
  }

  await db.run(
    `INSERT INTO messages (business_id, customer_phone, direction, message_text, wa_message_id, source)
     VALUES (?, ?, 'inbound', ?, ?, 'customer')`,
    business.id,
    customerPhone,
    incomingText,
    waMessageId || null
  );

  const usageDate = todayYmd();
  const usedReplies = await getDailyReplies(db, business.id, usageDate);

  let outgoingText = "";
  let source = "ai";

  if (business.plan === "free" && usedReplies >= FREE_DAILY_LIMIT) {
    outgoingText = LIMIT_MESSAGE;
    source = "system_limit";
  } else {
    outgoingText = await generateAiReply(business, incomingText);
  }

  let outboundWaMessageId = null;
  let finalSource = source;
  let sentSuccessfully = false;

  try {
    const response = await sendWhatsAppMessage({
      accessToken: business.whatsapp_access_token,
      phoneNumberId,
      to: customerPhone,
      messageText: outgoingText,
    });
    outboundWaMessageId = response?.messages?.[0]?.id || null;
    sentSuccessfully = true;
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error.message);
    finalSource = "system";
  }

  await db.run(
    `INSERT INTO messages (business_id, customer_phone, direction, message_text, wa_message_id, source)
     VALUES (?, ?, 'outbound', ?, ?, ?)`,
    business.id,
    customerPhone,
    outgoingText,
    outboundWaMessageId,
    finalSource
  );

  if (business.plan === "free" && source === "ai" && sentSuccessfully) {
    await incrementDailyReplies(db, business.id, usageDate);
  }
}

router.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.WHATSAPP_VERIFY_TOKEN &&
    challenge
  ) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post("/webhook/whatsapp", async (req, res) => {
  if (!isSignatureValid(req)) {
    return res.sendStatus(403);
  }

  const entries = Array.isArray(req.body.entry) ? req.body.entry : [];

  try {
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change.field !== "messages") {
          continue;
        }

        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        const incomingMessages = Array.isArray(value.messages) ? value.messages : [];

        for (const message of incomingMessages) {
          const customerPhone = message.from;
          const incomingText = extractMessageText(message);

          if (!phoneNumberId || !customerPhone || !incomingText) {
            continue;
          }

          try {
            await handleIncomingMessage({
              phoneNumberId,
              customerPhone,
              incomingText,
              waMessageId: message.id,
            });
          } catch (messageError) {
            console.error("Failed to process incoming message:", messageError.message);
          }
        }
      }
    }
  } catch (error) {
    console.error("Webhook processing error:", error.message);
  }

  return res.sendStatus(200);
});

module.exports = router;
