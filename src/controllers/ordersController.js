const supabase = require('../config/supabase');

// ===== CREATE ORDER (من العميل) =====
const createOrder = async (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      customer_city,
      items,
      notes,
      via_whatsapp
    } = req.body;

    // Validation
    if (!customer_name || !customer_phone || !items || items.length === 0) {
      return res.status(400).json({
        error: 'Name, phone, and items are required.'
      });
    }

    // حساب الإجمالي
    const total = items.reduce((sum, item) => {
      return sum + (parseFloat(item.price) * parseInt(item.quantity));
    }, 0);

    // إنشاء الطلب
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        customer_name,
        customer_phone,
        customer_email: customer_email || null,
        customer_address: customer_address || '',
        customer_city: customer_city || '',
        items,
        total,
        notes: notes || '',
        status: 'pending',
        via_whatsapp: via_whatsapp || false
      }])
      .select()
      .single();

    if (error) throw error;

    // لو عايز واتساب redirect، بنرجع رابط الواتساب
    let whatsappUrl = null;
    if (via_whatsapp) {
      const itemsList = items
        .map(item => `• ${item.name} (${item.size || ''}) × ${item.quantity} = ${item.price * item.quantity} EGP`)
        .join('\n');

      const message = encodeURIComponent(
        `🛍️ طلب جديد من SEENWAYS\n\n` +
        `👤 الاسم: ${customer_name}\n` +
        `📱 التليفون: ${customer_phone}\n` +
        `📍 العنوان: ${customer_address}, ${customer_city}\n\n` +
        `المنتجات:\n${itemsList}\n\n` +
        `💰 الإجمالي: ${total} EGP\n` +
        `📝 ملاحظات: ${notes || 'لا يوجد'}\n\n` +
        `رقم الطلب: #${data.id}`
      );

      whatsappUrl = `https://wa.me/${process.env.WHATSAPP_NUMBER}?text=${message}`;
    }

    res.status(201).json({
      success: true,
      order: data,
      whatsappUrl
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order.' });
  }
};

// ===== GET ALL ORDERS (للأدمن) =====
const getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      orders: data,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
};

// ===== GET SINGLE ORDER =====
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    res.json({ success: true, order: data });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order.' });
  }
};

// ===== UPDATE ORDER STATUS =====
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, order: data });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Failed to update order.' });
  }
};

// ===== DASHBOARD STATS =====
const getStats = async (req, res) => {
  try {
    // إجمالي الطلبات
    const { count: totalOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    // طلبات اليوم
    const today = new Date().toISOString().split('T')[0];
    const { count: todayOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today);

    // إجمالي الإيرادات
    const { data: revenueData } = await supabase
      .from('orders')
      .select('total')
      .not('status', 'eq', 'cancelled');

    const totalRevenue = revenueData?.reduce((sum, o) => sum + o.total, 0) || 0;

    // إجمالي المنتجات
    const { count: totalProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    // طلبات pending
    const { count: pendingOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    res.json({
      success: true,
      stats: {
        totalOrders,
        todayOrders,
        totalRevenue,
        totalProducts,
        pendingOrders
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  getStats
};
