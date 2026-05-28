const express = require("express");
const prisma = require("../config/prisma");
const auth = require("../middleware/auth");
const router = express.Router();

// ─── VERSION ENDPOINT ─────────────────────────────────────────────────────────
// أضفناه عشان نتأكد إن Railway deploy الكود الجديد
// جرب: GET /api/orders/version
router.get("/version", (req, res) => {
  res.json({
    version: "3.0-bundle-fix",
    deployedAt: new Date().toISOString(),
    features: ["bundle-without-productId", "risk-score", "blacklist", "coupon"]
  });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function generateOrderNumber() {
  return "SW-" + Date.now().toString().slice(-6) + "-" + Math.floor(Math.random() * 1000).toString().padStart(3, "0");
}

function calculateRiskScore(customer, previousOrders) {
  let score = 0;
  const reasons = [];
  if (previousOrders >= 3) { score += 50; reasons.push("أكثر من 3 طلبات سابقة"); }
  else if (previousOrders >= 1) { score += 20; reasons.push("طلبات سابقة"); }
  if (/\d/.test(customer.name)) { score += 30; reasons.push("اسم يحتوي على أرقام"); }
  if (customer.name.trim().split(" ").length < 2) { score += 15; reasons.push("اسم من كلمة واحدة"); }
  if (customer.address && customer.address.trim().length < 15) { score += 20; reasons.push("عنوان قصير"); }
  const hour = new Date().getUTCHours() + 2;
  if (hour >= 23 || hour <= 5) { score += 10; reasons.push("طلب في وقت متأخر"); }
  return { score: Math.min(score, 100), reasons };
}

// ─── PUBLIC: Validate coupon ───────────────────────────────────────────────────

router.post("/validate-coupon", async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    if (!code) return res.status(400).json({ error: "Coupon code required" });

    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon || !coupon.isActive) return res.status(404).json({ error: "كود الخصم غير صحيح" });
    if (coupon.expiresAt && new Date() > coupon.expiresAt) return res.status(400).json({ error: "انتهت صلاحية كود الخصم" });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: "تم استخدام الكود بالحد الأقصى" });
    if (orderTotal < coupon.minOrderValue) return res.status(400).json({ error: `الحد الأدنى للطلب ${coupon.minOrderValue} ج.م` });

    const discount = coupon.type === "PERCENTAGE"
      ? (orderTotal * coupon.value) / 100
      : Math.min(coupon.value, orderTotal);

    res.json({ valid: true, coupon, discount: Math.round(discount * 100) / 100 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUBLIC: Create order ──────────────────────────────────────────────────────

router.post("/", async (req, res) => {
  try {
    const { customer, items, notes, couponCode } = req.body;

    // ── Validate required fields ──
    if (!customer || !items || items.length === 0) {
      return res.status(400).json({ error: "بيانات الطلب غير مكتملة" });
    }

    const phoneClean = customer.phone?.replace(/\s/g, "");
    const phoneRegex = /^(010|011|012|015)\d{8}$/;
    if (!phoneRegex.test(phoneClean)) {
      return res.status(400).json({ error: "رقم التليفون غير صحيح. يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015" });
    }
    if (!customer.name || customer.name.trim().length < 3) {
      return res.status(400).json({ error: "الاسم يجب أن يكون 3 أحرف على الأقل" });
    }
    if (/[0-9!@#$%^&*()_+=\[\]{};':"\\|,.<>\/?]/.test(customer.name)) {
      return res.status(400).json({ error: "الاسم يجب أن يحتوي على أحرف فقط" });
    }

    // ── Blacklist check ──
    const blacklisted = await prisma.blacklist.findUnique({ where: { phone: phoneClean } });
    if (blacklisted) {
      return res.status(403).json({ error: "عذراً، لا يمكن إتمام الطلب. تواصل معنا للمساعدة." });
    }

    // ── Risk score ──
    const previousOrders = await prisma.order.count({
      where: { customer: { path: ["phone"], equals: phoneClean } }
    });
    const { score: riskScore, reasons: riskReasons } = calculateRiskScore(
      { ...customer, phone: phoneClean },
      previousOrders
    );

    // ── Build order items ──────────────────────────────────────────────────────
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {

      // ════════════════════════════════════════════════════════════════════════
      // CASE 1: Bundle أو Custom item — بيجي بـ price مباشرة بدون productId
      //         مثال: {"price":520,"size":null,"color":null}
      // ════════════════════════════════════════════════════════════════════════
      if (!item.productId && item.price) {
        const itemPrice = parseFloat(item.price);
        const itemQty   = parseInt(item.quantity) || 1;

        totalAmount += itemPrice * itemQty;

        orderItems.push({
          productId: null,          // ← schema لازم تكون String? (optional)
          quantity:  itemQty,
          size:      item.size  || null,
          color:     item.color || null,
          price:     itemPrice,
        });
        continue; // ← ننتقل للـ item التالي
      }

      // ════════════════════════════════════════════════════════════════════════
      // CASE 2: منتج عادي أو Bundle مع productId
      // ════════════════════════════════════════════════════════════════════════
      if (!item.productId) {
        return res.status(400).json({ error: "كل منتج لازم يكون له productId أو price" });
      }

      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product || !product.isActive) {
        return res.status(400).json({ error: "المنتج غير متاح" });
      }

      const isBundle    = item.isBundle === true || item.isBundle === "true";
      const bundlePrice = parseFloat(item.bundlePrice) || 0;

      if (isBundle && bundlePrice > 0) {
        // Bundle مع productId و bundlePrice
        totalAmount += bundlePrice;

        if (item.bundleItems && item.bundleItems.length > 0) {
          // bundleItems = [{size, color}, {size, color}, ...]
          item.bundleItems.forEach((piece, idx) => {
            orderItems.push({
              productId: product.id,
              quantity:  1,
              size:      piece.size  || null,
              color:     piece.color || null,
              price:     idx === 0 ? bundlePrice : 0, // السعر كله على أول item
            });
          });
        } else {
          orderItems.push({
            productId: product.id,
            quantity:  item.bundleQuantity || 2,
            size:      null,
            color:     null,
            price:     bundlePrice,
          });
        }
      } else {
        // منتج عادي
        const qty = parseInt(item.quantity) || 1;
        totalAmount += product.price * qty;
        orderItems.push({
          productId: product.id,
          quantity:  qty,
          size:      item.size  || null,
          color:     item.color || null,
          price:     product.price,
        });
      }
    }

    // ── Coupon ────────────────────────────────────────────────────────────────
    let discount     = 0;
    let appliedCoupon = null;

    if (couponCode) {
      appliedCoupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
      if (
        appliedCoupon && appliedCoupon.isActive &&
        (!appliedCoupon.expiresAt || new Date() <= appliedCoupon.expiresAt) &&
        (!appliedCoupon.maxUses   || appliedCoupon.usedCount < appliedCoupon.maxUses) &&
        totalAmount >= appliedCoupon.minOrderValue
      ) {
        discount = appliedCoupon.type === "PERCENTAGE"
          ? (totalAmount * appliedCoupon.value) / 100
          : Math.min(appliedCoupon.value, totalAmount);
        discount = Math.round(discount * 100) / 100;
        await prisma.coupon.update({
          where: { id: appliedCoupon.id },
          data:  { usedCount: { increment: 1 } }
        });
      }
    }

    // ── Create order ──────────────────────────────────────────────────────────
    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        totalAmount: totalAmount - discount,
        discount,
        couponCode:  appliedCoupon ? appliedCoupon.code : null,
        riskScore,
        riskReasons,
        customer: { ...customer, phone: phoneClean },
        notes:    notes || null,
        items:    { create: orderItems },
      },
      include: { items: { include: { product: true } } },
    });

    res.status(201).json(order);
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUBLIC: Track order ───────────────────────────────────────────────────────

router.get("/track/:orderNumber", async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: "Phone number required" });

    const order = await prisma.order.findFirst({
      where: {
        orderNumber: req.params.orderNumber.toUpperCase(),
        customer:    { path: ["phone"], equals: phone.replace(/\s/g, "") }
      },
      include: { items: { include: { product: true } } }
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found. Please check your order number and phone number." });
    }

    res.json({
      orderNumber: order.orderNumber,
      status:      order.status,
      totalAmount: order.totalAmount,
      createdAt:   order.createdAt,
      customer:    { name: order.customer.name, city: order.customer.city },
      items: order.items.map(i => ({
        name:     i.product?.name || "Bundle Item",
        price:    i.price,
        quantity: i.quantity,
        size:     i.size,
        color:    i.color,
        image:    i.product?.images?.[0] || null,
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: Get all orders ─────────────────────────────────────────────────────

router.get("/", auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) where.orderNumber = { contains: search, mode: "insensitive" };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include:  { items: { include: { product: true } } },
        orderBy:  { createdAt: "desc" },
        skip:     (page - 1) * limit,
        take:     parseInt(limit)
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ orders, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: Get single order ───────────────────────────────────────────────────

router.get("/:id", auth, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where:   { id: req.params.id },
      include: { items: { include: { product: true } } }
    });
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: Update order status ────────────────────────────────────────────────

router.patch("/:id/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const order = await prisma.order.update({
      where:   { id: req.params.id },
      data:    { status },
      include: { items: { include: { product: true } } }
    });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: Delete order ───────────────────────────────────────────────────────

router.delete("/:id", auth, async (req, res) => {
  try {
    await prisma.orderItem.deleteMany({ where: { orderId: req.params.id } });
    await prisma.order.delete({ where: { id: req.params.id } });
    res.json({ message: "Order deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN: Export CSV ─────────────────────────────────────────────────────────

router.get("/export/csv", auth, async (req, res) => {
  try {
    const { status, from, to } = req.query;
    const where = {};
    if (status) where.status = status;
    if (from || to) where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {})
    };

    const orders = await prisma.order.findMany({
      where,
      include:  { items: { include: { product: true } } },
      orderBy:  { createdAt: "desc" }
    });

    const headers = ["Order Number", "Status", "Risk Score", "Customer Name", "Phone", "City", "Address", "Total", "Discount", "Coupon", "Items", "Date"];
    const rows = orders.map(o => {
      const c     = o.customer;
      const items = o.items.map(i => `${i.product?.name || "Bundle"} x${i.quantity}`).join(" | ");
      return [
        o.orderNumber, o.status, o.riskScore || 0,
        c.name, c.phone, c.city, c.address,
        o.totalAmount, o.discount || 0, o.couponCode || "",
        items, new Date(o.createdAt).toLocaleDateString()
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=orders-${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
