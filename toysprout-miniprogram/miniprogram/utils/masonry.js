// utils/masonry.js
// 双列瀑布流的分列计算。
//
// 【为什么卡片高度不由图片真实比例决定】
// toys 数据里没有存图片宽高。若等 <image> 的 bindload 拿到真实比例再重排，
// 用户会看到卡片在图片加载完成后横向跳动（列归属可能整个换掉），比"不够错落"更难受。
// 因此改为「由 toy.id 派生的确定性比例」：同一件玩具每次渲染高度恒定，
// 翻页追加、点"想要"、下拉刷新都不会让已渲染的卡片挪位，图片用 aspectFill 裁切填满。
// 代价是裁切比例不跟随原图——对玩具这种主体居中的实拍图可接受。
'use strict';

// 错落档位（高 / 宽）。刻意避开单一值，也避开过于极端的比例导致主体被裁掉。
const RATIOS = [1.0, 1.26, 0.82, 1.12, 0.92, 1.18];

// 卡片正文（标题 2 行 + 作者行 + 内边距）的估算高度，单位 rpx。
// 仅用于分列时比较两列累计高度，不参与真实布局，允许有误差。
const CARD_TEXT_H = 216;

// 由 id 派生一个稳定的比例档位。用简单的字符串散列即可：
// 只要保证同一 id 每次得到同一档位，视觉上就是"随机错落"了。
function cardRatio(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
  return RATIOS[h % RATIOS.length];
}

// 把一批卡片分到左右两列：每张卡片总是进入「当前累计高度更矮」的那一列。
// 这是瀑布流的基本启发式——它不追求全局最优，但视觉上两列高度足够接近，
// 且是增量式的：追加新卡片不会打乱已有卡片的列归属。
//
// colWidthRpx：单列宽度（rpx），由页面按窗口宽度算好后传入。
function distributeColumns(items, colWidthRpx) {
  const left = [];
  const right = [];
  let hLeft = 0;
  let hRight = 0;
  (items || []).forEach((toy) => {
    const h = colWidthRpx * cardRatio(toy.id) + CARD_TEXT_H;
    // <= 让高度相同时优先放左列，保证首次渲染顺序符合直觉（左→右）
    if (hLeft <= hRight) { left.push(toy); hLeft += h; } else { right.push(toy); hRight += h; }
  });
  return { left, right };
}

module.exports = { cardRatio, distributeColumns, CARD_TEXT_H };
