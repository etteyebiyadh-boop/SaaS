const OpenAI = require("openai");

let openaiClient;

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function buildBusinessContext(business) {
  return [
    `Business name: ${business.name || "Not provided"}`,
    `Description: ${business.description || "Not provided"}`,
    `Services and prices: ${business.services || "Not provided"}`,
    `Working hours: ${business.working_hours || "Not provided"}`,
    `Location: ${business.location || "Not provided"}`,
    `Contact phone: ${business.contact_phone || "Not provided"}`,
  ].join("\n");
}

async function generateAiReply(business, customerMessage) {
  const client = getOpenAiClient();
  if (!client) {
    return "Thanks for your message. Please contact the business owner for more information.";
  }

  const systemPrompt = [
    "You are a professional business assistant replying to WhatsApp customers.",
    "Answer ONLY using BUSINESS_DATA.",
    "Keep the reply short, polite, and sales-oriented.",
    "If info is missing, ask a short clarification question.",
    "Do not invent services, prices, hours, or policies.",
    "Maximum length: 60 words.",
  ].join(" ");

  const userPrompt = [
    "BUSINESS_DATA:",
    buildBusinessContext(business),
    "",
    `CUSTOMER_MESSAGE: ${customerMessage}`,
    "",
    "Write a direct customer reply now.",
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 150,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return "Thanks for your message. Could you share a bit more detail so we can help you better?";
    }
    return reply;
  } catch (error) {
    console.error("OpenAI error:", error.message);
    return "Thanks for your message. Please contact the business owner for more information.";
  }
}

module.exports = {
  generateAiReply,
};
