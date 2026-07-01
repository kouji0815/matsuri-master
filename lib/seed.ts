import type { AppSettings, BundleRule, Product, ProductCategory, Session } from "@/types";

const now = () => new Date().toISOString();

export const seedCategories: ProductCategory[] = [
  {
    id: "cat-skewer",
    name: "くし",
    enabled: true,
    sortOrder: 10,
    showInHighTraffic: true,
    updatedAt: now()
  },
  {
    id: "cat-drink",
    name: "飲み物",
    enabled: true,
    sortOrder: 20,
    showInHighTraffic: true,
    updatedAt: now()
  },
  {
    id: "cat-toy",
    name: "おもちゃ",
    enabled: true,
    sortOrder: 30,
    showInHighTraffic: false,
    updatedAt: now()
  },
  {
    id: "cat-other",
    name: "その他",
    enabled: true,
    sortOrder: 40,
    showInHighTraffic: false,
    updatedAt: now()
  }
];

export const seedProducts: Product[] = [
  {
    id: "prod-lamb",
    name: "ラム串",
    icon: "🐑",
    category: "cat-skewer",
    price: 350,
    unitCost: 71.2,
    initialStock: 80,
    currentStock: 80,
    warningStock: 10,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "prod-beef",
    name: "牛肉串",
    icon: "🥩",
    category: "cat-skewer",
    price: 350,
    unitCost: 83.2,
    initialStock: 80,
    currentStock: 80,
    warningStock: 10,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "prod-chicken",
    name: "鶏肉",
    icon: "🍗",
    category: "cat-skewer",
    price: 350,
    unitCost: 38.2,
    initialStock: 25,
    currentStock: 25,
    warningStock: 6,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "prod-pork",
    name: "豚肩串",
    icon: "🐖",
    category: "cat-skewer",
    price: 350,
    unitCost: 45.7,
    initialStock: 25,
    currentStock: 25,
    warningStock: 6,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "prod-wing",
    name: "手羽先",
    icon: "🍖",
    category: "cat-skewer",
    price: 350,
    unitCost: 58.2,
    initialStock: 50,
    currentStock: 50,
    warningStock: 8,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "prod-beer",
    name: "ビール",
    icon: "🍺",
    category: "cat-drink",
    price: 500,
    unitCost: 0,
    initialStock: 60,
    currentStock: 60,
    warningStock: 10,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "prod-lemon",
    name: "レモンサワー",
    icon: "🍋",
    category: "cat-drink",
    price: 500,
    unitCost: 0,
    initialStock: 60,
    currentStock: 60,
    warningStock: 10,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "prod-glow-ring",
    name: "光る指輪",
    icon: "💍",
    category: "cat-toy",
    price: 300,
    unitCost: 80,
    initialStock: 50,
    currentStock: 50,
    warningStock: 10,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "prod-small-toy",
    name: "小型玩具",
    icon: "🪀",
    category: "cat-toy",
    price: 500,
    unitCost: 150,
    initialStock: 30,
    currentStock: 30,
    warningStock: 8,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "prod-lottery-toy",
    name: "くじ商品",
    icon: "🎁",
    category: "cat-toy",
    price: 400,
    unitCost: 120,
    initialStock: 40,
    currentStock: 40,
    warningStock: 8,
    enabled: true,
    updatedAt: now()
  }
];

export const seedBundles: BundleRule[] = [
  {
    id: "bundle-one",
    name: "1本",
    price: 350,
    itemCount: 1,
    allowChoice: true,
    includesDrink: false,
    allowedCategoryIds: ["cat-skewer"],
    discountAmount: 0,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "bundle-three",
    name: "3本セット",
    price: 900,
    itemCount: 3,
    allowChoice: true,
    includesDrink: false,
    allowedCategoryIds: ["cat-skewer"],
    discountAmount: 150,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "bundle-five",
    name: "5本セット",
    price: 1400,
    itemCount: 5,
    allowChoice: true,
    includesDrink: false,
    allowedCategoryIds: ["cat-skewer"],
    discountAmount: 350,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "bundle-drink-two",
    name: "ドリンク＋串2本",
    price: 1150,
    itemCount: 2,
    allowChoice: true,
    includesDrink: true,
    allowedCategoryIds: ["cat-skewer"],
    discountAmount: 50,
    enabled: true,
    updatedAt: now()
  },
  {
    id: "bundle-drink-three",
    name: "ドリンク＋串3本",
    price: 1450,
    itemCount: 3,
    allowChoice: true,
    includesDrink: true,
    allowedCategoryIds: ["cat-skewer"],
    discountAmount: 100,
    enabled: true,
    updatedAt: now()
  }
];

export const seedSession = (): Session => ({
  id: `session-${crypto.randomUUID()}`,
  name: "本日の営業",
  date: new Date().toISOString().slice(0, 10),
  location: "",
  targetSales: 100000,
  status: "planned",
  createdAt: now()
});

export const seedSettings: AppSettings = {
  id: "main",
  highTrafficMode: false,
  soundEnabled: true,
  defaultTargetSales: 100000
};
