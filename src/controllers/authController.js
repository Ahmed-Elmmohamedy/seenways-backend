const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// في البداية بنستخدم بيانات من .env
// ممكن بعدين تنقلها لقاعدة البيانات

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // تحقق من الإيميل
    if (email !== process.env.ADMIN_EMAIL) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // تحقق من الباسورد
    const isValidPassword = password === process.env.ADMIN_PASSWORD;
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // اعمل توكن
    const token = jwt.sign(
      { email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      admin: { email, role: 'admin' }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
};

const verifyToken = (req, res) => {
  res.json({ success: true, admin: req.admin });
};

module.exports = { login, verifyToken };
