const express = require("express");
const prisma = require("../config/prisma");
const auth = require("../middleware/auth");
const router = express.Router();

function slugify(text) {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
}

router.get("/", async (req, res) => {
  try {
    const categories = await prisma.category.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const category = await prisma.category.create({ data: { name, slug: slugify(name) } });
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ message: "Category deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
