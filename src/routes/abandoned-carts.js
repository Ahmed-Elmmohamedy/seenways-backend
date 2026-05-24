const express = require("express");
const prisma = require("../config/prisma");
const auth = require("../middleware/auth");
const router = express.Router();

// PUBLIC - Save abandoned cart
router.post("/", async (req, res) => {
  try {
    const { phone, name, email, items, total } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "No items" });
    if (phone) {
      const existing = await prisma.abandonedCart.findFirst({ where: { phone } });
      if (existing) {
        const updated = await prisma.abandonedCart.update({
          where: { id: existing.id },
          data: { name, email, items, total, updatedAt: new Date() }
        });
        return res.json(updated);
      }
    }
    const cart = await prisma.abandonedCart.create({ data: { phone, name, email, items, total } });
    res.status(201).json(cart);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUBLIC - Delete when order completed
router.delete("/phone/:phone", async (req, res) => {
  try {
    await prisma.abandonedCart.deleteMany({ where: { phone: req.params.phone } });
    res.json({ message: "Deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN - Get all abandoned carts
router.get("/", auth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = {};
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {})
      };
    }
    const carts = await prisma.abandonedCart.findMany({ where, orderBy: { createdAt: "desc" } });
    const totalLost = carts.reduce((sum, c) => sum + c.total, 0);
    res.json({ carts, totalLost });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN - Delete abandoned cart
router.delete("/:id", auth, async (req, res) => {
  try {
    await prisma.abandonedCart.delete({ where: { id: req.params.id } });
    res.json({ message: "Deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
