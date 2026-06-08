require("dotenv").config();
const express = require("express");
const cors = require("cors");

const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const notificationsRouter = require("./routes/notifications");
const adminRoutes = require("./routes/admin");
const uploadRoutes = require("./routes/upload");
const categoryRoutes = require("./routes/categories");
const couponRoutes = require("./routes/coupons");
const blacklistRouter = require("./routes/blacklist");
const governoratesRouter = require("./routes/governorates");
const abandonedCartsRouter = require("./routes/abandoned-carts");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/", (req, res) => res.json({ status: "ok", message: "SEENWAYS API is running", version: "2.1.0" }));

app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/notifications", notificationsRouter);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/blacklist", blacklistRouter);
app.use("/api/governorates", governoratesRouter);
app.use("/api/abandoned-carts", abandonedCartsRouter);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});

app.listen(PORT, () => console.log(`SEENWAYS API v2 running on port ${PORT}`));
