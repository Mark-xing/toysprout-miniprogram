// scripts/mock-wx-server-sdk.js
// 本地模拟微信云开发 wx-server-sdk 的数据库 API 子集，用于在无法接入真实云开发环境时
// 对云函数业务逻辑做本地集成测试。仅实现本项目云函数实际用到的 API 面：
// cloud.init / cloud.database() / collection().where/orderBy/skip/limit/get/add/update/remove/count/doc
// db.command 的 in/or/and/neq，db.serverDate()，cloud.getWXContext()，
// cloud.getTempFileURL()（云存储签名链接签发）
'use strict';

const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

function makeStore() {
  const collections = {};
  function col(name) {
    if (!collections[name]) collections[name] = [];
    return collections[name];
  }
  return { collections, col };
}

const GLOBAL_STORE = makeStore();
let CURRENT_OPENID = 'mock-openid-default';

// 模拟「集合不存在」：真实 CloudBase 里对一个未创建的集合调 where().get() 会抛
// -502005 database collection not exists。本 mock 默认按需自动建集合（方便测试），
// 因此需要一个显式开关来复现"运维漏建集合"这条故障路径。
const FAIL_COLLECTIONS = new Set();

function matchWhere(doc, where) {
  if (!where) return true;
  if (where.__or) return where.__or.some((w) => matchWhere(doc, w));
  if (where.__and) return where.__and.every((w) => matchWhere(doc, w));
  return Object.keys(where).every((key) => {
    const cond = where[key];
    const val = doc[key];
    if (cond && cond.__in) return cond.__in.includes(val);
    if (cond && cond.__neq !== undefined) return val !== cond.__neq;
    if (cond && cond.__regexp) {
      const re = new RegExp(cond.__regexp, cond.__options || '');
      return re.test(String(val || ''));
    }
    return val === cond;
  });
}

function deepClone(o) {
  return o === undefined ? o : JSON.parse(JSON.stringify(o));
}

class QueryBuilder {
  constructor(storeCol, whereCond, colName) {
    this.storeCol = storeCol;
    this.whereCond = whereCond || null;
    this.colName = colName || '';
    this._orderBy = [];
    this._skip = 0;
    this._limit = 1000;
  }
  where(cond) {
    return new QueryBuilder(this.storeCol, cond, this.colName);
  }
  orderBy(field, dir) {
    this._orderBy.push({ field, dir });
    return this;
  }
  skip(n) { this._skip = n; return this; }
  limit(n) { this._limit = n; return this; }
  _assertCollectionExists() {
    if (FAIL_COLLECTIONS.has(this.colName)) {
      throw new Error('collection.get:fail -502005 database collection not exists. ' +
        '[ResourceNotFound] Db or Table not exist: ' + this.colName);
    }
  }
  async get() {
    this._assertCollectionExists();
    let items = this.storeCol.filter((d) => matchWhere(d, this.whereCond));
    for (const ob of this._orderBy.slice().reverse()) {
      items.sort((a, b) => {
        const av = a[ob.field], bv = b[ob.field];
        const cmp = av > bv ? 1 : av < bv ? -1 : 0;
        return ob.dir === 'desc' ? -cmp : cmp;
      });
    }
    items = items.slice(this._skip, this._skip + this._limit);
    return { data: deepClone(items) };
  }
  async count() {
    this._assertCollectionExists();
    const items = this.storeCol.filter((d) => matchWhere(d, this.whereCond));
    return { total: items.length };
  }
  async update({ data }) {
    const items = this.storeCol.filter((d) => matchWhere(d, this.whereCond));
    items.forEach((doc) => Object.assign(doc, deepClone(data)));
    return { stats: { updated: items.length } };
  }
  async remove() {
    const items = this.storeCol.filter((d) => matchWhere(d, this.whereCond));
    items.forEach((doc) => {
      const idx = this.storeCol.indexOf(doc);
      if (idx >= 0) this.storeCol.splice(idx, 1);
    });
    return { stats: { removed: items.length } };
  }
}

class DocRef {
  constructor(storeCol, id) {
    this.storeCol = storeCol;
    this.id = id;
  }
  async get() {
    const doc = this.storeCol.find((d) => d._id === this.id);
    if (!doc) return { data: null };
    return { data: deepClone(doc) };
  }
  async update({ data }) {
    const doc = this.storeCol.find((d) => d._id === this.id);
    if (!doc) throw new Error('doc not found: ' + this.id);
    Object.assign(doc, deepClone(data));
    return { stats: { updated: 1 } };
  }
  async remove() {
    const idx = this.storeCol.findIndex((d) => d._id === this.id);
    if (idx >= 0) this.storeCol.splice(idx, 1);
    return { stats: { removed: idx >= 0 ? 1 : 0 } };
  }
}

class Collection {
  constructor(store, name) {
    this.store = store;
    this.name = name;
  }
  get _col() { return this.store.col(this.name); }
  where(cond) { return new QueryBuilder(this._col, cond, this.name); }
  doc(id) { return new DocRef(this._col, id); }
  async add({ data }) {
    // ⚠️ 行为必须与真实云函数对齐：云函数侧 add() **不会**自动注入 _openid，
    // 只有小程序端 wx.cloud.database() 才会。一旦这里自动补 _openid，
    // 就会出现「云函数写入漏写 _openid → where({_openid}) 查不到」这类 Bug 在本地测试中假绿
    // （auth/toy/user 三处写入都曾漏写，本地 69 用例全绿却真机登录直接 401）。
    // 千万不要改回自动注入；需要归属的集合由业务代码显式写入 _openid。
    const doc = { _id: uuidv4(), ...deepClone(data) };
    this._col.push(doc);
    return { _id: doc._id };
  }
  async get() {
    return { data: deepClone(this._col) };
  }
  async count() {
    return { total: this._col.length };
  }
}

function createDb(store) {
  const command = {
    in: (arr) => ({ __in: arr }),
    neq: (v) => ({ __neq: v }),
    or: (conds) => ({ __or: conds }),
    and: (conds) => ({ __and: conds }),
  };
  return {
    collection: (name) => new Collection(store, name),
    command,
    serverDate: () => new Date().toISOString().slice(0, 19).replace('T', ' '),
    RegExp: ({ regexp, options }) => ({ __regexp: regexp, __options: options }),
  };
}

function createMockCloud(store) {
  return {
    DYNAMIC_CURRENT_ENV: 'mock-env',
    init: () => {},
    database: () => createDb(store),
    getWXContext: () => ({ OPENID: CURRENT_OPENID }),
    // 模拟云存储签名链接签发：真实环境下 status 非 0 表示该文件换取失败，
    // 本 mock 约定传入 fileID 含 'missing' 时返回失败，用于测试回退分支。
    // 注意：真实 wx-server-sdk 的 fileList 只接受 fileID 字符串数组。
    getTempFileURL: ({ fileList }) => {
      const resolved = (fileList || []).map((item) => {
        const fileID = typeof item === 'string' ? item : item && item.fileID;
        if (!fileID || fileID.indexOf('missing') !== -1) {
          return { fileID, status: -1, errMsg: 'file not exist' };
        }
        return {
          fileID,
          status: 0,
          tempFileURL: 'https://mock-cdn.test/' + encodeURIComponent(fileID) + '?sign=mock',
        };
      });
      return Promise.resolve({ fileList: resolved });
    },
  };
}

module.exports = {
  GLOBAL_STORE,
  createMockCloud,
  setCurrentOpenid(openid) { CURRENT_OPENID = openid; },
  getStore() { return GLOBAL_STORE; },
  // 把某个集合标记为"不存在"，用于验证云函数对 -502005 的兜底分支
  failCollection(name, on) {
    if (on === false) FAIL_COLLECTIONS.delete(name);
    else FAIL_COLLECTIONS.add(name);
  },
  resetStore() {
    for (const k of Object.keys(GLOBAL_STORE.collections)) delete GLOBAL_STORE.collections[k];
    FAIL_COLLECTIONS.clear();
  },
};
