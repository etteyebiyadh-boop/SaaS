const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const SQLiteStoreFactory = require("connect-sqlite3");
const dotenv = require("dotenv");
const { getDb } = require("./db");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const webhookRoutes = require("./routes/webhook");

dotenv.config();

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);
const port = Number(process.env.PORT) || 3000;

const databaseDir = path.resolve(path.dirname(process.env.DATABASE_PATH || "./data/app.db"));
const sessionDir = path.resolve(path.dirname(process.env.SESSION_DB_PATH || "./data/sessions.db"));
fs.mkdirSync(databaseDir, { recursive: true });
fs.mkdirSync(sessionDir, { recursive: true });

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(
  express.json({
    verify: (req, _res, buffer) => {
      req.rawBody = buffer;
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(
  session({
    store: new SQLiteStore({
      db: path.basename(process.env.SESSION_DB_PATH || "./data/sessions.db"),
      dir: path.dirname(path.resolve(process.env.SESSION_DB_PATH || "./data/sessions.db")),
    }),
    secret: process.env.SESSION_SECRET || "change_this_session_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  return res.redirect("/dashboard");
});

app.use(authRoutes);
app.use(dashboardRoutes);
app.use(webhookRoutes);

app.use((req, res) => {
  res.status(404).send("Not found");
});

async function start() {
  try {
    await getDb();
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

start();
