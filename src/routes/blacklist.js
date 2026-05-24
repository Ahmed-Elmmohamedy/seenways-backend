const express = require("express");
const prisma = require("../config/prisma");
const auth = require("../middleware/auth");
const router = express.Router();

router.get("/", auth, async (req, res) => {
  try {
    const list = await prisma.blacklist.findMany({ orderBy: { createdAt: "desc" } });
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/", auth, async (req, res) => {
  try {
    const { phone, reason } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone is required" });
    const existing = await prisma.blacklist.findUnique({ where: { phone } });
    if (existing) return res.status(400).json({ error: "Phone already blacklisted" });
    const entry = await prisma.blacklist.create({ data: { phone, reason: reason || null } });
    res.status(201).json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    await prisma.blacklist.delete({ where: { id: req.params.id } });
    res.json({ message: "Removed from blacklist" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/check/:phone", async (req, res) => {
  try {
    const entry = await prisma.blacklist.findUnique({ where: { phone: req.params.phone } });
    res.json({ blacklisted: !!entry });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
