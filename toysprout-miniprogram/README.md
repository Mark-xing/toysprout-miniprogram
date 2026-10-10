# 童芽 ToySprout · 生产级微信小程序

> C2C 玩具交换平台，基于 MVP Web 版（`../toysprout-mvp/`）业务逻辑迁移为微信小程序原生 + 云开发架构。
> 回归测试：云函数集成测试 **35/35 PASS**；P0 门禁（emoji/紫粉渐变/AI模板味）全部 0 命中。

## 项目结构

```
toysprout-miniprogram/
├── miniprogram/              # 小程序前端（原生 WXML/WXSS/JS）
│   ├── app.js / app.json / app.wxss
│   ├── pages/                 # 主包：登录/发现/发布/我的
│   ├── packageToy/            # 分包：玩具详情
│   ├── packageSwap/           # 分包：发起交换/订单列表/订单详情
│   ├── packageUser/           # 分包：地址管理/会员中心/实名认证
│   ├── components/            # 自定义组件（toy-card 等）
│   └── utils/                 # api.js（云函数调用封装）/ format.js（格式化工具）
├── cloudfunctions/            # 微信云函数（后端）
│   ├── _shared/                # 共享源码（response.js/credit.js），部署前需同步
│   ├── auth/                   # 认证：验证码/登录建档
│   ├── user/                   # 用户信息/实名认证/地址管理
│   ├── toy/                    # 玩具发布/浏览/筛选
│   ├── swap/                   # 交换状态机全链路（核心）
│   ├── review/                 # 评价查询
│   ├── membership/              # 会员订阅
│   └── upload/                  # 云存储路径规范化
├── scripts/
│   ├── sync-shared.js          # 同步共享代码到各云函数目录（部署前必跑）
│   ├── mock-wx-server-sdk.js   # 本地模拟微信云开发 SDK（用于集成测试）
│   └── run-integration-test.js # 本地集成测试（35项断言）
├── project.config.json         # 微信开发者工具项目配置（需填入真实 AppID）
├── DEPLOY-GUIDE.md             # 完整上线部署指引（含账号注册/云开发配置/审核清单）
└── RELEASE-CHECKLIST.md        # 提交审核前自查清单
```

## 快速开始（本地验证业务逻辑，无需真实小程序账号）

```bash
cd toysprout-miniprogram
node scripts/sync-shared.js          # 同步共享代码
node scripts/run-integration-test.js # 本地集成测试（模拟云开发环境）
```

## 真实上线部署

**必须使用微信开发者工具**（本地 Node 无法模拟真实小程序运行环境/云开发环境）：

1. 注册小程序账号，拿到 AppID（详见 `DEPLOY-GUIDE.md` 第一步）
2. 微信开发者工具打开本项目，创建云开发环境，获取环境 ID 填入 `miniprogram/app.js`
3. 创建云数据库集合并配置安全规则（`DEPLOY-GUIDE.md` 第三步 + `../.workbuddy/outputs/toy-share-saas/production/SPEC-PRODUCTION.md` §8）
4. 逐个上传部署 7 个云函数
5. 真机预览测试，提交审核

完整步骤见 `DEPLOY-GUIDE.md`。

## 与 MVP Web 版的关系

本项目是 MVP Web 版（`../toysprout-mvp/`）的**生产级重构**，业务规则/状态机/信用分算法/服务费计价规则完全沿用并已在 MVP 阶段验证（36/36 回归通过）。MVP Web 版保留不动，作为业务逻辑参考基准与快速演示用途，两者独立部署、互不影响。

## 关键技术决策

1. **云函数按业务域拆分为 7 个**（非 28 个细粒度端点），每个云函数内部用 `action` 字段分发，避免云函数管理复杂度失控。
2. **无跨文档事务的应对**：发起交换用"先建记录+补偿回滚"策略；状态机流转用"前置条件更新"形成乐观锁，避免并发覆写。
3. **信用等级不落库**：云数据库无生成列能力，改为云函数统一实时计算（`_shared/credit.js`），比 MVP 版的 SQLite 生成列方案更彻底地杜绝双口径问题。
4. **支付/短信标准化预留接口**：`services/payService.js` 和 `services/smsService.js` 封装统一调用契约，接入真实资质时只需替换内部实现，业务逻辑零改动。

## 已知限制（详见 RELEASE-CHECKLIST.md）

- 短信验证码固定 1234（模拟态）
- 支付为模拟成功（无真实扣款）
- 用户协议/隐私政策文本页面待补充
- 建议：首次提交审核时考虑暂时隐藏收费展示，避免"展示收费但未真实扣款"引发的审核疑问（见 RELEASE-CHECKLIST.md 分阶段提交策略）
