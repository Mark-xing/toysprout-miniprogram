-- ToySprout MVP · SQLite Schema
-- 依据 SPEC.md §6（数据库表清单）产出，含架构师复核修正（见 CHANGE NOTES）。
--
-- CHANGE NOTES（相对 Spec §6 原始描述的技术决策，详见 SendMessage 汇报 / ADR）：
-- 1. users.id_card 拆分为 id_card_hash + id_card_masked：不落地存储明文身份证号，
--    仅存 SHA-256 哈希（用于唯一性校验/重复实名检测）与掩码展示串（如 110***********1234）。
-- 2. users.credit_level 改为 SQLite 生成列（GENERATED ALWAYS AS ... VIRTUAL），
--    由 credit_score 派生，避免出现 dev-checklist A-06 描述的"双口径不一致"问题——
--    信用等级永远与信用分实时一致，无需应用层重复维护。
-- 3. swaps.service_fee_amount 拆分为 service_fee_amount_initiator / _target 两列：
--    Spec 原字段为单一金额，但业务规则是"双方各自按自己的会员身份判定服务费"，
--    单列无法表达"一方会员免单、另一方非会员需付费"的场景，故按双轨拆分（与
--    initiator_tracking_no / target_tracking_no 的双轨设计保持一致的建模风格）。
-- 4. 金额字段统一以"分"为单位存储 INTEGER（如 190 = ¥1.90），避免浮点误差。
-- 5. swaps.status 在 Spec 枚举基础上新增 'rejected'（对方明确拒绝交换意向），
--    区别于用户主动 'cancelled'，便于前端区分文案与信用分是否受影响。
-- 6. credit_logs 新增 related_swap_id（可空外键），便于"信用分明细页"追溯来源订单。
-- 7. 所有主键使用 TEXT（UUID v4），由应用层（uuid 包）生成，避免自增 ID 暴露数据规模。
-- 8. updated_at 由触发器自动维护，避免业务代码遗漏更新。

PRAGMA foreign_keys = ON;

-- ========================= users =========================
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  phone               TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  id_card_hash        TEXT,                         -- SHA-256(身份证号)，仅用于唯一性校验
  id_card_masked      TEXT,                         -- 掩码展示，如 110101********1234
  is_verified         INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0, 1)),
  credit_score        INTEGER NOT NULL DEFAULT 500 CHECK (credit_score BETWEEN 0 AND 1000),
  credit_level        TEXT GENERATED ALWAYS AS (
                          CASE
                            WHEN credit_score >= 950 THEN 'elite'
                            WHEN credit_score >= 800 THEN 'trusted'
                            WHEN credit_score >= 600 THEN 'growing'
                            ELSE 'sprout'
                          END
                        ) VIRTUAL,
  is_member           INTEGER NOT NULL DEFAULT 0 CHECK (is_member IN (0, 1)),
  member_expires_at    TEXT,                         -- ISO datetime，NULL 表示非会员/已过期
  city                TEXT,                         -- 常驻城市，供"同城优先"排序占位使用
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ========================= addresses =========================
CREATE TABLE IF NOT EXISTS addresses (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  receiver_name TEXT NOT NULL,
  phone         TEXT NOT NULL,
  province      TEXT NOT NULL,
  city          TEXT NOT NULL,
  detail        TEXT NOT NULL,
  is_default    INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

CREATE TRIGGER IF NOT EXISTS trg_addresses_updated_at
AFTER UPDATE ON addresses
BEGIN
  UPDATE addresses SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ========================= toys =========================
-- category 取值对齐 exchange/web/explore.html 筛选 chips（品类五分类）
-- condition_level 取值对齐 explore.html 成色徽章 CSS 类名（condition--*）
CREATE TABLE IF NOT EXISTS toys (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL CHECK (category IN (
                       'building_blocks', 'outdoor_sports', 'pretend_play',
                       'early_education', 'plush_fabric'
                     )),
  age_range        TEXT NOT NULL,                 -- 展示用字符串，如 "1.5-5"
  condition_level  TEXT NOT NULL CHECK (condition_level IN ('new', '9new', '8new', 'used')),
  has_small_parts  INTEGER NOT NULL DEFAULT 0 CHECK (has_small_parts IN (0, 1)),
  images           TEXT NOT NULL DEFAULT '[]',    -- JSON 数组字符串，>=3 张由应用层校验（AC-04）
  city             TEXT,                          -- 冗余自 owner 常驻城市，便于列表展示无需 JOIN
  status           TEXT NOT NULL DEFAULT 'available' CHECK (status IN (
                       'available', 'swapping', 'exchanged', 'removed'
                     )),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_toys_owner_id ON toys(owner_id);
CREATE INDEX IF NOT EXISTS idx_toys_status ON toys(status);
CREATE INDEX IF NOT EXISTS idx_toys_category ON toys(category);

CREATE TRIGGER IF NOT EXISTS trg_toys_updated_at
AFTER UPDATE ON toys
BEGIN
  UPDATE toys SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ========================= swaps =========================
CREATE TABLE IF NOT EXISTS swaps (
  id                          TEXT PRIMARY KEY,
  initiator_id                TEXT NOT NULL REFERENCES users(id),
  target_owner_id              TEXT NOT NULL REFERENCES users(id),
  my_toy_id                   TEXT NOT NULL REFERENCES toys(id),
  target_toy_id                TEXT NOT NULL REFERENCES toys(id),
  message                     TEXT NOT NULL DEFAULT '',
  status                      TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
                                  'requested', 'accepted', 'rejected', 'shipping',
                                  'received', 'reviewed', 'cancelled', 'disputed'
                                )),
  -- 服务费按双轨分别计价（见 CHANGE NOTES #3），单位：分。会员一方在 pay-fee 时应为 0。
  service_fee_amount_initiator INTEGER,
  service_fee_amount_target    INTEGER,
  service_fee_paid_by_initiator INTEGER NOT NULL DEFAULT 0 CHECK (service_fee_paid_by_initiator IN (0, 1)),
  service_fee_paid_by_target   INTEGER NOT NULL DEFAULT 0 CHECK (service_fee_paid_by_target IN (0, 1)),
  initiator_tracking_no        TEXT,
  target_tracking_no           TEXT,
  initiator_received_at        TEXT,
  target_received_at           TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_swaps_initiator ON swaps(initiator_id);
CREATE INDEX IF NOT EXISTS idx_swaps_target ON swaps(target_owner_id);
CREATE INDEX IF NOT EXISTS idx_swaps_status ON swaps(status);

CREATE TRIGGER IF NOT EXISTS trg_swaps_updated_at
AFTER UPDATE ON swaps
BEGIN
  UPDATE swaps SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ========================= reviews =========================
CREATE TABLE IF NOT EXISTS reviews (
  id           TEXT PRIMARY KEY,
  swap_id      TEXT NOT NULL REFERENCES swaps(id),
  reviewer_id  TEXT NOT NULL REFERENCES users(id),
  reviewee_id  TEXT NOT NULL REFERENCES users(id),
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags         TEXT NOT NULL DEFAULT '[]',   -- JSON 数组字符串（快捷标签）
  comment      TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  -- 同一订单同一评价人只能评一次（避免重复刷分，对应 dev-checklist B-07 风控前置）
  UNIQUE (swap_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_swap_id ON reviews(swap_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews(reviewee_id);

-- ========================= disputes =========================
CREATE TABLE IF NOT EXISTS disputes (
  id               TEXT PRIMARY KEY,
  swap_id          TEXT NOT NULL REFERENCES swaps(id),
  reporter_id      TEXT NOT NULL REFERENCES users(id),
  type             TEXT NOT NULL,
  description      TEXT NOT NULL,
  evidence_images  TEXT NOT NULL DEFAULT '[]',  -- JSON 数组字符串
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_disputes_swap_id ON disputes(swap_id);

CREATE TRIGGER IF NOT EXISTS trg_disputes_updated_at
AFTER UPDATE ON disputes
BEGIN
  UPDATE disputes SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ========================= credit_logs =========================
CREATE TABLE IF NOT EXISTS credit_logs (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  delta            INTEGER NOT NULL,
  reason           TEXT NOT NULL,
  related_swap_id  TEXT REFERENCES swaps(id),   -- 可空，非订单相关的调整（如人工修正）留空
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_credit_logs_user_id ON credit_logs(user_id);
