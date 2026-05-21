const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const auth = require("../middleware/auth");
const router = express.Router();

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: admin.id, email: admin.email, name: admin.name }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });
    res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify token
router.get("/me", auth, async (req, res) => {
  const admin = await prisma.admin.findUnique({ where: { id: req.admin.id }, select: { id: true, email: true, name: true } });
  res.json(admin);
});

// Dashboard stats - Enhanced
router.get("/stats", auth, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalProducts, totalOrders, pendingOrders, recentOrders,
      monthOrders, lastMonthOrders, revenue, monthRevenue,
      ordersByStatus, topProducts
    ] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.order.findMany({ take: 5, orderBy: { createdAt: "desc" }, include: { items: { include: { product: true } } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
      prisma.order.aggregate({ where: { status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] } }, _sum: { totalAmount: true } }),
      prisma.order.aggregate({ where: { status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] }, createdAt: { gte: startOfMonth } }, _sum: { totalAmount: true } }),
      prisma.order.groupBy({ by: ["status"], _count: true }),
      prisma.orderItem.groupBy({ by: ["productId"], _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
    ]);

    // Monthly revenue for chart (last 6 months)
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const result = await prisma.order.aggregate({
        where: { status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] }, createdAt: { gte: start, lte: end } },
        _sum: { totalAmount: true }
      });
      monthlyRevenue.push({
        month: start.toLocaleString("ar-EG", { month: "short" }),
        revenue: result._sum.totalAmount || 0,
        orders: await prisma.order.count({ where: { createdAt: { gte: start, lte: end } } })
      });
    }

    // Top products with names
    const topProductsWithNames = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.product.findUnique({ where: { id: item.productId }, select: { name: true, images: true } });
        return { ...item, product };
      })
    );

    res.json({
      totalProducts, totalOrders, pendingOrders,
      revenue: revenue._sum.totalAmount || 0,
      monthRevenue: monthRevenue._sum?.totalAmount || 0,
      monthOrders, lastMonthOrders,
      recentOrders, ordersByStatus, monthlyRevenue,
      topProducts: topProductsWithNames,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed admin
router.post("/seed", async (req, res) => {
  try {
    const existing = await prisma.admin.findFirst();
    if (existing) return res.status(400).json({ error: "Admin already exists" });
    const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Admin@123456", 10);
    const admin = await prisma.admin.create({ data: { email: process.env.ADMIN_EMAIL || "admin@seenways.com", password: hashed, name: "SEENWAYS Admin" } });
    res.json({ message: "Admin created", email: admin.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
