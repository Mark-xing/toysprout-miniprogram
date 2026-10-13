# Spec - 童芽 ToySprout C2C 玩具交换平台 · 生产级小程序 v1.0

> 生成日期：2026-08-27
> 基于：MVP 版 `mvp/SPEC.md`（已验证 36/36 回归通过）+ `phase2-design-tokens-v2.md`（设计令牌）+ 本次用户确认的架构方向
> 状态：已确认（用户已选定：微信云开发 + 支付/短信先模拟预留接口 + 云数据库）
> **本文档为 MVP → 生产级小程序改造的唯一权威依据，MVP 版 Web 工程 `toysprout-mvp/` 保留不动，作为设计与业务逻辑参考基准。**

---

## 0. 与 MVP 版的差异总览

| 维度 | MVP 版（已交付） | 生产级小程序版（本次） |
|------|------------------|------------------------|
| 前端 | 原生 HTML/CSS/JS（Web） | **微信小程序原生**（WXML/WXSS/JS，`wx.cloud` API） |
| 后端 | Express + Node 进程 | **微信云开发云函数**（Node.js runtime，按需调用，免运维） |
| 数据库 | better-sqlite3（单机文件） | **微信云数据库**（NoSQL 文档型，`wx-server-sdk`） |
| 认证 | 自建 JWT | **微信云开发内置身份**（`wx-server-sdk` `cloud.getWXContext()` 拿 openid）+ 业务态字段落库 |
| 验证码/短信 | 固定 1234 模拟 | **仍模拟**，接口标准化预留（`sendSmsCode` 云函数封装，替换内部实现即可接入真实短信网关） |
| 支付 | 模拟成功 | **仍模拟**，接口标准化预留（`payService` 封装统一下单/回调，替换内部实现即可接入微信支付） |
| 部署 | `npm start` 本地进程 | **微信开发者工具上传 + 云开发控制台部署云函数** |
| 图片存储 | 图片 URL 输入 | **云存储**（`wx.cloud.uploadFile`），发布时选择本机相册直接上传 |

**不变的部分（直接复用 MVP 已验证的业务逻辑）**：
- 状态机流转规则、服务费/会员计价规则、信用分加减分规则（±5/-10/clamp 0-1000）、AC-01~AC-16 全部验收标准、WarmTrust v2 设计令牌色值。

---

## 1. 产品定义（沿用）

同 MVP 版 `mvp/SPEC.md` §1，不变。

## 2. MVP 范围回顾 → 生产级范围扩展

MVP 版 §2 全部功能保留并升级为小程序原生实现，新增：

| 新增项 | 说明 | 优先级 |
|--------|------|--------|
| 微信授权登录 | `wx.login()` 获取 code → 云函数换取 openid，首次登录引导完善手机号+昵称 | P0 |
| 图片上传至云存储 | 发布玩具时 `wx.chooseMedia` + `wx.cloud.uploadFile`，替代 URL 输入 | P0 |
| 手机号快捷验证 | 预留 `<button open-type="getPhoneNumber">` 组件与云函数解密接口（需小程序具备手机号快速验证能力，视账号资质，无该资质时降级为验证码模式） | P1（可降级） |
| 分包加载 | 主包仅含 Tab 页，子页面分包，控制主包 ≤2MB | P0（生产合规硬要求） |
| 隐私协议合规 | `wx.getPrivacySetting` + 隐私协议弹窗（微信 2023 年后强制要求） | P0（审核硬要求） |
| 订阅消息 | 交换状态变化时 `wx.requestSubscribeMessage`（同意/寄出/收货提醒） | P1 |

## 3. 明确不做（沿用 MVP §3，补充小程序特有排除项）

| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| 真实微信支付/短信网关接入 | 需商户号/短信服务商资质，用户已确认先模拟 | 拿到资质后按预留接口直接替换 |
| 手机号一键登录 | 需小程序具备"手机号快速验证"能力（部分类目/新账号无此权限），先用短信验证码降级方案 | 账号具备资质后升级 |
| Web 端管理后台 | 云开发控制台自带数据管理面板可临时替代 | V1.1（dev-checklist C-12） |
| 分销/裂变增长功能 | 涉及分享合规审查，MVP阶段不做 | V1.1 |

## 4. 技术架构（锁定）

| 层 | 技术 | 版本/说明 | 锁定原因 |
|----|------|-----------|----------|
| 小程序前端 | 微信小程序原生（WXML+WXSS+JS） | 基础库 ≥2.32.3 | 用户要求"真实上线"，原生框架审核最稳妥、性能最优、无需额外构建链 |
| 后端 | 微信云开发云函数（Node.js） | wx-server-sdk ^2.6, Node18 运行时 | 用户已选择，免服务器运维、免域名备案，与小程序同源鉴权最简 |
| 数据库 | 微信云数据库（NoSQL） | wx-server-sdk database API | 与云开发方案配套，免运维，支持数据库安全规则做权限控制 |
| 云存储 | 微信云存储 | wx.cloud.uploadFile | 玩具实拍图片存储，替代 MVP 版 URL 输入 |
| 身份 | 云开发内置 openid 体系 | cloud.getWXContext() | 免自建 JWT，天然与微信生态绑定，云函数调用自动带上下文 |
| 短信/支付 | 预留接口，内部模拟实现 | 见 §9 | 用户当前无资质，代码结构不能阻塞未来接入 |

### 4.1 云函数拆分策略

不采用"一个云函数一个 API 端点"的细粒度拆分（会导致 28 个云函数难以维护），改为按业务域拆分为 **7 个云函数**，每个云函数内部用 `event.action` 分发到具体处理器（类似 MVP 版 Express Router 的思路平移）：

| 云函数名 | 覆盖的 MVP 路由 | action 列表 |
|----------|----------------|-------------|
| `auth` | routes/auth.js | `sendCode` / `login`（微信授权自动登录，不再需要 register，openid 即唯一标识） |
| `user` | routes/me.js, routes/addresses.js | `getProfile` / `verify` / `listAddresses` / `createAddress` / `updateAddress` / `deleteAddress` |
| `toy` | routes/toys.js | `list` / `detail` / `mine` / `create` / `update` / `remove` |
| `swap` | routes/swaps.js | `create` / `detail` / `list` / `respond` / `payFee` / `ship` / `confirmReceipt` / `cancel` / `dispute` / `review` |
| `review` | routes/reviews.js | `listReceived` |
| `membership` | routes/membership.js | `subscribe` / `status` |
| `upload` | 新增（MVP无） | `getUploadToken`（返回云存储路径前缀，实际上传由前端 wx.cloud.uploadFile 直接完成，此云函数仅用于生成规范化路径与做简单校验） |

**调用约定**：小程序前端统一通过 `wx.cloud.callFunction({ name, data: { action, ...payload } })` 调用，云函数内部 `switch(event.action)` 分发，返回统一格式 `{ code, data, message }`（与 MVP 版 API 契约保持一致，前端适配层改动最小）。

## 5. 云函数接口清单（对应 MVP openapi.yaml 全量迁移）

> 所有云函数自动获得 `wx.cloud.getWXContext().OPENID`，无需前端传 token，云函数内用 openid 查询 users 表判定身份。

### 5.1 auth 云函数

| action | 入参 | 出参 | 说明 |
|--------|------|------|------|
| `sendCode` | `{phone}` | `{code, devOnly}` | 开发态固定1234，生产替换为短信网关（见§9.2） |
| `login` | `{phone, code, name?}` | `{user}` | 首次调用自动以 openid 建档（若 users 表无该 openid 记录）；phone+code 用于补全手机号（沿用验证码校验），不返回 token（云函数天然带 openid 上下文） |

### 5.2 user 云函数

| action | 入参 | 出参 | 说明 |
|--------|------|------|------|
| `getProfile` | - | `{user}` | 取当前 openid 对应用户 |
| `verify` | `{name, idCard}` | `{user}` | 同 MVP AC-03，身份证 SHA-256 哈希存储 |
| `listAddresses` | - | `{addresses[]}` | |
| `createAddress` | `{receiverName,phone,province,city,detail,isDefault}` | `{address}` | |
| `updateAddress` | `{id, ...}` | `{address}` | |
| `deleteAddress` | `{id}` | `{}` | |

### 5.3 toy 云函数

| action | 入参 | 出参 | 说明 |
|--------|------|------|------|
| `list` | `{category?,age?,condition?,creditVerified?,keyword?,page?,limit?}` | `{items[],total,page,limit,hasMore}` | 同 MVP AC-05 |
| `detail` | `{id}` | `{toy}` | |
| `mine` | `{status?}` | `{items[]}` | |
| `create` | `{title,description,category,ageRange,conditionLevel,hasSmallParts,images[]}` | `{toy}` | images 为云存储 fileID 数组，同 AC-04 校验≥3张 |
| `update` | `{id, ...}` | `{toy}` | |
| `remove` | `{id}` | `{}` | |

### 5.4 swap 云函数（状态机核心，逐 action 对应 MVP swaps.js 全部端点）

| action | 入参 | 出参 | 说明 |
|--------|------|------|------|
| `create` | `{targetToyId,myToyId,message}` | `{swap}` | 同 AC-06 |
| `list` | `{status?}` | `{items[]}` | |
| `detail` | `{id}` | `{swap,myToy,targetToy,counterpartAddress}` | 同 AC-16 地址可见性规则 |
| `respond` | `{id,accept}` | `{swap}` | 同 AC-07 |
| `payFee` | `{id}` | `{amountPaid,isMember}` | 同 AC-10/AC-11 |
| `ship` | `{id,trackingNo}` | `{swap}` | 同 AC-08 |
| `confirmReceipt` | `{id}` | `{swap}` | 同 AC-09 |
| `cancel` | `{id}` | `{swap}` | |
| `dispute` | `{id,type,description,evidenceImages}` | `{dispute}` | 同 AC-15 |
| `review` | `{id,rating,tags,comment}` | `{review,creditDelta}` | 同 AC-12/AC-13 |

### 5.5 review 云函数

| action | 入参 | 出参 |
|--------|------|------|
| `listReceived` | `{page?,limit?}` | `{items[],total,page,limit,hasMore}` |

### 5.6 membership 云函数

| action | 入参 | 出参 | 说明 |
|--------|------|------|------|
| `subscribe` | - | `{isMember,memberExpiresAt,amountPaid}` | 同 AC-14；预留真实支付切点见§9.1 |
| `status` | - | `{isMember,memberExpiresAt}` | |

### 5.7 upload 云函数

| action | 入参 | 出参 | 说明 |
|--------|------|------|------|
| `getUploadPath` | `{ext}` | `{cloudPath}` | 生成规范化云存储路径（如 `toys/{openid}/{timestamp}.{ext}`），实际上传前端直接调 `wx.cloud.uploadFile` |

## 6. 云数据库集合设计（对应 MVP schema.sql 7 张表）

> 微信云数据库为文档型 NoSQL，字段设计沿用 SQL 版语义，去除外键约束（应用层校验），JSON 数组字段可直接存原生数组（无需 JSON.stringify）。所有集合默认开启**数据库安全规则**：仅创建者可读写自己的记录，`toys`/`reviews` 公开读、仅本人写（详见 §8）。

### 6.1 `users`

```js
{
  _id: "自动生成",
  _openid: "微信自动写入，作为唯一身份标识（替代 MVP 版 users.id）",
  phone: "13800000001",
  name: "妈妈·小雨",
  idCardHash: "sha256哈希，可空",
  idCardMasked: "110101********1234，可空",
  isVerified: false,
  creditScore: 500,          // 云数据库无生成列，creditLevel 由云函数计算后一并返回，不落库存储避免双写不一致
  isMember: false,
  memberExpiresAt: null,     // ISO 字符串或 null
  city: null,
  createdAt: "云数据库 serverDate()",
  updatedAt: "云数据库 serverDate()"
}
```

> **关键差异说明**：MVP 版用 SQLite 生成列（`credit_level GENERATED ALWAYS AS`）避免信用等级双口径问题；云数据库无生成列能力，改为**云函数统一计算**：任何返回 user 对象的云函数出口，都调用共享工具函数 `deriveCreditLevel(creditScore)` 实时计算，不落库存储 creditLevel 字段，从根本上杜绝双口径（比 MVP 方案更彻底）。

### 6.2 `addresses`

```js
{
  _id, _openid,
  receiverName, phone, province, city, detail,
  isDefault: false,
  createdAt, updatedAt
}
```

### 6.3 `toys`

```js
{
  _id, _openid,   // _openid 即 ownerId
  title, description,
  category: "building_blocks",  // 枚举同 MVP
  ageRange: "3-6",
  conditionLevel: "9new",       // 枚举同 MVP
  hasSmallParts: false,
  images: ["cloud://xxx/toys/openid/xxx.jpg"],  // 云存储 fileID 数组，>=3
  city: null,
  status: "available",          // available/swapping/exchanged/removed
  createdAt, updatedAt
}
```

### 6.4 `swaps`

```js
{
  _id,
  initiatorOpenid, targetOpenid,
  myToyId, targetToyId,
  message: "",
  status: "requested",  // 同 MVP 8 态枚举
  serviceFeeAmountInitiator: 190,  // 分
  serviceFeeAmountTarget: 0,
  serviceFeePaidByInitiator: false,
  serviceFeePaidByTarget: false,
  initiatorTrackingNo: null,
  targetTrackingNo: null,
  initiatorReceivedAt: null,
  targetReceivedAt: null,
  createdAt, updatedAt
}
```

### 6.5 `reviews`

```js
{
  _id,
  swapId, reviewerOpenid, revieweeOpenid,
  rating: 5, tags: [], comment: "",
  createdAt
}
// 唯一性约束（swapId+reviewerOpenid 不可重复评价）：云数据库无 UNIQUE 索引，
// 由云函数在写入前先 count 查询校验，事务内二次确认（见 §7.2）
```

### 6.6 `disputes`

```js
{
  _id,
  swapId, reporterOpenid,
  type: "item_mismatch", description: "",
  evidenceImages: [],
  status: "pending",
  createdAt, updatedAt
}
```

### 6.7 `credit_logs`

```js
{
  _id,
  userOpenid, delta: 5, reason: "收到好评",
  relatedSwapId: null,
  createdAt
}
```

## 7. 关键业务逻辑迁移说明（SQLite → 云数据库事务差异）

### 7.1 事务处理

MVP 版用 `better-sqlite3` 的 `db.transaction()` 保证原子性（如发起交换时两个玩具状态同时改为 swapping）。云数据库**不支持跨文档事务**（云开发数据库事务仅在同一批次操作内，且有并发限制），改为以下策略：

- **发起交换**（`swap.create`）：先创建 swap 记录（status=requested），再依次更新两个 toy 状态；若第二步失败，云函数捕获异常后补偿回滚第一步（删除刚创建的 swap）。
- **状态机流转**（`respond`/`ship`/`confirmReceipt`）：单条 swap 记录内的字段更新用云数据库 `update` 的原子字段操作（`db.command.set`），配合前置 `status` 条件查询（`where: {status: 'requested'}` 命中才更新），天然避免并发覆写（类似乐观锁）。
- **互评唯一性**（`review`）：写入前先 `count({swapId, reviewerOpenid})` 查询，非 0 直接返回 409；极端并发下允许极小概率的重复写入风险（MVP 阶段可接受，V1.1 可加云函数级分布式锁或迁移到支持事务的云数据库版本）。

### 7.2 权限与身份

MVP 版用 JWT 中间件解析 `req.user`；生产版每个云函数入口统一调用：

```js
const wxContext = cloud.getWXContext();
const openid = wxContext.OPENID;
const userRecord = await db.collection('users').where({ _openid: openid }).get();
```

若 `userRecord` 为空（新用户首次调用非 auth.login 的云函数），返回 401 引导前端跳转登录页——与 MVP 版 401 自动跳转逻辑一致。

## 8. 数据库安全规则（权限控制，替代 MVP 版应用层 403 校验的第一道防线）

> 云开发控制台配置，规则示例（JSON）：

```json
// users 集合：仅本人可读写自己的记录
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
// toys 集合：所有人可读，仅创建者可写
{
  "read": true,
  "write": "doc._openid == auth.openid"
}
// swaps 集合：仅交换双方可读写
{
  "read": "doc.initiatorOpenid == auth.openid || doc.targetOpenid == auth.openid",
  "write": "doc.initiatorOpenid == auth.openid || doc.targetOpenid == auth.openid"
}
// addresses 集合：仅本人可读写
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
// reviews / disputes / credit_logs：禁止客户端直接写（must go through 云函数），
// 云函数使用管理员权限（cloud.database() 默认跳过安全规则），前端 SDK 直连仅允许只读
{
  "read": "doc.reviewerOpenid == auth.openid || doc.revieweeOpenid == auth.openid",
  "write": false
}
```

**纪律**：所有写操作必须经云函数（管理员权限跳过安全规则），前端小程序 SDK **不直连数据库写入**，仅用于极少数只读场景优化（如详情页直接查 toys 集合，非必须，MVP阶段统一走云函数保持一致性，暂不引入直连读优化）。

## 9. 支付/短信预留接口标准化（生产切点）

### 9.1 支付预留接口

`cloudfunctions/swap/services/payService.js`：

```js
// 统一支付服务接口，当前为模拟实现；接入真实微信支付时只需替换 mockPay 为 wxPay 实现，
// 调用方（swap 云函数 payFee action）无需改动。
async function charge({ openid, amountFen, description, outTradeNo }) {
  // TODO(生产接入)：调用微信支付统一下单 API，返回 prepay_id 供前端 wx.requestPayment 拉起支付
  // 当前 MVP/生产预留阶段：直接模拟支付成功
  return { success: true, amountFen, mock: true };
}
module.exports = { charge };
```

`membership` 云函数的 `subscribe` action 同样调用该 `payService.charge`，两处支付场景统一切点，接入真实支付时改一处生效两处。

### 9.2 短信预留接口

`cloudfunctions/auth/services/smsService.js`：

```js
// 统一短信服务接口，当前为模拟实现（固定验证码1234）；接入真实短信网关（如腾讯云 SMS）时
// 只需替换 mockSend 为真实调用，调用方（auth 云函数 sendCode action）无需改动。
async function sendVerificationCode({ phone }) {
  // TODO(生产接入)：调用腾讯云短信 API，生成随机6位码，存入云数据库 sms_codes 集合（含5分钟过期）
  // 当前模拟阶段：固定返回 1234，不做真实发送
  return { code: '1234', mock: true };
}
module.exports = { sendVerificationCode };
```

## 10. 小程序页面清单（app.json 路由设计）

> 主包仅含 Tab 页与登录页（控制包体积 ≤2MB），其余页面分包 `packageSwap`（交换相关）与 `packageUser`（用户相关）。

```json
{
  "pages": [
    "pages/login/login",
    "pages/discover/discover",
    "pages/publish/publish",
    "pages/mine/mine"
  ],
  "tabBar": {
    "list": [
      { "pagePath": "pages/discover/discover", "text": "发现" },
      { "pagePath": "pages/publish/publish", "text": "发布" },
      { "pagePath": "pages/mine/mine", "text": "我的" }
    ]
  },
  "subPackages": [
    {
      "root": "packageToy",
      "pages": ["detail/detail"]
    },
    {
      "root": "packageSwap",
      "pages": ["swap/swap", "orders/orders", "order-detail/order-detail"]
    },
    {
      "root": "packageUser",
      "pages": ["addresses/addresses", "membership/membership", "verify/verify"]
    }
  ]
}
```

| 页面 | 路径 | 对应 MVP Web 页面 | 云函数依赖 |
|------|------|-------------------|-----------|
| 登录 | pages/login/login | register.html | auth |
| 发现（Tab1） | pages/discover/discover | explore.html | toy |
| 发布（Tab2） | pages/publish/publish | publish.html | toy, upload |
| 我的（Tab3） | pages/mine/mine | profile.html | user, review |
| 玩具详情 | packageToy/detail/detail | toy-detail.html | toy |
| 发起交换 | packageSwap/swap/swap | swap.html | toy, swap |
| 订单列表 | packageSwap/orders/orders | orders.html | swap |
| 订单详情 | packageSwap/order-detail/order-detail | order-detail.html | swap |
| 地址管理 | packageUser/addresses/addresses | addresses.html | user |
| 会员中心 | packageUser/membership/membership | membership.html | membership |
| 实名认证 | packageUser/verify/verify | profile.html（认证卡） | user |

> 落地页（index.html）在小程序场景无需保留——小程序打开即直接进入 Tab 页（发现页），符合小程序交互惯例，去除营销落地页壳层。

## 11. 设计 Token 迁移（CSS 变量 → WXSS 变量）

WXSS 支持 CSS 变量语法与普通 CSS 基本一致，`public/styles.css` 中的 `:root { --color-xxx: ... }` 可直接迁移到小程序 `app.wxss` 的 `page { --color-xxx: ... }`（小程序不支持 `:root`，用 `page` 选择器代替全局作用域）。尺寸单位从 `px` 统一改为 `rpx`（750rpx=屏幕宽度），比例换算：`1px ≈ 2rpx`（以 375px 设计基准）。

## 12. 验收标准（沿用 MVP AC-01~AC-16，新增小程序特有验收项）

| 编号 | 功能 | EARS 格式验收标准 | 优先级 |
|------|------|-------------------|--------|
| AC-01~AC-16 | 核心业务规则 | 同 MVP 版 SPEC.md §9，验收标准不变，仅执行环境从 Express API 改为云函数调用 | P0 |
| AC-17 | 微信登录 | While 用户首次打开小程序且未授权，系统**必须**引导完成登录（验证码方式）并在 users 集合创建以 openid 为准的档案 | P0 |
| AC-18 | 图片上传 | While 用户在发布页选择图片，系统**必须**通过 wx.cloud.uploadFile 上传至云存储并获得 fileID，发布时传入 fileID 数组（非本地临时路径） | P0 |
| AC-19 | 隐私协议 | If 用户未同意隐私协议，系统**必须**在小程序启动时弹出隐私协议授权弹窗并阻塞核心功能直至同意 | P0（审核硬要求） |
| AC-20 | 包体积 | While 构建小程序包，主包大小**必须** ≤2MB，总包 ≤20MB | P0（审核硬要求） |
| AC-21 | 数据库权限 | If 前端小程序 SDK 尝试直接写入 swaps/reviews/credit_logs 集合，云数据库安全规则**必须**拒绝该请求（write:false 或 openid 校验不通过） | P0 |

## 13. 端到端验证步骤

```bash
# 1. 安装微信开发者工具（CLI 或 GUI），登录小程序账号

# 2. 云函数本地依赖安装（每个云函数目录下）
cd cloudfunctions/auth && npm install
cd cloudfunctions/user && npm install
cd cloudfunctions/toy && npm install
cd cloudfunctions/swap && npm install
cd cloudfunctions/review && npm install
cd cloudfunctions/membership && npm install
cd cloudfunctions/upload && npm install

# 3. 微信开发者工具中：右键各云函数目录 → "上传并部署：云端安装依赖"

# 4. 云开发控制台：数据库 → 创建 7 个集合（users/addresses/toys/swaps/reviews/disputes/credit_logs）
#    并按 §8 配置安全规则

# 5. 微信开发者工具预览/真机调试，核心成功流：
#    登录 → 发布玩具（选图片真实上传） → 发现页浏览 → 发起交换 → 对方（另一测试账号）同意
#    → 双方支付服务费（模拟）→ 填运单 → 确认收货 → 互评 → 查看信用分变化

# 6. 提交审核前检查清单见 production/RELEASE-CHECKLIST.md
```

## 14. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-08-27 | 生产级 Spec v1.0 生成 | 用户确认微信小程序真实上线，架构方向：云开发+云数据库，支付短信先模拟预留接口 | 全项目架构升级 |

---
*—— 项目总监 大湾区靓仔（韦优），基于已验证的MVP业务逻辑与已确认的架构选型，产出生产级Spec，用户注册小程序账号期间可并行推进代码开发。*
