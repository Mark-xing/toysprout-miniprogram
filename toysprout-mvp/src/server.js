// src/server.js
// 童芽 ToySprout · C2C 玩具交换平台 Web MVP 入口。
// 职责：装配中间件与路由、托管静态前端、启动 HTTP 服务。零业务逻辑。
'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');
const { router: authRouter } = require('./routes/auth');
const meRouter = require('./routes/me');
const { router: addressesRouter } = require('./routes/addresses');
const { router: toysRouter } = require('./routes/toys');
const { router: swapsRouter } = require('./routes/swaps');
const reviewsRouter = require('./routes/reviews');
const membershipRouter = require('./routes/membership');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ code: 0, data: { status: 'ok', time: new Date().toISOString() }, message: '' });
});

// API v1 路由
const api = express.Router();
api.use('/auth', authRouter);
api.use('/me', requireAuth, meRouter);
api.use('/addresses', requireAuth, addressesRouter);
api.use('/toys', toysRouter); // toys 内部分端点按需 requireAuth（POST/PUT/DELETE/mine）
api.use('/swaps', requireAuth, swapsRouter);
api.use('/reviews', requireAuth, reviewsRouter);
api.use('/membership', requireAuth, membershipRouter);

app.use('/api/v1', api);

// 静态前端：优先公开目录，其次回退到设计原型目录（保持可访问）
const publicDir = path.join(__dirname, '..', 'public');
const fallbackDir = path.join(__dirname, '..', '..', '.workbuddy', 'outputs', 'toy-share-saas', 'exchange', 'web');
app.use(express.static(publicDir));
app.use(express.static(fallbackDir));

// SPA 回退：未匹配的 GET 请求回落到 index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) return next();
    return undefined;
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`ToySprout MVP running on http://localhost:${PORT}`);
  console.log(`  前端入口: http://localhost:${PORT}/index.html`);
  console.log(`  API 文档: http://localhost:${PORT}/docs/openapi.yaml`);
});
