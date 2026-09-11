/**
 * 眼镜店管理系统 - 前端主逻辑
 * 通过 fetch 调用后端 RESTful API
 */

// ========== 配置 ==========
// 部署到Render后，将下面的地址替换为你的Render应用地址
// 例如：https://your-glasses-shop.onrender.com
const API_BASE = (window.location.protocol === 'file:' || window.location.hostname === '')
  ? 'http://localhost:3000'
  : window.location.origin;

// ========== 全局状态 ==========
const state = {
  currentPage: 'dashboard',
  members: [],
  memberPage: 1,
  memberTotalPages: 1,
  memberTotal: 0,
  memberSearch: '',
  products: [],
  orders: [],
  optometries: [],
  settings: {},
  cashier: {
    cart: [],
    selectedMember: null,
    payMethod: '余额',
    currentStore: '常州路店',
    allProducts: []
  },
  editingMemberId: null,
  editingProductId: null,
  editingOptometryId: null
};

// ========== 工具函数 ==========
// ========== 认证相关工具函数 ==========
function getToken() { return localStorage.getItem('auth_token'); }
function saveToken(token, expireAt) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_expire', String(expireAt));
}
function clearToken() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_expire');
}
function getDeviceId() {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = 'dev-' + (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).substr(2, 9)));
    localStorage.setItem('device_id', id);
  }
  return id;
}
function isLoggedIn() {
  const token = getToken();
  const expire = parseInt(localStorage.getItem('auth_expire') || '0');
  return !!(token && Date.now() < expire);
}

function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(API_BASE + url, {
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then(async res => {
    if (res.status === 401) {
      clearToken();
      stopHeartbeat();
      stopIdleTimer();
      showLoginPage();
      throw new Error('未登录或登录已过期');
    }
    return res.json();
  }).catch(err => {
    if (err.message && err.message !== '未登录或登录已过期' && !err.message.includes('Failed to fetch')) {
      showToast('网络请求失败: ' + err.message, 'error');
    }
    throw err;
  });
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function formatMoney(num) {
  return '¥' + (parseFloat(num) || 0).toFixed(2);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return dateStr.replace('T', ' ').substring(0, 16);
}

// 把 datetime-local 格式转成数据库格式 YYYY-MM-DD HH:MM:SS
function formatDateTimeForDb(localVal) {
  if (!localVal) return null;
  return localVal.replace('T', ' ') + ':00';
}

// 获取当前时间的 datetime-local 格式值（本地时间，即北京时间）
function getNowLocalValue() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// 初始化时间选择器默认值
function initDateTimePickers() {
  const now = getNowLocalValue();
  const cashierTime = document.getElementById('cashier-order-time');
  if (cashierTime) cashierTime.value = now;
  const optometryTime = document.getElementById('optometry-time');
  if (optometryTime) optometryTime.value = now;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('show');
}

// 点击遮罩关闭弹窗
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
  }
});

// ========== 页面导航 ==========
function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');

  const titles = {
    dashboard: '仪表盘', members: '会员管理', products: '库存管理',
    cashier: '消费收银', optometry: '验光管理', orders: '订单记录', settings: '系统设置', admin: '后台管理'
  };
  document.getElementById('page-title').textContent = titles[page] || '';

  // 页面加载时刷新数据
  if (page === 'dashboard') loadDashboard();
  if (page === 'members') loadMembers();
  if (page === 'products') loadProducts();
  if (page === 'cashier') initCashier();
  if (page === 'optometry') loadOptometries();
  if (page === 'orders') loadOrders();
  if (page === 'settings') loadSettings();
  if (page === 'admin') loadAdminDevices();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

// ========== 仪表盘 ==========
async function loadDashboard() {
  try {
    const res = await api('/api/dashboard');
    if (res.success) {
      const d = res.data;
      // 两店今日营业额
      document.getElementById('stat-changzhou-revenue').textContent = formatMoney(d.todayRevenueChangzhou || 0);
      document.getElementById('stat-zhongqi-revenue').textContent = formatMoney(d.todayRevenueZhongqi || 0);
      document.getElementById('stat-changzhou-orders').textContent = d.todayOrdersChangzhou || 0;
      document.getElementById('stat-zhongqi-orders').textContent = d.todayOrdersZhongqi || 0;
      document.getElementById('stat-changzhou-month').textContent = formatMoney(d.monthRevenueChangzhou || 0);
      document.getElementById('stat-zhongqi-month').textContent = formatMoney(d.monthRevenueZhongqi || 0);
      document.getElementById('stat-today-orders').textContent = d.todayOrders;
      document.getElementById('stat-total-members').textContent = d.totalMembers;
      document.getElementById('stat-low-stock').textContent = d.lowStockCount;

      // 库存预警
      const lowStockTbody = document.getElementById('low-stock-tbody');
      if (d.lowStockProducts.length === 0) {
        lowStockTbody.innerHTML = '<tr><td colspan="4" class="empty-cell">暂无预警商品，库存充足 ✓</td></tr>';
      } else {
        lowStockTbody.innerHTML = d.lowStockProducts.map(p => `
          <tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.category)}</td>
            <td class="stock-low">${p.stock} ${escapeHtml(p.unit)}</td>
            <td>${p.min_stock} ${escapeHtml(p.unit)}</td>
          </tr>
        `).join('');
      }

      // 最近订单
      const ordersTbody = document.getElementById('recent-orders-tbody');
      if (d.recentOrders.length === 0) {
        ordersTbody.innerHTML = '<tr><td colspan="4" class="empty-cell">暂无订单</td></tr>';
      } else {
        ordersTbody.innerHTML = d.recentOrders.map(o => `
          <tr>
            <td>${escapeHtml(o.order_no)}</td>
            <td>${escapeHtml(o.member_name)}</td>
            <td style="color:var(--primary);font-weight:600;">${formatMoney(o.final_amount)}</td>
            <td>${formatDate(o.created_at)}</td>
          </tr>
        `).join('');
      }

      // 最近验光
      const optTbody = document.getElementById('recent-optometry-tbody');
      if (d.recentOptometries.length === 0) {
        optTbody.innerHTML = '<tr><td colspan="4" class="empty-cell">暂无验光记录</td></tr>';
      } else {
        optTbody.innerHTML = d.recentOptometries.map(o => `
          <tr>
            <td>${escapeHtml(o.member_name)}</td>
            <td>${o.r_sphere ? o.r_sphere.toFixed(2) : '-'}${o.r_cylinder ? ' / ' + o.r_cylinder.toFixed(2) : ''}</td>
            <td>${o.l_sphere ? o.l_sphere.toFixed(2) : '-'}${o.l_cylinder ? ' / ' + o.l_cylinder.toFixed(2) : ''}</td>
            <td>${formatDate(o.created_at)}</td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('加载仪表盘失败:', err);
  }
}

// ========== 会员管理 ==========
let memberSearchTimer = null;
document.getElementById('member-search').addEventListener('input', (e) => {
  clearTimeout(memberSearchTimer);
  memberSearchTimer = setTimeout(() => {
    state.memberPage = 1;
    loadMembers(e.target.value);
  }, 300);
});

async function loadMembers(search = '') {
  if (search !== undefined) state.memberSearch = search;
  try {
    const params = new URLSearchParams();
    params.set('page', state.memberPage);
    params.set('limit', 50);
    if (state.memberSearch) params.set('search', state.memberSearch);
    const res = await api('/api/members?' + params.toString());
    if (res.success) {
      state.members = res.data;
      state.memberTotal = res.total;
      state.memberTotalPages = Math.max(1, Math.ceil(res.total / 50));
      renderMembers();
      renderMemberPagination();
    }
  } catch (err) {
    document.getElementById('members-tbody').innerHTML = '<tr><td colspan="10" class="empty-cell">加载失败</td></tr>';
  }
}

function renderMemberPagination() {
  const info = document.getElementById('members-pagination-info');
  const current = document.getElementById('members-page-current');
  const first = document.getElementById('members-page-first');
  const prev = document.getElementById('members-page-prev');
  const next = document.getElementById('members-page-next');
  const last = document.getElementById('members-page-last');

  info.textContent = `共 ${state.memberTotal} 条会员，每页 50 条`;
  current.textContent = `${state.memberPage} / ${state.memberTotalPages}`;

  first.disabled = state.memberPage <= 1;
  prev.disabled = state.memberPage <= 1;
  next.disabled = state.memberPage >= state.memberTotalPages;
  last.disabled = state.memberPage >= state.memberTotalPages;
}

function changeMemberPage(page) {
  if (page < 1 || page > state.memberTotalPages) return;
  state.memberPage = page;
  loadMembers();
}

function renderMembers() {
  const tbody = document.getElementById('members-tbody');
  if (state.members.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-cell">暂无会员数据，点击右上角添加</td></tr>';
    return;
  }
  tbody.innerHTML = state.members.map(m => `
    <tr>
      <td>${m.id}</td>
      <td><strong>${escapeHtml(m.name)}</strong></td>
      <td>${escapeHtml(m.phone) || '-'}</td>
      <td>${escapeHtml(m.gender)}</td>
      <td>${escapeHtml(m.birthday) || '-'}</td>
      <td style="color:var(--success);font-weight:600;">${formatMoney(m.balance)}</td>
      <td>${formatMoney(m.total_spent)}</td>
      <td>${m.points}</td>
      <td>${formatDate(m.created_at)}</td>
      <td>
        <div class="table-actions">
          <button class="action-btn detail" onclick="viewMemberDetail(${m.id})">📋 详情</button>
          <button class="action-btn recharge" onclick="openRechargeModal(${m.id})">充值</button>
          <button class="action-btn edit" onclick="editMember(${m.id})">编辑</button>
          <button class="action-btn delete" onclick="deleteMember(${m.id})">删除</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openMemberModal() {
  state.editingMemberId = null;
  document.getElementById('member-modal-title').textContent = '添加会员';
  ['member-name','member-phone','member-birthday','member-address','member-remark'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('member-gender').value = '未填写';
  openModal('member-modal');
}

function editMember(id) {
  const m = state.members.find(x => x.id === id);
  if (!m) return;
  state.editingMemberId = id;
  document.getElementById('member-modal-title').textContent = '编辑会员';
  document.getElementById('member-name').value = m.name;
  document.getElementById('member-phone').value = m.phone || '';
  document.getElementById('member-gender').value = m.gender || '未填写';
  document.getElementById('member-birthday').value = m.birthday || '';
  document.getElementById('member-address').value = m.address || '';
  document.getElementById('member-remark').value = m.remark || '';
  openModal('member-modal');
}

async function saveMember() {
  const name = document.getElementById('member-name').value.trim();
  if (!name) { showToast('请输入会员姓名', 'error'); return; }

  const data = {
    name,
    phone: document.getElementById('member-phone').value.trim(),
    gender: document.getElementById('member-gender').value,
    birthday: document.getElementById('member-birthday').value,
    address: document.getElementById('member-address').value.trim(),
    remark: document.getElementById('member-remark').value.trim()
  };

  try {
    let res;
    if (state.editingMemberId) {
      res = await api(`/api/members/${state.editingMemberId}`, { method: 'PUT', body: data });
    } else {
      res = await api('/api/members', { method: 'POST', body: data });
    }
    if (res.success) {
      showToast(res.message);
      closeModal('member-modal');
      loadMembers();
    } else {
      showToast(res.message || '保存失败', 'error');
    }
  } catch (err) {
    showToast('保存失败', 'error');
  }
}

async function deleteMember(id) {
  const m = state.members.find(x => x.id === id);
  if (!m) return;
  if (!confirm(`确定要删除会员「${m.name}」吗？此操作不可恢复！`)) return;
  try {
    const res = await api(`/api/members/${id}`, { method: 'DELETE' });
    if (res.success) {
      showToast('会员已删除');
      loadMembers();
    } else {
      showToast(res.message || '删除失败', 'error');
    }
  } catch (err) {
    showToast('删除失败', 'error');
  }
}

// 会员充值
function openRechargeModal(id) {
  const m = state.members.find(x => x.id === id);
  if (!m) return;
  document.getElementById('recharge-member-id').value = id;
  document.getElementById('recharge-member-info').innerHTML = `
    <strong>${escapeHtml(m.name)}</strong>（${escapeHtml(m.phone) || '无手机号'}）<br>
    当前余额：<span style="color:var(--success);font-weight:600;">${formatMoney(m.balance)}</span>
  `;
  document.getElementById('recharge-amount').value = '';
  document.getElementById('recharge-bonus').value = '0';
  document.getElementById('recharge-pay-method').value = '现金';
  document.getElementById('recharge-remark').value = '';
  openModal('recharge-modal');
}

async function confirmRecharge() {
  const id = document.getElementById('recharge-member-id').value;
  const amount = parseFloat(document.getElementById('recharge-amount').value);
  if (!amount || amount <= 0) { showToast('请输入有效的充值金额', 'error'); return; }

  const data = {
    amount,
    bonus: parseFloat(document.getElementById('recharge-bonus').value) || 0,
    pay_method: document.getElementById('recharge-pay-method').value,
    store: document.getElementById('recharge-store').value,
    remark: document.getElementById('recharge-remark').value.trim()
  };

  try {
    const res = await api(`/api/members/${id}/recharge`, { method: 'POST', body: data });
    if (res.success) {
      showToast(res.message);
      closeModal('recharge-modal');
      loadMembers();
    } else {
      showToast(res.message || '充值失败', 'error');
    }
  } catch (err) {
    showToast('充值失败', 'error');
  }
}

// 查看会员详情
async function viewMemberDetail(memberId) {
  try {
    const res = await api(`/api/members/${memberId}/detail`);
    if (res.success) {
      const { member, orders, recharges, stats } = res.data;
      
      // 会员基本信息
      document.getElementById('member-detail-title').textContent = `👤 ${member.name} 的详情`;
      document.getElementById('member-detail-info').innerHTML = `
        <div class="member-info-grid">
          <div class="info-item"><span class="info-label">姓名</span><span class="info-value">${escapeHtml(member.name)}</span></div>
          <div class="info-item"><span class="info-label">手机号</span><span class="info-value">${escapeHtml(member.phone) || '-'}</span></div>
          <div class="info-item"><span class="info-label">性别</span><span class="info-value">${escapeHtml(member.gender) || '-'}</span></div>
          <div class="info-item"><span class="info-label">生日</span><span class="info-value">${escapeHtml(member.birthday) || '-'}</span></div>
          <div class="info-item"><span class="info-label">当前余额</span><span class="info-value" style="color:var(--success);font-weight:700;">${formatMoney(member.balance)}</span></div>
          <div class="info-item"><span class="info-label">累计消费</span><span class="info-value">${formatMoney(member.total_spent)}</span></div>
          <div class="info-item"><span class="info-label">积分</span><span class="info-value">${member.points}</span></div>
          <div class="info-item"><span class="info-label">注册时间</span><span class="info-value">${formatDate(member.created_at)}</span></div>
        </div>
        <div class="member-stats-row">
          <div class="member-stat"><span class="stat-num">${stats.orderCount}</span><span class="stat-label">消费次数</span></div>
          <div class="member-stat"><span class="stat-num">${formatMoney(stats.totalSpent)}</span><span class="stat-label">累计消费</span></div>
          <div class="member-stat"><span class="stat-num">${stats.rechargeCount}</span><span class="stat-label">充值次数</span></div>
          <div class="member-stat"><span class="stat-num">${formatMoney(stats.totalRecharged)}</span><span class="stat-label">累计充值</span></div>
        </div>
      `;
      
      // 消费记录
      document.getElementById('detail-order-count').textContent = orders.length;
      const ordersTbody = document.getElementById('detail-orders-tbody');
      if (orders.length === 0) {
        ordersTbody.innerHTML = '<tr><td colspan="7" class="empty-cell">暂无消费记录</td></tr>';
      } else {
        ordersTbody.innerHTML = orders.map(o => {
          let itemsText = '';
          try {
            const items = JSON.parse(o.items);
            itemsText = items.map(i => `${i.name}×${i.qty}`).join(', ');
          } catch (e) { itemsText = o.items; }
          return `
            <tr>
              <td><strong>${escapeHtml(o.order_no)}</strong></td>
              <td>${formatDate(o.created_at)}</td>
              <td style="max-width:200px;font-size:12px;" title="${escapeHtml(itemsText)}">${escapeHtml(itemsText)}</td>
              <td style="color:var(--primary);font-weight:600;">${formatMoney(o.final_amount)}</td>
              <td><span class="feature-tag" style="font-size:11px;">${escapeHtml(o.pay_method)}</span></td>
              <td>${escapeHtml(o.store) || '-'}</td>
              <td>${escapeHtml(o.status)}</td>
            </tr>
          `;
        }).join('');
      }
      
      // 充值记录
      document.getElementById('detail-recharge-count').textContent = recharges.length;
      const rechargesTbody = document.getElementById('detail-recharges-tbody');
      if (recharges.length === 0) {
        rechargesTbody.innerHTML = '<tr><td colspan="7" class="empty-cell">暂无充值记录</td></tr>';
      } else {
        rechargesTbody.innerHTML = recharges.map(r => `
          <tr>
            <td>${formatDate(r.created_at)}</td>
            <td style="color:var(--success);font-weight:600;">${formatMoney(r.amount)}</td>
            <td style="color:var(--warning);">${r.bonus > 0 ? '+' + formatMoney(r.bonus) : '-'}</td>
            <td style="color:var(--primary);font-weight:600;">${formatMoney(parseFloat(r.amount) + parseFloat(r.bonus))}</td>
            <td><span class="feature-tag" style="font-size:11px;">${escapeHtml(r.pay_method)}</span></td>
            <td>${escapeHtml(r.store) || '-'}</td>
            <td>${escapeHtml(r.remark) || '-'}</td>
          </tr>
        `).join('');
      }
      
      // 默认显示消费记录标签页
      switchDetailTab('orders');
      openModal('member-detail-modal');
    } else {
      showToast(res.message || '获取会员详情失败', 'error');
    }
  } catch (err) {
    showToast('获取会员详情失败', 'error');
  }
}

// 切换会员详情标签页
function switchDetailTab(tab) {
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.detail-panel').forEach(p => p.style.display = 'none');
  if (tab === 'orders') {
    document.querySelectorAll('.detail-tab')[0].classList.add('active');
    document.getElementById('detail-orders-panel').style.display = 'block';
  } else if (tab === 'recharges') {
    document.querySelectorAll('.detail-tab')[1].classList.add('active');
    document.getElementById('detail-recharges-panel').style.display = 'block';
  }
}

// ========== 库存管理 ==========
let productSearchTimer = null;
document.getElementById('product-search').addEventListener('input', (e) => {
  clearTimeout(productSearchTimer);
  productSearchTimer = setTimeout(() => loadProducts(), 300);
});

async function loadProducts() {
  try {
    const search = document.getElementById('product-search').value.trim();
    const category = document.getElementById('product-category-filter').value;
    const lowStock = document.getElementById('product-low-stock-only').checked;
    let url = '/api/products?';
    const params = [];
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (category && category !== '全部') params.push(`category=${encodeURIComponent(category)}`);
    if (lowStock) params.push('low_stock=true');
    url += params.join('&');

    const res = await api(url);
    if (res.success) {
      state.products = res.data;
      renderProducts();
    }
  } catch (err) {
    document.getElementById('products-tbody').innerHTML = '<tr><td colspan="10" class="empty-cell">加载失败</td></tr>';
  }
}

function renderProducts() {
  const tbody = document.getElementById('products-tbody');
  if (state.products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-cell">暂无商品数据，点击右上角添加</td></tr>';
    return;
  }
  tbody.innerHTML = state.products.map(p => {
    const isLow = p.stock <= p.min_stock;
    return `
    <tr>
      <td>${p.id}</td>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td><span class="feature-tag" style="font-size:11px;">${escapeHtml(p.category)}</span></td>
      <td>${escapeHtml(p.brand) || '-'}</td>
      <td>${escapeHtml(p.model || '')} ${escapeHtml(p.spec || '')}</td>
      <td style="color:var(--primary);font-weight:600;">${formatMoney(p.price)}</td>
      <td>${formatMoney(p.cost)}</td>
      <td class="${isLow ? 'stock-low' : 'stock-ok'}">${p.stock} ${escapeHtml(p.unit)}</td>
      <td>${escapeHtml(p.unit)}</td>
      <td>
        <div class="table-actions">
          <button class="action-btn stock-in" onclick="openStockInModal(${p.id})">入库</button>
          <button class="action-btn edit" onclick="editProduct(${p.id})">编辑</button>
          <button class="action-btn delete" onclick="deleteProduct(${p.id})">删除</button>
        </div>
      </td>
    </tr>
  `;}).join('');
}

function openProductModal() {
  state.editingProductId = null;
  document.getElementById('product-modal-title').textContent = '添加商品';
  ['product-name','product-brand','product-model','product-spec','product-remark'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('product-category').value = '镜片';
  document.getElementById('product-unit').value = '副';
  document.getElementById('product-price').value = '0';
  document.getElementById('product-cost').value = '0';
  document.getElementById('product-stock').value = '0';
  document.getElementById('product-min-stock').value = '5';
  openModal('product-modal');
}

function editProduct(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  state.editingProductId = id;
  document.getElementById('product-modal-title').textContent = '编辑商品';
  document.getElementById('product-name').value = p.name;
  document.getElementById('product-category').value = p.category;
  document.getElementById('product-brand').value = p.brand || '';
  document.getElementById('product-model').value = p.model || '';
  document.getElementById('product-spec').value = p.spec || '';
  document.getElementById('product-unit').value = p.unit || '件';
  document.getElementById('product-price').value = p.price;
  document.getElementById('product-cost').value = p.cost;
  document.getElementById('product-stock').value = p.stock;
  document.getElementById('product-min-stock').value = p.min_stock;
  document.getElementById('product-remark').value = p.remark || '';
  openModal('product-modal');
}

async function saveProduct() {
  const name = document.getElementById('product-name').value.trim();
  if (!name) { showToast('请输入商品名称', 'error'); return; }

  const data = {
    name,
    category: document.getElementById('product-category').value,
    brand: document.getElementById('product-brand').value.trim(),
    model: document.getElementById('product-model').value.trim(),
    spec: document.getElementById('product-spec').value.trim(),
    unit: document.getElementById('product-unit').value.trim() || '件',
    price: parseFloat(document.getElementById('product-price').value) || 0,
    cost: parseFloat(document.getElementById('product-cost').value) || 0,
    stock: parseInt(document.getElementById('product-stock').value) || 0,
    min_stock: parseInt(document.getElementById('product-min-stock').value) || 5,
    remark: document.getElementById('product-remark').value.trim()
  };

  try {
    let res;
    if (state.editingProductId) {
      res = await api(`/api/products/${state.editingProductId}`, { method: 'PUT', body: data });
    } else {
      res = await api('/api/products', { method: 'POST', body: data });
    }
    if (res.success) {
      showToast(res.message);
      closeModal('product-modal');
      loadProducts();
    } else {
      showToast(res.message || '保存失败', 'error');
    }
  } catch (err) {
    showToast('保存失败', 'error');
  }
}

async function deleteProduct(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`确定要删除商品「${p.name}」吗？`)) return;
  try {
    const res = await api(`/api/products/${id}`, { method: 'DELETE' });
    if (res.success) {
      showToast('商品已删除');
      loadProducts();
    } else {
      showToast(res.message || '删除失败', 'error');
    }
  } catch (err) {
    showToast('删除失败', 'error');
  }
}

// 商品入库
function openStockInModal(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  document.getElementById('stock-in-product-id').value = id;
  document.getElementById('stock-in-product-info').innerHTML = `
    <strong>${escapeHtml(p.name)}</strong>（${escapeHtml(p.category)}）<br>
    当前库存：<span style="color:var(--primary);font-weight:600;">${p.stock} ${escapeHtml(p.unit)}</span>，成本价：${formatMoney(p.cost)}
  `;
  document.getElementById('stock-in-quantity').value = '1';
  document.getElementById('stock-in-unit-cost').value = '';
  document.getElementById('stock-in-supplier').value = '';
  document.getElementById('stock-in-remark').value = '';
  openModal('stock-in-modal');
}

async function confirmStockIn() {
  const id = document.getElementById('stock-in-product-id').value;
  const quantity = parseInt(document.getElementById('stock-in-quantity').value);
  if (!quantity || quantity <= 0) { showToast('请输入有效的入库数量', 'error'); return; }

  const unitCostVal = document.getElementById('stock-in-unit-cost').value;
  const data = {
    quantity,
    unit_cost: unitCostVal ? parseFloat(unitCostVal) : undefined,
    supplier: document.getElementById('stock-in-supplier').value.trim(),
    remark: document.getElementById('stock-in-remark').value.trim()
  };

  try {
    const res = await api(`/api/products/${id}/stock-in`, { method: 'POST', body: data });
    if (res.success) {
      showToast(res.message);
      closeModal('stock-in-modal');
      loadProducts();
    } else {
      showToast(res.message || '入库失败', 'error');
    }
  } catch (err) {
    showToast('入库失败', 'error');
  }
}

// ========== 消费收银 ==========
async function initCashier() {
  try {
    const res = await api('/api/products');
    if (res.success) {
      state.cashier.allProducts = res.data;
      renderCashierProducts(res.data);
    }
  } catch (err) {
    console.error('加载商品失败:', err);
  }
  updateCashierTotal();
}

function renderCashierProducts(products) {
  const grid = document.getElementById('cashier-product-grid');
  if (products.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-lighter);padding:30px;">没有找到商品</div>';
    return;
  }
  grid.innerHTML = products.map(p => `
    <div class="product-item" onclick="addToCart(${p.id})">
      <div class="product-item-name">${escapeHtml(p.name)}</div>
      <div class="product-item-cat">${escapeHtml(p.category)} · ${escapeHtml(p.brand || '')}</div>
      <div class="product-item-price">${formatMoney(p.price)}</div>
      <div class="product-item-stock">库存: ${p.stock} ${escapeHtml(p.unit)}</div>
    </div>
  `).join('');
}

function filterCashierProducts() {
  const keyword = document.getElementById('cashier-product-search').value.toLowerCase();
  const filtered = state.cashier.allProducts.filter(p =>
    p.name.toLowerCase().includes(keyword) ||
    (p.brand && p.brand.toLowerCase().includes(keyword)) ||
    (p.category && p.category.toLowerCase().includes(keyword))
  );
  renderCashierProducts(filtered);
}

function addToCart(productId) {
  const product = state.cashier.allProducts.find(p => p.id === productId);
  if (!product) return;
  if (product.stock <= 0) { showToast('该商品库存不足', 'error'); return; }

  const existing = state.cashier.cart.find(item => item.id === productId);
  if (existing) {
    if (existing.qty >= product.stock) { showToast('库存不足', 'error'); return; }
    existing.qty++;
  } else {
    state.cashier.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: 1
    });
  }
  renderCart();
}

function changeQty(productId, delta) {
  const item = state.cashier.cart.find(i => i.id === productId);
  if (!item) return;
  const product = state.cashier.allProducts.find(p => p.id === productId);
  item.qty += delta;
  if (item.qty <= 0) {
    state.cashier.cart = state.cashier.cart.filter(i => i.id !== productId);
  } else if (product && item.qty > product.stock) {
    item.qty = product.stock;
    showToast('已达库存上限', 'warning');
  }
  renderCart();
}

function removeFromCart(productId) {
  state.cashier.cart = state.cashier.cart.filter(i => i.id !== productId);
  renderCart();
}

function renderCart() {
  const cartEl = document.getElementById('cashier-cart');
  if (state.cashier.cart.length === 0) {
    cartEl.innerHTML = '<div class="empty-cart">购物车为空，请从左侧选择商品</div>';
  } else {
    cartEl.innerHTML = state.cashier.cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(item.name)}</div>
          <div class="cart-item-price">${formatMoney(item.price)} / 件</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
          <span>${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
        </div>
        <div class="cart-item-total">${formatMoney(item.price * item.qty)}</div>
        <button class="cart-item-remove" onclick="removeFromCart(${item.id})">✕</button>
      </div>
    `).join('');
  }
  updateCashierTotal();
}

// 标记用户是否手动修改过实付金额
let finalAmountManuallyChanged = false;

function updateCashierTotal() {
  const subtotal = state.cashier.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const finalInput = document.getElementById('cashier-final-amount');

  // 如果用户没手动改过，实付金额默认等于商品合计
  if (!finalAmountManuallyChanged) {
    finalInput.value = subtotal.toFixed(2);
  }

  const finalAmount = parseFloat(finalInput.value) || 0;
  const discount = Math.max(0, subtotal - finalAmount);

  document.getElementById('cashier-subtotal').textContent = formatMoney(subtotal);
  document.getElementById('cashier-total').textContent = formatMoney(finalAmount);

  // 显示优惠金额
  const discountRow = document.getElementById('cashier-discount-row');
  if (discount > 0) {
    discountRow.style.display = 'flex';
    document.getElementById('cashier-discount-amount').textContent = formatMoney(discount);
  } else {
    discountRow.style.display = 'none';
  }
}

// 用户手动修改实付金额时触发
function onFinalAmountChange() {
  finalAmountManuallyChanged = true;
  updateCashierTotal();
}

// 收银台会员搜索
let cashierMemberTimer = null;
function searchCashierMembers() {
  clearTimeout(cashierMemberTimer);
  cashierMemberTimer = setTimeout(async () => {
    const keyword = document.getElementById('cashier-member-search').value.trim();
    const dropdown = document.getElementById('cashier-member-list');
    if (!keyword) { dropdown.classList.remove('show'); return; }
    try {
      const res = await api(`/api/members?search=${encodeURIComponent(keyword)}&limit=10`);
      if (res.success && res.data.length > 0) {
        dropdown.innerHTML = res.data.map(m => `
          <div class="member-dropdown-item" onclick="selectCashierMember(${m.id}, '${escapeHtml(m.name)}', ${m.balance})">
            <span>${escapeHtml(m.name)} (${escapeHtml(m.phone) || '无手机号'})</span>
            <span class="balance">${formatMoney(m.balance)}</span>
          </div>
        `).join('');
        dropdown.classList.add('show');
      } else {
        dropdown.innerHTML = '<div class="member-dropdown-item" style="color:var(--text-lighter);">未找到会员</div>';
        dropdown.classList.add('show');
      }
    } catch (err) {
      dropdown.classList.remove('show');
    }
  }, 300);
}

function selectCashierMember(id, name, balance) {
  state.cashier.selectedMember = { id, name, balance };
  document.getElementById('cashier-member-search').value = '';
  document.getElementById('cashier-member-list').classList.remove('show');
  document.getElementById('cashier-selected-member').style.display = 'flex';
  document.getElementById('cashier-member-name').textContent = name;
  document.getElementById('cashier-member-balance').textContent = '余额: ' + formatMoney(balance);
}

function clearCashierMember() {
  state.cashier.selectedMember = null;
  document.getElementById('cashier-selected-member').style.display = 'none';
}

// 支付方式选择
function selectPayMethod(btn) {
  document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.cashier.payMethod = btn.dataset.method;
}

// 选择消费门店
function selectStore(btn) {
  document.querySelectorAll('.store-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.cashier.currentStore = btn.dataset.store;
}

// 提交订单（二次确认）
function submitOrder() {
  if (state.cashier.cart.length === 0) {
    showToast('请先选择商品', 'error');
    return;
  }
  const subtotal = state.cashier.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const finalAmount = parseFloat(document.getElementById('cashier-final-amount').value) || 0;
  const discount = Math.max(0, subtotal - finalAmount);
  const total = finalAmount;

  if (state.cashier.payMethod === '余额') {
    if (!state.cashier.selectedMember) {
      showToast('余额支付需要先选择会员', 'error');
      return;
    }
    if (state.cashier.selectedMember.balance < total) {
      showToast(`会员余额不足，当前余额 ${formatMoney(state.cashier.selectedMember.balance)}`, 'error');
      return;
    }
  }

  // 构建确认信息
  const itemsHtml = state.cashier.cart.map(item => `
    <div class="confirm-row"><span>${escapeHtml(item.name)} × ${item.qty}</span><span>${formatMoney(item.price * item.qty)}</span></div>
  `).join('');

  document.getElementById('order-confirm-content').innerHTML = `
    ${itemsHtml}
    <div class="confirm-row"><span>商品合计</span><span>${formatMoney(subtotal)}</span></div>
    ${discount > 0 ? `<div class="confirm-row"><span style="color:#16a34a;">优惠</span><span style="color:#16a34a;">-${formatMoney(discount)}</span></div>` : ''}
    <div class="confirm-row"><span>支付方式</span><span>${state.cashier.payMethod}</span></div>
    <div class="confirm-row"><span>消费门店</span><span>${state.cashier.currentStore}</span></div>
    ${state.cashier.selectedMember ? `<div class="confirm-row"><span>会员</span><span>${escapeHtml(state.cashier.selectedMember.name)}</span></div>` : ''}
    <div class="confirm-row confirm-total"><span>实付金额</span><span>${formatMoney(total)}</span></div>
  `;
  openModal('order-confirm-modal');
}

async function doSubmitOrder() {
  const subtotal = state.cashier.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const finalAmount = parseFloat(document.getElementById('cashier-final-amount').value) || 0;
  const discount = Math.max(0, subtotal - finalAmount);
  const total = finalAmount;

  const data = {
    member_id: state.cashier.selectedMember ? state.cashier.selectedMember.id : null,
    member_name: state.cashier.selectedMember ? state.cashier.selectedMember.name : '散客',
    items: state.cashier.cart.map(item => ({ name: item.name, qty: item.qty, price: item.price })),
    total_amount: subtotal,
    discount: discount,
    final_amount: total,
    pay_method: state.cashier.payMethod,
    store: state.cashier.currentStore,
    operator: 'admin',
    remark: '',
    created_at: formatDateTimeForDb(document.getElementById('cashier-order-time').value)
  };

  try {
    const res = await api('/api/orders', { method: 'POST', body: data });
    if (res.success) {
      showToast('收款成功！订单号: ' + res.data.order_no);
      closeModal('order-confirm-modal');
      // 清空购物车
      state.cashier.cart = [];
      clearCashierMember();
      document.getElementById('cashier-final-amount').value = '0';
      finalAmountManuallyChanged = false;
      renderCart();
      // 刷新商品库存
      initCashier();
    } else {
      showToast(res.message || '下单失败', 'error');
    }
  } catch (err) {
    showToast('下单失败', 'error');
  }
}

// ========== 验光管理 ==========
let optSearchTimer = null;
document.getElementById('optometry-search').addEventListener('input', (e) => {
  clearTimeout(optSearchTimer);
  optSearchTimer = setTimeout(() => loadOptometries(e.target.value), 300);
});

async function loadOptometries(search = '') {
  try {
    const url = '/api/optometries' + (search ? `?search=${encodeURIComponent(search)}` : '');
    const res = await api(url);
    if (res.success) {
      state.optometries = res.data;
      renderOptometries();
    }
  } catch (err) {
    document.getElementById('optometry-tbody').innerHTML = '<tr><td colspan="11" class="empty-cell">加载失败</td></tr>';
  }
}

function renderOptometries() {
  const tbody = document.getElementById('optometry-tbody');
  if (state.optometries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">暂无验光记录，点击右上角新增</td></tr>';
    return;
  }

  // 统计每个会员的验光次数（按时间正序编号）
  const visitMap = {};
  const sortedByTime = [...state.optometries].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  sortedByTime.forEach(o => {
    const key = o.member_id || (o.member_name + '_' + (o.phone || ''));
    if (!visitMap[key]) visitMap[key] = {};
    visitMap[key][o.id] = Object.keys(visitMap[key]).length + 1;
  });

  tbody.innerHTML = state.optometries.map(o => {
    const key = o.member_id || (o.member_name + '_' + (o.phone || ''));
    const visitNum = visitMap[key] && visitMap[key][o.id] ? visitMap[key][o.id] : '-';
    let brandHtml = '';
    if (o.lens_brand || o.frame_brand) {
      brandHtml = '<div class="opt-brand-info">';
      if (o.lens_brand) brandHtml += `<span class="brand-tag lens">镜片：${escapeHtml(o.lens_brand)}</span>`;
      if (o.frame_brand) brandHtml += `<span class="brand-tag frame">镜架：${escapeHtml(o.frame_brand)}</span>`;
      brandHtml += '</div>';
    }
    return `
    <tr>
      <td>${o.id}</td>
      <td><strong>${escapeHtml(o.member_name)}</strong> <span class="visit-badge">第${visitNum}次</span>${brandHtml}</td>
      <td>${escapeHtml(o.phone) || '-'}</td>
      <td>${o.age || '-'}</td>
      <td>${escapeHtml(o.gender) || '-'}</td>
      <td>${o.r_sphere ? o.r_sphere.toFixed(2) : '-'}${o.r_cylinder ? ' / ' + o.r_cylinder.toFixed(2) + ' / ' + (o.r_axis || 0) : ''}</td>
      <td>${o.l_sphere ? o.l_sphere.toFixed(2) : '-'}${o.l_cylinder ? ' / ' + o.l_cylinder.toFixed(2) + ' / ' + (o.l_axis || 0) : ''}</td>
      <td>右${o.r_pd || '-'} / 左${o.l_pd || '-'}</td>
      <td>${escapeHtml(o.optometrist) || '-'}</td>
      <td>${formatDate(o.created_at)}</td>
      <td>
        <div class="table-actions">
          <button class="action-btn history" onclick="viewOptometryHistory(${o.id})">📜 历史</button>
          <button class="action-btn print" onclick="printOptometry(${o.id})">🖨️ 打印</button>
          <button class="action-btn edit" onclick="editOptometry(${o.id})">编辑</button>
          <button class="action-btn delete" onclick="deleteOptometry(${o.id})">删除</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

function openOptometryModal() {
  state.editingOptometryId = null;
  document.getElementById('optometry-modal-title').textContent = '新增验光';
  // 清空所有验光数据字段
  const fields = ['optometry-r-sphere','optometry-r-cylinder','optometry-r-axis','optometry-r-vision','optometry-r-pd','optometry-l-sphere','optometry-l-cylinder','optometry-l-axis','optometry-l-vision','optometry-l-pd','optometry-add-power','optometry-optometrist','optometry-diagnosis','optometry-remark','optometry-lens-brand','optometry-frame-brand'];
  fields.forEach(id => document.getElementById(id).value = '');
  document.getElementById('optometry-store').value = '常州路店';
  // 重置时间为当前
  document.getElementById('optometry-time').value = getNowLocalValue();
  // 重置会员选择
  document.getElementById('optometry-member-id').value = '';
  document.getElementById('optometry-member-search').value = '';
  document.getElementById('optometry-selected-member-info').style.display = 'none';
  document.getElementById('optometry-history-section').style.display = 'none';
  openModal('optometry-modal');
}

function editOptometry(id) {
  const o = state.optometries.find(x => x.id === id);
  if (!o) return;
  state.editingOptometryId = id;
  document.getElementById('optometry-modal-title').textContent = '编辑验光记录';
  // 填充验光数据
  document.getElementById('optometry-r-sphere').value = o.r_sphere || '';
  document.getElementById('optometry-r-cylinder').value = o.r_cylinder || '';
  document.getElementById('optometry-r-axis').value = o.r_axis || '';
  document.getElementById('optometry-r-vision').value = o.r_vision || '';
  document.getElementById('optometry-l-sphere').value = o.l_sphere || '';
  document.getElementById('optometry-l-cylinder').value = o.l_cylinder || '';
  document.getElementById('optometry-l-axis').value = o.l_axis || '';
  document.getElementById('optometry-l-vision').value = o.l_vision || '';
  document.getElementById('optometry-r-pd').value = o.r_pd || '';
  document.getElementById('optometry-l-pd').value = o.l_pd || '';
  document.getElementById('optometry-add-power').value = o.add_power || '';
  document.getElementById('optometry-lens-brand').value = o.lens_brand || '';
  document.getElementById('optometry-frame-brand').value = o.frame_brand || '';
  document.getElementById('optometry-optometrist').value = o.optometrist || '';
  document.getElementById('optometry-store').value = o.store || '总店';
  document.getElementById('optometry-diagnosis').value = o.diagnosis || '';
  document.getElementById('optometry-remark').value = o.remark || '';
  // 填充时间选择器（把数据库格式转成datetime-local格式）
  if (o.created_at) {
    const dbTime = o.created_at.replace('T', ' ').substring(0, 16);
    document.getElementById('optometry-time').value = dbTime.replace(' ', 'T');
  } else {
    document.getElementById('optometry-time').value = getNowLocalValue();
  }
  // 如果有关联会员，显示会员信息
  document.getElementById('optometry-member-id').value = o.member_id || '';
  document.getElementById('optometry-member-search').value = '';
  if (o.member_id) {
    document.getElementById('optometry-sel-name').textContent = o.member_name;
    document.getElementById('optometry-sel-phone').textContent = o.phone || '无手机号';
    document.getElementById('optometry-sel-gender').textContent = o.gender || '未填写';
    document.getElementById('optometry-sel-age').textContent = o.age ? o.age + '岁' : '';
    document.getElementById('optometry-sel-balance').textContent = '加载中...';
    document.getElementById('optometry-selected-member-info').style.display = 'flex';
    // 加载会员余额和历史记录
    loadMemberBalanceForOptometry(o.member_id);
    loadOptometryHistoryForMember(o.member_id);
  } else {
    document.getElementById('optometry-selected-member-info').style.display = 'none';
    document.getElementById('optometry-history-section').style.display = 'none';
  }
  openModal('optometry-modal');
}

// 验光弹窗中搜索会员
let optMemberTimer = null;
function searchOptometryMembers() {
  clearTimeout(optMemberTimer);
  const keyword = document.getElementById('optometry-member-search').value.trim();
  const dropdown = document.getElementById('optometry-member-list');
  if (!keyword) { dropdown.classList.remove('show'); return; }
  // 显示加载状态
  dropdown.innerHTML = '<div class="member-dropdown-item" style="color:var(--text-lighter);">🔍 搜索中...</div>';
  dropdown.classList.add('show');

  optMemberTimer = setTimeout(async () => {
    try {
      const res = await api(`/api/members?search=${encodeURIComponent(keyword)}&limit=10`);
      if (res.success && res.data.length > 0) {
        dropdown.innerHTML = res.data.map(m => `
          <div class="member-dropdown-item" onclick="selectOptometryMember(${m.id}, '${escapeHtml(m.name)}', '${escapeHtml(m.phone)}', ${m.age || 'null'}, '${escapeHtml(m.gender)}', ${m.balance || 0})">
            <span>${escapeHtml(m.name)} (${escapeHtml(m.phone) || '无手机号'})</span>
            <span class="balance">${formatMoney(m.balance)}</span>
          </div>
        `).join('');
        dropdown.classList.add('show');
      } else {
        dropdown.innerHTML = '<div class="member-dropdown-item" style="color:var(--text-lighter);">😕 未找到会员，请检查姓名或手机号</div>';
        dropdown.classList.add('show');
      }
    } catch (err) {
      dropdown.innerHTML = '<div class="member-dropdown-item" style="color:var(--danger);">❌ 搜索失败，请重试</div>';
      dropdown.classList.add('show');
    }
  }, 300);
}

function selectOptometryMember(id, name, phone, age, gender, balance) {
  document.getElementById('optometry-member-id').value = id;
  document.getElementById('optometry-sel-name').textContent = name;
  document.getElementById('optometry-sel-phone').textContent = phone || '无手机号';
  document.getElementById('optometry-sel-gender').textContent = gender || '未填写';
  document.getElementById('optometry-sel-age').textContent = age ? age + '岁' : '';
  document.getElementById('optometry-sel-balance').textContent = balance !== undefined ? formatMoney(balance) : '加载中...';
  document.getElementById('optometry-member-search').value = '';
  document.getElementById('optometry-member-list').classList.remove('show');
  document.getElementById('optometry-selected-member-info').style.display = 'flex';
  // 加载会员余额（如果没传）和历史验光记录
  if (balance === undefined) loadMemberBalanceForOptometry(id);
  loadOptometryHistoryForMember(id);
}

function clearOptometryMember() {
  document.getElementById('optometry-member-id').value = '';
  document.getElementById('optometry-selected-member-info').style.display = 'none';
  document.getElementById('optometry-history-section').style.display = 'none';
  document.getElementById('optometry-member-search').value = '';
}

async function loadMemberBalanceForOptometry(memberId) {
  try {
    const res = await api(`/api/members/${memberId}`);
    if (res.success) {
      document.getElementById('optometry-sel-balance').textContent = formatMoney(res.data.balance);
    }
  } catch (e) { /* ignore */ }
}

async function loadOptometryHistoryForMember(memberId) {
  const section = document.getElementById('optometry-history-section');
  const list = document.getElementById('optometry-history-list');
  section.style.display = 'block';
  list.innerHTML = '<div class="empty-cell">加载中...</div>';
  try {
    const res = await api(`/api/optometries?member_id=${memberId}&limit=20`);
    if (res.success && res.data.length > 0) {
      list.innerHTML = res.data.map((r, idx) => `
        <div class="history-quick-item" onclick="fillOptometryFromHistory(${JSON.stringify(r).replace(/"/g, '&quot;')})">
          <div class="history-quick-date">${formatDate(r.created_at)} <span class="history-quick-num">第${res.data.length - idx}次</span></div>
          <div class="history-quick-eyes">
            <span>右：${r.r_sphere !== null ? r.r_sphere.toFixed(2) : '-'}${r.r_cylinder ? ' / ' + r.r_cylinder.toFixed(2) + ' / ' + (r.r_axis || 0) : ''}</span>
            <span>左：${r.l_sphere !== null ? r.l_sphere.toFixed(2) : '-'}${r.l_cylinder ? ' / ' + r.l_cylinder.toFixed(2) + ' / ' + (r.l_axis || 0) : ''}</span>
            <span>右PD：${r.r_pd || '-'}</span>
            <span>左PD：${r.l_pd || '-'}</span>
            ${r.lens_brand ? `<span style="color:#1d4ed8;">🔍 ${escapeHtml(r.lens_brand)}</span>` : ''}
            ${r.frame_brand ? `<span style="color:#15803d;">👓 ${escapeHtml(r.frame_brand)}</span>` : ''}
          </div>
          <div class="history-quick-btn">📋 使用此度数</div>
        </div>
      `).join('');
    } else {
      list.innerHTML = '<div class="empty-cell">该会员暂无历史验光记录</div>';
    }
  } catch (err) {
    list.innerHTML = '<div class="empty-cell">加载历史记录失败</div>';
  }
}

function fillOptometryFromHistory(r) {
  document.getElementById('optometry-r-sphere').value = r.r_sphere || '';
  document.getElementById('optometry-r-cylinder').value = r.r_cylinder || '';
  document.getElementById('optometry-r-axis').value = r.r_axis || '';
  document.getElementById('optometry-r-vision').value = r.r_vision || '';
  document.getElementById('optometry-l-sphere').value = r.l_sphere || '';
  document.getElementById('optometry-l-cylinder').value = r.l_cylinder || '';
  document.getElementById('optometry-l-axis').value = r.l_axis || '';
  document.getElementById('optometry-l-vision').value = r.l_vision || '';
  document.getElementById('optometry-r-pd').value = r.r_pd || '';
  document.getElementById('optometry-l-pd').value = r.l_pd || '';
  document.getElementById('optometry-add-power').value = r.add_power || '';
  document.getElementById('optometry-lens-brand').value = r.lens_brand || '';
  document.getElementById('optometry-frame-brand').value = r.frame_brand || '';
  showToast('已填充历史度数，可继续修改');
}

async function saveOptometry() {
  const memberId = document.getElementById('optometry-member-id').value;
  if (!memberId) { showToast('请先选择会员', 'error'); return; }
  const memberName = document.getElementById('optometry-sel-name').textContent;
  const memberPhone = document.getElementById('optometry-sel-phone').textContent;
  const memberGender = document.getElementById('optometry-sel-gender').textContent;
  const memberAgeText = document.getElementById('optometry-sel-age').textContent;
  const memberAge = memberAgeText ? parseInt(memberAgeText) : null;

  const data = {
    member_id: parseInt(memberId),
    member_name: memberName,
    phone: memberPhone === '无手机号' ? '' : memberPhone,
    age: memberAge,
    gender: memberGender,
    r_sphere: parseFloat(document.getElementById('optometry-r-sphere').value) || null,
    r_cylinder: parseFloat(document.getElementById('optometry-r-cylinder').value) || null,
    r_axis: parseInt(document.getElementById('optometry-r-axis').value) || null,
    r_vision: document.getElementById('optometry-r-vision').value.trim(),
    l_sphere: parseFloat(document.getElementById('optometry-l-sphere').value) || null,
    l_cylinder: parseFloat(document.getElementById('optometry-l-cylinder').value) || null,
    l_axis: parseInt(document.getElementById('optometry-l-axis').value) || null,
    l_vision: document.getElementById('optometry-l-vision').value.trim(),
    r_pd: parseFloat(document.getElementById('optometry-r-pd').value) || null,
    l_pd: parseFloat(document.getElementById('optometry-l-pd').value) || null,
    add_power: parseFloat(document.getElementById('optometry-add-power').value) || null,
    lens_brand: document.getElementById('optometry-lens-brand').value.trim(),
    frame_brand: document.getElementById('optometry-frame-brand').value.trim(),
    optometrist: document.getElementById('optometry-optometrist').value.trim(),
    store: document.getElementById('optometry-store').value.trim() || '总店',
    diagnosis: document.getElementById('optometry-diagnosis').value.trim(),
    remark: document.getElementById('optometry-remark').value.trim(),
    created_at: formatDateTimeForDb(document.getElementById('optometry-time').value)
  };

  try {
    let res;
    if (state.editingOptometryId) {
      res = await api(`/api/optometries/${state.editingOptometryId}`, { method: 'PUT', body: data });
    } else {
      res = await api('/api/optometries', { method: 'POST', body: data });
    }
    if (res.success) {
      showToast(res.message);
      closeModal('optometry-modal');
      loadOptometries();
    } else {
      showToast(res.message || '保存失败', 'error');
    }
  } catch (err) {
    showToast('保存失败', 'error');
  }
}

async function deleteOptometry(id) {
  const o = state.optometries.find(x => x.id === id);
  if (!o) return;
  if (!confirm(`确定要删除「${o.member_name}」的验光记录吗？`)) return;
  try {
    const res = await api(`/api/optometries/${id}`, { method: 'DELETE' });
    if (res.success) {
      showToast('验光记录已删除');
      loadOptometries();
    } else {
      showToast(res.message || '删除失败', 'error');
    }
  } catch (err) {
    showToast('删除失败', 'error');
  }
}

// 查看历史验光记录
async function viewOptometryHistory(id) {
  const current = state.optometries.find(x => x.id === id);
  if (!current) return;

  document.getElementById('history-modal-title').textContent = `📜 ${current.member_name} 的历史验光记录`;
  document.getElementById('history-member-info').innerHTML = `
    <div class="history-info-row">
      <span><strong>姓名：</strong>${escapeHtml(current.member_name)}</span>
      <span><strong>手机号：</strong>${escapeHtml(current.phone) || '未填写'}</span>
      <span><strong>性别：</strong>${escapeHtml(current.gender) || '未填写'}</span>
      <span><strong>年龄：</strong>${current.age ? current.age + '岁' : '未填写'}</span>
    </div>
  `;
  document.getElementById('history-timeline').innerHTML = '<div class="empty-cell">加载中...</div>';
  openModal('optometry-history-modal');

  try {
    // 优先用 member_id 查询，没有则用姓名搜索
    let records = [];
    if (current.member_id) {
      const res = await api(`/api/optometries?member_id=${current.member_id}&limit=200`);
      if (res.success) records = res.data;
    }
    // 如果按 member_id 没查到或没有 member_id，用姓名搜索补充
    if (records.length === 0) {
      const res = await api(`/api/optometries?search=${encodeURIComponent(current.member_name)}&limit=200`);
      if (res.success) {
        // 过滤出手机号匹配的（如果有手机号），避免同名不同人
        records = current.phone
          ? res.data.filter(r => !r.phone || r.phone === current.phone)
          : res.data;
      }
    }

    if (records.length === 0) {
      document.getElementById('history-timeline').innerHTML = '<div class="empty-cell">暂无历史验光记录</div>';
      return;
    }

    // 按时间倒序
    records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const timeline = document.getElementById('history-timeline');
    const total = records.length;
    timeline.innerHTML = records.map((r, idx) => {
      const isLatest = idx === 0;
      const prev = records[idx + 1];
      const visitNumber = total - idx; // 第几次验光
      let changeHtml = '';
      if (prev) {
        const rChange = r.r_sphere !== null && prev.r_sphere !== null ? r.r_sphere - prev.r_sphere : null;
        const lChange = r.l_sphere !== null && prev.l_sphere !== null ? r.l_sphere - prev.l_sphere : null;
        if (rChange !== null || lChange !== null) {
          changeHtml = '<div class="history-change">';
          changeHtml += '<span class="change-label">较上一次：</span>';
          if (rChange !== null) {
            const arrow = rChange > 0 ? '↑' : (rChange < 0 ? '↓' : '→');
            const cls = rChange > 0 ? 'up' : (rChange < 0 ? 'down' : 'same');
            changeHtml += `<span class="change-tag ${cls}">右眼 ${arrow} ${Math.abs(rChange).toFixed(2)}</span>`;
          }
          if (lChange !== null) {
            const arrow = lChange > 0 ? '↑' : (lChange < 0 ? '↓' : '→');
            const cls = lChange > 0 ? 'up' : (lChange < 0 ? 'down' : 'same');
            changeHtml += `<span class="change-tag ${cls}">左眼 ${arrow} ${Math.abs(lChange).toFixed(2)}</span>`;
          }
          changeHtml += '</div>';
        }
      }

      return `
        <div class="history-item ${isLatest ? 'latest' : ''}">
          <div class="history-dot">${visitNumber}</div>
          <div class="history-content">
            <div class="history-header">
              <span class="history-visit">第 ${visitNumber} 次验光</span>
              <span class="history-date">${formatDate(r.created_at)}</span>
              ${isLatest ? '<span class="latest-tag">最新</span>' : ''}
            </div>
            <div class="history-subheader">
              <span class="history-optometrist">验光师：${escapeHtml(r.optometrist) || '未填写'}</span>
              <span class="history-store">门店：${escapeHtml(r.store) || '总店'}</span>
              <button class="history-print-btn" onclick="printOptometry(${r.id}); event.stopPropagation();">🖨️ 打印报告单</button>
            </div>
            <div class="history-eyes">
              <div class="eye-box">
                <div class="eye-label">右眼 (R)</div>
                <div class="eye-data">
                  <span>球镜 <strong>${r.r_sphere !== null ? r.r_sphere.toFixed(2) : '-'}</strong></span>
                  <span>柱镜 <strong>${r.r_cylinder !== null ? r.r_cylinder.toFixed(2) : '-'}</strong></span>
                  <span>轴位 <strong>${r.r_axis || '-'}</strong></span>
                  <span>视力 <strong>${escapeHtml(r.r_vision) || '-'}</strong></span>
                </div>
              </div>
              <div class="eye-box">
                <div class="eye-label">左眼 (L)</div>
                <div class="eye-data">
                  <span>球镜 <strong>${r.l_sphere !== null ? r.l_sphere.toFixed(2) : '-'}</strong></span>
                  <span>柱镜 <strong>${r.l_cylinder !== null ? r.l_cylinder.toFixed(2) : '-'}</strong></span>
                  <span>轴位 <strong>${r.l_axis || '-'}</strong></span>
                  <span>视力 <strong>${escapeHtml(r.l_vision) || '-'}</strong></span>
                </div>
              </div>
            </div>
            <div class="history-meta">
              <span>右眼PD：<strong>${r.r_pd || '-'}</strong> mm</span>
              <span>左眼PD：<strong>${r.l_pd || '-'}</strong> mm</span>
              ${r.add_power ? `<span>下加光 ADD：<strong>${r.add_power.toFixed(2)}</strong></span>` : ''}
              ${r.lens_brand ? `<span>🔍 镜片：<strong>${escapeHtml(r.lens_brand)}</strong></span>` : ''}
              ${r.frame_brand ? `<span>👓 镜架：<strong>${escapeHtml(r.frame_brand)}</strong></span>` : ''}
              ${r.diagnosis ? `<span>诊断：${escapeHtml(r.diagnosis)}</span>` : ''}
              ${r.remark ? `<span>备注：${escapeHtml(r.remark)}</span>` : ''}
            </div>
            ${changeHtml}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    document.getElementById('history-timeline').innerHTML = '<div class="empty-cell">加载失败，请重试</div>';
  }
}

// 打印验光报告单
function printOptometry(id) {
  const o = state.optometries.find(x => x.id === id);
  if (!o) return;

  document.getElementById('print-store-name').textContent = state.settings.store_name || '明视眼镜店';
  document.getElementById('print-store-info').textContent =
    `电话：${state.settings.store_phone || ''} | 地址：${state.settings.store_address || ''}`;
  document.getElementById('print-name').textContent = o.member_name;
  document.getElementById('print-gender').textContent = o.gender || '-';
  document.getElementById('print-age').textContent = o.age ? o.age + '岁' : '-';
  document.getElementById('print-date').textContent = formatDate(o.created_at);
  document.getElementById('print-phone').textContent = o.phone || '-';
  document.getElementById('print-r-pd').textContent = o.r_pd || '-';
  document.getElementById('print-l-pd').textContent = o.l_pd || '-';
  document.getElementById('print-optometrist').textContent = o.optometrist || '-';
  document.getElementById('print-store').textContent = o.store || '-';
  document.getElementById('print-lens-brand').textContent = o.lens_brand || '未填写';
  document.getElementById('print-frame-brand').textContent = o.frame_brand || '未填写';
  document.getElementById('print-r-sphere').textContent = o.r_sphere ? o.r_sphere.toFixed(2) : '-';
  document.getElementById('print-r-cylinder').textContent = o.r_cylinder ? o.r_cylinder.toFixed(2) : '-';
  document.getElementById('print-r-axis').textContent = o.r_axis || '-';
  document.getElementById('print-r-vision').textContent = o.r_vision || '-';
  document.getElementById('print-l-sphere').textContent = o.l_sphere ? o.l_sphere.toFixed(2) : '-';
  document.getElementById('print-l-cylinder').textContent = o.l_cylinder ? o.l_cylinder.toFixed(2) : '-';
  document.getElementById('print-l-axis').textContent = o.l_axis || '-';
  document.getElementById('print-l-vision').textContent = o.l_vision || '-';
  document.getElementById('print-diagnosis').textContent = o.diagnosis || '无';
  document.getElementById('print-remark').textContent = o.remark || '无';
  document.getElementById('print-footer-text').textContent = state.settings.receipt_footer || '感谢您的惠顾！';

  window.print();
}

// ========== 订单记录 ==========
let orderSearchTimer = null;
document.getElementById('order-search').addEventListener('input', (e) => {
  clearTimeout(orderSearchTimer);
  orderSearchTimer = setTimeout(() => loadOrders(), 300);
});

async function loadOrders() {
  try {
    const search = document.getElementById('order-search').value.trim();
    const startDate = document.getElementById('order-start-date').value;
    const endDate = document.getElementById('order-end-date').value;
    let url = '/api/orders?limit=200';
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;

    const res = await api(url);
    if (res.success) {
      state.orders = res.data;
      renderOrders();
    }
  } catch (err) {
    document.getElementById('orders-tbody').innerHTML = '<tr><td colspan="11" class="empty-cell">加载失败</td></tr>';
  }
}

function renderOrders() {
  const tbody = document.getElementById('orders-tbody');
  if (state.orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">暂无订单记录</td></tr>';
    return;
  }
  tbody.innerHTML = state.orders.map(o => {
    let itemsText = '';
    try {
      const items = JSON.parse(o.items);
      itemsText = items.map(i => `${i.name}×${i.qty}`).join(', ');
    } catch (e) { itemsText = o.items; }
    return `
    <tr>
      <td><strong>${escapeHtml(o.order_no)}</strong></td>
      <td>${escapeHtml(o.member_name)}</td>
      <td style="max-width:200px;font-size:12px;" title="${escapeHtml(itemsText)}">${escapeHtml(itemsText)}</td>
      <td>${formatMoney(o.total_amount)}</td>
      <td style="color:var(--warning);">${o.discount > 0 ? '-' + formatMoney(o.discount) : '-'}</td>
      <td style="color:var(--primary);font-weight:600;">${formatMoney(o.final_amount)}</td>
      <td><span class="feature-tag" style="font-size:11px;">${escapeHtml(o.pay_method)}</span></td>
      <td>${escapeHtml(o.store)}</td>
      <td>${escapeHtml(o.operator)}</td>
      <td>${formatDate(o.created_at)}</td>
      <td>
        <div class="table-actions">
          <button class="action-btn delete" onclick="refundOrder(${o.id})">退款删除</button>
        </div>
      </td>
    </tr>
  `;}).join('');
}

function clearOrderFilters() {
  document.getElementById('order-search').value = '';
  document.getElementById('order-start-date').value = '';
  document.getElementById('order-end-date').value = '';
  loadOrders();
}

async function refundOrder(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return;
  if (!confirm(`确定要退款并删除订单「${o.order_no}」吗？\n金额：${formatMoney(o.final_amount)}\n${o.pay_method === '余额' ? '余额将退还给会员，' : ''}库存将恢复。`)) return;
  try {
    const res = await api(`/api/orders/${id}`, { method: 'DELETE' });
    if (res.success) {
      showToast('订单已退款并删除');
      loadOrders();
    } else {
      showToast(res.message || '操作失败', 'error');
    }
  } catch (err) {
    showToast('操作失败', 'error');
  }
}

// ========== 系统设置 ==========
async function loadSettings() {
  try {
    const res = await api('/api/settings');
    if (res.success) {
      state.settings = res.data;
      document.getElementById('setting-store-name').value = res.data.store_name || '';
      document.getElementById('setting-store-phone').value = res.data.store_phone || '';
      document.getElementById('setting-store-address').value = res.data.store_address || '';
      document.getElementById('setting-receipt-footer').value = res.data.receipt_footer || '';
      document.getElementById('sidebar-store-name').textContent = res.data.store_name || '明视眼镜店';
      document.getElementById('logo-store-name').textContent = res.data.store_name || '追光者眼镜';

      // 短信开关
      const smsEnabled = res.data.sms_enabled === '1';
      document.getElementById('setting-sms-enabled').checked = smsEnabled;
      document.getElementById('sms-status-text').textContent = smsEnabled ? '✅ 已开启，消费成功将自动发送短信' : '❌ 已关闭，消费成功不发送短信';

      // 服务器信息
      document.getElementById('server-info-text').innerHTML = `
        API地址: ${API_BASE}<br>
        数据库: SQLite (data/glasses_shop.db)<br>
        自动备份: 每天凌晨2:00自动备份到 data/backups/<br>
        版本: v1.0.0
      `;
    }
  } catch (err) {
    console.error('加载设置失败:', err);
  }
}

async function toggleSMS(checkbox) {
  const enabled = checkbox.checked;
  try {
    await api('/api/settings', {
      method: 'PUT',
      body: { sms_enabled: enabled ? '1' : '0' }
    });
    document.getElementById('sms-status-text').textContent = enabled
      ? '✅ 已开启，消费成功将自动发送短信'
      : '❌ 已关闭，消费成功不发送短信';
    showToast(enabled ? '短信通知已开启' : '短信通知已关闭');
  } catch (err) {
    showToast('设置失败', 'error');
    checkbox.checked = !enabled;
  }
}

async function saveSettings() {
  const data = {
    store_name: document.getElementById('setting-store-name').value.trim(),
    store_phone: document.getElementById('setting-store-phone').value.trim(),
    store_address: document.getElementById('setting-store-address').value.trim(),
    receipt_footer: document.getElementById('setting-receipt-footer').value.trim()
  };
  try {
    const res = await api('/api/settings', { method: 'PUT', body: data });
    if (res.success) {
      showToast('设置保存成功');
      state.settings = { ...state.settings, ...data };
      document.getElementById('sidebar-store-name').textContent = data.store_name || '明视眼镜店';
      document.getElementById('logo-store-name').textContent = data.store_name || '追光者眼镜';
    } else {
      showToast('保存失败', 'error');
    }
  } catch (err) {
    showToast('保存失败', 'error');
  }
}

// 下载备份
function downloadBackup() {
  showToast('正在生成备份文件...', 'warning');
  window.open(API_BASE + '/api/backup', '_blank');
  setTimeout(() => showToast('备份文件已开始下载'), 1000);
}

// 导入备份
async function restoreBackup(input) {
  const file = input.files[0];
  if (!file) return;
  if (!confirm('确定要导入备份数据吗？⚠️ 这将覆盖当前所有数据，建议先下载备份！')) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const res = await api('/api/restore', { method: 'POST', body: data });
    if (res.success) {
      showToast('数据恢复成功！');
      setTimeout(() => location.reload(), 1500);
    } else {
      showToast(res.message || '恢复失败', 'error');
    }
  } catch (err) {
    showToast('文件格式错误或恢复失败', 'error');
  }
  input.value = '';
}


// ========== 登录/登出 ==========
function showLoginPage() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').textContent = '';
  setTimeout(() => document.getElementById('login-password').focus(), 100);
}

function hideLoginPage() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
}

async function doLogin() {
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  if (!password) { errorEl.textContent = '请输入密码'; return; }
  errorEl.textContent = '';
  const btn = document.getElementById('login-submit-btn');
  btn.disabled = true; btn.textContent = '登录中...';
  try {
    const res = await fetch(API_BASE + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, deviceId: getDeviceId() })
    });
    const data = await res.json();
    if (data.success) {
      saveToken(data.data.token, data.data.expireAt);
      hideLoginPage();
      startHeartbeat();
      startIdleTimer();
      initLogoSecretClick();
      await loadSettings();
      loadDashboard();
      showToast('登录成功');
    } else {
      errorEl.textContent = data.message || '登录失败';
    }
  } catch (err) {
    errorEl.textContent = '无法连接服务器，请稍后重试';
  }
  btn.disabled = false; btn.textContent = '登 录';
}

async function doLogout() {
  try {
    await fetch(API_BASE + '/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }
    });
  } catch (e) { /* ignore */ }
  clearToken();
  stopHeartbeat();
  stopIdleTimer();
  showLoginPage();
}

// 登录页回车提交
document.addEventListener('DOMContentLoaded', () => {
  const pwd = document.getElementById('login-password');
  if (pwd) pwd.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});

// ========== 空闲检测（15分钟无操作自动退出） ==========
let idleTimer = null;
const IDLE_TIMEOUT = 15 * 60 * 1000;

function resetIdleTimer() {
  if (!isLoggedIn()) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    showToast('15分钟无操作，已自动退出登录', 'warning');
    doLogout();
  }, IDLE_TIMEOUT);
}

function startIdleTimer() {
  const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
  events.forEach(ev => document.addEventListener(ev, resetIdleTimer, { passive: true }));
  resetIdleTimer();
}

function stopIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

// ========== 心跳保活（每10分钟） ==========
let heartbeatTimer = null;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    if (!isLoggedIn()) { stopHeartbeat(); return; }
    try {
      await fetch(API_BASE + '/api/heartbeat');
    } catch (e) { /* 服务器可能休眠，忽略 */ }
  }, 10 * 60 * 1000);
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

// ========== 后台管理 ==========
// 连续点击左上角logo 5次触发后台管理（1.5秒内）
let logoClickCount = 0;
let logoClickTimer = null;

function initLogoSecretClick() {
  const logo = document.querySelector('.sidebar-logo');
  if (!logo) return;
  logo.addEventListener('click', () => {
    logoClickCount++;
    if (logoClickTimer) clearTimeout(logoClickTimer);
    logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 1500);
    if (logoClickCount >= 5) {
      logoClickCount = 0;
      if (logoClickTimer) clearTimeout(logoClickTimer);
      openAdminPanel();
    }
  });
}

function openAdminPanel() {
  document.getElementById('admin-verify-password').value = '';
  document.getElementById('admin-verify-error').textContent = '';
  openModal('admin-verify-modal');
  setTimeout(() => document.getElementById('admin-verify-password').focus(), 100);
}

async function verifyAdminPassword() {
  const password = document.getElementById('admin-verify-password').value;
  const errorEl = document.getElementById('admin-verify-error');
  if (!password) { errorEl.textContent = '请输入密码'; return; }
  try {
    const res = await fetch(API_BASE + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, deviceId: getDeviceId() })
    });
    const data = await res.json();
    if (data.success) {
      // 验证成功，更新token并进入后台
      saveToken(data.data.token, data.data.expireAt);
      closeModal('admin-verify-modal');
      navigateTo('admin');
    } else {
      errorEl.textContent = data.message || '验证失败';
    }
  } catch (err) {
    errorEl.textContent = '无法连接服务器';
  }
}

async function loadAdminDevices() {
  try {
    const res = await api('/api/admin/devices');
    if (res.success) {
      const tbody = document.getElementById('admin-devices-tbody');
      document.getElementById('admin-device-count').textContent = res.data.length;
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">暂无在线设备</td></tr>';
        return;
      }
      tbody.innerHTML = res.data.map(d => {
        const ua = d.userAgent || '';
        let browser = '未知';
        if (ua.includes('Edg')) browser = 'Edge';
        else if (ua.includes('Chrome')) browser = 'Chrome';
        else if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Safari')) browser = 'Safari';
        return `
        <tr>
          <td style="font-size:11px;font-family:monospace;">${d.deviceId.substring(0, 20)}...</td>
          <td>${d.loginTime}</td>
          <td>${d.lastActiveTime}</td>
          <td style="font-size:12px;">${browser}<br><span style="color:var(--text-lighter);">${d.ip || '-'}</span></td>
          <td>${d.isCurrent ? '<span class="feature-tag" style="background:#dcfce7;color:#16a34a;">当前设备</span>' : '<span class="feature-tag">在线</span>'}</td>
          <td>
            ${d.isCurrent ? '-' : `<button class="action-btn delete" onclick="kickDevice('${d.tokenFull}')">强制下线</button>`}
          </td>
        </tr>`;
      }).join('');
    }
  } catch (err) {
    document.getElementById('admin-devices-tbody').innerHTML = '<tr><td colspan="6" class="empty-cell">加载失败</td></tr>';
  }
}

async function kickDevice(token) {
  if (!confirm('确定要强制下线该设备吗？')) return;
  try {
    const res = await api('/api/admin/kick', { method: 'POST', body: { token } });
    if (res.success) {
      showToast(res.message);
      loadAdminDevices();
    } else {
      showToast(res.message || '操作失败', 'error');
    }
  } catch (err) {
    showToast('操作失败', 'error');
  }
}

async function changeAdminPassword() {
  const oldPwd = document.getElementById('admin-old-password').value;
  const newPwd = document.getElementById('admin-new-password').value;
  const confirmPwd = document.getElementById('admin-confirm-password').value;
  if (!oldPwd || !newPwd) { showToast('请填写完整', 'error'); return; }
  if (newPwd.length < 6) { showToast('新密码至少6位', 'error'); return; }
  if (newPwd !== confirmPwd) { showToast('两次输入的新密码不一致', 'error'); return; }
  try {
    const res = await api('/api/admin/change-password', { method: 'POST', body: { oldPassword: oldPwd, newPassword: newPwd } });
    if (res.success) {
      showToast(res.message);
      clearToken();
      stopHeartbeat();
      stopIdleTimer();
      setTimeout(() => { showLoginPage(); showToast('密码已修改，请重新登录', 'success'); }, 500);
    } else {
      showToast(res.message || '修改失败', 'error');
    }
  } catch (err) {
    showToast('修改失败', 'error');
  }
}

// ========== 初始化 ==========
async function init() {
  // 显示日期
  const now = new Date();
  document.getElementById('current-date').textContent =
    now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  // 初始化时间选择器默认值
  initDateTimePickers();

  // 健康检查（等待服务器唤醒）
  let connected = false;
  let attempts = 0;
  const maxAttempts = 30;
  const loadingSubtext = document.getElementById('loading-subtext');

  async function checkServer() {
    attempts++;
    try {
      const res = await fetch(API_BASE + '/api/health');
      if (res.ok) { connected = true; return true; }
    } catch (e) { /* 继续等待 */ }
    return false;
  }

  while (!connected && attempts < maxAttempts) {
    if (await checkServer()) break;
    if (attempts > 3) {
      loadingSubtext.textContent = '正在唤醒服务器，请稍候... 已等待 ' + (attempts * 2) + ' 秒';
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!connected) {
    loadingSubtext.innerHTML = '⚠️ 无法连接到服务器<br>请确认服务器已启动';
    document.querySelector('.loading-spinner').style.display = 'none';
    return;
  }

  // 检查登录状态
  if (isLoggedIn()) {
    // 已登录，直接进入系统
    document.getElementById('loading-overlay').style.display = 'none';
    hideLoginPage();
    startHeartbeat();
    startIdleTimer();
    initLogoSecretClick();
    await loadSettings();
    loadDashboard();
  } else {
    // 未登录，显示登录页
    clearToken();
    showLoginPage();
  }
}

// 启动
init();
