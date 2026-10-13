# Spec - 童芽 ToySprout C2C 玩具交换平台 · Web MVP v1.0

> 生成日期：2026-08-26
> 基于：`phase1-requirements-v2.md`（PRD） + `phase2-design-tokens-v2.md`（设计令牌） + `business-decisions-pending.md`（业务规则决策） + `dev-checklist.md`（开发路线）+ `exchange/web/`（8页高保真原型，审查 21/25 PASS）
> 状态：已确认（用户已选定：可运行 Web MVP + 轻量真实后端 + dev-checklist 的 MVP 必须项全集）

---

## 1. 产品定义

- **一句话描述**：家长之间互换闲置玩具的 C2C 平台，一换一互相邮寄，平台收取撮合服务费。
- **目标用户**：25–40 岁家长（孩子 0–10 岁），C2C 双向角色（既是发布者也是浏览者）。
- **核心问题**：玩具堆积浪费 + 买新太贵；用闲置换心动，零现金成本。

## 2. MVP 范围（锁定 — 不在此列表的功能一律不做）

| 优先级 | 功能 | 验收标准摘要 | 来源 |
|--------|------|-------------|------|
| P0 | 注册/登录 | 手机号 + 验证码（本地模拟发送，验证码固定回显于开发态） | dev-checklist C-02/C-19 |
| P0 | 实名认证 | 姓名 + 身份证号提交，格式校验通过后标记「已实名」 | B-10 / C-27 |
| P0 | 发布玩具 | 上传≥3图（URL/本地文件）、成色四级必选、适龄必选、小零件警告可选、描述 | 需求 §1.5-1 / C-05 |
| P0 | 发现浏览+筛选 | 品类/年龄/成色/仅信用达标 四维筛选；玩具卡含成色标签+主人信用徽章+认证标识 | 需求 §2.1 |
| P0 | 玩具详情 | 图集、成色/安全标签、作者信用卡、服务费保障条、发起交换 CTA | 令牌 §11.2 |
| P0 | 发起交换 | 选择「我的玩具」交换池 + 留言 + 运费协商文案 + 服务费保障条(¥1.9/会员免) | B-01/B-05 |
| P0 | 交换订单状态机 | 五态：已发起→对方已同意→双方邮寄中→已收货→已互评；双轨运单号录入 | 令牌 §6.4 |
| P0 | 确认收货 | 双方各自确认收货动作，驱动状态机前进 | 需求 §1.5-6 |
| P0 | 互评+信用分 | 收货后5星+文字+快捷标签评价，提交后信用分按规则更新，四级信用徽章 | B-03/B-07 |
| P0 | 会员订阅（模拟支付） | ¥10/月订阅，模拟支付成功后立即生效，服务费联动免单 | B-02 |
| P0 | 服务费（模拟支付） | 非会员每单¥1.9，双方发起快递时各自模拟支付 | B-01 |
| P0 | 地址管理 | 收货地址+寄件信息 CRUD，交换确认后才可见对方地址 | C-26 |
| P1 | 纠纷提交 | 订单详情内「发起纠纷」表单（类型+说明+举证图片URL），提交后订单转「纠纷仲裁」态 | C-24（至少提交版） |
| P1 | 我的主页 | 信用分概览+升级进度条、认证状态、我的玩具、我的交换记录、评价记录 | 令牌 §11.2 |
| P0 | 落地页 | 品牌主张+如何交换三步+信任三要素展示+会员对照（沿用原型，接入真实注册CTA） | 原型 index.html |

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| 微信登录/小程序原生开发 | MVP 先验证 Web 全链路，wxml/wxss 转换是独立工程量 | dev-checklist C-01，V1.1 |
| 真实微信支付/物流查询 API | 无商户资质与真实物流账号，MVP 用模拟支付+手动填运单号 | 上线前接入，C-06/C-07 |
| 推荐算法 | MVP 用「时间+信用+同城占位」排序 | V1.1（dev-checklist C-15） |
| 收藏/心愿单、通知中心 | 非核心闭环，MVP 可省略 | V1.1（C-22/C-23） |
| 完整仲裁流程（举证期/裁决/扣分自动化） | 仅做「提交纠纷」入口，人工介入判定不做自动化 | V1.1（C-Ⅲ 后端风控） |
| Web 后台管理系统 | 用直接查 SQLite/简单管理脚本代替 | V1.1（C-12） |
| 聊天实时通讯 | 原型有聊天页但非核心验证闭环，MVP 先不做即时消息，用交换留言代替 | V1.1（C-04） |

## 4. 技术架构（锁定 — 含版本锚定）

> 架构师选型：轻量级、零外部依赖、可在本地一键启动的全栈方案，服务于「可运行 Web MVP + 轻量真实后端」诉求。

| 层 | 技术 | 版本 | 锁定原因 |
|----|------|------|----------|
| 运行时 | Node.js | 22.22.2（管理版） | 环境已提供，无需额外安装 |
| 后端框架 | Express | ^4.19 | 轻量、零构建步骤、路由清晰 |
| 数据库 | better-sqlite3 | ^11 | 文件型数据库，零配置持久化，同步API易维护事务 |
| 认证 | JWT（jsonwebtoken） | ^9 | 无状态、前后端分离友好 |
| 密码/验证码 | 内置模拟（验证码固定规则+开发态回显） | - | 无短信网关，功能等价模拟 |
| 前端 | 原生 HTML/CSS/JS（沿用 exchange/web 原型 + 新增 app.js 数据层） | - | 复用已通过设计审查（21/25 PASS）的原型资产，最大化保留设计投入 |
| 静态资源服务 | Express static | - | 前后端同源部署，避免 CORS 复杂度 |
| 部署 | 本地 Node 进程（`npm start`），可选 CloudStudio/EdgeOne 静态+API 分离部署 | - | MVP 阶段优先本地可运行验证 |

## 5. API 端点清单（锁定）

Base path: `/api/v1`，认证方式：`Authorization: Bearer <JWT>`（除注册/登录/公开浏览接口外均需要）

| Method | Path | 功能 | 认证 |
|--------|------|------|------|
| POST | /auth/register | 手机号+验证码注册（验证码固定为 `1234`，开发态） | 否 |
| POST | /auth/login | 手机号+验证码登录 | 否 |
| POST | /auth/send-code | 模拟发送验证码（返回固定码，仅开发态） | 否 |
| GET | /me | 当前用户信息（信用分/认证状态/会员状态） | 是 |
| POST | /me/verify | 提交实名认证（姓名+身份证号） | 是 |
| GET | /addresses | 我的地址列表 | 是 |
| POST | /addresses | 新增地址 | 是 |
| PUT | /addresses/:id | 编辑地址 | 是 |
| DELETE | /addresses/:id | 删除地址 | 是 |
| GET | /toys | 玩具列表（筛选：category/age/condition/creditVerified/keyword，分页） | 否 |
| GET | /toys/:id | 玩具详情（含作者信用信息、互评摘要） | 否 |
| POST | /toys | 发布玩具 | 是 |
| GET | /toys/mine | 我的玩具（在换/已换） | 是 |
| PUT | /toys/:id | 编辑我的玩具 | 是 |
| DELETE | /toys/:id | 下架我的玩具 | 是 |
| POST | /swaps | 发起交换（targetToyId+myToyId+message） | 是 |
| GET | /swaps | 我的交换订单列表（按状态分组） | 是 |
| GET | /swaps/:id | 交换订单详情 | 是 |
| POST | /swaps/:id/respond | 对方同意/拒绝交换意向 | 是 |
| POST | /swaps/:id/ship | 填写运单号（发起己方邮寄） | 是 |
| POST | /swaps/:id/confirm-receipt | 确认收货（己方） | 是 |
| POST | /swaps/:id/cancel | 取消交换（仅未成交状态可取消） | 是 |
| POST | /swaps/:id/dispute | 提交纠纷（类型+说明+举证图片URL） | 是 |
| POST | /swaps/:id/pay-fee | 模拟支付服务费（会员自动¥0） | 是 |
| POST | /swaps/:id/review | 提交互评（星级+文字+快捷标签），驱动信用分更新 | 是 |
| GET | /reviews/received | 我收到的评价列表 | 是 |
| POST | /membership/subscribe | 模拟订阅会员（¥10/月，立即生效30天） | 是 |
| GET | /membership/status | 会员状态查询 | 是 |

## 6. 数据库表清单（锁定，SQLite）

| 表名 | 核心字段 | 索引 | 关联 |
|------|----------|------|------|
| users | id, phone(unique), name, id_card, is_verified, credit_score(默认500), credit_level, is_member, member_expires_at, created_at | idx_phone | - |
| addresses | id, user_id, receiver_name, phone, province, city, detail, is_default | idx_user_id | user_id→users.id |
| toys | id, owner_id, title, description, category, age_range, condition_level, has_small_parts, images(JSON数组), status(available/swapping/exchanged/removed), created_at | idx_owner_id, idx_status | owner_id→users.id |
| swaps | id, initiator_id, target_owner_id, my_toy_id, target_toy_id, message, status(requested/accepted/shipping/received/reviewed/cancelled/disputed), service_fee_amount, service_fee_paid_by_initiator, service_fee_paid_by_target, initiator_tracking_no, target_tracking_no, initiator_received_at, target_received_at, created_at | idx_initiator, idx_target, idx_status | my_toy_id/target_toy_id→toys.id |
| reviews | id, swap_id, reviewer_id, reviewee_id, rating(1-5), tags(JSON数组), comment, created_at | idx_swap_id, idx_reviewee_id | swap_id→swaps.id |
| disputes | id, swap_id, reporter_id, type, description, evidence_images(JSON数组), status(pending/resolved), created_at | idx_swap_id | swap_id→swaps.id |
| credit_logs | id, user_id, delta, reason, created_at | idx_user_id | user_id→users.id |

## 7. 页面清单（锁定，基于 exchange/web 原型改造）

| 页面 | 路由(文件) | 核心组件 | 对应 API | 数据来源 |
|------|------|----------|----------|----------|
| 落地页 | index.html | 品牌主张/三步说明/信任要素/会员对照 | - | 静态，CTA跳转register.html |
| 注册/登录 | register.html（新增） | 手机号+验证码表单 | /auth/send-code, /auth/register, /auth/login | 动态 |
| 发现玩具 | explore.html | 筛选栏+玩具卡网格 | /toys | 动态替换原静态10条示例 |
| 玩具详情 | toy-detail.html | 图集/成色/作者信用卡/发起交换CTA | /toys/:id | 动态 |
| 发起交换 | swap.html | 交换池单选+留言+服务费保障条 | /toys/mine, /swaps | 动态 |
| 交换订单列表 | orders.html | 按状态分组卡片+状态机mini | /swaps | 动态 |
| 交换订单详情 | order-detail.html | 完整状态机/双轨运单/确认收货/评价/纠纷入口 | /swaps/:id, /swaps/:id/ship, /confirm-receipt, /pay-fee, /review, /dispute | 动态 |
| 我的主页 | profile.html | 信用分卡/认证状态/我的玩具/地址管理入口 | /me, /toys/mine, /addresses | 动态 |
| 地址管理 | addresses.html（新增） | 地址列表CRUD表单 | /addresses | 动态 |
| 会员订阅 | membership.html | 权益对照+免服务费计算器+订阅CTA | /membership/subscribe, /membership/status | 动态 |
| 发布玩具 | publish.html（新增，取小程序端publish.html视觉改造为Web） | 图片URL输入(≥3)+成色/适龄/小零件表单 | POST /toys | 动态 |

## 8. 设计 Token（锁定）

- **色彩/字体/间距/圆角/阴影**：完整沿用 `phase2-design-tokens-v2.md` §2–4 CSS 变量，前端直接引用现有 `exchange/web/styles.css`，不新增/不修改令牌值。
- **图标库**：沿用原型内联 SVG symbol 方案（见 `explore.html` 头部 `<defs>`），全站统一，不新增图标库依赖，不使用 emoji。
- **主题**：浅色 WarmTrust v2（暖米白背景 + 奶油暖黄主色 + 珊瑚橙CTA + 鼠尾草绿信任语义）。
- **对标品牌**：Airbnb 信任体系 × Notion 组件纪律 × Stripe 规则透明。

## 9. 验收标准（锁定，EARS 格式）

| 编号 | 功能 | EARS 格式验收标准 | 优先级 |
|------|------|-------------------|--------|
| AC-01 | 注册 | While 用户提交合法手机号+正确验证码，系统**必须**创建账户并返回 JWT | P0 |
| AC-02 | 注册 | If 手机号已存在，系统**必须**直接登录返回JWT而非报错阻断（简化：手机号即账户，验证码通过即登录/自动注册） | P0 |
| AC-03 | 实名认证 | While 身份证号格式非18位合法校验，系统**必须**拒绝并返回错误 | P0 |
| AC-04 | 发布玩具 | If 图片数量<3 或未选成色/适龄，系统**必须**拒绝发布并提示缺失字段 | P0 |
| AC-05 | 发现筛选 | While 用户选择「仅信用达标」筛选，系统**必须**只返回作者信用分≥800的玩具 | P0 |
| AC-06 | 发起交换 | While 用户选择自己的在换玩具发起交换，系统**必须**创建status=requested的订单并通知目标玩具下架为swapping | P0 |
| AC-07 | 状态机 | While 目标方调用/respond同意，系统**必须**将订单status从requested转为accepted | P0 |
| AC-08 | 状态机 | While 双方均填写运单号，系统**必须**将订单status转为shipping | P0 |
| AC-09 | 收货确认 | While 双方均确认收货，系统**必须**将订单status转为received | P0 |
| AC-10 | 服务费 | If 用户非会员，系统**必须**在发起邮寄时要求支付¥1.9服务费才可继续 | P0 |
| AC-11 | 服务费 | If 用户是会员（member_expires_at未过期），系统**必须**服务费显示¥0且无需支付即可继续 | P0 |
| AC-12 | 互评信用分 | While 用户提交评价rating≥4，系统**必须**为被评价人信用分+5并记录credit_logs | P0 |
| AC-13 | 互评信用分 | While 用户提交评价rating≤2，系统**必须**为被评价人信用分-10并记录credit_logs | P0 |
| AC-14 | 会员订阅 | While 用户模拟支付¥10成功，系统**必须**将is_member置true且member_expires_at设为30天后 | P0 |
| AC-15 | 纠纷 | While 用户在进行中订单提交纠纷，系统**必须**将订单status转为disputed并冻结状态机推进 | P1 |
| AC-16 | 地址 | If 未确认交换（status<accepted），系统**必须**不向对方暴露收货地址详情 | P0 |

## 10. 边界与约束

- 不支持 IE 浏览器；桌面优先，兼容原型已有 1024/768/375 三档响应式。
- 验证码为开发态模拟：固定值 `1234`，接口响应中直接返回（生产替换为真实短信网关）。
- 支付为模拟：调用即视为支付成功，不接入真实支付网关。
- 单机 SQLite 文件数据库，未做主从/备份，仅用于 MVP 验证，非生产级数据可靠性保证。
- 图片上传简化为「图片URL输入」（不做真实文件上传/OSS存储），保持零依赖快速验证。

## 11. 内嵌已知坑（从 dev-checklist 拉取）

| 坑 | 说明 | 修法 |
|----|------|------|
| A-01 会员服务费双口径 | 原型曾出现静态硬编码会员态 | MVP 后端按真实 is_member 字段动态判断，前端不再硬编码 |
| A-06 信用分时间线矛盾 | 原型曾出现 862→867 与 862→866 并存 | MVP 用 credit_logs 表作唯一信用分变化来源，前端从该表渲染 |
| A-15 静态示例数据 | 原型玩具/信用分为静态 | MVP 首次启动运行 seed 脚本注入示例数据，之后全部走真实API与DB |

## 12. 端到端验证步骤

```bash
# 1. 安装依赖
cd toysprout-mvp && npm install

# 2. 启动（含DB自动建表+seed示例数据）
npm start   # 等待 "ToySprout MVP running on http://localhost:4000"

# 3. 核心成功流
curl -X POST http://localhost:4000/api/v1/auth/send-code -H "Content-Type: application/json" -d '{"phone":"13800000001"}'
curl -X POST http://localhost:4000/api/v1/auth/register -H "Content-Type: application/json" -d '{"phone":"13800000001","code":"1234","name":"妈妈·小雨"}'
# 断言：返回 200 + token

# 4. 关键错误流
curl -X POST http://localhost:4000/api/v1/auth/register -H "Content-Type: application/json" -d '{"phone":"13800000001","code":"9999","name":"x"}'
# 断言：返回 400 验证码错误

# 5. 浏览器验证
open http://localhost:4000/exchange/web/index.html
```

## 13. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-08-26 | 初版 Spec 生成 | 用户确认三方向（Web MVP/轻量真实后端/dev-checklist必须项） | 全项目 |

---
*—— 项目总监 大湾区靓仔（韦优），基于已确认的PRD v2/设计令牌v2/业务规则决策，直接生成Spec，无需重走Phase 0-1调研。*
