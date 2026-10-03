import "dotenv/config";
import { randomBytes, randomInt, randomUUID, scrypt as scryptCallback, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import express, { type NextFunction, type Request, type Response } from "express";
import mysql from "mysql2/promise";

const scrypt = promisify(scryptCallback);
const app = express();

console.log("MYSQL_PASSWORD loaded:", !!process.env.MYSQL_PASSWORD);
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE ?? "annaseva",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: ["DATE"],
});

app.use(express.json({ limit: "32kb" }));

type Role = "beneficiary" | "shopkeeper" | "admin";
type CurrentUser = { id: string; email: string; role: Role; full_name: string };
type ApiRequest = Request & { currentUser?: CurrentUser };

function cookieValue(request: Request, name: string) {
  const header = request.headers.cookie ?? "";
  const entry = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

function sendError(response: Response, status: number, message: string) {
  response.status(status).json({ error: message });
}

function asyncRoute(handler: (request: ApiRequest, response: Response) => Promise<unknown>) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request as ApiRequest, response)).catch(next);
  };
}

async function sessionUser(request: Request): Promise<CurrentUser | null> {
  const token = cookieValue(request, "annaseva_session");
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT u.id, u.email, ur.role, p.full_name
     FROM app_sessions s
     JOIN app_users u ON u.id = s.user_id
     JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN profiles p ON p.id = u.id
     WHERE s.token_hash = ? AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );
  return (rows[0] as CurrentUser | undefined) ?? null;
}

function requireUser(roles?: Role[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    sessionUser(request).then((user) => {
      if (!user) return sendError(response, 401, "Please sign in again.");
      if (roles && !roles.includes(user.role)) return sendError(response, 403, "You are not allowed to do that.");
      (request as ApiRequest).currentUser = user;
      next();
    }).catch(next);
  };
}

function current(request: ApiRequest) {
  if (!request.currentUser) throw new Error("Authentication required");
  return request.currentUser;
}

function requiredString(value: unknown, label: string, maxLength = 255) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function publicUser(user: CurrentUser) {
  return { id: user.id, email: user.email, role: user.role, full_name: user.full_name };
}

async function notifyUser(userId: string, title: string, message: string, type: string) {
  await pool.execute(
    "INSERT INTO notifications (id, user_id, title, message, notification_type) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), userId, title, message, type],
  );
}

async function notifyAdmins(title: string, message: string, type: string) {
  const [admins] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT user_id FROM user_roles WHERE role = 'admin'",
  );
  for (const admin of admins) {
    await notifyUser(admin.user_id, title, message, type);
  }
}

app.get("/api/health", asyncRoute(async (_request, response) => {
  await pool.query("SELECT 1");
  response.json({ ok: true, database: process.env.MYSQL_DATABASE ?? "annaseva" });
}));

app.post("/api/auth/signup", asyncRoute(async (request, response) => {
  const email = requiredString(request.body.email, "Email", 320).toLowerCase();
  const password = requiredString(request.body.password, "Password", 200);
  const fullName = requiredString(request.body.fullName, "Full name");
  const mobile = requiredString(request.body.mobile, "Mobile number", 32);
  const role = request.body.role as Role;
  if (password.length < 6) return sendError(response, 400, "Password must be at least 6 characters.");
  if (!["beneficiary", "shopkeeper", "admin"].includes(role)) return sendError(response, 400, "Choose a valid account type.");
  if (role === "admin") return sendError(response, 403, "Admin accounts must be created by an administrator in MySQL.");

  const salt = randomBytes(16);
  const passwordHash = `${salt.toString("hex")}:${(await scrypt(password, salt, 64) as Buffer).toString("hex")}`;
  const userId = randomUUID();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("INSERT INTO app_users (id, email, password_hash) VALUES (?, ?, ?)", [userId, email, passwordHash]);
    await connection.execute("INSERT INTO profiles (id, full_name, mobile_number) VALUES (?, ?, ?)", [userId, fullName, mobile]);
    await connection.execute("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)", [randomUUID(), userId, role]);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await connection.execute("INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))", [tokenHash, userId]);
    await connection.commit();
    response.cookie("annaseva_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 });
    response.status(201).json({ user: { id: userId, email, full_name: fullName, role } });
  } catch (error) {
    await connection.rollback();
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return sendError(response, 409, "An account with this email already exists.");
    throw error;
  } finally {
    connection.release();
  }
}));

app.get("/api/auth/admin-bootstrap-status", asyncRoute(async (_request, response) => {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM user_roles WHERE role = 'admin'",
  );
  response.json({ available: Number(rows[0].count) === 0 });
}));

app.post("/api/auth/admin-bootstrap", asyncRoute(async (request, response) => {
  const email = requiredString(request.body.email, "Email", 320).toLowerCase();
  const password = requiredString(request.body.password, "Password", 200);
  const fullName = requiredString(request.body.fullName, "Full name");
  const mobile = requiredString(request.body.mobile, "Mobile number", 32);
  if (password.length < 8) return sendError(response, 400, "Admin password must be at least 8 characters.");

  const connection = await pool.getConnection();
  let lockAcquired = false;
  let transactionStarted = false;
  try {
    const [lockRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT GET_LOCK('annaseva_admin_bootstrap', 5) AS acquired",
    );
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) return sendError(response, 503, "Admin account setup is busy. Try again shortly.");

    const [existingAdmins] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM user_roles WHERE role = 'admin'",
    );
    if (Number(existingAdmins[0].count) > 0) {
      return sendError(response, 409, "The first admin account already exists. Ask an administrator to provision another account.");
    }

    const salt = randomBytes(16);
    const passwordHash = `${salt.toString("hex")}:${(await scrypt(password, salt, 64) as Buffer).toString("hex")}`;
    const userId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.execute("INSERT INTO app_users (id, email, password_hash) VALUES (?, ?, ?)", [userId, email, passwordHash]);
    await connection.execute("INSERT INTO profiles (id, full_name, mobile_number) VALUES (?, ?, ?)", [userId, fullName, mobile]);
    await connection.execute("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin')", [randomUUID(), userId]);
    await connection.execute(
      "INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))",
      [createHash("sha256").update(token).digest("hex"), userId],
    );
    await connection.commit();
    transactionStarted = false;
    response.cookie("annaseva_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 });
    response.status(201).json({ user: { id: userId, email, full_name: fullName, role: "admin" } });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return sendError(response, 409, "An account with this email already exists.");
    throw error;
  } finally {
    if (lockAcquired) await connection.query("SELECT RELEASE_LOCK('annaseva_admin_bootstrap')");
    connection.release();
  }
}));

app.post("/api/auth/signin", asyncRoute(async (request, response) => {
  const email = requiredString(request.body.email, "Email", 320).toLowerCase();
  const password = requiredString(request.body.password, "Password", 200);
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT u.id, u.email, u.password_hash, ur.role, p.full_name
     FROM app_users u JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN profiles p ON p.id = u.id WHERE u.email = ? LIMIT 1`,
    [email],
  );
  const user = rows[0] as (CurrentUser & { password_hash: string }) | undefined;
  if (!user) return sendError(response, 401, "Incorrect email or password.");
  const [saltHex, hashHex] = user.password_hash.split(":");
  if (!saltHex || !hashHex) return sendError(response, 401, "Incorrect email or password.");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), 64) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return sendError(response, 401, "Incorrect email or password.");
  const token = randomBytes(32).toString("base64url");
  await pool.execute("INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))", [createHash("sha256").update(token).digest("hex"), user.id]);
  response.cookie("annaseva_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 });
  response.json({ user: publicUser(user) });
}));

app.get("/api/auth/me", asyncRoute(async (request, response) => {
  response.json({ user: await sessionUser(request) });
}));

app.post("/api/auth/signout", asyncRoute(async (request, response) => {
  const token = cookieValue(request, "annaseva_session");
  if (token) await pool.execute("DELETE FROM app_sessions WHERE token_hash = ?", [createHash("sha256").update(token).digest("hex")]);
  response.clearCookie("annaseva_session", { httpOnly: true, sameSite: "lax", path: "/" });
  response.json({ ok: true });
}));

app.get("/api/shops", requireUser(), asyncRoute(async (_request, response) => {
  const [rows] = await pool.query("SELECT id, shop_name, shop_code, district, status FROM fps_shops WHERE status = 'active' ORDER BY shop_code");
  response.json(rows);
}));

app.get("/api/beneficiary/verification", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT phone_verified_at, aadhaar_last4, identity_status, submitted_at, reviewed_at, review_note FROM user_verifications WHERE user_id = ?",
    [current(request).id],
  );
  response.json(rows[0] ?? { phone_verified_at: null, aadhaar_last4: null, identity_status: "not_submitted", submitted_at: null, reviewed_at: null, review_note: null });
}));

app.post("/api/beneficiary/verification/otp/send", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  if (process.env.NODE_ENV === "production") return sendError(response, 503, "SMS delivery is not configured. Contact the administrator to enable a verified SMS provider.");
  const user = current(request);
  const [profiles] = await pool.execute<mysql.RowDataPacket[]>("SELECT mobile_number FROM profiles WHERE id = ?", [user.id]);
  const mobile = requiredString(profiles[0]?.mobile_number, "A registered mobile number").replace(/\s+/g, "");
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = createHash("sha256").update(`${user.id}:${code}`).digest("hex");
  await pool.execute("UPDATE mobile_otp_challenges SET consumed_at = NOW() WHERE user_id = ? AND consumed_at IS NULL", [user.id]);
  await pool.execute(
    "INSERT INTO mobile_otp_challenges (id, user_id, mobile_number, code_hash, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))",
    [randomUUID(), user.id, mobile, codeHash],
  );
  response.json({ sent: true, masked_mobile: `${mobile.slice(0, 2)}******${mobile.slice(-2)}`, demo_code: code });
}));

app.post("/api/beneficiary/verification/otp/verify", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  const userId = current(request).id;
  const code = requiredString(request.body.code, "6-digit code", 6);
  if (!/^\d{6}$/.test(code)) return sendError(response, 400, "Enter the 6-digit code.");
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, code_hash, attempts FROM mobile_otp_challenges
     WHERE user_id = ? AND consumed_at IS NULL AND expires_at > NOW() AND attempts < 5
     ORDER BY created_at DESC LIMIT 1`, [userId],
  );
  const challenge = rows[0];
  if (!challenge) return sendError(response, 400, "No valid code found. Request a new code.");
  const expected = Buffer.from(challenge.code_hash, "hex");
  const provided = Buffer.from(createHash("sha256").update(`${userId}:${code}`).digest("hex"), "hex");
  if (!timingSafeEqual(expected, provided)) {
    await pool.execute("UPDATE mobile_otp_challenges SET attempts = attempts + 1 WHERE id = ?", [challenge.id]);
    return sendError(response, 400, "That code is incorrect.");
  }
  await pool.execute("UPDATE mobile_otp_challenges SET consumed_at = NOW() WHERE id = ?", [challenge.id]);
  await pool.execute(
    `INSERT INTO user_verifications (user_id, phone_verified_at)
     VALUES (?, NOW()) ON DUPLICATE KEY UPDATE phone_verified_at = VALUES(phone_verified_at)`, [userId],
  );
  response.json({ verified: true });
}));

app.post("/api/beneficiary/verification/submit", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  const userId = current(request).id;
  const aadhaarLast4 = requiredString(request.body.aadhaarLast4, "Aadhaar last four digits", 4);
  if (!/^\d{4}$/.test(aadhaarLast4)) return sendError(response, 400, "Enter exactly four digits.");
  const [rows] = await pool.execute<mysql.RowDataPacket[]>("SELECT phone_verified_at FROM user_verifications WHERE user_id = ?", [userId]);
  if (!rows[0]?.phone_verified_at) return sendError(response, 400, "Verify your mobile number first.");
  await pool.execute(
    `INSERT INTO user_verifications (user_id, aadhaar_last4, identity_status, submitted_at, reviewed_at, reviewed_by, review_note)
     VALUES (?, ?, 'pending', NOW(), NULL, NULL, NULL)
     ON DUPLICATE KEY UPDATE aadhaar_last4 = VALUES(aadhaar_last4), identity_status = 'pending', submitted_at = NOW(), reviewed_at = NULL, reviewed_by = NULL, review_note = NULL`,
    [userId, aadhaarLast4],
  );
  await pool.execute("UPDATE ration_cards SET aadhaar_last4 = ?, verification_status = 'pending' WHERE user_id = ?", [aadhaarLast4, userId]);
  await notifyAdmins("Identity review requested", `${current(request).full_name} submitted a demo identity review.`, "verification");
  response.status(202).json({ status: "pending" });
}));

app.get("/api/beneficiary/profile", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  const user = current(request);
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT bp.*, rc.id AS card_id, rc.masked_card_number, rc.card_category, rc.aadhaar_last4, rc.verification_status,
       uv.phone_verified_at, uv.identity_status,
       fs.id AS shop_id, fs.shop_name, fs.shop_code, fs.district, fs.operating_hours
     FROM beneficiary_profiles bp
     LEFT JOIN ration_cards rc ON rc.id = bp.ration_card_id
     LEFT JOIN user_verifications uv ON uv.user_id = bp.user_id
     LEFT JOIN fps_shops fs ON fs.id = bp.fps_id WHERE bp.user_id = ? LIMIT 1`,
    [user.id],
  );
  const row = rows[0];
  if (!row) return response.json(null);
  response.json({
    id: row.id, user_id: row.user_id, ration_card_id: row.ration_card_id, fps_id: row.fps_id, family_size: row.family_size,
    verification: { phone_verified_at: row.phone_verified_at, identity_status: row.identity_status ?? "not_submitted" },
    ration_cards: row.card_id ? { id: row.card_id, masked_card_number: row.masked_card_number, card_category: row.card_category, aadhaar_last4: row.aadhaar_last4, verification_status: row.identity_status ?? row.verification_status } : null,
    fps_shops: row.shop_id ? { id: row.shop_id, shop_name: row.shop_name, shop_code: row.shop_code, district: row.district, operating_hours: row.operating_hours } : null,
  });
}));

app.post("/api/beneficiary/setup", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  const user = current(request);
  const familySize = Number(request.body.familySize);
  const category = requiredString(request.body.category, "Card category", 32);
  const fpsId = requiredString(request.body.fpsId, "Fair price shop", 36);
  const aadhaarLast4 = request.body.aadhaarLast4 ? requiredString(request.body.aadhaarLast4, "Aadhaar last four digits", 4) : null;
  if (!Number.isInteger(familySize) || familySize < 1 || familySize > 20) return sendError(response, 400, "Family size must be between 1 and 20.");
  if (!["Yellow", "Orange", "White"].includes(category)) return sendError(response, 400, "Choose a valid card category.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute<mysql.RowDataPacket[]>("SELECT id FROM beneficiary_profiles WHERE user_id = ? FOR UPDATE", [user.id]);
    if (existing.length) throw new Error("Your ration profile is already set up.");
    const cardId = randomUUID();
    const profileId = randomUUID();
    const cardNumber = `RC-****-${randomBytes(2).readUInt16BE() % 9000 + 1000}`;
    await connection.execute("INSERT INTO ration_cards (id, user_id, masked_card_number, card_category, aadhaar_last4) VALUES (?, ?, ?, ?, ?)", [cardId, user.id, cardNumber, category, aadhaarLast4]);
    await connection.execute("INSERT INTO beneficiary_profiles (id, user_id, ration_card_id, fps_id, family_size) VALUES (?, ?, ?, ?, ?)", [profileId, user.id, cardId, fpsId, familySize]);
    await connection.commit();
    response.status(201).json({ id: profileId });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get("/api/beneficiary/entitlements", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  const category = requiredString(request.query.category, "Card category", 32);
  const [rows] = await pool.execute(
    `SELECT er.*, JSON_OBJECT('id', ri.id, 'item_name', ri.item_name, 'unit', ri.unit) AS ration_items
     FROM entitlement_rules er JOIN ration_items ri ON ri.id = er.item_id
     WHERE er.card_category = ? AND er.active = TRUE ORDER BY ri.item_name`, [category],
  );
  response.json(rows);
}));

app.get("/api/beneficiary/stock", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  const user = current(request);
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT st.*, ri.item_name, ri.unit, fs.shop_name, fs.operating_hours
     FROM fps_stock st JOIN ration_items ri ON ri.id = st.item_id
     JOIN fps_shops fs ON fs.id = st.fps_id
     JOIN beneficiary_profiles bp ON bp.fps_id = st.fps_id
     WHERE bp.user_id = ? ORDER BY ri.item_name`, [user.id],
  );
  response.json(rows.map((row) => ({ ...row, ration_items: { item_name: row.item_name, unit: row.unit }, fps_shops: { shop_name: row.shop_name, operating_hours: row.operating_hours } })));
}));

app.get("/api/beneficiary/bookings", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  const user = current(request);
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT b.* FROM bookings b JOIN beneficiary_profiles bp ON bp.id = b.beneficiary_id
     WHERE bp.user_id = ? ORDER BY b.created_at DESC`, [user.id],
  );
  response.json(await attachBookingItems(rows));
}));

async function attachBookingItems(bookings: mysql.RowDataPacket[]) {
  if (!bookings.length) return [];
  const ids = bookings.map((booking) => booking.id as string);
  const placeholders = ids.map(() => "?").join(",");
  const [items] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT bi.*, ri.item_name, ri.unit FROM booking_items bi JOIN ration_items ri ON ri.id = bi.item_id WHERE bi.booking_id IN (${placeholders})`, ids,
  );
  return bookings.map((booking) => ({
    ...booking,
    booking_items: items.filter((item) => item.booking_id === booking.id).map((item) => ({ ...item, ration_items: { item_name: item.item_name, unit: item.unit } })),
  }));
}

app.post("/api/beneficiary/bookings", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  const user = current(request);
  const collectionDate = requiredString(request.body.collectionDate, "Collection date", 10);
  const slot = requiredString(request.body.slot, "Collection time slot", 64);
  const [verificationRows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT phone_verified_at FROM user_verifications WHERE user_id = ?", [user.id],
  );
  if (!verificationRows[0]?.phone_verified_at) {
    return sendError(response, 403, "Verify your mobile number before booking.");
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [profiles] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT bp.id, bp.fps_id, bp.family_size, rc.card_category FROM beneficiary_profiles bp
       JOIN ration_cards rc ON rc.id = bp.ration_card_id WHERE bp.user_id = ? FOR UPDATE`, [user.id],
    );
    const profile = profiles[0];
    if (!profile) throw new Error("Set up your ration profile before booking.");
    const [shopRows] = await connection.execute<mysql.RowDataPacket[]>("SELECT status FROM fps_shops WHERE id = ?", [profile.fps_id]);
    if (shopRows[0]?.status !== "active") throw new Error("Your fair price shop is currently closed.");
    const bookingId = randomUUID();
    const bookingCode = `BK-${randomBytes(4).toString("hex").toUpperCase()}`;
    await connection.execute(
      "INSERT INTO bookings (id, booking_code, beneficiary_id, fps_id, collection_date, collection_slot) VALUES (?, ?, ?, ?, ?, ?)",
      [bookingId, bookingCode, profile.id, profile.fps_id, collectionDate, slot],
    );
    const [entitlements] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT er.item_id, er.quantity_per_person FROM entitlement_rules er
       WHERE er.card_category = ? AND er.active = TRUE AND er.quantity_per_person > 0`, [profile.card_category],
    );
    for (const item of entitlements) {
      await connection.execute("INSERT INTO booking_items (id, booking_id, item_id, requested_quantity) VALUES (?, ?, ?, ?)", [randomUUID(), bookingId, item.item_id, Number(item.quantity_per_person) * Number(profile.family_size)]);
    }
    await connection.commit();
    const [shopkeepers] = await pool.execute<mysql.RowDataPacket[]>("SELECT user_id FROM shopkeepers WHERE fps_id = ?", [profile.fps_id]);
    for (const shopkeeper of shopkeepers) {
      await notifyUser(shopkeeper.user_id, "New ration booking", `Booking ${bookingCode} needs review.`, "booking");
    }
    response.status(201).json({ id: bookingId, booking_code: bookingCode });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get("/api/beneficiary/notifications", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  const [rows] = await pool.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", [current(request).id]);
  response.json(rows);
}));
app.patch("/api/beneficiary/notifications/:id/read", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  await pool.execute("UPDATE notifications SET read_status = TRUE WHERE id = ? AND user_id = ?", [request.params.id, current(request).id]);
  response.json({ ok: true });
}));
app.post("/api/beneficiary/complaints", requireUser(["beneficiary"]), asyncRoute(async (request, response) => {
  const user = current(request);
  const [rows] = await pool.execute<mysql.RowDataPacket[]>("SELECT id, fps_id FROM beneficiary_profiles WHERE user_id = ?", [user.id]);
  if (!rows.length) return sendError(response, 400, "Set up your ration profile first.");
  const complaintId = randomUUID();
  await pool.execute("INSERT INTO complaints (id, beneficiary_id, fps_id, category, description) VALUES (?, ?, ?, ?, ?)", [complaintId, rows[0].id, rows[0].fps_id, requiredString(request.body.category, "Category", 120), requiredString(request.body.description, "Description", 5000)]);
  response.status(201).json({ id: complaintId });
}));

app.get("/api/shopkeeper/profile", requireUser(["shopkeeper"]), asyncRoute(async (request, response) => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT sk.*, fs.shop_name, fs.shop_code, fs.district FROM shopkeepers sk
     LEFT JOIN fps_shops fs ON fs.id = sk.fps_id WHERE sk.user_id = ? LIMIT 1`, [current(request).id],
  );
  const row = rows[0];
  response.json(row ? { ...row, fps_shops: { shop_name: row.shop_name, shop_code: row.shop_code, district: row.district } } : null);
}));
app.post("/api/shopkeeper/setup", requireUser(["shopkeeper"]), asyncRoute(async (request, response) => {
  const fpsId = requiredString(request.body.fpsId, "Fair price shop", 36);
  await pool.execute("INSERT INTO shopkeepers (id, user_id, fps_id) VALUES (?, ?, ?)", [randomUUID(), current(request).id, fpsId]);
  response.status(201).json({ ok: true });
}));
app.get("/api/shopkeeper/dashboard", requireUser(["shopkeeper"]), asyncRoute(async (request, response) => {
  const userId = current(request).id;
  const [shops] = await pool.execute<mysql.RowDataPacket[]>("SELECT fps_id FROM shopkeepers WHERE user_id = ?", [userId]);
  const fpsId = shops[0]?.fps_id;
  if (!fpsId) return response.json({ bookings: [], stock: [], distributions: [] });
  const [[bookings], [stock], [distributions]] = await Promise.all([
    pool.execute<mysql.RowDataPacket[]>("SELECT id, status FROM bookings WHERE fps_id = ?", [fpsId]),
    pool.execute<mysql.RowDataPacket[]>("SELECT closing_stock, minimum_threshold FROM fps_stock WHERE fps_id = ?", [fpsId]),
    pool.execute<mysql.RowDataPacket[]>("SELECT id, distribution_date FROM distribution_records WHERE fps_id = ?", [fpsId]),
  ]);
  response.json({ bookings, stock, distributions });
}));
app.get("/api/shopkeeper/bookings", requireUser(["shopkeeper"]), asyncRoute(async (request, response) => {
  const user = current(request);
  const status = typeof request.query.status === "string" ? request.query.status : null;
  const [shops] = await pool.execute<mysql.RowDataPacket[]>("SELECT fps_id FROM shopkeepers WHERE user_id = ?", [user.id]);
  if (!shops.length || !shops[0].fps_id) return response.json([]);
  const params: mysql.ExecuteValues[] = [shops[0].fps_id as string];
  let statusSql = "";
  if (status) { statusSql = " AND b.status = ?"; params.push(status); }
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT b.*, bp.family_size, rc.masked_card_number, rc.card_category, bp.user_id AS beneficiary_user_id
     FROM bookings b JOIN beneficiary_profiles bp ON bp.id = b.beneficiary_id
     LEFT JOIN ration_cards rc ON rc.id = bp.ration_card_id
     WHERE b.fps_id = ?${statusSql} ORDER BY b.created_at DESC`, params,
  );
  const result = await attachBookingItems(rows);
  response.json(result.map((booking: Record<string, unknown>) => ({
    ...booking,
    beneficiary_profiles: {
      family_size: booking.family_size,
      user_id: booking.beneficiary_user_id,
      ration_cards: { masked_card_number: booking.masked_card_number, card_category: booking.card_category },
    },
  })));
}));
app.patch("/api/shopkeeper/bookings/:id", requireUser(["shopkeeper"]), asyncRoute(async (request, response) => {
  const status = requiredString(request.body.status, "Booking status", 32);
  if (!["approved", "rejected"].includes(status)) return sendError(response, 400, "Invalid booking status.");
  const reason = status === "rejected" ? requiredString(request.body.rejectionReason ?? "Not specified", "Rejection reason", 1000) : null;
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE bookings b JOIN shopkeepers sk ON sk.fps_id = b.fps_id
     SET b.status = ?, b.rejection_reason = ?
     WHERE b.id = ? AND sk.user_id = ? AND b.status = 'pending'`, [status, reason, request.params.id, current(request).id],
  );
  if (!result.affectedRows) return sendError(response, 404, "Pending booking not found for your shop.");
  const [beneficiaries] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT bp.user_id, b.booking_code FROM bookings b JOIN beneficiary_profiles bp ON bp.id = b.beneficiary_id WHERE b.id = ?",
    [request.params.id],
  );
  if (beneficiaries[0]) {
    await notifyUser(
      beneficiaries[0].user_id,
      status === "approved" ? "Booking approved" : "Booking rejected",
      status === "approved" ? `Your booking ${beneficiaries[0].booking_code} was approved.` : `Your booking ${beneficiaries[0].booking_code} was rejected: ${reason}`,
      "booking",
    );
  }
  response.json({ ok: true });
}));
app.get("/api/shopkeeper/stock", requireUser(["shopkeeper"]), asyncRoute(async (request, response) => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT st.*, ri.item_name, ri.unit FROM fps_stock st
     JOIN ration_items ri ON ri.id = st.item_id JOIN shopkeepers sk ON sk.fps_id = st.fps_id
     WHERE sk.user_id = ? ORDER BY ri.item_name`, [current(request).id],
  );
  response.json(rows.map((row) => ({ ...row, ration_items: { item_name: row.item_name, unit: row.unit } })));
}));
app.post("/api/shopkeeper/stock/:id/receive", requireUser(["shopkeeper"]), asyncRoute(async (request, response) => {
  const qty = Number(request.body.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return sendError(response, 400, "Quantity must be greater than zero.");
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT st.fps_id, st.item_id FROM fps_stock st JOIN shopkeepers sk ON sk.fps_id = st.fps_id
     WHERE st.id = ? AND sk.user_id = ?`, [request.params.id, current(request).id],
  );
  if (!rows.length) return sendError(response, 404, "Stock row not found for your shop.");
  const requestId = randomUUID();
  await pool.execute(
    "INSERT INTO stock_refill_requests (id, shopkeeper_user_id, fps_id, item_id, quantity) VALUES (?, ?, ?, ?, ?)",
    [requestId, current(request).id, rows[0].fps_id, rows[0].item_id, qty],
  );
  await notifyAdmins("Stock refill requested", `A shop requested ${qty} units of an item.`, "stock_refill");
  response.status(202).json({ id: requestId, status: "pending" });
}));

app.get("/api/shopkeeper/refills", requireUser(["shopkeeper"]), asyncRoute(async (request, response) => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT r.*, ri.item_name, ri.unit, fs.shop_name FROM stock_refill_requests r
     JOIN ration_items ri ON ri.id = r.item_id JOIN fps_shops fs ON fs.id = r.fps_id
     WHERE r.shopkeeper_user_id = ? ORDER BY r.created_at DESC LIMIT 50`, [current(request).id],
  );
  response.json(rows);
}));

app.get("/api/shopkeeper/complaints", requireUser(["shopkeeper"]), asyncRoute(async (request, response) => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT c.*, rc.masked_card_number, p.full_name AS beneficiary_name
     FROM complaints c JOIN shopkeepers sk ON sk.fps_id = c.fps_id
     JOIN beneficiary_profiles bp ON bp.id = c.beneficiary_id
     JOIN profiles p ON p.id = bp.user_id
     LEFT JOIN ration_cards rc ON rc.id = bp.ration_card_id
     WHERE sk.user_id = ? ORDER BY c.created_at DESC LIMIT 100`, [current(request).id],
  );
  response.json(rows);
}));

app.patch("/api/shopkeeper/complaints/:id", requireUser(["shopkeeper"]), asyncRoute(async (request, response) => {
  const status = requiredString(request.body.status, "Complaint status", 32);
  if (!["in_progress", "resolved"].includes(status)) return sendError(response, 400, "Invalid complaint status.");
  const reply = requiredString(request.body.reply, "Response", 2000);
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE complaints c JOIN shopkeepers sk ON sk.fps_id = c.fps_id
     SET c.status = ?, c.resolution_notes = ?
     WHERE c.id = ? AND sk.user_id = ? AND c.status IN ('open', 'in_progress')`,
    [status, reply, request.params.id, current(request).id],
  );
  if (!result.affectedRows) return sendError(response, 404, "Open complaint not found for your shop.");
  const [beneficiaries] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT bp.user_id FROM complaints c JOIN beneficiary_profiles bp ON bp.id = c.beneficiary_id WHERE c.id = ?",
    [request.params.id],
  );
  if (beneficiaries[0]) await notifyUser(beneficiaries[0].user_id, "Shop replied to your complaint", reply, "complaint");
  response.json({ ok: true });
}));

app.get("/api/notifications", requireUser(), asyncRoute(async (request, response) => {
  const [rows] = await pool.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", [current(request).id]);
  response.json(rows);
}));
app.patch("/api/notifications/:id/read", requireUser(), asyncRoute(async (request, response) => {
  await pool.execute("UPDATE notifications SET read_status = TRUE WHERE id = ? AND user_id = ?", [request.params.id, current(request).id]);
  response.json({ ok: true });
}));
app.post("/api/shopkeeper/distributions", requireUser(["shopkeeper"]), asyncRoute(async (request, response) => {
  const user = current(request);
  const bookingId = requiredString(request.body.bookingId, "Booking", 36);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [bookings] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT b.*, sk.user_id AS shopkeeper_user_id FROM bookings b
       JOIN shopkeepers sk ON sk.fps_id = b.fps_id
       WHERE b.id = ? AND sk.user_id = ? AND b.status = 'approved' FOR UPDATE`, [bookingId, user.id],
    );
    const booking = bookings[0];
    if (!booking) throw new Error("Approved booking not found for your shop.");
    const [items] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT bi.*, ri.unit, ri.item_name FROM booking_items bi JOIN ration_items ri ON ri.id = bi.item_id WHERE bi.booking_id = ?`, [bookingId],
    );
    for (const item of items) {
      const [stocks] = await connection.execute<mysql.RowDataPacket[]>(
        "SELECT id, closing_stock FROM fps_stock WHERE fps_id = ? AND item_id = ? FOR UPDATE", [booking.fps_id, item.item_id],
      );
      if (!stocks.length || Number(stocks[0].closing_stock) < Number(item.requested_quantity)) throw new Error(`Not enough stock for ${item.item_name}.`);
    }
    const distributionId = randomUUID();
    const distributionCode = `DN-${randomBytes(4).toString("hex").toUpperCase()}`;
    await connection.execute(
      "INSERT INTO distribution_records (id, distribution_code, booking_id, beneficiary_id, fps_id, distributed_by) VALUES (?, ?, ?, ?, ?, ?)",
      [distributionId, distributionCode, bookingId, booking.beneficiary_id, booking.fps_id, user.id],
    );
    for (const item of items) {
      await connection.execute("INSERT INTO distribution_items (id, distribution_id, item_id, quantity_distributed, unit) VALUES (?, ?, ?, ?, ?)", [randomUUID(), distributionId, item.item_id, item.requested_quantity, item.unit]);
      await connection.execute("UPDATE fps_stock SET closing_stock = closing_stock - ?, distributed_stock = distributed_stock + ? WHERE fps_id = ? AND item_id = ?", [item.requested_quantity, item.requested_quantity, booking.fps_id, item.item_id]);
    }
    await connection.execute("UPDATE bookings SET status = 'completed' WHERE id = ?", [bookingId]);
    const [beneficiaries] = await connection.execute<mysql.RowDataPacket[]>("SELECT user_id FROM beneficiary_profiles WHERE id = ?", [booking.beneficiary_id]);
    if (beneficiaries[0]) await connection.execute("INSERT INTO notifications (id, user_id, title, message, notification_type) VALUES (?, ?, ?, ?, 'distribution')", [randomUUID(), beneficiaries[0].user_id, "Ration distributed", `Your booking ${booking.booking_code} was distributed. Receipt: ${distributionCode}.`]);
    await connection.commit();
    response.status(201).json({ id: distributionId, distribution_code: distributionCode });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get("/api/admin/overview", requireUser(["admin"]), asyncRoute(async (_request, response) => {
  const [[shops], [bookings], [distributions], [complaints], [users], [shopkeepers], [beneficiaries], [today], [monthDistributions], [monthlyQuantity], [lowStock], [verification], [refills], [trend], [recentComplaints], [stockAlerts]] = await Promise.all([
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM fps_shops"),
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM bookings"),
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM distribution_records"),
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count, SUM(status = 'open') AS open_count FROM complaints"),
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM app_users"),
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(DISTINCT user_id) AS count FROM user_roles WHERE role = 'shopkeeper'"),
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(DISTINCT user_id) AS count FROM user_roles WHERE role = 'beneficiary'"),
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM bookings WHERE booking_date = CURRENT_DATE"),
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM distribution_records WHERE distribution_date >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')"),
    pool.query<mysql.RowDataPacket[]>(
      `SELECT ri.unit, SUM(di.quantity_distributed) AS quantity
       FROM distribution_records dr
       JOIN distribution_items di ON di.distribution_id = dr.id
       JOIN ration_items ri ON ri.id = di.item_id
       WHERE dr.distribution_date >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
       GROUP BY ri.unit ORDER BY ri.unit`,
    ),
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM fps_stock WHERE closing_stock <= minimum_threshold"),
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM user_verifications WHERE identity_status = 'pending'"),
    pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM stock_refill_requests WHERE status = 'pending'"),
    pool.query<mysql.RowDataPacket[]>(
      `SELECT DATE_FORMAT(distribution_date, '%b') AS month, COUNT(*) AS count
       FROM distribution_records WHERE distribution_date >= DATE_SUB(CURRENT_DATE, INTERVAL 5 MONTH)
       GROUP BY YEAR(distribution_date), MONTH(distribution_date), DATE_FORMAT(distribution_date, '%b')
       ORDER BY YEAR(distribution_date), MONTH(distribution_date)`,
    ),
    pool.query<mysql.RowDataPacket[]>(
      "SELECT id, category AS title, description AS message, created_at FROM complaints WHERE status = 'open' ORDER BY created_at DESC LIMIT 4",
    ),
    pool.query<mysql.RowDataPacket[]>(
      `SELECT st.id, ri.item_name, fs.shop_name, st.closing_stock, st.minimum_threshold
       FROM fps_stock st JOIN ration_items ri ON ri.id = st.item_id JOIN fps_shops fs ON fs.id = st.fps_id
       WHERE st.closing_stock <= st.minimum_threshold ORDER BY st.closing_stock ASC LIMIT 4`,
    ),
  ]);
  const alerts = [
    ...recentComplaints.map((row) => ({ id: row.id, type: "complaint", title: row.title, message: row.message, created_at: row.created_at })),
    ...stockAlerts.map((row) => ({ id: row.id, type: "stock", title: `Low stock: ${row.item_name}`, message: `${row.shop_name} has ${row.closing_stock} remaining (minimum ${row.minimum_threshold}).`, created_at: null })),
  ];
  response.json({
    shops: Number(shops[0].count), bookings: Number(bookings[0].count), distributions: Number(distributions[0].count),
    complaints: Number(complaints[0].count), open_complaints: Number(complaints[0].open_count ?? 0),
    users: Number(users[0].count), shopkeepers: Number(shopkeepers[0].count), beneficiaries: Number(beneficiaries[0].count),
    bookings_today: Number(today[0].count), monthly_deliveries: Number(monthDistributions[0].count),
    monthly_quantity: monthlyQuantity.map((row) => ({ unit: row.unit, quantity: Number(row.quantity ?? 0) })),
    low_stock: Number(lowStock[0].count),
    pending_verifications: Number(verification[0].count), pending_refills: Number(refills[0].count),
    trend, alerts: alerts.slice(0, 8),
  });
}));
app.get("/api/admin/shops", requireUser(["admin"]), asyncRoute(async (_request, response) => {
  const [rows] = await pool.query("SELECT * FROM fps_shops ORDER BY shop_code");
  response.json(rows);
}));
app.get("/api/admin/stock", requireUser(["admin"]), asyncRoute(async (_request, response) => {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT st.*, ri.item_name, ri.unit, fs.shop_name, fs.shop_code FROM fps_stock st
     JOIN ration_items ri ON ri.id = st.item_id JOIN fps_shops fs ON fs.id = st.fps_id ORDER BY fs.shop_code, ri.item_name`,
  );
  response.json(rows.map((row) => ({ ...row, ration_items: { item_name: row.item_name, unit: row.unit }, fps_shops: { shop_name: row.shop_name, shop_code: row.shop_code } })));
}));
app.get("/api/admin/predictions", requireUser(["admin"]), asyncRoute(async (_request, response) => {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT ap.*, ri.item_name, ri.unit, fs.shop_name FROM ai_predictions ap
     JOIN ration_items ri ON ri.id = ap.item_id JOIN fps_shops fs ON fs.id = ap.fps_id
     ORDER BY ap.predicted_quantity DESC`,
  );
  response.json(rows.map((row) => ({ ...row, ration_items: { item_name: row.item_name, unit: row.unit }, fps_shops: { shop_name: row.shop_name } })));
}));
app.get("/api/admin/complaints", requireUser(["admin"]), asyncRoute(async (_request, response) => {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT c.*, fs.shop_name, rc.masked_card_number FROM complaints c
     JOIN beneficiary_profiles bp ON bp.id = c.beneficiary_id
     LEFT JOIN fps_shops fs ON fs.id = c.fps_id
     LEFT JOIN ration_cards rc ON rc.id = bp.ration_card_id ORDER BY c.created_at DESC`,
  );
  response.json(rows.map((row) => ({ ...row, fps_shops: { shop_name: row.shop_name }, beneficiary_profiles: { ration_cards: { masked_card_number: row.masked_card_number } } })));
}));
app.patch("/api/admin/complaints/:id", requireUser(["admin"]), asyncRoute(async (request, response) => {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT bp.user_id FROM complaints c JOIN beneficiary_profiles bp ON bp.id = c.beneficiary_id WHERE c.id = ?", [request.params.id],
  );
  await pool.execute("UPDATE complaints SET status = 'resolved', resolution_notes = ? WHERE id = ?", [requiredString(request.body.resolutionNotes, "Resolution notes", 2000), request.params.id]);
  if (rows[0]) await notifyUser(rows[0].user_id, "Complaint resolved", "An administrator resolved your complaint.", "complaint");
  response.json({ ok: true });
}));

app.get("/api/admin/verifications", requireUser(["admin"]), asyncRoute(async (_request, response) => {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT uv.user_id, uv.phone_verified_at, uv.aadhaar_last4, uv.identity_status, uv.submitted_at,
       p.full_name, p.mobile_number, u.email
     FROM user_verifications uv JOIN profiles p ON p.id = uv.user_id
     JOIN app_users u ON u.id = uv.user_id
     WHERE uv.identity_status IN ('pending', 'rejected') ORDER BY uv.submitted_at DESC LIMIT 100`,
  );
  response.json(rows.map((row) => ({ ...row, aadhaar_last4: row.aadhaar_last4 ? `•••• ${row.aadhaar_last4}` : null })));
}));

app.patch("/api/admin/verifications/:userId", requireUser(["admin"]), asyncRoute(async (request, response) => {
  const status = requiredString(request.body.status, "Review status", 32);
  if (!["verified", "rejected"].includes(status)) return sendError(response, 400, "Choose verified or rejected.");
  const note = request.body.note ? requiredString(request.body.note, "Review note", 1000) : null;
  const userId = current(request).id;
  const reviewedUserId = requiredString(request.params.userId, "User", 36);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<mysql.ResultSetHeader>(
      `UPDATE user_verifications SET identity_status = ?, reviewed_at = NOW(), reviewed_by = ?, review_note = ?
       WHERE user_id = ? AND phone_verified_at IS NOT NULL AND aadhaar_last4 IS NOT NULL`,
      [status, userId, note, reviewedUserId],
    );
    if (!result.affectedRows) throw new Error("Pending identity review not found.");
    await connection.execute("UPDATE ration_cards SET verification_status = ? WHERE user_id = ?", [status, reviewedUserId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await notifyUser(reviewedUserId, status === "verified" ? "Identity verified" : "Identity review needs attention", note ?? `Your identity review was ${status}.`, "verification");
  response.json({ status });
}));

app.get("/api/admin/refills", requireUser(["admin"]), asyncRoute(async (_request, response) => {
  const [rows] = await pool.query(
    `SELECT r.*, ri.item_name, ri.unit, fs.shop_name, p.full_name AS shopkeeper_name
     FROM stock_refill_requests r JOIN ration_items ri ON ri.id = r.item_id
     JOIN fps_shops fs ON fs.id = r.fps_id JOIN profiles p ON p.id = r.shopkeeper_user_id
     WHERE r.status = 'pending' ORDER BY r.created_at ASC LIMIT 100`,
  );
  response.json(rows);
}));

app.patch("/api/admin/refills/:id", requireUser(["admin"]), asyncRoute(async (request, response) => {
  const status = requiredString(request.body.status, "Refill status", 32);
  if (!["approved", "rejected"].includes(status)) return sendError(response, 400, "Choose approved or rejected.");
  const reviewNote = request.body.note ? requiredString(request.body.note, "Review note", 1000) : null;
  const connection = await pool.getConnection();
  let shopkeeperId: string | null = null;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<mysql.RowDataPacket[]>("SELECT * FROM stock_refill_requests WHERE id = ? AND status = 'pending' FOR UPDATE", [request.params.id]);
    const refill = rows[0];
    if (!refill) throw new Error("Pending refill request not found.");
    shopkeeperId = refill.shopkeeper_user_id;
    if (status === "approved") {
      const [stockResult] = await connection.execute<mysql.ResultSetHeader>(
        "UPDATE fps_stock SET received_stock = received_stock + ?, closing_stock = closing_stock + ? WHERE fps_id = ? AND item_id = ?",
        [refill.quantity, refill.quantity, refill.fps_id, refill.item_id],
      );
      if (stockResult.affectedRows !== 1) throw new Error("No matching stock row was found; the refill was not approved.");
    }
    const [requestResult] = await connection.execute<mysql.ResultSetHeader>(
      "UPDATE stock_refill_requests SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ? AND status = 'pending'",
      [status, reviewNote, current(request).id, request.params.id],
    );
    if (requestResult.affectedRows !== 1) throw new Error("The refill request changed before it could be reviewed. Refresh and try again.");
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (shopkeeperId) {
    void notifyUser(shopkeeperId, `Stock refill ${status}`, reviewNote ?? `Your refill request was ${status}.`, "stock_refill")
      .catch((error) => console.error("Could not send refill decision notification:", error));
  }
  response.json({ status, stock_updated: status === "approved" });
}));

app.patch("/api/admin/shops/:id/status", requireUser(["admin"]), asyncRoute(async (request, response) => {
  const status = requiredString(request.body.status, "Shop status", 32);
  if (!["active", "closed"].includes(status)) return sendError(response, 400, "Choose open or closed.");
  const [result] = await pool.execute<mysql.ResultSetHeader>("UPDATE fps_shops SET status = ? WHERE id = ?", [status, request.params.id]);
  if (!result.affectedRows) return sendError(response, 404, "Shop not found.");
  const [shopkeepers] = await pool.execute<mysql.RowDataPacket[]>("SELECT user_id FROM shopkeepers WHERE fps_id = ?", [request.params.id]);
  for (const shopkeeper of shopkeepers) await notifyUser(shopkeeper.user_id, `Shop ${status === "active" ? "opened" : "closed"}`, `An administrator marked your shop ${status === "active" ? "open" : "closed"}.`, "shop_status");
  const [beneficiaries] = await pool.execute<mysql.RowDataPacket[]>("SELECT user_id FROM beneficiary_profiles WHERE fps_id = ?", [request.params.id]);
  for (const beneficiary of beneficiaries) await notifyUser(beneficiary.user_id, `Fair price shop ${status === "active" ? "open" : "closed"}`, `Your assigned shop is now ${status === "active" ? "open" : "closed"}.`, "shop_status");
  response.json({ status });
}));

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  response.status(400).json({ error: message });
});

const port = Number(process.env.API_PORT ?? 3001);
app.listen(port, "127.0.0.1", () => console.log(`MySQL API listening on http://127.0.0.1:${port}`));
