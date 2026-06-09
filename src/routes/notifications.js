const express = require("express");
const prisma = require("../config/prisma");
const auth = require("../middleware/auth");
const router = express.Router();

// PUBLIC - اشتراك في إشعار توفر المنتج
router.post("/", async (req, res) => {
  try {
    const { productId, phone, color, size } = req.body;
    if (!productId || !phone) {
      return res.status(400).json({ error: "بيانات غير مكتملة" });
    }
    const phoneClean = phone.replace(/\s/g, "");
    const phoneRegex = /^(010|011|012|015)\d{8}$/;
    if (!phoneRegex.test(phoneClean)) {
      return res.status(400).json({ error: "رقم التليفون غير صحيح" });
    }
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: "المنتج غير موجود" });

    const existing = await prisma.stockNotification.findFirst({
      where: { productId, phone: phoneClean, notified: false }
    });
    if (existing) {
      return res.json({ success: true, message: "أنت مسجّل بالفعل، هنبلغك فور توفر المنتج" });
    }
    await prisma.stockNotification.create({
      data: { productId, phone: phoneClean, color: color || null, size: size || null }
    });
    res.json({ success: true, message: "هنبلغك فور توفر المنتج" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - عرض كل الإشعارات
router.get("/", auth, async (req, res) => {
  try {
    const { productId, notified } = req.query;
    const where = {};
    if (productId) where.productId = productId;
    if (notified !== undefined) where.notified = notified === "true";
    const notifications = await prisma.stockNotification.findMany({
      where,
      include: { product: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - تحديد كـ "تم الإبلاغ"
router.patch("/:id/notified", auth, async (req, res) => {
  try {
    await prisma.stockNotification.update({
      where: { id: req.params.id },
      data: { notified: true }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - حذف إشعار
router.delete("/:id", auth, async (req, res) => {
  try {
    await prisma.stockNotification.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
