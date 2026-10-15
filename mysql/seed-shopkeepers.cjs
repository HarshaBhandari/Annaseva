
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
require("dotenv").config();

const csvPath = path.join(__dirname, "FPS_Shops_Chandwad.csv")
const credentialsPath = path.join(__dirname, "shopkeeper-credentials.csv");

// Parse CSV correctly, including addresses containing commas.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift().map(h => h.trim().replace(/^\uFEFF/, ""));
  return rows.map(values =>
    Object.fromEntries(headers.map((h, i) => [h, (values[i] || "").trim()]))
  );
}

function csvEscape(value) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    throw new Error("CSV not found: " + csvPath);
  }

  const records = parseCSV(fs.readFileSync(csvPath, "utf8"));

  const required = [
    "Shop_Code", "Shop_Name", "Address", "District", "Taluka",
    "Contact_number", "Shopkeeper_Name", "Shopkeeper_Email",
    "Operating_hours", "Beneficiary_Count_Demo", "Status"
  ];

  if (!records.length || required.some(k => !(k in records[0]))) {
    throw new Error("CSV headers do not match the expected format.");
  }

  if (records.length !== 10) {
    throw new Error(`Expected 10 CSV records but found ${records.length}. Check the CSV before importing.`);
  }

  const seenEmails = new Set();
  for (const r of records) {
    r.Shopkeeper_Email = r.Shopkeeper_Email.toLowerCase();
    if (!r.Shop_Code || !r.Shopkeeper_Name || !r.Shopkeeper_Email) {
      throw new Error("A CSV row is missing a shop code, name, or email.");
    }
    if (seenEmails.has(r.Shopkeeper_Email)) {
      throw new Error("Duplicate shopkeeper email: " + r.Shopkeeper_Email);
    }
    seenEmails.add(r.Shopkeeper_Email);
  }

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || "annaseva"
  });

  const credentials = [];

  try {
    await db.beginTransaction();

    for (const r of records) {
      const [existingShops] = await db.execute(
        "SELECT id FROM fps_shops WHERE shop_code = ?",
        [r.Shop_Code]
      );

      const shopId = existingShops[0]?.id || crypto.randomUUID();

      await db.execute(
        `INSERT INTO fps_shops
          (id, shop_code, shop_name, address, district, taluka,
           contact_number, operating_hours, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           shop_name = VALUES(shop_name),
           address = VALUES(address),
           district = VALUES(district),
           taluka = VALUES(taluka),
           contact_number = VALUES(contact_number),
           operating_hours = VALUES(operating_hours),
           status = VALUES(status)`,
        [
          shopId, r.Shop_Code, r.Shop_Name, r.Address, r.District,
          r.Taluka, r.Contact_number || null, r.Operating_hours,
          r.Status || "active"
        ]
      );

      const [shopRows] = await db.execute(
        "SELECT id FROM fps_shops WHERE shop_code = ?",
        [r.Shop_Code]
      );
      const fpsId = shopRows[0].id;

      const [items] = await db.execute(
        "SELECT id FROM ration_items WHERE active = TRUE"
      );
      if (!items.length) {
        throw new Error("No active ration items were found. Initialize the database schema and ration items first.");
      }

      // These are synthetic demo quantities; INSERT IGNORE preserves existing stock values.
      await db.execute(
        `INSERT IGNORE INTO fps_stock
          (id, fps_id, item_id, opening_stock, received_stock, distributed_stock,
           closing_stock, minimum_threshold)
         SELECT UUID(), ?, id, 500, 200, 0, 650, 100
         FROM ration_items WHERE active = TRUE`,
        [fpsId]
      );

      // Unique password per shop code; login uses the existing scrypt format.
      const password = `Annaseva@${r.Shop_Code.slice(-4)}!`;
      const salt = crypto.randomBytes(16);
      const hash = crypto.scryptSync(password, salt, 64);
      const passwordHash = `${salt.toString("hex")}:${hash.toString("hex")}`;

      const [users] = await db.execute(
        "SELECT id FROM app_users WHERE email = ?",
        [r.Shopkeeper_Email]
      );

      let userId;
      if (users.length) {
        userId = users[0].id;
        await db.execute(
          "UPDATE app_users SET password_hash = ? WHERE id = ?",
          [passwordHash, userId]
        );
      } else {
        userId = crypto.randomUUID();
        await db.execute(
          "INSERT INTO app_users (id, email, password_hash) VALUES (?, ?, ?)",
          [userId, r.Shopkeeper_Email, passwordHash]
        );
      }

      await db.execute(
        `INSERT INTO profiles (id, full_name, mobile_number)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           full_name = VALUES(full_name),
           mobile_number = VALUES(mobile_number)`,
        [userId, r.Shopkeeper_Name, r.Contact_number || null]
      );

      const [roles] = await db.execute(
        "SELECT id FROM user_roles WHERE user_id = ? AND role = 'shopkeeper'",
        [userId]
      );
      if (!roles.length) {
        await db.execute(
          "INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'shopkeeper')",
          [crypto.randomUUID(), userId]
        );
      }

      const [links] = await db.execute(
        "SELECT id FROM shopkeepers WHERE user_id = ?",
        [userId]
      );
      if (links.length) {
        await db.execute(
          "UPDATE shopkeepers SET fps_id = ? WHERE user_id = ?",
          [fpsId, userId]
        );
      } else {
        await db.execute(
          "INSERT INTO shopkeepers (id, user_id, fps_id) VALUES (?, ?, ?)",
          [crypto.randomUUID(), userId, fpsId]
        );
      }

      credentials.push({
        shop_code: r.Shop_Code,
        shopkeeper_name: r.Shopkeeper_Name,
        email: r.Shopkeeper_Email,
        password,
        password_hash: passwordHash
      });
    }

    await db.commit();

    const header = [
      "shop_code", "shopkeeper_name", "email", "password", "password_hash"
    ];
    const output = [
      header.join(","),
      ...credentials.map(c => header.map(k => csvEscape(c[k])).join(","))
    ].join("\n");

    fs.writeFileSync(credentialsPath, output, "utf8");

    console.log("\nSUCCESS: imported all 10 CSV shopkeepers.");
    console.log("Credentials file:", credentialsPath);
    console.table(credentials.map(({ shop_code, shopkeeper_name, email, password }) =>
      ({ shop_code, shopkeeper_name, email, password })
    ));
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error("IMPORT FAILED:", error.message);
  process.exitCode = 1;
});
