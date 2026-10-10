/* app.js — 童芽 ToySprout 前端数据层
 * 职责：API 封装 / 登录态管理 / 通用渲染工具 / toast 提示
 * 与后端契约：API 返回 {code, data, message}；金额单位分为整数。
 */
(function () {
  'use strict';

  var API_BASE = '/api/v1';
  var TOKEN_KEY = 'toysprout_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }
  function setToken(t) {
    localStorage.setItem(TOKEN_KEY, t);
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }
  function isLoggedIn() {
    return !!getToken();
  }

  // 统一请求封装：注入 Authorization、解析 {code,data,message}、401 跳登录。
  function apiFetch(path, options) {
    options = options || {};
    options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    var token = getToken();
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + path, options).then(function (resp) {
      return resp.json().catch(function () {
        return { code: resp.status, data: null, message: '服务响应异常' };
      }).then(function (body) {
        if (body.code === 401) {
          clearToken();
          if (!/register\.html/.test(location.pathname)) {
            location.href = 'register.html';
          }
        }
        return body;
      });
    });
  }

  function get(path) {
    return apiFetch(path);
  }
  function post(path, data) {
    return apiFetch(path, { method: 'POST', body: JSON.stringify(data || {}) });
  }
  function put(path, data) {
    return apiFetch(path, { method: 'PUT', body: JSON.stringify(data || {}) });
  }
  function del(path) {
    return apiFetch(path, { method: 'DELETE' });
  }

  // 页面加载时要求登录（除 index/register 外）。
  function requireAuth(redirectTo) {
    if (!isLoggedIn()) {
      location.href = redirectTo || 'register.html';
      return false;
    }
    return true;
  }

  // 轻提示条：复用 styles.css 的 notice-bar 视觉。
  var toastTimer = null;
  function toast(msg, type) {
    var old = document.getElementById('app-toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'app-toast';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:400;' +
      'max-width:90vw;padding:12px 20px;border-radius:10px;box-shadow:0 12px 32px rgba(61,45,30,.16);' +
      'font-size:14px;font-weight:600;color:var(--color-text-primary);background:var(--color-surface);' +
      'border:1px solid var(--color-border-strong);display:flex;align-items:center;gap:8px;';
    if (type === 'success') {
      el.style.borderColor = 'var(--color-success-border)';
      el.style.background = 'var(--color-success-tint)';
      el.style.color = 'var(--color-success-text)';
    } else if (type === 'error') {
      el.style.borderColor = 'var(--color-danger-border)';
      el.style.background = 'var(--color-danger-tint)';
      el.style.color = 'var(--color-danger-text)';
    } else if (type === 'warn') {
      el.style.borderColor = 'var(--color-warning-border)';
      el.style.background = 'var(--color-warning-tint)';
      el.style.color = 'var(--color-warning-text)';
    }
    el.textContent = msg;
    document.body.appendChild(el);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 3200);
  }

  // ============ 通用渲染工具 ============

  var CATEGORY_NAMES = {
    building_blocks: '积木拼搭',
    outdoor_sports: '运动户外',
    pretend_play: '过家家',
    early_education: '早教益智',
    plush_fabric: '布艺毛绒',
  };

  var CONDITION_META = {
    new: { label: '全新', cls: 'condition--new', icon: 'i-gift', desc: '未拆封/仅试玩' },
    '9new': { label: '9成新', cls: 'condition--9new', icon: 'i-circle-check', desc: '轻微使用无明显瑕疵' },
    '8new': { label: '8成新', cls: 'condition--8new', icon: 'i-clock', desc: '正常使用痕迹' },
    used: { label: '有使用痕迹', cls: 'condition--used', icon: 'i-wrinkle', desc: '明显磨损/小瑕疵' },
  };

  var CREDIT_META = {
    sprout: { label: '新芽', cls: 'credit--sprout', icon: 'i-sprout' },
    growing: { label: '成长', cls: 'credit--growing', icon: 'i-growing' },
    trusted: { label: '信赖', cls: 'credit--trusted', icon: 'i-shield-check' },
    elite: { label: '优选', cls: 'credit--elite', icon: 'i-star-shield' },
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function icon(name) {
    return '<svg class="ic"><use href="#' + name + '"/></svg>';
  }

  function conditionBadge(level) {
    var m = CONDITION_META[level] || CONDITION_META.used;
    return '<span class="condition-badge ' + m.cls + '">' + icon(m.icon) + m.label + '</span>';
  }

  function creditBadge(user, size) {
    size = size || 'M';
    var m = CREDIT_META[user.creditLevel] || CREDIT_META.sprout;
    var cls = 'credit-badge ' + m.cls + (size === 'L' ? ' credit-badge--lg' : '');
    return '<span class="' + cls + '">' + icon(m.icon) + m.label + '·<span class="credit-badge__score">' + user.creditScore + '</span></span>';
  }

  function verifiedBadge(user) {
    if (!user.isVerified) return '';
    return '<span class="verified-badge">' + icon('i-shield-check') + '已实名</span>';
  }

  // 玩具卡 HTML（对齐原型 toy-card 结构）
  function toyCard(t) {
    var owner = t.owner || {};
    var meta = CONDITION_META[t.conditionLevel] || CONDITION_META.used;
    var cover = (t.images && t.images[0]) || '';
    var media = cover
      ? '<img src="' + esc(cover) + '" alt="' + esc(t.title) + '" loading="lazy" onerror="this.parentElement.innerHTML=toyFallbackSvg()">'
      : toyFallbackSvg();
    return (
      '<article class="toy-card">' +
      '<a class="toy-card__media" href="toy-detail.html?id=' + t.id + '" aria-label="' + esc(t.title) + '详情">' +
      media +
      '<span class="toy-card__condition">' + conditionBadge(t.conditionLevel) + '</span>' +
      '</a>' +
      '<div class="toy-card__body">' +
      '<h3 class="toy-card__title"><a href="toy-detail.html?id=' + t.id + '">' + esc(t.title) + '</a></h3>' +
      '<div class="toy-card__meta">' +
      '<span class="safety-tag safety-tag--age">适合 ' + esc(t.ageRange) + ' 岁</span>' +
      '<span>' + icon('i-pin') + esc(t.city || '') + '</span>' +
      '</div>' +
      '<div class="caption text-tertiary">' + esc(meta.desc) + '</div>' +
      '<div class="toy-card__author">' +
      verifiedBadge(owner) +
      (owner.creditScore != null ? creditBadge(owner, 'S') : '') +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  // 离线降级插画（几何 SVG，风格对齐原型）
  window.toyFallbackSvg = function () {
    return (
      '<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block;">' +
      '<rect width="320" height="200" fill="#F8F1E6"/>' +
      '<circle cx="80" cy="70" r="34" fill="#FCF0D8"/>' +
      '<rect x="140" y="60" width="110" height="42" rx="8" fill="#F2B33D"/>' +
      '<rect x="140" y="108" width="110" height="42" rx="8" fill="#FCE8E0"/>' +
      '<path d="M60 150h200" stroke="#E9DFCE" stroke-width="2"/>' +
      '</svg>'
    );
  };

  // 服务费保障条
  function feeBar(swap, myRole) {
    var fee = swap[myRole === 'initiator' ? 'serviceFeeAmountInitiator' : 'serviceFeeAmountTarget'];
    var paid = swap[myRole === 'initiator' ? 'serviceFeePaidByInitiator' : 'serviceFeePaidByTarget'];
    var status = swap.status;
    var text = '本单服务费 ¥1.9（会员免）· 双方发起快递时收取，取消不收费';
    var cls = '';
    if (status === 'received' || status === 'reviewed') {
      text = '服务费已收取 ¥' + (fee == null ? 1.9 : fee / 100);
      cls = 'notice-bar--success';
    } else if (paid) {
      text = '服务费已担保 ¥' + (fee == null ? 1.9 : fee / 100) + ' · 已支付';
      cls = 'notice-bar--success';
    }
    return (
      '<div class="notice-bar ' + cls + '">' +
      icon('i-shield-check') +
      '<span>' + text + '</span></div>'
    );
  }

  // 交换状态机（竖排 mini 版，用于订单卡）
  var STATUS_META = {
    requested: { label: '已发起', cls: 'st-requested', order: 1 },
    accepted: { label: '对方已同意', cls: 'st-accepted', order: 2 },
    rejected: { label: '已拒绝', cls: 'st-cancelled', order: 6 },
    shipping: { label: '双方邮寄中', cls: 'st-shipping', order: 3 },
    received: { label: '已收货', cls: 'st-received', order: 4 },
    reviewed: { label: '已互评', cls: 'st-reviewed', order: 5 },
    cancelled: { label: '已取消', cls: 'st-cancelled', order: 6 },
    disputed: { label: '纠纷仲裁中', cls: 'st-disputed', order: 7 },
  };

  function statusBadge(status) {
    var m = STATUS_META[status] || STATUS_META.requested;
    var color = '';
    if (status === 'received' || status === 'reviewed') color = 'st-ok';
    if (status === 'disputed') color = 'st-danger';
    if (status === 'cancelled' || status === 'rejected') color = 'st-neutral';
    return '<span class="status-chip ' + color + '">' + m.label + '</span>';
  }

  // 订单卡 HTML
  function orderCard(swap) {
    var m = STATUS_META[swap.status] || STATUS_META.requested;
    var me = swap.myRole || 'initiator';
    return (
      '<a class="card card--compact order-card" href="order-detail.html?id=' + swap.id + '">' +
      '<div class="order-card__head">' +
      '<span class="order-card__id num">#' + swap.id.slice(0, 8) + '</span>' +
      statusBadge(swap.status) +
      '</div>' +
      '<div class="order-card__row">' +
      '<span>发起方玩具：<strong>' + esc(swap.myToy ? swap.myToy.title : '—') + '</strong></span>' +
      '<span>对方玩具：<strong>' + esc(swap.targetToy ? swap.targetToy.title : '—') + '</strong></span>' +
      '</div>' +
      '<div class="order-card__meta">' +
      '<span>' + icon('i-cal') + ' ' + esc(swap.createdAt || '').slice(0, 10) + '</span>' +
      (swap.serviceFeeAmountInitiator != null
        ? '<span class="num">服务费 ' + swap.serviceFeeAmountInitiator / 100 + ' / ' + swap.serviceFeeAmountTarget / 100 + ' 元</span>'
        : '') +
      '</div>' +
      '</a>'
    );
  }

  // 星星渲染
  function stars(rating) {
    var html = '<span class="stars">';
    for (var i = 1; i <= 5; i++) {
      html += i <= rating ? icon('i-star') : '<svg class="ic ic--empty"><use href="#i-star"/></svg>';
    }
    return html + '</span>';
  }

  // 页面脚本执行入口：document ready 后执行
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // 导航栏登录态渲染（替换 nav-actions 的会员按钮）
  function renderNav() {
    var actions = document.querySelector('.nav-actions');
    if (!actions) return;
    if (isLoggedIn()) {
      actions.innerHTML =
        '<a class="btn btn--soft btn--sm" href="profile.html">我的</a>' +
        '<a class="btn btn--primary btn--sm" href="publish.html">' + icon('i-plus') + '发布玩具</a>';
    } else {
      actions.innerHTML =
        '<a class="btn btn--soft btn--sm" href="membership.html">会员权益</a>' +
        '<a class="btn btn--primary btn--sm" href="register.html">登录/注册</a>';
    }
  }

  window.ToySprout = {
    API_BASE: API_BASE,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    isLoggedIn: isLoggedIn,
    apiFetch: apiFetch,
    get: get,
    post: post,
    put: put,
    del: del,
    requireAuth: requireAuth,
    toast: toast,
    esc: esc,
    icon: icon,
    conditionBadge: conditionBadge,
    creditBadge: creditBadge,
    verifiedBadge: verifiedBadge,
    toyCard: toyCard,
    feeBar: feeBar,
    statusBadge: statusBadge,
    statusMeta: STATUS_META,
    orderCard: orderCard,
    stars: stars,
    ready: ready,
    renderNav: renderNav,
    CATEGORY_NAMES: CATEGORY_NAMES,
    CONDITION_META: CONDITION_META,
    CREDIT_META: CREDIT_META,
  };
})();
