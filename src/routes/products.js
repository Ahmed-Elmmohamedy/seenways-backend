const express = require("express");
const prisma = require("../config/prisma");
const auth = require("../middleware/auth");
const router = express.Router();

function slugify(text) {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "").replace(/--+/g, "-");
}

const productInclude = {
  category: true,
  colorVariants: {
    include: { sizes: true },
    orderBy: { createdAt: "asc" }
  }
};

// PUBLIC - Get all active products
router.get("/", async (req, res) => {
  try {
    const { category, featured, search, page = 1, limit = 20 } = req.query;
    const where = { isActive: true };
    if (category) where.category = { slug: category };
    if (featured === "true") where.isFeatured = true;
    if (search) where.name = { contains: search, mode: "insensitive" };
    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, include: productInclude, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: parseInt(limit) }),
      prisma.product.count({ where }),
    ]);
    res.json({ products, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Get all products
router.get("/admin/all", auth, async (req, res) => {
  try {
    const { search, category, status } = req.query;
    const where = {};
    if (search) where.name = { contains: search, mode: "insensitive" };
    if (category) where.categoryId = category;
    if (status === "active") where.isActive = true;
    if (status === "hidden") where.isActive = false;
    const products = await prisma.product.findMany({ where, include: productInclude, orderBy: { createdAt: "desc" } });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUBLIC - Get single product by slug
router.get("/:slug", async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { slug: req.params.slug }, include: productInclude });
    if (!product || !product.isActive) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Create product
router.post("/", auth, async (req, res) => {
  try {
    const { name, description, price, oldPrice, images, sizes, colors, stock, isActive, isFeatured, categoryId, metaTitle, metaDescription, metaKeywords, colorVariants, bundles, sizeGuide } = req.body;
    if (!name || !price) return res.status(400).json({ error: "Name and price are required" });
    let slug = slugify(name);
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now()}`;

    const product = await prisma.product.create({
      data: {
        name, slug, description,
        price: parseFloat(price),
        oldPrice: oldPrice ? parseFloat(oldPrice) : null,
        images: images || [],
        sizes: sizes || [],
        colors: colors || [],
        stock: parseInt(stock) || 0,
        isActive: isActive !== false,
        isFeatured: isFeatured || false,
        categoryId: categoryId || null,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        metaKeywords: metaKeywords || null,
        bundles: bundles || null,
        sizeGuide: sizeGuide || null,
        colorVariants: colorVariants?.length ? {
          create: colorVariants.map(cv => ({
            name: cv.name,
            images: cv.images || [],
            sizes: {
              create: (cv.sizes || []).map(s => ({
                size: s.size,
                stock: parseInt(s.stock) || 0
              }))
            }
          }))
        } : undefined
      },
      include: productInclude,
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Update product
router.put("/:id", auth, async (req, res) => {
  try {
    const { name, description, price, oldPrice, images, sizes, colors, stock, isActive, isFeatured, categoryId, metaTitle, metaDescription, metaKeywords, colorVariants, bundles, sizeGuide } = req.body;
    const data = {};
    if (name !== undefined) { data.name = name; data.slug = slugify(name); }
    if (description !== undefined) data.description = description;
    if (price !== undefined) data.price = parseFloat(price);
    if (oldPrice !== undefined) data.oldPrice = oldPrice ? parseFloat(oldPrice) : null;
    if (images !== undefined) data.images = images;
    if (sizes !== undefined) data.sizes = sizes;
    if (colors !== undefined) data.colors = colors;
    if (stock !== undefined) data.stock = parseInt(stock);
    if (isActive !== undefined) data.isActive = isActive;
    if (isFeatured !== undefined) data.isFeatured = isFeatured;
    if (categoryId !== undefined) data.categoryId = categoryId || null;
    if (metaTitle !== undefined) data.metaTitle = metaTitle || null;
    if (metaDescription !== undefined) data.metaDescription = metaDescription || null;
    if (metaKeywords !== undefined) data.metaKeywords = metaKeywords || null;
    if (bundles !== undefined) data.bundles = bundles || null;
    if (sizeGuide !== undefined) data.sizeGuide = sizeGuide || null;

    if (colorVariants !== undefined) {
      await prisma.colorVariant.deleteMany({ where: { productId: req.params.id } });
      if (colorVariants.length > 0) {
        for (const cv of colorVariants) {
          await prisma.colorVariant.create({
            data: {
              productId: req.params.id,
              name: cv.name,
              images: cv.images || [],
              sizes: {
                create: (cv.sizes || []).map(s => ({
                  size: s.size,
                  stock: parseInt(s.stock) || 0
                }))
              }
            }
          });
        }
      }
    }

    const product = await prisma.product.update({ where: { id: req.params.id }, data, include: productInclude });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN - Delete product
router.delete("/:id", auth, async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
