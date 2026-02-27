async function sendWhatsAppMessage({ accessToken, phoneNumberId, to, messageText }) {
  if (!accessToken) {
    throw new Error("Missing WhatsApp access token for business.");
  }
  if (!phoneNumberId) {
    throw new Error("Missing WhatsApp phone number ID.");
  }

  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || "v22.0";
  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body: messageText,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`WhatsApp API ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

module.exports = {
  sendWhatsAppMessage,
};
