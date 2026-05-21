const supabase = require('../config/supabase');

// ===== GET ALL PRODUCTS (للعميل) =====
const getProducts = async (req, res) => {
  try {
    const { category, sort, search } = req.query;

    let query = supabase
      .from('products')
      .select('*')
      .eq('is_active', true);

    // فلتر بالكاتيجوري
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    // بحث
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // ترتيب
    if (sort === 'price_asc') query = query.order('price', { ascending: true });
    else if (sort === 'price_desc') query = query.order('price', { ascending: false });
    else query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, products: data });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
};

// ===== GET SINGLE PRODUCT =====
const getProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json({ success: true, product: data });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product.' });
  }
};

// ===== GET ALL PRODUCTS (للأدمن - بما فيها المخفية) =====
const getAdminProducts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, products: data });
  } catch (error) {
    console.error('Get admin products error:', error);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
};

// ===== ADD PRODUCT =====
const addProduct = async (req, res) => {
  try {
    const {
      name,
      name_en,
      description,
      price,
      original_price,
      category,
      sizes,
      colors,
      images,
      is_active,
      stock
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required.' });
    }

    const { data, error } = await supabase
      .from('products')
      .insert([{
        name,
        name_en: name_en || '',
        description: description || '',
        price: parseFloat(price),
        original_price: original_price ? parseFloat(original_price) : null,
        category: category || 'general',
        sizes: sizes || [],
        colors: colors || [],
        images: images || [],
        is_active: is_active !== undefined ? is_active : true,
        stock: stock || 0
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, product: data });
  } catch (error) {
    console.error('Add product error:', error);
    res.status(500).json({ error: 'Failed to add product.' });
  }
};

// ===== UPDATE PRODUCT =====
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // تحويل السعر لرقم لو موجود
    if (updates.price) updates.price = parseFloat(updates.price);
    if (updates.original_price) updates.original_price = parseFloat(updates.original_price);

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, product: data });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product.' });
  }
};

// ===== DELETE PRODUCT =====
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Product deleted successfully.' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
};

// ===== UPLOAD IMAGE =====
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided.' });
    }

    const fileName = `products/${Date.now()}-${req.file.originalname}`;
    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, fileBuffer, {
        contentType: mimeType,
        upsert: false
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    res.json({ success: true, url: urlData.publicUrl });
  } catch (error) {
    console.error('Upload image error:', error);
    res.status(500).json({ error: 'Failed to upload image.' });
  }
};

module.exports = {
  getProducts,
  getProduct,
  getAdminProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  uploadImage
};
