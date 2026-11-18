/**
 * 素材库的颜色（docs/design/0019 §9）。小学徒和道具都画在一张宣纸色的「画片」上（picture.tsx），
 * 浅色、深色模式下画片里都是同一套颜色，所以这里全是固定颜色，不用主题变量。
 * 松绿、琥珀、朱砂取的是 App 浅色主题的值（globals.css）。
 */
export const PAPER_BG = "#f6f1e7"; // 画片底色（宣纸色）
export const FRAME = "#e2d9c8"; // 画片的边
export const LINE = "#5b4535"; // 暖棕色的手绘线
export const FEATURE = "#3a2a20"; // 五官
export const SKIN = "#f1d1b0";
export const HAIR = "#3a2c22";
export const SHOE = "#4a3a2e";
export const CREAM = "#efe3c8"; // 内领、袖口镶边
export const JADE = "#3d6b58"; // 长衫
export const AMBER = "#b7791f"; // 腰带、卷轴
export const CINNABAR = "#a8372a"; // 发带、穴位
export const POUCH = "#b08251"; // 药囊
export const WOOD = "#b9894f"; // 药柜、杵
export const DRAWER = "#d9b98a"; // 抽屉面板
export const LABEL = "#f4ead3"; // 抽屉上的标签、书卷的纸
export const KNOB = "#6b5133"; // 拉手
export const STONE = "#a0968a"; // 药臼
export const STONE_DARK = "#4d453e"; // 臼口里面
export const TEXT = "#7b6a58"; // 书卷上的字
export const SHADOW = "#e2d9c8"; // 脚下的影子
export const HERB = "#6f8f5a"; // 药末、药材（绿）
export const HERB2 = "#c79a55"; // 药末、药材（黄）
export const CHEEK = "#e98f78";
export const MOUTH = "#8a3a2c";
export const TONGUE = "#e88a7a";
export const BRONZE = "#b08d57"; // 针灸铜人
export const STEEL = "#9aa3a8"; // 针

/** 常用的「填色 + 手绘线」组合，直接展开到 SVG 元素上：<path {...robe} /> */
export const paint = {
  robe: { fill: JADE, stroke: LINE, strokeWidth: 0.9 },
  skin: { fill: SKIN, stroke: LINE, strokeWidth: 0.8 },
  hair: { fill: HAIR, stroke: LINE, strokeWidth: 0.6 },
  shoe: { fill: SHOE, stroke: LINE, strokeWidth: 0.6 },
  cream: { fill: CREAM, stroke: LINE, strokeWidth: 0.6 },
  belt: { fill: AMBER, stroke: LINE, strokeWidth: 0.6 },
  red: { fill: CINNABAR, stroke: LINE, strokeWidth: 0.4 },
  pouch: { fill: POUCH, stroke: LINE, strokeWidth: 0.6 },
  wood: { fill: WOOD, stroke: LINE, strokeWidth: 0.7 },
  drawer: { fill: DRAWER, stroke: LINE, strokeWidth: 0.6 },
  label: { fill: LABEL, stroke: LINE, strokeWidth: 0.3 },
  stone: { fill: STONE, stroke: LINE, strokeWidth: 0.8 },
  paper: { fill: LABEL, stroke: LINE, strokeWidth: 0.6 },
  bronze: { fill: BRONZE, stroke: LINE, strokeWidth: 0.6 },
  herb: { fill: HERB, stroke: LINE, strokeWidth: 0.4 },
  herb2: { fill: HERB2, stroke: LINE, strokeWidth: 0.4 },
  /** 衣服的褶 */
  fold: { fill: "none", stroke: "rgba(40,30,20,.35)", strokeWidth: 0.7 },
} as const;
