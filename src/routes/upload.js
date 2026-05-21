const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { uploadImage, deleteImage } = require("../config/supabase");
const auth = require("../middleware/auth");
const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"), false);
  },
});

// Upload single image
router.post("/image", auth, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image provided" });
    const ext = req.file.originalname.split(".").pop();
    const filename = `${uuidv4()}.${ext}`;
    const url = await uploadImage(req.file.buffer, filename, req.file.mimetype);
    res.json({ url, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload multiple images
router.post("/images", auth, upload.array("images", 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No images provided" });
    const urls = await Promise.all(
      req.files.map(async (file) => {
        const ext = file.originalname.split(".").pop();
        const filename = `${uuidv4()}.${ext}`;
        const url = await uploadImage(file.buffer, filename, file.mimetype);
        return { url, filename };
      })
    );
    res.json(urls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete image
router.delete("/image/:filename", auth, async (req, res) => {
  try {
    await deleteImage(req.params.filename);
    res.json({ message: "Image deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
