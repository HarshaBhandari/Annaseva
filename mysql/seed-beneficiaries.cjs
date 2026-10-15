
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const fs = require("fs");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const beneficiaries = [
  {
    name: "Ravi Shinde",
    mobile: "9000000101",
    aadhaar: "XXXX-XXXX-1001",
    ration: "RC-DEMO-2026-1001",
    category: "Yellow",
    status: "verified",
    family: 4,
    shopCode: "FPS-1001",
    password: "RaviShinde@1001!"
  },
  {
    name: "Pooja Patil",
    mobile: "9000000102",
    aadhaar: "XXXX-XXXX-1002",
    ration: "RC-DEMO-2026-1002",
    category: "Orange",
    status: "pending",
    family: 5,
    shopCode: "FPS-1002",
    password: "PoojaPatil@1002!"
  },
  {
    name: "Amit Jadhav",
    mobile: "9000000103",
    aadhaar: "XXXX-XXXX-1003",
    ration: "RC-DEMO-2026-1003",
    category: "Yellow",
    status: "verified",
    family: 3,
    shopCode: "FPS-1003",
    password: "AmitJadhav@1003!"
  },
  {
    name: "Sneha More",
    mobile: "9000000104",
    aadhaar: "XXXX-XXXX-1004",
    ration: "RC-DEMO-2026-1004",
    category: "Orange",
    status: "pending",
    family: 6,
    shopCode: "FPS-1004",
    password: "SnehaMore@1004!"
  },
  {
    name: "Kiran Ahire",
    mobile: "9000000105",
    aadhaar: "XXXX-XXXX-1005",
    ration: "RC-DEMO-2026-1005",
    category: "White",
    status: "verified",
    family: 4,
    shopCode: "FPS-1005",
    password: "KiranAhire@1005!"
  }
];

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    // Add the requested columns if they are missing.
    // Do this before starting the data transaction.
    const columns = {
      full_name: "VARCHAR(150) NULL",
      mobile_number: "VARCHAR(20) NULL",
      aadhaar_no: "VARCHAR(20) NULL",
      ration_card_number: "VARCHAR(100) NULL",
      card_category: "VARCHAR(30) NULL",
      verification_status: "VARCHAR(30) NULL",
      family_members: "INT NULL"
    };

    for (const [name, definition] of Object.entries(columns)) {
      const [found] = await db.execute(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'beneficiary_profiles'
           AND COLUMN_NAME = ?`,
        [process.env.MYSQL_DATABASE, name]
      );

      if (found.length === 0) {
        await db.query(
          `ALTER TABLE beneficiary_profiles
           ADD COLUMN \`${name}\` ${definition}`
        );
      }
    }

    await db.beginTransaction();

    const credentials = [];

    for (const b of beneficiaries) {
      const [shops] = await db.execute(
        "SELECT id FROM fps_shops WHERE shop_code = ?",
        [b.shopCode]
      );
      if (!shops.length) {
        throw new Error(`FPS shop ${b.shopCode} is missing. Run seed-shopkeepers.cjs first.`);
      }
      const fpsId = shops[0].id;

      // The current login system uses email.
      // Names are used to generate the login email.
      const email =
        b.name.toLowerCase().replace(/\s+/g, ".") +
        "@example.com";

      const [existing] = await db.execute(
        "SELECT id FROM app_users WHERE email = ?",
        [email]
      );

      const userId = existing.length
        ? existing[0].id
        : crypto.randomUUID();

      // Generate a password hash compatible with the existing login.
      const salt = crypto.randomBytes(16);
      const hash = crypto.scryptSync(b.password, salt, 64);
      const passwordHash =
        salt.toString("hex") + ":" + hash.toString("hex");

      if (existing.length) {
        await db.execute(
          "UPDATE app_users SET password_hash = ? WHERE id = ?",
          [passwordHash, userId]
        );
      } else {
        await db.execute(
          `INSERT INTO app_users (id, email, password_hash)
           VALUES (?, ?, ?)`,
          [userId, email, passwordHash]
        );
      }

      // Keep the existing profile table in sync.
      await db.execute(
        `INSERT INTO profiles
          (id, full_name, mobile_number, ration_card_number)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name),
          mobile_number = VALUES(mobile_number),
          ration_card_number = VALUES(ration_card_number)`,
        [userId, b.name, b.mobile, b.ration]
      );

      // Add beneficiary role only if it does not already exist.
      await db.execute(
        `INSERT INTO user_roles (id, user_id, role)
         SELECT ?, ?, 'beneficiary'
         WHERE NOT EXISTS (
           SELECT 1 FROM user_roles
           WHERE user_id = ? AND role = 'beneficiary'
         )`,
        [crypto.randomUUID(), userId, userId]
      );

      // Create or update the ration card.
      const [cards] = await db.execute(
        "SELECT id FROM ration_cards WHERE user_id = ? LIMIT 1",
        [userId]
      );

      let cardId;

      if (cards.length > 0) {
        cardId = cards[0].id;

        await db.execute(
          `UPDATE ration_cards
           SET masked_card_number = ?,
               card_category = ?,
               aadhaar_last4 = ?,
               verification_status = ?
           WHERE id = ?`,
          [
            b.ration,
            b.category,
            b.aadhaar.slice(-4),
            b.status,
            cardId
          ]
        );
      } else {
        cardId = crypto.randomUUID();

        await db.execute(
          `INSERT INTO ration_cards
           (id, user_id, masked_card_number, card_category,
            aadhaar_last4, verification_status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            cardId,
            userId,
            b.ration,
            b.category,
            b.aadhaar.slice(-4),
            b.status
          ]
        );
      }

      // Insert or update all requested beneficiary fields.
      const [profiles] = await db.execute(
        "SELECT id FROM beneficiary_profiles WHERE user_id = ? LIMIT 1",
        [userId]
      );

      if (profiles.length > 0) {
        await db.execute(
          `UPDATE beneficiary_profiles SET
             ration_card_id = ?,
             fps_id = ?,
             selected_fps_id = ?,
             family_size = ?,
             full_name = ?,
             mobile_number = ?,
             aadhaar_no = ?,
             ration_card_number = ?,
             card_category = ?,
             verification_status = ?,
             family_members = ?
           WHERE user_id = ?`,
          [
            cardId,
            fpsId,
            fpsId,
            b.family,
            b.name,
            b.mobile,
            b.aadhaar,
            b.ration,
            b.category,
            b.status,
            b.family,
            userId
          ]
        );
      } else {
        await db.execute(
          `INSERT INTO beneficiary_profiles (
             id, user_id, ration_card_id, fps_id, selected_fps_id, family_size,
             full_name, mobile_number, aadhaar_no,
             ration_card_number, card_category,
             verification_status, family_members
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
          [
            crypto.randomUUID(),
            userId,
            cardId,
            fpsId,
            fpsId,
            b.family,
            b.name,
            b.mobile,
            b.aadhaar,
            b.ration,
            b.category,
            b.status,
            b.family
          ]
        );
      }

      credentials.push({
        user_id: userId,
        full_name: b.name,
        mobile_number: b.mobile,
        aadhaar_no: b.aadhaar,
        ration_card_number: b.ration,
        card_category: b.category,
        verification_status: b.status,
        family_members: b.family,
        fps_shop_code: b.shopCode,
        email,
        password: b.password,
        password_hash: passwordHash
      });
    }

    await db.commit();

    // Write the credentials file after the database commit.
    const output = path.join(
      __dirname,
      "beneficiary-credentials.csv"
    );

    const headers = Object.keys(credentials[0]);

    const csv = [
      headers.join(","),
      ...credentials.map(row =>
        headers.map(key =>
          '"' + String(row[key]).replace(/"/g, '""') + '"'
        ).join(",")
      )
    ].join("\n");

    fs.writeFileSync(output, csv, "utf8");

    console.log("\nSUCCESS: 5 beneficiary accounts created.");
    console.log("Credentials file:", output);

    console.table(
      credentials.map(({
        password_hash,
        user_id,
        ...row
      }) => ({
        user_id,
        full_name: row.full_name,
        email: row.email,
        password: row.password
      }))
    );
  } catch (error) {
    try {
      await db.rollback();
    } catch (_) {}

    console.error("IMPORT FAILED:", error.message);
    console.error("MySQL error code:", error.code || "N/A");
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error("IMPORT FAILED:", error.message);
  process.exitCode = 1;
});
