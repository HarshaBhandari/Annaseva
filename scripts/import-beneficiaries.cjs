const XLSX = require("xlsx");
const mysql = require("mysql2/promise");
const { randomBytes, randomUUID, scrypt: scryptCallback } = require("node:crypto");
const { promisify } = require("node:util");
require("dotenv").config();

const scrypt = promisify(scryptCallback);
const FILE = "Annaseva_Beneficiary_Data.xlsx";

// Demo-only password for all newly imported beneficiary accounts.
const DEMO_PASSWORD = "Demo@12345";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE ?? "annaseva",
  connectionLimit: 2
});

const str = value => String(value ?? "").trim();

async function main() {
  const workbook = XLSX.readFile(FILE);
  if (!workbook.SheetNames.includes("Beneficiaries") ||
      !workbook.SheetNames.includes("FamilyMembers")) {
    throw new Error("Workbook must contain Beneficiaries and FamilyMembers sheets.");
  }

  const beneficiaries = XLSX.utils.sheet_to_json(
    workbook.Sheets.Beneficiaries, { defval: "" }
  );
  const members = XLSX.utils.sheet_to_json(
    workbook.Sheets.FamilyMembers, { defval: "" }
  );

  if (!beneficiaries.length) throw new Error("No beneficiary rows found.");

  const memberMap = new Map();
  for (const member of members) {
    const code = str(member.beneficiary_code);
    if (!code || !str(member.member_name) || !str(member.relationship)) {
      throw new Error("A family-member row is missing required information.");
    }
    if (!memberMap.has(code)) memberMap.set(code, []);
    memberMap.get(code).push(member);
  }

  const codes = new Set();
  const emails = new Set();

  for (const b of beneficiaries) {
    b.beneficiary_code = str(b.beneficiary_code);
    b.full_name = str(b.full_name);
    b.email = str(b.email).toLowerCase();
    b.mobile_number = str(b.mobile_number);
    b.ration_card_number = str(b.ration_card_number);
    b.card_category = str(b.card_category);
    b.fps_shop_code = str(b.fps_shop_code);
    b.family_size = Number(b.family_size);

    if (!b.beneficiary_code || !b.full_name || !b.email ||
        !b.mobile_number || !b.ration_card_number) {
      throw new Error("A beneficiary row is missing required fields.");
    }
    if (codes.has(b.beneficiary_code) || emails.has(b.email)) {
      throw new Error("Duplicate beneficiary code or email in the workbook.");
    }
    codes.add(b.beneficiary_code);
    emails.add(b.email);

    if (!["Yellow", "Orange", "White"].includes(b.card_category)) {
      throw new Error(`Invalid card category for ${b.beneficiary_code}.`);
    }
    if (!Number.isInteger(b.family_size) ||
        b.family_size < 1 || b.family_size > 20) {
      throw new Error(`Invalid family size for ${b.beneficiary_code}.`);
    }

    const normalizedCard = b.ration_card_number
      .replace(/[\s-]/g, "").toUpperCase();

    if (!/^[A-Z0-9/]{5,64}$/.test(normalizedCard)) {
      throw new Error(`Invalid demo card reference for ${b.beneficiary_code}.`);
    }

    const count = (memberMap.get(b.beneficiary_code) ?? []).length;
    if (count !== b.family_size - 1) {
      throw new Error(
        `${b.beneficiary_code}: family size is ${b.family_size}, ` +
        `but ${count} additional family members were found.`
      );
    }
  }

  for (const code of memberMap.keys()) {
    if (!codes.has(code)) {
      throw new Error(`Family member refers to unknown beneficiary ${code}.`);
    }
  }

  const shopCodes = [...new Set(beneficiaries.map(b => b.fps_shop_code))];
  const shopMap = new Map();

  for (const shopCode of shopCodes) {
    const [rows] = await pool.execute(
      "SELECT id FROM fps_shops WHERE shop_code = ? LIMIT 1",
      [shopCode]
    );
    if (!rows.length) {
      throw new Error(`FPS shop ${shopCode} does not exist. No data imported.`);
    }
    shopMap.set(shopCode, rows[0].id);
  }

  const connection = await pool.getConnection();
  let imported = 0;
  let skipped = 0;
  let memberCount = 0;

  try {
    await connection.beginTransaction();

    for (const b of beneficiaries) {
      const [existing] = await connection.execute(
        "SELECT id FROM app_users WHERE email = ? LIMIT 1",
        [b.email]
      );

      // Do not overwrite existing accounts or partially modify them.
      if (existing.length) {
        skipped++;
        continue;
      }

      const userId = randomUUID();
      const cardId = randomUUID();
      const salt = randomBytes(16);
      const passwordHash =
        `${salt.toString("hex")}:` +
        `${(await scrypt(DEMO_PASSWORD, salt, 64)).toString("hex")}`;

      const normalizedCard = b.ration_card_number
        .replace(/[\s-]/g, "").toUpperCase();
      const suffix = b.beneficiary_code.slice(-4);
      const maskedCard = `RC-****-${suffix}`;

      await connection.execute(
        "INSERT INTO app_users (id, email, password_hash) VALUES (?, ?, ?)",
        [userId, b.email, passwordHash]
      );

      await connection.execute(
        `INSERT INTO profiles
         (id, full_name, mobile_number, ration_card_number)
         VALUES (?, ?, ?, ?)`,
        [userId, b.full_name, b.mobile_number, normalizedCard]
      );

      await connection.execute(
        "INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'beneficiary')",
        [randomUUID(), userId]
      );

      await connection.execute(
        `INSERT INTO ration_cards
         (id, user_id, masked_card_number, card_category, verification_status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [cardId, userId, maskedCard, b.card_category]
      );

      await connection.execute(
        `INSERT INTO beneficiary_profiles
         (id, user_id, ration_card_id, fps_id, selected_fps_id, family_size)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          userId,
          cardId,
          shopMap.get(b.fps_shop_code),
          shopMap.get(b.fps_shop_code),
          b.family_size
        ]
      );

      for (const member of memberMap.get(b.beneficiary_code) ?? []) {
        await connection.execute(
          `INSERT INTO ration_card_members
           (id, ration_card_id, full_name, relationship)
           VALUES (?, ?, ?, ?)`,
          [
            randomUUID(),
            cardId,
            str(member.member_name),
            str(member.relationship)
          ]
        );
        memberCount++;
      }

      imported++;
    }

    await connection.commit();

    console.log("\n===== ANNASEVA BENEFICIARY IMPORT =====");
    console.log(`New beneficiary accounts: ${imported}`);
    console.log(`Existing accounts skipped: ${skipped}`);
    console.log(`Family members inserted: ${memberCount}`);
    console.log(`Demo login password for NEW accounts: ${DEMO_PASSWORD}`);
    console.log("Ration-card verification status: pending");
    console.log("Existing FPS shops and stock were not modified.");
    console.log("=======================================\n");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .catch(error => {
    console.error("\nIMPORT FAILED:", error.message);
    console.error("The import transaction was rolled back if it had started.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
