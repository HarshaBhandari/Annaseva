const mysql = require("mysql2/promise");
require("dotenv").config();

const assignments = [
  { email: "ravi.shinde@example.com", shopCode: "FPS-1001" },
  { email: "pooja.patil@example.com", shopCode: "FPS-1002" },
  { email: "amit.jadhav@example.com", shopCode: "FPS-1003" },
  { email: "sneha.more@example.com", shopCode: "FPS-1004" },
  { email: "kiran.ahire@example.com", shopCode: "FPS-1005" },
];

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "root",
    password: process.env.MYSQL_PASSWORD ?? "",
    database: process.env.MYSQL_DATABASE ?? "annaseva",
  });

  try {
    await db.beginTransaction();

    for (const assignment of assignments) {
      const [rows] = await db.execute(
        `SELECT bp.id AS beneficiary_profile_id, fs.id AS fps_id
         FROM app_users u
         JOIN beneficiary_profiles bp ON bp.user_id = u.id
         JOIN fps_shops fs ON fs.shop_code = ?
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'beneficiary'
         WHERE u.email = ?`,
        [assignment.shopCode, assignment.email],
      );

      if (rows.length !== 1) {
        throw new Error(
          `Expected one beneficiary and shop for ${assignment.email} / ${assignment.shopCode}; found ${rows.length}.`,
        );
      }

      await db.execute(
        "UPDATE beneficiary_profiles SET fps_id = ?, selected_fps_id = ? WHERE id = ?",
        [rows[0].fps_id, rows[0].fps_id, rows[0].beneficiary_profile_id],
      );
    }

    const [items] = await db.execute(
      "SELECT id FROM ration_items WHERE active = TRUE",
    );
    if (!items.length) {
      throw new Error("No active ration items found; initialize ration items before assigning stock.");
    }

    for (const assignment of assignments) {
      const [shops] = await db.execute(
        "SELECT id FROM fps_shops WHERE shop_code = ?",
        [assignment.shopCode],
      );

      await db.execute(
        `INSERT IGNORE INTO fps_stock
          (id, fps_id, item_id, opening_stock, received_stock, distributed_stock,
           closing_stock, minimum_threshold)
         SELECT UUID(), ?, id, 500, 200, 0, 650, 100
         FROM ration_items WHERE active = TRUE`,
        [shops[0].id],
      );
    }

    const emails = assignments.map(() => "?").join(", ");
    const [results] = await db.execute(
      `SELECT u.email, fs.shop_code, fs.shop_name,
              COUNT(st.id) AS stock_items
       FROM app_users u
       JOIN beneficiary_profiles bp ON bp.user_id = u.id
       JOIN fps_shops fs ON fs.id = bp.fps_id
       LEFT JOIN fps_stock st ON st.fps_id = fs.id
       WHERE u.email IN (${emails})
       GROUP BY u.email, fs.shop_code, fs.shop_name
       ORDER BY fs.shop_code`,
      assignments.map(({ email }) => email),
    );

    if (results.length !== assignments.length || results.some((row) => Number(row.stock_items) === 0)) {
      throw new Error("Assignment verification failed: at least one beneficiary shop has no stock rows.");
    }

    await db.commit();
    console.log("Assigned demo beneficiaries to separate FPS shops:");
    console.table(results);
    console.log("Existing stock quantities were preserved; missing demo stock rows were added.");
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error("BENEFICIARY SHOP ASSIGNMENT FAILED:", error.message);
  process.exitCode = 1;
});
