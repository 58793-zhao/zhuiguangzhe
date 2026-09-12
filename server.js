/**
 * 眼镜店管理系统 - 后端服务器
 * 技术栈：Node.js + Express + SQLite (node:sqlite 内置模块，零编译依赖)
 * 功能：会员管理、库存管理、消费收银、验光管理、订单记录、系统设置、数据备份
 *
 * 注意：需要 Node.js >= 22.5.0（内置 node:sqlite 模块）
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const Dysmsapi20170525 = require('@alicloud/dysmsapi20170525');
const OpenApi = require('@alicloud/openapi-client');

const app = express();

// ========== 阿里云短信配置 ==========
const SMS_CONFIG = {
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
  signName: '青岛视源眼镜有限公司',
  templateCode: 'SMS_512035688',
  endpoint: 'dysmsapi.aliyuncs.com'
};

// 发送短信函数
async function sendSMS(phone, name, time, store, amount, balance) {
  try {
    const config = new OpenApi.Config({
      accessKeyId: SMS_CONFIG.accessKeyId,
      accessKeySecret: SMS_CONFIG.accessKeySecret,
      endpoint: SMS_CONFIG.endpoint,
    });
    const client = new Dysmsapi20170525.default(config);
    const sendSmsRequest = new Dysmsapi20170525.SendSmsRequest({
      phoneNumbers: phone,
      signName: SMS_CONFIG.signName,
      templateCode: SMS_CONFIG.templateCode,
      templateParam: JSON.stringify({
        name: name,
        time: time,
        store: store,
        amount: amount,
        balance: balance
      })
    });
    const res = await client.sendSms(sendSmsRequest);
    console.log('短信发送结果:', res.body);
    return true;
  } catch (err) {
    console.error('短信发送失败:', err.message);
    return false;
  }
}

// ========== 认证系统 ==========
const DEFAULT_PASSWORD = 'zhuiguangzhe2026';
const TOKEN_EXPIRE_MS = 24 * 60 * 60 * 1000;
const tokenStore = new Map();
const AUTH_WHITELIST = ['/login', '/heartbeat', '/health', '/backup'];

function getAdminPassword() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password');
  return row ? row.value : DEFAULT_PASSWORD;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

app.use('/api', (req, res, next) => {
  if (AUTH_WHITELIST.includes(req.path)) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未登录或登录已过期' });
  }
  const token = authHeader.substring(7);
  const session = tokenStore.get(token);
  if (!session) {
    return res.status(401).json({ success: false, message: '登录已失效，请重新登录' });
  }
  if (Date.now() - session.loginTime > TOKEN_EXPIRE_MS) {
    tokenStore.delete(token);
    return res.status(401).json({ success: false, message: '登录已过期（24小时），请重新登录' });
  }
  session.lastActiveTime = Date.now();
  req.session = session;
  req.token = token;
  next();
});
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
const backupDir = path.join(dataDir, 'backups');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

// 数据库连接
const dbPath = path.join(dataDir, 'glasses_shop.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ========== 事务工具 ==========
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ========== 数据库表初始化 ==========
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      gender TEXT DEFAULT '未填写',
      birthday TEXT,
      balance REAL DEFAULT 0,
      total_spent REAL DEFAULT 0,
      points INTEGER DEFAULT 0,
      address TEXT,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','+8 hours')),
      updated_at TEXT DEFAULT (datetime('now','+8 hours'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT '其他',
      brand TEXT,
      model TEXT,
      spec TEXT,
      sphere REAL,
      cylinder REAL,
      axis INTEGER,
      price REAL DEFAULT 0,
      cost REAL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 5,
      unit TEXT DEFAULT '件',
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','+8 hours')),
      updated_at TEXT DEFAULT (datetime('now','+8 hours'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE,
      member_id INTEGER,
      member_name TEXT,
      items TEXT,
      total_amount REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      final_amount REAL DEFAULT 0,
      pay_method TEXT DEFAULT '余额',
      status TEXT DEFAULT '已完成',
      store TEXT DEFAULT '总店',
      operator TEXT,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','+8 hours')),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS optometries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      member_name TEXT,
      phone TEXT,
      age INTEGER,
      gender TEXT,
      r_sphere REAL, r_cylinder REAL, r_axis INTEGER, r_vision TEXT, r_pd REAL,
      l_sphere REAL, l_cylinder REAL, l_axis INTEGER, l_vision TEXT, l_pd REAL,
      add_power REAL, pd REAL,
      lens_brand TEXT, frame_brand TEXT,
      optometrist TEXT, store TEXT DEFAULT '总店', diagnosis TEXT, remark TEXT,
      created_at TEXT DEFAULT (datetime('now','+8 hours')),
      updated_at TEXT DEFAULT (datetime('now','+8 hours')),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );
  `);

  // 兼容旧数据库：自动添加新字段
  try {
    const cols = db.prepare("PRAGMA table_info(optometries)").all();
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('lens_brand')) db.exec('ALTER TABLE optometries ADD COLUMN lens_brand TEXT');
    if (!colNames.includes('frame_brand')) db.exec('ALTER TABLE optometries ADD COLUMN frame_brand TEXT');
  } catch (e) { console.log('添加验光表字段:', e.message); }

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now','+8 hours'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS recharge_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER, member_name TEXT,
      amount REAL, bonus REAL DEFAULT 0, pay_method TEXT DEFAULT '现金',
      store TEXT DEFAULT '常州路店',
      operator TEXT, remark TEXT,
      created_at TEXT DEFAULT (datetime('now','+8 hours')),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );
  `);

  // 兼容旧数据库：给充值记录表加store字段
  try {
    const rechargeCols = db.prepare("PRAGMA table_info(recharge_records)").all();
    const rechargeColNames = rechargeCols.map(c => c.name);
    if (!rechargeColNames.includes('store')) db.exec('ALTER TABLE recharge_records ADD COLUMN store TEXT DEFAULT "常州路店"');
  } catch (e) { console.log('添加充值表store字段:', e.message); }

  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_in_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER, product_name TEXT,
      quantity INTEGER, unit_cost REAL, total_cost REAL,
      supplier TEXT, operator TEXT, remark TEXT,
      created_at TEXT DEFAULT (datetime('now','+8 hours')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);
}

// ========== 初始化示例数据 ==========
function initSampleData() {
  const memberCount = db.prepare('SELECT COUNT(*) as c FROM members').get().c;
  if (memberCount > 0) return;

  const insertMember = db.prepare(`
    INSERT INTO members (name, phone, gender, birthday, balance, total_spent, points, address, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const members = [
    ['张三', '13800138001', '男', '1990-05-15', 500.00, 1280.00, 128, '青岛市市南区', '老客户，偏好轻量镜框'],
    ['李四', '13800138002', '女', '1995-08-20', 300.00, 680.00, 68, '青岛市市北区', '对金属过敏，需TR90材质'],
    ['王五', '13800138003', '男', '1988-03-10', 1000.00, 3500.00, 350, '青岛市崂山区', 'VIP客户，渐进多焦点'],
    ['赵六', '13800138004', '女', '2000-12-01', 150.00, 200.00, 20, '青岛市李沧区', '学生，首次配镜'],
    ['孙七', '13800138005', '男', '1985-07-25', 800.00, 2100.00, 210, '青岛市城阳区', '高度近视，需超薄镜片'],
  ];
  transaction(() => { for (const row of members) insertMember.run(...row); });

  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, brand, model, spec, sphere, cylinder, axis, price, cost, stock, min_stock, unit, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const products = [
    ['1.56非球面镜片', '镜片', '明月', '1.56ASP', '常规', null, null, null, 198, 80, 50, 10, '副', '常规度数库存'],
    ['1.60非球面镜片', '镜片', '明月', '1.60ASP', '常规', null, null, null, 298, 120, 30, 10, '副', '中高度数推荐'],
    ['1.67非球面镜片', '镜片', '依视路', '1.67ASP', '超薄', null, null, null, 598, 280, 15, 5, '副', '高度数超薄'],
    ['1.74非球面镜片', '镜片', '蔡司', '1.74ASP', '超超薄', null, null, null, 1280, 600, 5, 3, '副', '超高度数专用'],
    ['防蓝光镜片1.56', '镜片', '明月', '1.56BL', '防蓝光', null, null, null, 268, 100, 25, 8, '副', '电脑族推荐'],
    ['TR90全框眼镜架', '镜架', '暴龙', 'TR90-001', '黑色', null, null, null, 199, 60, 40, 10, '副', '轻量舒适'],
    ['金属半框眼镜架', '镜架', '雷朋', 'MT-002', '银色', null, null, null, 299, 100, 20, 5, '副', '商务风格'],
    ['板材全框眼镜架', '镜架', '木九十', 'AC-003', '玳瑁色', null, null, null, 399, 150, 12, 5, '副', '复古风格'],
    ['无框钛架眼镜', '镜架', '夏蒙', 'TI-004', '金色', null, null, null, 699, 300, 8, 3, '副', '高端纯钛'],
    ['隐形眼镜日抛30片', '隐形眼镜', '海昌', 'DAILY-30', '0度', null, null, null, 128, 55, 60, 15, '盒', '日抛型'],
    ['隐形眼镜月抛6片', '隐形眼镜', '博士伦', 'MONTH-6', '0度', null, null, null, 98, 40, 45, 10, '盒', '月抛型'],
    ['护理液360ml', '配件', '爱尔康', 'CARE-360', '常规', null, null, null, 45, 18, 100, 20, '瓶', '隐形眼镜护理'],
    ['眼镜清洗液', '配件', '国产', 'CLEAN-100', '100ml', null, null, null, 15, 5, 80, 20, '瓶', '镜片清洁'],
    ['眼镜布', '配件', '国产', 'CLOTH', '超细纤维', null, null, null, 5, 1, 200, 50, '块', '擦镜布'],
    ['眼镜盒', '配件', '国产', 'CASE', '硬壳', null, null, null, 10, 3, 150, 30, '个', '收纳盒'],
  ];
  transaction(() => { for (const row of products) insertProduct.run(...row); });

  const insertOpt = db.prepare(`
    INSERT INTO optometries (member_id, member_name, phone, age, gender,
      r_sphere, r_cylinder, r_axis, r_vision, l_sphere, l_cylinder, l_axis, l_vision, pd, optometrist, store, diagnosis, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const optometries = [
    [1, '张三', '13800138001', 35, '男', -2.50, -0.50, 175, '1.0', -2.75, -0.25, 5, '1.0', 64, '王验光师', '总店', '双眼近视散光，建议常戴', '复查'],
    [2, '李四', '13800138002', 30, '女', -3.00, 0, 0, '1.0', -3.25, -0.50, 180, '1.0', 62, '王验光师', '总店', '双眼近视，左眼轻度散光', '首次配镜'],
    [3, '王五', '13800138003', 40, '男', -5.00, -1.00, 90, '0.8', -5.50, -0.75, 85, '0.8', 66, '李验光师', '总店', '高度近视加散光，建议1.67以上镜片', '老客户'],
    [5, '孙七', '13800138005', 40, '男', -8.00, -1.50, 100, '0.6', -8.50, -1.25, 95, '0.6', 68, '李验光师', '总店', '超高度近视，建议1.74超薄镜片', '需定制'],
  ];
  transaction(() => { for (const row of optometries) insertOpt.run(...row); });

  const insertOrder = db.prepare(`
    INSERT INTO orders (order_no, member_id, member_name, items, total_amount, discount, final_amount, pay_method, status, store, operator, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const today = new Date().toISOString().slice(0, 10);
  const orders = [
    [`ORD${today.replace(/-/g,'')}001`, 1, '张三', JSON.stringify([{name:'1.56非球面镜片',qty:1,price:198},{name:'TR90全框眼镜架',qty:1,price:199}]), 397, 0, 397, '余额', '已完成', '总店', 'admin', ''],
    [`ORD${today.replace(/-/g,'')}002`, 3, '王五', JSON.stringify([{name:'1.67非球面镜片',qty:1,price:598},{name:'无框钛架眼镜',qty:1,price:699}]), 1297, 97, 1200, '余额', '已完成', '总店', 'admin', 'VIP优惠'],
    [`ORD${today.replace(/-/g,'')}003`, null, '散客', JSON.stringify([{name:'眼镜清洗液',qty:2,price:15},{name:'眼镜布',qty:3,price:5}]), 45, 0, 45, '现金', '已完成', '总店', 'admin', ''],
  ];
  transaction(() => { for (const row of orders) insertOrder.run(...row); });

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('store_name', '追光者眼镜');
  insertSetting.run('store_phone', '0532-88888888');
  insertSetting.run('store_address', '青岛市市南区XX路XX号');
  insertSetting.run('default_discount', '1.0');
  insertSetting.run('low_stock_alert', '5');
  insertSetting.run('receipt_footer', '感谢您的惠顾，明视眼镜竭诚为您服务！');
  insertSetting.run('admin_password', 'zhuiguangzhe2026');

  console.log('✅ 示例数据初始化完成');
}

initDatabase();
initSampleData();

// 确保 admin_password 存在（兼容已有数据库）
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', 'zhuiguangzhe2026')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('sms_enabled', '0')").run();

// ========== 工具函数 ==========
function generateOrderNo() {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `ORD${dateStr}${random}`;
}

function getTodayStr() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijing = new Date(utc + 8 * 3600000);
  return beijing.toISOString().slice(0, 10);
}

// ========== API 路由 ==========

// --- 认证相关 ---
app.post('/api/login', (req, res) => {
  const { password, deviceId } = req.body;
  if (!password) return res.status(400).json({ success: false, message: '请输入密码' });
  if (password !== getAdminPassword()) return res.status(401).json({ success: false, message: '密码错误' });
  const token = generateToken();
  const now = Date.now();
  tokenStore.set(token, {
    deviceId: deviceId || 'unknown',
    loginTime: now,
    lastActiveTime: now,
    userAgent: req.headers['user-agent'] || '',
    ip: req.ip || ''
  });
  res.json({ success: true, data: { token, expireAt: now + TOKEN_EXPIRE_MS }, message: '登录成功' });
});

app.post('/api/logout', (req, res) => {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) tokenStore.delete(h.substring(7));
  res.json({ success: true, message: '已退出登录' });
});

app.get('/api/heartbeat', (req, res) => {
  res.json({ success: true, status: 'alive', timestamp: new Date().toISOString() });
});

// --- 后台管理 ---
app.get('/api/admin/devices', (req, res) => {
  const devices = [];
  for (const [token, s] of tokenStore.entries()) {
    devices.push({
      tokenFull: token,
      deviceId: s.deviceId,
      loginTime: new Date(s.loginTime).toLocaleString('zh-CN'),
      lastActiveTime: new Date(s.lastActiveTime).toLocaleString('zh-CN'),
      userAgent: s.userAgent,
      ip: s.ip,
      isCurrent: token === req.token
    });
  }
  devices.sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));
  res.json({ success: true, data: devices });
});

app.post('/api/admin/kick', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: '缺少token' });
  if (token === req.token) return res.status(400).json({ success: false, message: '不能踢掉当前设备' });
  if (tokenStore.delete(token)) {
    res.json({ success: true, message: '设备已强制下线' });
  } else {
    res.status(404).json({ success: false, message: '设备不存在或已下线' });
  }
});

app.post('/api/admin/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ success: false, message: '旧密码和新密码必填' });
  if (newPassword.length < 6) return res.status(400).json({ success: false, message: '新密码至少6位' });
  if (oldPassword !== getAdminPassword()) return res.status(401).json({ success: false, message: '旧密码错误' });
  db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','+8 hours')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','+8 hours')").run('admin_password', newPassword);
  tokenStore.clear();
  res.json({ success: true, message: '密码修改成功，所有设备需重新登录' });
});



// --- 会员管理 ---
app.get('/api/members', (req, res) => {
  const { search, page = 1, limit = 100 } = req.query;
  let sql = 'SELECT * FROM members';
  let params = [];
  if (search) { sql += ' WHERE name LIKE ? OR phone LIKE ?'; params = [`%${search}%`, `%${search}%`]; }
  sql += ' ORDER BY created_at DESC';
  const offset = (page - 1) * limit;
  sql += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
  const members = db.prepare(sql).all(...params);
  const countSql = 'SELECT COUNT(*) as c FROM members' + (search ? ' WHERE name LIKE ? OR phone LIKE ?' : '');
  const total = db.prepare(countSql).get(...(search ? [`%${search}%`, `%${search}%`] : []));
  res.json({ success: true, data: members, total: total.c });
});

app.get('/api/members/:id', (req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ success: false, message: '会员不存在' });
  res.json({ success: true, data: member });
});

app.post('/api/members', (req, res) => {
  const { name, phone, gender, birthday, balance, address, remark } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '会员姓名必填' });
  const result = db.prepare(`
    INSERT INTO members (name, phone, gender, birthday, balance, address, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, phone || '', gender || '未填写', birthday || '', balance || 0, address || '', remark || '');
  res.json({ success: true, data: { id: Number(result.lastInsertRowid), name, phone, balance: balance || 0 }, message: '会员添加成功' });
});

app.put('/api/members/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: '会员不存在' });
  const { name, phone, gender, birthday, address, remark } = req.body;
  db.prepare(`
    UPDATE members SET name=?, phone=?, gender=?, birthday=?, address=?, remark=?, updated_at=datetime('now','+8 hours')
    WHERE id=?
  `).run(name || existing.name, phone !== undefined ? phone : existing.phone,
    gender || existing.gender, birthday !== undefined ? birthday : existing.birthday,
    address !== undefined ? address : existing.address, remark !== undefined ? remark : existing.remark,
    req.params.id);
  res.json({ success: true, message: '会员信息更新成功' });
});

app.delete('/api/members/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: '会员不存在' });
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: '会员删除成功' });
});

app.post('/api/members/:id/recharge', (req, res) => {
  const { amount, bonus = 0, pay_method = '现金', operator = 'admin', remark = '', store = '常州路店' } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: '充值金额必须大于0' });
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ success: false, message: '会员不存在' });
  const totalAdd = parseFloat(amount) + parseFloat(bonus);
  db.prepare("UPDATE members SET balance = balance + ?, updated_at=datetime('now','+8 hours') WHERE id = ?").run(totalAdd, req.params.id);
  db.prepare(`INSERT INTO recharge_records (member_id, member_name, amount, bonus, pay_method, store, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, member.name, amount, bonus, pay_method, store, operator, remark);
  const updated = db.prepare('SELECT balance FROM members WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: { balance: updated.balance }, message: `充值成功，当前余额 ¥${updated.balance.toFixed(2)}` });
});

app.get('/api/recharge-records', (req, res) => {
  const { member_id } = req.query;
  let sql = 'SELECT * FROM recharge_records';
  let params = [];
  if (member_id) { sql += ' WHERE member_id = ?'; params.push(member_id); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  res.json({ success: true, data: db.prepare(sql).all(...params) });
});

// 会员详情：基本信息 + 消费记录 + 充值记录
app.get('/api/members/:id/detail', (req, res) => {
  const memberId = req.params.id;
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  if (!member) return res.status(404).json({ success: false, message: '会员不存在' });
  
  const orders = db.prepare('SELECT * FROM orders WHERE member_id = ? ORDER BY created_at DESC LIMIT 100').all(memberId);
  const recharges = db.prepare('SELECT * FROM recharge_records WHERE member_id = ? ORDER BY created_at DESC LIMIT 100').all(memberId);
  
  const totalSpent = db.prepare("SELECT COALESCE(SUM(final_amount), 0) as total FROM orders WHERE member_id = ? AND status = '已完成'").get(memberId);
  const totalRecharged = db.prepare("SELECT COALESCE(SUM(amount + bonus), 0) as total FROM recharge_records WHERE member_id = ?").get(memberId);
  const orderCount = db.prepare("SELECT COUNT(*) as c FROM orders WHERE member_id = ?").get(memberId);
  const rechargeCount = db.prepare("SELECT COUNT(*) as c FROM recharge_records WHERE member_id = ?").get(memberId);
  
  res.json({
    success: true,
    data: {
      member, orders, recharges,
      stats: {
        totalSpent: totalSpent.total,
        totalRecharged: totalRecharged.total,
        orderCount: orderCount.c,
        rechargeCount: rechargeCount.c
      }
    }
  });
});

// --- 商品/库存管理 ---
app.get('/api/products', (req, res) => {
  const { search, category, low_stock, page = 1, limit = 200 } = req.query;
  let sql = 'SELECT * FROM products WHERE 1=1';
  let params = [];
  if (search) { sql += ' AND (name LIKE ? OR brand LIKE ? OR model LIKE ? OR spec LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
  if (category && category !== '全部') { sql += ' AND category = ?'; params.push(category); }
  if (low_stock === 'true') { sql += ' AND stock <= min_stock'; }
  sql += ' ORDER BY category, created_at DESC';
  const offset = (page - 1) * limit;
  sql += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
  res.json({ success: true, data: db.prepare(sql).all(...params) });
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: '商品不存在' });
  res.json({ success: true, data: product });
});

app.post('/api/products', (req, res) => {
  const p = req.body;
  if (!p.name) return res.status(400).json({ success: false, message: '商品名称必填' });
  const result = db.prepare(`
    INSERT INTO products (name, category, brand, model, spec, sphere, cylinder, axis, price, cost, stock, min_stock, unit, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(p.name, p.category || '其他', p.brand || '', p.model || '', p.spec || '',
    p.sphere || null, p.cylinder || null, p.axis || null,
    p.price || 0, p.cost || 0, p.stock || 0, p.min_stock || 5, p.unit || '件', p.remark || '');
  res.json({ success: true, data: { id: Number(result.lastInsertRowid) }, message: '商品添加成功' });
});

app.put('/api/products/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: '商品不存在' });
  const p = req.body;
  db.prepare(`
    UPDATE products SET name=?, category=?, brand=?, model=?, spec=?, sphere=?, cylinder=?, axis=?,
    price=?, cost=?, stock=?, min_stock=?, unit=?, remark=?, updated_at=datetime('now','+8 hours') WHERE id=?
  `).run(p.name || existing.name, p.category || existing.category, p.brand !== undefined ? p.brand : existing.brand,
    p.model !== undefined ? p.model : existing.model, p.spec !== undefined ? p.spec : existing.spec,
    p.sphere !== undefined ? p.sphere : existing.sphere, p.cylinder !== undefined ? p.cylinder : existing.cylinder,
    p.axis !== undefined ? p.axis : existing.axis, p.price !== undefined ? p.price : existing.price,
    p.cost !== undefined ? p.cost : existing.cost, p.stock !== undefined ? p.stock : existing.stock,
    p.min_stock !== undefined ? p.min_stock : existing.min_stock, p.unit || existing.unit,
    p.remark !== undefined ? p.remark : existing.remark, req.params.id);
  res.json({ success: true, message: '商品信息更新成功' });
});

app.delete('/api/products/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: '商品不存在' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: '商品删除成功' });
});

app.post('/api/products/:id/stock-in', (req, res) => {
  const { quantity, unit_cost, supplier = '', operator = 'admin', remark = '' } = req.body;
  if (!quantity || quantity <= 0) return res.status(400).json({ success: false, message: '入库数量必须大于0' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: '商品不存在' });
  const totalCost = (unit_cost || product.cost) * quantity;
  db.prepare("UPDATE products SET stock = stock + ?, updated_at=datetime('now','+8 hours') WHERE id = ?").run(quantity, req.params.id);
  db.prepare(`INSERT INTO stock_in_records (product_id, product_name, quantity, unit_cost, total_cost, supplier, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, product.name, quantity, unit_cost || product.cost, totalCost, supplier, operator, remark);
  const updated = db.prepare('SELECT stock FROM products WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: { stock: updated.stock }, message: `入库成功，当前库存 ${updated.stock} ${product.unit}` });
});

app.get('/api/stock-in-records', (req, res) => {
  res.json({ success: true, data: db.prepare('SELECT * FROM stock_in_records ORDER BY created_at DESC LIMIT 200').all() });
});

// --- 订单管理 ---
app.get('/api/orders', (req, res) => {
  const { member_id, status, start_date, end_date, search, page = 1, limit = 100 } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  let params = [];
  if (member_id) { sql += ' AND member_id = ?'; params.push(member_id); }
  if (status && status !== '全部') { sql += ' AND status = ?'; params.push(status); }
  if (start_date) { sql += ' AND date(created_at) >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND date(created_at) <= ?'; params.push(end_date); }
  if (search) { sql += ' AND (order_no LIKE ? OR member_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY created_at DESC';
  const offset = (page - 1) * limit;
  sql += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
  res.json({ success: true, data: db.prepare(sql).all(...params) });
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  res.json({ success: true, data: order });
});

app.post('/api/orders', (req, res) => {
  const { member_id, member_name, items, total_amount, discount = 0, final_amount, pay_method = '余额', store = '总店', operator = 'admin', remark = '', created_at } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, message: '订单商品不能为空' });
  if (!final_amount || final_amount <= 0) return res.status(400).json({ success: false, message: '订单金额必须大于0' });

  const orderNo = generateOrderNo();
  const itemsJson = JSON.stringify(items);
  const orderTime = created_at || null;

  try {
    const orderId = transaction(() => {
      for (const item of items) {
        const product = db.prepare('SELECT id, stock, name FROM products WHERE name = ?').get(item.name);
        if (product) {
          if (product.stock < item.qty) throw new Error(`商品「${item.name}」库存不足，当前库存 ${product.stock}`);
          db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.qty, product.id);
        }
      }
      if (member_id) {
        const member = db.prepare('SELECT * FROM members WHERE id = ?').get(member_id);
        if (!member) throw new Error('会员不存在');
        if (pay_method === '余额') {
          if (member.balance < final_amount) throw new Error(`会员余额不足，当前余额 ¥${member.balance.toFixed(2)}`);
          db.prepare("UPDATE members SET balance = balance - ?, total_spent = total_spent + ?, points = points + ?, updated_at=datetime('now','+8 hours') WHERE id = ?")
            .run(final_amount, final_amount, Math.floor(final_amount), member_id);
        } else {
          db.prepare("UPDATE members SET total_spent = total_spent + ?, points = points + ?, updated_at=datetime('now','+8 hours') WHERE id = ?")
            .run(final_amount, Math.floor(final_amount), member_id);
        }
      }
      let result;
      if (orderTime) {
        result = db.prepare(`
          INSERT INTO orders (order_no, member_id, member_name, items, total_amount, discount, final_amount, pay_method, status, store, operator, remark, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, '已完成', ?, ?, ?, ?)
        `).run(orderNo, member_id || null, member_name || '散客', itemsJson, total_amount, discount, final_amount, pay_method, store, operator, remark, orderTime);
      } else {
        result = db.prepare(`
          INSERT INTO orders (order_no, member_id, member_name, items, total_amount, discount, final_amount, pay_method, status, store, operator, remark)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, '已完成', ?, ?, ?)
        `).run(orderNo, member_id || null, member_name || '散客', itemsJson, total_amount, discount, final_amount, pay_method, store, operator, remark);
      }
      return Number(result.lastInsertRowid);
    });

    // 发送短信通知会员（异步，不影响下单）
    if (member_id) {
      const smsEnabled = db.prepare("SELECT value FROM settings WHERE key = ?").get('sms_enabled');
      if (smsEnabled && smsEnabled.value === '1') {
        const member = db.prepare('SELECT * FROM members WHERE id = ?').get(member_id);
        if (member && member.phone) {
          const orderTimeStr = orderTime || new Date(Date.now() + 8*3600000).toISOString().replace('T',' ').substring(0,19);
          const smsTime = orderTimeStr.substring(0, 16).replace('T', ' ');
          const smsAmount = final_amount.toFixed(2);
          const smsBalance = member.balance.toFixed(2);
          // 异步发送，不等待结果
          sendSMS(member.phone, member.name, smsTime, store, smsAmount, smsBalance);
        }
      }
    }

    res.json({ success: true, data: { id: orderId, order_no: orderNo }, message: '订单创建成功' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  try {
    transaction(() => {
      try {
        const items = JSON.parse(order.items);
        for (const item of items) {
          const product = db.prepare('SELECT id FROM products WHERE name = ?').get(item.name);
          if (product) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.qty, product.id);
        }
      } catch (e) { /* ignore */ }
      if (order.member_id) {
        if (order.pay_method === '余额') {
          db.prepare("UPDATE members SET balance = balance + ?, total_spent = total_spent - ?, updated_at=datetime('now','+8 hours') WHERE id = ?")
            .run(order.final_amount, order.final_amount, order.member_id);
        } else {
          db.prepare("UPDATE members SET total_spent = total_spent - ?, updated_at=datetime('now','+8 hours') WHERE id = ?")
            .run(order.final_amount, order.member_id);
        }
      }
      db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
    });
    res.json({ success: true, message: '订单已退款并删除' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- 验光管理 ---
app.get('/api/optometries', (req, res) => {
  const { member_id, search, page = 1, limit = 100 } = req.query;
  let sql = 'SELECT * FROM optometries WHERE 1=1';
  let params = [];
  if (member_id) { sql += ' AND member_id = ?'; params.push(member_id); }
  if (search) { sql += ' AND (member_name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY created_at DESC';
  const offset = (page - 1) * limit;
  sql += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;
  res.json({ success: true, data: db.prepare(sql).all(...params) });
});

app.get('/api/optometries/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM optometries WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: '验光记录不存在' });
  res.json({ success: true, data: record });
});

app.post('/api/optometries', (req, res) => {
  const o = req.body;
  if (!o.member_name) return res.status(400).json({ success: false, message: '验光人姓名必填' });
  let result;
  if (o.created_at) {
    result = db.prepare(`
      INSERT INTO optometries (member_id, member_name, phone, age, gender,
        r_sphere, r_cylinder, r_axis, r_vision, r_pd,
        l_sphere, l_cylinder, l_axis, l_vision, l_pd,
        add_power, pd, lens_brand, frame_brand, optometrist, store, diagnosis, remark, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(o.member_id || null, o.member_name, o.phone || '', o.age || null, o.gender || '',
      o.r_sphere || null, o.r_cylinder || null, o.r_axis || null, o.r_vision || '', o.r_pd || null,
      o.l_sphere || null, o.l_cylinder || null, o.l_axis || null, o.l_vision || '', o.l_pd || null,
      o.add_power || null, o.pd || null, o.lens_brand || '', o.frame_brand || '', o.optometrist || '', o.store || '总店', o.diagnosis || '', o.remark || '', o.created_at);
  } else {
    result = db.prepare(`
      INSERT INTO optometries (member_id, member_name, phone, age, gender,
        r_sphere, r_cylinder, r_axis, r_vision, r_pd,
        l_sphere, l_cylinder, l_axis, l_vision, l_pd,
        add_power, pd, lens_brand, frame_brand, optometrist, store, diagnosis, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(o.member_id || null, o.member_name, o.phone || '', o.age || null, o.gender || '',
      o.r_sphere || null, o.r_cylinder || null, o.r_axis || null, o.r_vision || '', o.r_pd || null,
      o.l_sphere || null, o.l_cylinder || null, o.l_axis || null, o.l_vision || '', o.l_pd || null,
      o.add_power || null, o.pd || null, o.lens_brand || '', o.frame_brand || '', o.optometrist || '', o.store || '总店', o.diagnosis || '', o.remark || '');
  }
  res.json({ success: true, data: { id: Number(result.lastInsertRowid) }, message: '验光记录添加成功' });
});

app.put('/api/optometries/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM optometries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: '验光记录不存在' });
  const o = req.body;
  db.prepare(`
    UPDATE optometries SET member_id=?, member_name=?, phone=?, age=?, gender=?,
      r_sphere=?, r_cylinder=?, r_axis=?, r_vision=?, r_pd=?,
      l_sphere=?, l_cylinder=?, l_axis=?, l_vision=?, l_pd=?,
      add_power=?, pd=?, lens_brand=?, frame_brand=?, optometrist=?, store=?, diagnosis=?, remark=?,
      created_at=?, updated_at=datetime('now','+8 hours') WHERE id=?
  `).run(o.member_id !== undefined ? o.member_id : existing.member_id,
    o.member_name || existing.member_name, o.phone !== undefined ? o.phone : existing.phone,
    o.age !== undefined ? o.age : existing.age, o.gender !== undefined ? o.gender : existing.gender,
    o.r_sphere !== undefined ? o.r_sphere : existing.r_sphere, o.r_cylinder !== undefined ? o.r_cylinder : existing.r_cylinder,
    o.r_axis !== undefined ? o.r_axis : existing.r_axis, o.r_vision !== undefined ? o.r_vision : existing.r_vision,
    o.r_pd !== undefined ? o.r_pd : existing.r_pd,
    o.l_sphere !== undefined ? o.l_sphere : existing.l_sphere, o.l_cylinder !== undefined ? o.l_cylinder : existing.l_cylinder,
    o.l_axis !== undefined ? o.l_axis : existing.l_axis, o.l_vision !== undefined ? o.l_vision : existing.l_vision,
    o.l_pd !== undefined ? o.l_pd : existing.l_pd,
    o.add_power !== undefined ? o.add_power : existing.add_power, o.pd !== undefined ? o.pd : existing.pd,
    o.lens_brand !== undefined ? o.lens_brand : existing.lens_brand, o.frame_brand !== undefined ? o.frame_brand : existing.frame_brand,
    o.optometrist !== undefined ? o.optometrist : existing.optometrist, o.store || existing.store,
    o.diagnosis !== undefined ? o.diagnosis : existing.diagnosis, o.remark !== undefined ? o.remark : existing.remark,
    o.created_at || existing.created_at,
    req.params.id);
  res.json({ success: true, message: '验光记录更新成功' });
});

app.delete('/api/optometries/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM optometries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: '验光记录不存在' });
  db.prepare('DELETE FROM optometries WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: '验光记录删除成功' });
});

// --- 系统设置 ---
app.get('/api/settings', (req, res) => {
  const settings = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const s of settings) result[s.key] = s.value;
  res.json({ success: true, data: result });
});

app.put('/api/settings', (req, res) => {
  const settings = req.body;
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','+8 hours'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','+8 hours')
  `);
  transaction(() => { for (const [key, value] of Object.entries(settings)) upsert.run(key, String(value)); });
  res.json({ success: true, message: '设置保存成功' });
});

// --- 仪表盘 ---
app.get('/api/dashboard', (req, res) => {
  const today = getTodayStr();
  const todayRevenue = db.prepare("SELECT COALESCE(SUM(final_amount), 0) as total FROM orders WHERE date(created_at) = ? AND status = '已完成'").get(today);
  const todayOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(created_at) = ?").get(today);
  const totalMembers = db.prepare('SELECT COUNT(*) as c FROM members').get();
  const lowStockProducts = db.prepare('SELECT * FROM products WHERE stock <= min_stock ORDER BY stock ASC').all();
  const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10').all();
  const recentOptometries = db.prepare('SELECT * FROM optometries ORDER BY created_at DESC LIMIT 10').all();
  const monthStart = today.slice(0, 7) + '-01';
  const monthRevenue = db.prepare("SELECT COALESCE(SUM(final_amount), 0) as total FROM orders WHERE date(created_at) >= ? AND status = '已完成'").get(monthStart);
  const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products').get();
  const lowStockCount = db.prepare('SELECT COUNT(*) as c FROM products WHERE stock <= min_stock').get();
  
  // 按门店统计今日营业额
  const todayRevenueChangzhou = db.prepare("SELECT COALESCE(SUM(final_amount), 0) as total FROM orders WHERE date(created_at) = ? AND status = '已完成' AND store = ?").get(today, '常州路店');
  const todayRevenueZhongqi = db.prepare("SELECT COALESCE(SUM(final_amount), 0) as total FROM orders WHERE date(created_at) = ? AND status = '已完成' AND store = ?").get(today, '中启广场店');
  const todayOrdersChangzhou = db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(created_at) = ? AND store = ?").get(today, '常州路店');
  const todayOrdersZhongqi = db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(created_at) = ? AND store = ?").get(today, '中启广场店');

  // 按门店统计本月营业额
  const monthRevenueChangzhou = db.prepare("SELECT COALESCE(SUM(final_amount), 0) as total FROM orders WHERE date(created_at) >= ? AND status = '已完成' AND store = ?").get(monthStart, '常州路店');
  const monthRevenueZhongqi = db.prepare("SELECT COALESCE(SUM(final_amount), 0) as total FROM orders WHERE date(created_at) >= ? AND status = '已完成' AND store = ?").get(monthStart, '中启广场店');

  res.json({
    success: true,
    data: {
      todayRevenue: todayRevenue.total, todayOrders: todayOrders.c,
      totalMembers: totalMembers.c, monthRevenue: monthRevenue.total,
      totalProducts: totalProducts.c, lowStockCount: lowStockCount.c,
      lowStockProducts, recentOrders, recentOptometries,
      todayRevenueChangzhou: todayRevenueChangzhou.total,
      todayRevenueZhongqi: todayRevenueZhongqi.total,
      todayOrdersChangzhou: todayOrdersChangzhou.c,
      todayOrdersZhongqi: todayOrdersZhongqi.c,
      monthRevenueChangzhou: monthRevenueChangzhou.total,
      monthRevenueZhongqi: monthRevenueZhongqi.total
    }
  });
});

// --- 数据备份/导出 ---
app.get('/api/backup', (req, res) => {
  const backupData = {
    export_time: new Date().toLocaleString('zh-CN'), version: '1.0.0',
    members: db.prepare('SELECT * FROM members').all(),
    products: db.prepare('SELECT * FROM products').all(),
    orders: db.prepare('SELECT * FROM orders').all(),
    optometries: db.prepare('SELECT * FROM optometries').all(),
    settings: db.prepare('SELECT * FROM settings').all(),
    recharge_records: db.prepare('SELECT * FROM recharge_records').all(),
    stock_in_records: db.prepare('SELECT * FROM stock_in_records').all()
  };
  const fileName = `glasses_shop_backup_${new Date().toISOString().slice(0,10)}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.json(backupData);
});

app.post('/api/restore', (req, res) => {
  const data = req.body;
  if (!data || !data.members) return res.status(400).json({ success: false, message: '备份数据格式不正确' });
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  try {
    transaction(() => {
      db.exec('DELETE FROM recharge_records; DELETE FROM stock_in_records; DELETE FROM orders; DELETE FROM optometries; DELETE FROM products; DELETE FROM members; DELETE FROM settings;');
      if (data.members) {
        const stmt = db.prepare(`INSERT INTO members (id, name, phone, gender, birthday, balance, total_spent, points, address, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        let memberIdx = 1;
        for (const m of data.members) {
          const id = m.id || (Date.now() + memberIdx);
          stmt.run(id, m.name, m.phone, m.gender || '未填写', m.birthday || '', m.balance || 0, m.total_spent || 0, m.points || 0, m.address || '', m.remark || '', m.created_at || now, m.updated_at || now);
          memberIdx++;
        }
      }
      if (data.products) {
        const stmt = db.prepare(`INSERT INTO products (id, name, category, brand, model, spec, sphere, cylinder, axis, price, cost, stock, min_stock, unit, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const p of data.products) stmt.run(p.id, p.name, p.category, p.brand, p.model, p.spec, p.sphere, p.cylinder, p.axis, p.price, p.cost, p.stock, p.min_stock, p.unit, p.remark, p.created_at, p.updated_at);
      }
      if (data.orders) {
        const stmt = db.prepare(`INSERT INTO orders (id, order_no, member_id, member_name, items, total_amount, discount, final_amount, pay_method, status, store, operator, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const o of data.orders) stmt.run(o.id, o.order_no, o.member_id, o.member_name, o.items, o.total_amount, o.discount, o.final_amount, o.pay_method, o.status, o.store, o.operator, o.remark, o.created_at);
      }
      if (data.optometries) {
        const stmt = db.prepare(`INSERT INTO optometries (id, member_id, member_name, phone, age, gender, r_sphere, r_cylinder, r_axis, r_vision, r_pd, l_sphere, l_cylinder, l_axis, l_vision, l_pd, add_power, pd, lens_brand, frame_brand, optometrist, store, diagnosis, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const o of data.optometries) stmt.run(o.id, o.member_id, o.member_name, o.phone, o.age, o.gender, o.r_sphere, o.r_cylinder, o.r_axis, o.r_vision, o.r_pd, o.l_sphere, o.l_cylinder, o.l_axis, o.l_vision, o.l_pd, o.add_power, o.pd, o.lens_brand || '', o.frame_brand || '', o.optometrist, o.store, o.diagnosis, o.remark, o.created_at, o.updated_at);
      }
      if (data.settings) {
        const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
        for (const s of data.settings) stmt.run(s.key, s.value, s.updated_at);
      }
    });
    res.json({ success: true, message: '数据恢复成功' });
  } catch (err) {
    res.status(400).json({ success: false, message: '数据恢复失败: ' + err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// ========== 自动备份 ==========
function performAutoBackup() {
  try {
    const backupData = {
      export_time: new Date().toLocaleString('zh-CN'), version: '1.0.0',
      members: db.prepare('SELECT * FROM members').all(),
      products: db.prepare('SELECT * FROM products').all(),
      orders: db.prepare('SELECT * FROM orders').all(),
      optometries: db.prepare('SELECT * FROM optometries').all(),
      settings: db.prepare('SELECT * FROM settings').all()
    };
    const fileName = `auto_backup_${new Date().toISOString().slice(0,10)}.json`;
    fs.writeFileSync(path.join(backupDir, fileName), JSON.stringify(backupData, null, 2), 'utf-8');
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('auto_backup_'));
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const f of files) {
      const fp = path.join(backupDir, f);
      if (fs.statSync(fp).mtimeMs < thirtyDaysAgo) fs.unlinkSync(fp);
    }
    console.log(`💾 自动备份完成: ${fileName}`);
  } catch (err) { console.error('自动备份失败:', err.message); }
}

function scheduleAutoBackup() {
  const now = new Date();
  const next2am = new Date(now);
  next2am.setHours(2, 0, 0, 0);
  if (next2am <= now) next2am.setDate(next2am.getDate() + 1);
  setTimeout(() => { performAutoBackup(); setInterval(performAutoBackup, 24 * 60 * 60 * 1000); }, next2am - now);
  console.log(`⏰ 自动备份已安排，下次备份时间: ${next2am.toLocaleString('zh-CN')}`);
}

performAutoBackup();
scheduleAutoBackup();

// 后台管理端独立页面
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// SPA 路由回退
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   👓 眼镜店管理系统 - 网络版 v1.0.0          ║');
  console.log('║   TT游戏工作室 & 豆包 联合开发                 ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║   🌐 服务器地址: http://localhost:${PORT}         ║`);
  console.log(`║   📁 数据库路径: ${dbPath}`);
  console.log(`║   💾 备份目录: ${backupDir}`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
