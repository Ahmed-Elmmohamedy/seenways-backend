const express = require("express");
const prisma = require("../config/prisma");
const auth = require("../middleware/auth");
const router = express.Router();

const DEFAULT_GOVERNORATES = [
  { name: "القاهرة", shippingFee: 0 },
  { name: "الجيزة", shippingFee: 0 },
  { name: "الإسكندرية", shippingFee: 35 },
  { name: "الدقهلية", shippingFee: 35 },
  { name: "الشرقية", shippingFee: 35 },
  { name: "المنوفية", shippingFee: 35 },
  { name: "القليوبية", shippingFee: 25 },
  { name: "الغربية", shippingFee: 35 },
  { name: "كفر الشيخ", shippingFee: 40 },
  { name: "دمياط", shippingFee: 40 },
  { name: "بورسعيد", shippingFee: 40 },
  { name: "الإسماعيلية", shippingFee: 35 },
  { name: "السويس", shippingFee: 40 },
  { name: "البحيرة", shippingFee: 40 },
  { name: "المنيا", shippingFee: 45 },
  { name: "أسيوط", shippingFee: 50 },
  { name: "سوهاج", shippingFee: 50 },
  { name: "قنا", shippingFee: 55 },
  { name: "الأقصر", shippingFee: 60 },
  { name: "أسوان", shippingFee: 65 },
  { name: "الفيوم", shippingFee: 40 },
  { name: "بني سويف", shippingFee: 40 },
  { name: "شمال سيناء", shippingFee: 60 },
  { name: "جنوب سيناء", shippingFee: 65 },
  { name: "البحر الأحمر", shippingFee: 65 },
  { name: "مطروح", shippingFee: 65 },
  { name: "الوادي الجديد", shippingFee: 70 },
];

// PUBLIC - Get active governorates
router.get("/", async (req, res) => {
  try {
    const govs = await prisma.governorate.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
    if (govs.length === 0) {
      await prisma.governorate.createMany({ data: DEFAULT_GOVERNORATES });
      const seeded = await prisma.governorate.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
      return res.json(seeded);
    }
    res.json(govs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN - Get all governorates
router.get("/admin/all", auth, async (req, res) => {
  try {
    const govs = await prisma.governorate.findMany({ orderBy: { name: "asc" } });
    if (govs.length === 0) {
      await prisma.governorate.createMany({ data: DEFAULT_GOVERNORATES });
      const seeded = await prisma.governorate.findMany({ orderBy: { name: "asc" } });
      return res.json(seeded);
    }
    res.json(govs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN - Add governorate
router.post("/", auth, async (req, res) => {
  try {
    const { name, shippingFee } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const gov = await prisma.governorate.create({ data: { name, shippingFee: parseFloat(shippingFee) || 0 } });
    res.status(201).json(gov);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN - Update governorate
router.put("/:id", auth, async (req, res) => {
  try {
    const { name, shippingFee, isActive } = req.body;
    const gov = await prisma.governorate.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(shippingFee !== undefined && { shippingFee: parseFloat(shippingFee) }),
        ...(isActive !== undefined && { isActive }),
      }
    });
    res.json(gov);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN - Delete governorate
router.delete("/:id", auth, async (req, res) => {
  try {
    await prisma.governorate.delete({ where: { id: req.params.id } });
    res.json({ message: "Deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
