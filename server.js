const express = require("express");
const path = require("path");
const db = require("./database.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();
const PORT = 3000;
const JWT_SECRET = "change-this-secret-before-deploying";
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: "Please log in first."
        });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, JWT_SECRET, (error, user) => {
        if (error) {
            return res.status(403).json({
                error: "Your login has expired. Please log in again."
            });
        }

        req.user = user;
        next();
    });
}
function requireAdmin(req, res, next) {
    if (!req.user.is_admin) {
        return res.status(403).json({
            error: "Admin access required."
        });
    }

    next();
}
app.get("/api/test", (req, res) => {
    res.json({
        message: "E-commerce backend is working!"
    });
});

app.get("/api/products", (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({
                error: "Failed to get products"
            });
        }

        res.json(rows);
    });
});

app.post("/api/register", (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            error: "Name, email, and password are required."
        });
    }

    bcrypt.hash(password, 10, (hashError, passwordHash) => {
        if (hashError) {
            return res.status(500).json({
                error: "Could not secure password."
            });
        }

        const sql = `
            INSERT INTO users (name, email, password_hash)
            VALUES (?, ?, ?)
        `;

        db.run(sql, [name, email, passwordHash], function (dbError) {
            if (dbError) {
                if (dbError.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        error: "An account with this email already exists."
                    });
                }

                return res.status(500).json({
                    error: "Could not create account."
                });
            }

            res.status(201).json({
                message: "Account created successfully!"
            });
        });
    });
});
app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: "Email and password are required."
        });
    }

    const sql = "SELECT * FROM users WHERE email = ?";

    db.get(sql, [email], (dbError, user) => {
        if (dbError) {
            return res.status(500).json({
                error: "Could not log in."
            });
        }

        if (!user) {
            return res.status(401).json({
                error: "Email or password is incorrect."
            });
        }

        bcrypt.compare(password, user.password_hash, (compareError, isMatch) => {
            if (compareError || !isMatch) {
                return res.status(401).json({
                    error: "Email or password is incorrect."
                });
            }

  const token = jwt.sign(
    {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: user.is_admin
    },
    JWT_SECRET,
    {
        expiresIn: "1h"
    }
);

res.json({
    message: "Login successful!",
    token: token,
    user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: user.is_admin
    }
});        


        });
    });
});
app.post("/api/orders", authenticateToken, (req, res) => {
    const { cart } = req.body;

    if (!Array.isArray(cart) || cart.length === 0) {
        return res.status(400).json({
            error: "Your cart is empty."
        });
    }

    const quantities = {};

    cart.forEach(productId => {
        quantities[productId] = (quantities[productId] || 0) + 1;
    });

    const productIds = Object.keys(quantities).map(Number);
    const placeholders = productIds.map(() => "?").join(",");

    db.all(
        `SELECT id, price FROM products WHERE id IN (${placeholders})`,
        productIds,
        (productError, products) => {
            if (productError || products.length !== productIds.length) {
                return res.status(400).json({
                    error: "One or more products could not be found."
                });
            }

            let total = 0;

            products.forEach(product => {
                total += product.price * quantities[product.id];
            });

            db.run(
                "INSERT INTO orders (user_id, total) VALUES (?, ?)",
                [req.user.id, total],
                function (orderError) {
                    if (orderError) {
                        return res.status(500).json({
                            error: "Could not save your order."
                        });
                    }

                    const orderId = this.lastID;

                    const insertItem = db.prepare(`
                        INSERT INTO order_items (order_id, product_id, quantity, price)
                        VALUES (?, ?, ?, ?)
                    `);

                    products.forEach(product => {
                        insertItem.run(
                            orderId,
                            product.id,
                            quantities[product.id],
                            product.price
                        );
                    });

                    insertItem.finalize(itemError => {
                        if (itemError) {
                            return res.status(500).json({
                                error: "Could not save order items."
                            });
                        }

                        res.status(201).json({
                            message: "Order saved successfully!",
                            orderId: orderId,
                            total: total
                        });
                    });
                }
            );
        }
    );
});
app.get("/api/orders", authenticateToken, (req, res) => {
    const sql = `
        SELECT
            orders.id AS order_id,
            orders.total,
            orders.created_at,
            products.name AS product_name,
            order_items.quantity,
            order_items.price
        FROM orders
        JOIN order_items ON orders.id = order_items.order_id
        JOIN products ON order_items.product_id = products.id
        WHERE orders.user_id = ?
        ORDER BY orders.created_at DESC
    `;

    db.all(sql, [req.user.id], (error, rows) => {
        if (error) {
            console.error("Order history error:", error.message);

            return res.status(500).json({
                error: "Could not load your orders."
            });
        }

        res.json(rows);
    });
});
app.post("/api/admin/products", authenticateToken, requireAdmin, (req, res) => {
    const { name, price, description, image } = req.body;

    if (!name || !price) {
        return res.status(400).json({
            error: "Product name and price are required."
        });
    }

    const sql = `
        INSERT INTO products (name, price, description, image)
        VALUES (?, ?, ?, ?)
    `;

    db.run(sql, [name, price, description, image], function (error) {
        if (error) {
            return res.status(500).json({
                error: "Could not add product."
            });
        }

        res.status(201).json({
            message: "Product added successfully!",
            productId: this.lastID
        });
    });
});
app.delete(
    "/api/admin/products/:id",
    authenticateToken,
    requireAdmin,
    (req, res) => {
        const productId = req.params.id;

        db.get(
            "SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?",
            [productId],
            (checkError, result) => {
                if (checkError) {
                    return res.status(500).json({
                        error: "Could not check product orders."
                    });
                }

                if (result.count > 0) {
                    return res.status(400).json({
                        error: "This product cannot be deleted because it appears in an order."
                    });
                }

                db.run(
                    "DELETE FROM products WHERE id = ?",
                    [productId],
                    function (deleteError) {
                        if (deleteError) {
                            return res.status(500).json({
                                error: "Could not delete product."
                            });
                        }

                        if (this.changes === 0) {
                            return res.status(404).json({
                                error: "Product not found."
                            });
                        }

                        res.json({
                            message: "Product deleted successfully!"
                        });
                    }
                );
            }
        );
    }
);
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});