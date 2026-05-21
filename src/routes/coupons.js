const express = require("express");
const prisma = require("../config/prisma");
const auth = require("../middleware/auth");
const router = express.Router();

// ADMIN - Get all coupons
router.get("/", auth, async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Create coupon
router.post("/", auth, async (req, res) => {
  try {
    const { code, type, value, minOrderValue, maxUses, expiresAt } = req.body;
    if (!code || !value) return res.status(400).json({ error: "Code and value are required" });
    if (!["PERCENTAGE", "FIXED"].includes(type)) return res.status(400).json({ error: "Invalid type" });
    if (type === "PERCENTAGE" && (value <= 0 || value > 100)) return res.status(400).json({ error: "Percentage must be between 1 and 100" });

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase().trim(),
        type,
        value: parseFloat(value),
        minOrderValue: parseFloat(minOrderValue) || 0,
        maxUses: maxUses ? parseInt(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      }
    });
    res.status(201).json(coupon);
  } catch (err) {
    if (err.code === "P2002") return res.status(400).json({ error: "Coupon code already exists" });
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Toggle coupon active
router.patch("/:id/toggle", auth, async (req, res) => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });
    const updated = await prisma.coupon.update({ where: { id: req.params.id }, data: { isActive: !coupon.isActive } });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Delete coupon
router.delete("/:id", auth, async (req, res) => {
  try {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    res.json({ message: "Coupon deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
