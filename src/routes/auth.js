const express = require("express");
const bcrypt = require("bcryptjs");
const { getDb } = require("../db");

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.get("/signup", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  return res.render("signup", { error: null, values: {} });
});

router.post("/signup", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!isValidEmail(email) || password.length < 6) {
    return res.status(400).render("signup", {
      error: "Use a valid email and a password with at least 6 characters.",
      values: { email },
    });
  }

  try {
    const db = await getDb();
    const existing = await db.get("SELECT id FROM users WHERE email = ?", email);
    if (existing) {
      return res.status(409).render("signup", {
        error: "Email already in use.",
        values: { email },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const role = adminEmail && email === adminEmail ? "admin" : "owner";

    const result = await db.run(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
      email,
      passwordHash,
      role
    );

    await db.run("INSERT INTO businesses (user_id, name) VALUES (?, ?)", result.lastID, "");

    req.session.user = {
      id: result.lastID,
      email,
      role,
    };

    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Signup error:", error.message);
    return res.status(500).render("signup", {
      error: "Could not create account.",
      values: { email },
    });
  }
});

router.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  return res.render("login", { error: null, values: {} });
});

router.post("/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  try {
    const db = await getDb();
    const user = await db.get("SELECT * FROM users WHERE email = ?", email);
    if (!user) {
      return res.status(401).render("login", {
        error: "Invalid credentials.",
        values: { email },
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).render("login", {
        error: "Invalid credentials.",
        values: { email },
      });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).render("login", {
      error: "Could not log in.",
      values: { email },
    });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

module.exports = router;
