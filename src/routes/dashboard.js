const express = require("express");
const { getDb } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function clean(value) {
  return String(value || "").trim();
}

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const userId = req.session.user.id;
    const today = todayYmd();

    let business = await db.get("SELECT * FROM businesses WHERE user_id = ?", userId);
    if (!business) {
      const insertResult = await db.run(
        "INSERT INTO businesses (user_id, name) VALUES (?, ?)",
        userId,
        ""
      );
      business = await db.get("SELECT * FROM businesses WHERE id = ?", insertResult.lastID);
    }

    const dailyUsage = await db.get(
      "SELECT replies_sent FROM daily_usage WHERE business_id = ? AND usage_date = ?",
      business.id,
      today
    );

    const todayMessageStats = await db.get(
      `SELECT
          SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) AS inbound_count,
          SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) AS outbound_count
        FROM messages
        WHERE business_id = ?
          AND date(created_at) = date('now')`,
      business.id
    );

    const conversations = await db.all(
      `SELECT
          customer_phone,
          MAX(created_at) AS last_message_at,
          COUNT(*) AS total_messages
        FROM messages
        WHERE business_id = ?
        GROUP BY customer_phone
        ORDER BY last_message_at DESC
        LIMIT 50`,
      business.id
    );

    const messages = await db.all(
      `SELECT id, customer_phone, direction, message_text, source, created_at
       FROM messages
       WHERE business_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      business.id
    );

    let adminBusinesses = [];
    if (req.session.user.role === "admin") {
      adminBusinesses = await db.all(
        `SELECT
            b.id,
            b.name,
            b.plan,
            b.contact_phone,
            u.email,
            COALESCE(du.replies_sent, 0) AS daily_replies
          FROM businesses b
          JOIN users u ON u.id = b.user_id
          LEFT JOIN daily_usage du
            ON du.business_id = b.id
           AND du.usage_date = ?
          ORDER BY b.id DESC`,
        today
      );
    }

    return res.render("dashboard", {
      user: req.session.user,
      business,
      dailyReplies: dailyUsage ? dailyUsage.replies_sent : 0,
      inboundCount: todayMessageStats?.inbound_count || 0,
      outboundCount: todayMessageStats?.outbound_count || 0,
      conversations,
      messages,
      adminBusinesses,
      query: req.query,
    });
  } catch (error) {
    console.error("Dashboard error:", error.message);
    return res.status(500).send("Failed to load dashboard.");
  }
});

router.post("/business-profile", requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const userId = req.session.user.id;

    const business = await db.get("SELECT id FROM businesses WHERE user_id = ?", userId);
    if (!business) {
      return res.status(404).send("Business not found.");
    }

    await db.run(
      `UPDATE businesses
       SET name = ?,
           description = ?,
           services = ?,
           working_hours = ?,
           location = ?,
           contact_phone = ?,
           whatsapp_phone_number_id = ?,
           whatsapp_access_token = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      clean(req.body.name),
      clean(req.body.description),
      clean(req.body.services),
      clean(req.body.working_hours),
      clean(req.body.location),
      clean(req.body.contact_phone),
      clean(req.body.whatsapp_phone_number_id) || null,
      clean(req.body.whatsapp_access_token),
      business.id
    );

    return res.redirect("/dashboard?saved=1");
  } catch (error) {
    console.error("Business profile update error:", error.message);
    if (String(error.message).includes("UNIQUE constraint failed")) {
      return res.redirect("/dashboard?error=whatsapp_phone_number_id_in_use");
    }
    return res.redirect("/dashboard?error=save_failed");
  }
});

router.post("/admin/business/:businessId/plan", requireAdmin, async (req, res) => {
  const plan = String(req.body.plan || "").trim();
  if (!["free", "paid"].includes(plan)) {
    return res.status(400).send("Invalid plan.");
  }

  try {
    const db = await getDb();
    await db.run("UPDATE businesses SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", plan, req.params.businessId);
    return res.redirect("/dashboard?admin_saved=1");
  } catch (error) {
    console.error("Plan update error:", error.message);
    return res.redirect("/dashboard?error=plan_update_failed");
  }
});

module.exports = router;
