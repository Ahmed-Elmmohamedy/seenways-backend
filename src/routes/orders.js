const express = require("express");
const prisma = require("../config/prisma");
const auth = require("../middleware/auth");
const router = express.Router();

function generateOrderNumber() {
  return "SW-" + Date.now().toString().slice(-8);
}

// PUBLIC - Validate coupon
router.post("/validate-coupon", async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    if (!code) return res.status(400).json({ error: "Coupon code required" });

    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon || !coupon.isActive) return res.status(404).json({ error: "Invalid coupon code" });
    if (coupon.expiresAt && new Date() > coupon.expiresAt) return res.status(400).json({ error: "Coupon has expired" });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: "Coupon usage limit reached" });
    if (orderTotal < coupon.minOrderValue) return res.status(400).json({ error: `Minimum order value is ${coupon.minOrderValue} ج.م` });

    const discount = coupon.type === "PERCENTAGE"
      ? (orderTotal * coupon.value) / 100
      : Math.min(coupon.value, orderTotal);

    res.json({ valid: true, coupon, discount: Math.round(discount * 100) / 100 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUBLIC - Create order
router.post("/", async (req, res) => {
  try {
    const { customer, items, notes, couponCode } = req.body;
    if (!customer || !items || items.length === 0) return res.status(400).json({ error: "Customer info and items are required" });
    if (!customer.name || !customer.phone || !customer.address) return res.status(400).json({ error: "Name, phone, and address are required" });

    // Rate limiting per phone
    const recentOrder = await prisma.order.findFirst({
      where: { customer: { path: ["phone"], equals: customer.phone }, createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } }
    });
    if (recentOrder) return res.status(429).json({ error: "Please wait before placing another order" });

    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product || !product.isActive) return res.status(400).json({ error: `Product not found: ${item.productId}` });
      const itemPrice = product.price * item.quantity;
      totalAmount += itemPrice;
      orderItems.push({ productId: product.id, quantity: item.quantity, size: item.size || null, color: item.color || null, price: product.price });
    }

    // Apply coupon
    let discount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      appliedCoupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
      if (appliedCoupon && appliedCoupon.isActive) {
        if (!appliedCoupon.expiresAt || new Date() <= appliedCoupon.expiresAt) {
          if (!appliedCoupon.maxUses || appliedCoupon.usedCount < appliedCoupon.maxUses) {
            if (totalAmount >= appliedCoupon.minOrderValue) {
              discount = appliedCoupon.type === "PERCENTAGE"
                ? (totalAmount * appliedCoupon.value) / 100
                : Math.min(appliedCoupon.value, totalAmount);
              discount = Math.round(discount * 100) / 100;
              await prisma.coupon.update({ where: { id: appliedCoupon.id }, data: { usedCount: { increment: 1 } } });
            }
          }
        }
      }
    }

    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        totalAmount: totalAmount - discount,
        discount,
        couponCode: appliedCoupon ? appliedCoupon.code : null,
        customer,
        notes: notes || null,
        items: { create: orderItems },
      },
      include: { items: { include: { product: true } } },
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Get all orders
router.get("/", auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) where.orderNumber = { contains: search, mode: "insensitive" };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({ where, include: { items: { include: { product: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: parseInt(limit) }),
      prisma.order.count({ where }),
    ]);
    res.json({ orders, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Get single order
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: { include: { product: true } } } });
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Update order status
router.patch("/:id/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
    const order = await prisma.order.update({ where: { id: req.params.id }, data: { status }, include: { items: { include: { product: true } } } });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Delete order
router.delete("/:id", auth, async (req, res) => {
  try {
    await prisma.orderItem.deleteMany({ where: { orderId: req.params.id } });
    await prisma.order.delete({ where: { id: req.params.id } });
    res.json({ message: "Order deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Export orders CSV
router.get("/export/csv", auth, async (req, res) => {
  try {
    const { status, from, to } = req.query;
    const where = {};
    if (status) where.status = status;
    if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };

    const orders = await prisma.order.findMany({ where, include: { items: { include: { product: true } } }, orderBy: { createdAt: "desc" } });

    const headers = ["Order Number", "Status", "Customer Name", "Phone", "City", "Address", "Total", "Discount", "Coupon", "Items", "Date"];
    const rows = orders.map(o => {
      const c = o.customer;
      const items = o.items.map(i => `${i.product?.name} x${i.quantity}`).join(" | ");
      return [o.orderNumber, o.status, c.name, c.phone, c.city, c.address, o.totalAmount, o.discount || 0, o.couponCode || "", items, new Date(o.createdAt).toLocaleDateString()].join(",");
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
