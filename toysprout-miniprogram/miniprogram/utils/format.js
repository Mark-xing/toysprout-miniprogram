// utils/format.js
// 格式化与常量工具：品类/成色/信用等级中文映射、金额格式化等。
'use strict';

const CATEGORY_NAMES = {
  building_blocks: '积木拼搭',
  outdoor_sports: '运动户外',
  pretend_play: '过家家',
  early_education: '早教益智',
  plush_fabric: '布艺毛绒',
};

const CONDITION_META = {
  new: { label: '全新', cls: 'condition--new', desc: '未拆封/仅试玩' },
  '9new': { label: '9成新', cls: 'condition--9new', desc: '轻微使用无明显瑕疵' },
  '8new': { label: '8成新', cls: 'condition--8new', desc: '正常使用痕迹' },
  used: { label: '有使用痕迹', cls: 'condition--used', desc: '明显磨损/小瑕疵' },
};

const CREDIT_META = {
  sprout: { label: '新芽', cls: 'credit--sprout' },
  growing: { label: '成长', cls: 'credit--growing' },
  trusted: { label: '信赖', cls: 'credit--trusted' },
  elite: { label: '优选', cls: 'credit--elite' },
};

const STATUS_META = {
  requested: { label: '已发起', cls: '' },
  accepted: { label: '对方已同意', cls: '' },
  rejected: { label: '已拒绝', cls: '' },
  shipping: { label: '双方邮寄中', cls: '' },
  received: { label: '已收货', cls: 'st-ok' },
  reviewed: { label: '已互评', cls: 'st-ok' },
  cancelled: { label: '已取消', cls: '' },
  disputed: { label: '纠纷仲裁中', cls: 'st-danger' },
};

// 意见反馈类型枚举：value 必须与云函数 user.createFeedback 的 FEEDBACK_TYPES 一一对应，
// label 仅前端展示。改这里务必同步改 cloudfunctions/user/index.js。
const FEEDBACK_TYPES = [
  { value: 'suggestion', label: '功能建议' },
  { value: 'report', label: '内容举报' },
  { value: 'transaction', label: '交易问题' },
  { value: 'other', label: '其他' },
];

function fenToYuan(fen) {
  if (fen == null) return '0';
  return (fen / 100).toFixed(1).replace(/\.0$/, '');
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

// 统一日期格式化。
// 踩坑：云数据库的日期字段（serverDate 写入）读出来是 Date 对象，
// 直接 String(date).slice(0, 10) 会得到 "Wed Oct 08" 这种英文星期缩写，不是日期。
// 这里显式识别 Date 并按本地时区拼 yyyy-MM-dd。
// 兼容入参：Date 对象 / ISO 字符串 / 时间戳数字 / 空值。
function formatDate(value, withTime) {
  if (value == null || value === '') return '';
  let d = null;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === 'number') {
    d = new Date(value);
  } else {
    const s = String(value);
    // ISO（2026-10-08T09:00:00.000Z）或 "2026-10-08 09:00:00" 直接切字符串最稳，
    // 避免被 Date 解析再按本地时区回退一天。
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return withTime ? s.slice(0, 16).replace('T', ' ') : s.slice(0, 10);
    }
    d = new Date(s);
  }
  if (!d || isNaN(d.getTime())) return '';
  const base = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  return withTime ? base + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : base;
}

// 把若干可选片段拼成一行元信息，自动滤掉空片段。
//
// 为什么必须放在 JS 侧做，而不是在 WXML 里写 `{{a}} · {{b}} · {{c}}`：
// **小程序 WXML 会把 null 渲染成字面量字符串「null」**，不像 React 那样自动消隐成空。
// 实测（2026-10-10，玩具详情页）：toy.city 为 null 时页面真的显示
//   「积木拼搭 · null · 发布于 2026-10-10」
// 这个坑纯数值断言抓不到，只有看真实渲染截图才会发现。
// 所以凡是「可选片段 + 分隔符」的结构，一律先在这里滤空再拼。
function joinMeta(parts, sep) {
  const s = sep === undefined ? ' · ' : sep;
  return (parts || [])
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter((p) => p !== '')
    .join(s);
}

module.exports = { CATEGORY_NAMES, CONDITION_META, CREDIT_META, STATUS_META, FEEDBACK_TYPES, fenToYuan, formatDate, joinMeta };
