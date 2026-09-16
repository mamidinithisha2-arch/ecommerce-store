const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database.db", (err) => {
    if (err) {
        console.error("Database error:", err.message);
    } else {
        console.log("SQLite database connected!");
    }
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            description TEXT,
            image TEXT
        )
    `);
db.run(`
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        total REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    )
`);
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    `);
    db.all("PRAGMA table_info(users)", (error, columns) => {
    if (error) {
        console.error("Could not check users table:", error.message);
        return;
    }

    const hasAdminColumn = columns.some(column => column.name === "is_admin");

    if (!hasAdminColumn) {
        db.run(`
            ALTER TABLE users
            ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0
        `);
    }
});
db.run(
    "UPDATE users SET is_admin = 1 WHERE email = ?",
    ["mamidinithisha0@gmail.com"],
    function (error) {
        if (error) {
            console.error("Admin update error:", error.message);
        } else {
            console.log("Admin accounts updated:", this.changes);
        }
    }
);
});

module.exports = db;