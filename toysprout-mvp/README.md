# 童芽 ToySprout · C2C 玩具交换平台 Web MVP

> 基于设计原型专家团已确认的 PRD v2 / 设计令牌 v2 / 业务规则决策，由 MVP 开发专家团工程化落地。
> 技术栈：Node.js 22 + Express 4 + better-sqlite3 + 原生 HTML/CSS/JS（零前端框架、零 CDN 依赖）
> 启动端口：4000（可用环境变量 PORT 覆盖）

---

## 一、快速开始

```bash
cd toysprout-mvp
npm install        # 已安装可跳过
npm start          # 启动后自动建表 + 注入种子数据（4 用户 / 10 玩具）
```

浏览器打开：**http://localhost:4000/**（自动跳转落地页；登录后进入发现页）

**演示账号（开发态验证码统一为 `1234`）：**

| 手机号 | 身份 | 信用 | 会员 |
|--------|------|------|------|
| 13800000001 | 小雨妈妈 | 862 信赖 | 否 |
| 13800000002 | 阿哲爸爸 | 985 优选 | **是**（免服务费） |
| 13800000003 | 橙子妈妈 | 560 新芽 | 否 |
| 13800000004 | 大鹏爸爸 | 720 成长 | 否 |

登录页有一键填入演示账号按钮，或注册任意手机号（新用户信用分 500 起）。

---

## 二、MVP 功能清单（对照 Spec 验收标准）

| 模块 | 状态 | 验证方式 |
|------|------|----------|
| 注册/登录（手机号+验证码，自动注册） | ✅ | 登录页 / `POST /api/v1/auth/register` |
| 实名认证（姓名+身份证号，哈希脱敏存储） | ✅ | 我的主页认证卡 |
| 发布玩具（≥3 图 URL / 品类 / 适龄 / 成色 / 小零件） | ✅ | 发布页 |
| 发现浏览 + 多维筛选（品类/年龄/成色/仅信用达标/关键词） | ✅ | 发现页 |
| 玩具详情（图集/作者信用卡/互评摘要/安全标签） | ✅ | 详情页 |
| 发起交换（交换池单选 + 留言 + 服务费保障条） | ✅ | 发起交换页 |
| 交换状态机（发起→同意→邮寄→收货→互评 / 取消 / 拒绝 / 纠纷） | ✅ | 订单详情页 |
| 服务费 ¥1.9（双方发起快递时收；会员免单） | ✅ | 订单操作区 |
| 双轨运单号录入 | ✅ | 订单详情页 |
| 确认收货（双方） | ✅ | 订单详情页 |
| 互评（5 星+标签+文字）→ 信用分动态更新（好评+5/差评-10） | ✅ | 订单详情评价浮层 |
| 信用分级（500新芽/600成长/800信赖/950优选） | ✅ | 我的主页 |
| 会员订阅（模拟支付 ¥10/月，续订顺延） | ✅ | 会员页 |
| 地址管理 CRUD | ✅ | 地址管理页 |
| 纠纷提交（类型+描述，订单转 disputed） | ✅ | 订单详情页 |
| AC-16 对方地址仅 accepted 后可见 | ✅ | 订单详情页 |

## 三、项目结构

```
toysprout-mvp/
├── src/
│   ├── server.js              # 入口：装配路由 + 静态托管 + 健康检查
│   ├── db/
│   │   ├── schema.sql         # 7 张表（含索引/外键/触发器/生成列）
│   │   ├── seed.js            # 种子数据（4 用户/10 玩具/地址/信用日志）
│   │   └── index.js           # 连接初始化 + 自动建表 + 自动 seed
│   ├── middleware/
│   │   ├── auth.js            # JWT 签发与校验
│   │   └── error-handler.js   # 统一错误格式 {code,data,message}
│   └── routes/
│       ├── auth.js            # send-code / register(upsert) / login
│       ├── me.js              # 用户信息 / 实名认证
│       ├── toys.js            # 发布 / 浏览 / 筛选 / 我的 / 编辑 / 下架
│       ├── swaps.js           # 状态机全链路 + 服务费 + 运单 + 收货 + 纠纷 + 互评
│       ├── reviews.js         # 收到的评价
│       ├── addresses.js       # 地址 CRUD
│       └── membership.js      # 订阅 / 状态
├── public/                    # 前端（设计令牌 styles.css + 11 页面 + app.js 数据层）
│   ├── index.html             # 落地页（动态精选玩具）
│   ├── register.html          # 登录/注册（新增）
│   ├── explore.html           # 发现玩具（筛选/搜索真实生效）
│   ├── toy-detail.html        # 玩具详情
│   ├── swap.html              # 发起交换
│   ├── orders.html            # 订单列表
│   ├── order-detail.html      # 订单详情（状态机/操作/评价/纠纷）
│   ├── profile.html           # 我的主页（信用/认证/玩具/评价）
│   ├── publish.html           # 发布玩具（新增）
│   ├── membership.html        # 会员订阅
│   ├── addresses.html         # 地址管理（新增）
│   ├── app.js                 # API 封装/登录态/toast/渲染工具
│   └── styles.css             # WarmTrust v2 设计令牌（唯一权威）
└── docs/
    └── openapi.yaml           # 22 路径 / 28 端点 / 17 schema
```

## 四、API 一览（完整契约见 docs/openapi.yaml）

Base: `/api/v1`，认证：`Authorization: Bearer <JWT>`

- `POST /auth/send-code` / `POST /auth/register` / `POST /auth/login`
- `GET /me` / `POST /me/verify`
- `GET|POST /addresses` / `PUT|DELETE /addresses/:id`
- `GET|POST /toys` / `GET /toys/mine` / `GET|PUT|DELETE /toys/:id`
- `GET|POST /swaps` / `GET /swaps/:id`
- `POST /swaps/:id/respond`（同意/拒绝）
- `POST /swaps/:id/pay-fee`（服务费，会员 ¥0）
- `POST /swaps/:id/ship`（运单号）
- `POST /swaps/:id/confirm-receipt`（收货）
- `POST /swaps/:id/cancel` / `POST /swaps/:id/dispute`
- `POST /swaps/:id/review`（互评→信用分）
- `GET /reviews/received`
- `POST /membership/subscribe` / `GET /membership/status`

## 五、设计令牌（WarmTrust v2 唯一权威）

颜色/字体/间距/圆角/阴影全部沿用 `phase2-design-tokens-v2.md`，CSS 变量定义在 `public/styles.css` 的 `:root`。前端所有页面通过 var() 引用，无自创色值；图标为页内内联 SVG（线性描边，无 emoji）。

## 六、已知边界（MVP 阶段刻意简化）

1. **验证码**：开发态固定 `1234` 并直接回显，生产需替换真实短信网关。
2. **支付**：模拟支付（点击即成功），未接入微信支付/商户。
3. **图片**：发布使用图片 URL（未做文件上传/OSS），图片源为 picsum 占位，离线时前端自动降级为几何插画。
4. **物流**：运单号手动填写，未对接快递 100 等查询 API。
5. **聊天**：MVP 未做即时消息（Spec §3 明确不做，V1.1 项）。
6. **仲裁**：仅提供纠纷提交入口与状态冻结，裁决人工介入未自动化。
7. 单机 SQLite，非生产级数据可靠性。

## 七、QA 验证记录

- 后端回归测试：**36/36 PASS**（覆盖 AC-01~AC-16 全链路：注册/实名/发布/筛选/发起/状态机/服务费会员联动/运单/收货/互评/信用分/重复评价409/订阅/地址/纠纷/取消）
- 前端 jsdom 冒烟：11 页面无脚本错误，核心页面数据渲染断言通过
- P0 门禁：emoji 图标 0 命中、紫粉渐变 0 命中、AI 模板味 0 命中
