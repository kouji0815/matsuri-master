import type { CostRecord, CostUnitPriceMode, Product, SaleRecord, SessionSummary } from "@/types";

export const yen = (value: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: value % 1 === 0 ? 0 : 1
  }).format(value);

export function getSaleSummary(sales: SaleRecord[], costs: CostRecord[]): SessionSummary {
  const revenue = sales.reduce((sum, sale) => sum + sale.totalRevenue, 0);
  const quantity = sales.reduce(
    (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );
  const variableCost = sales.reduce((sum, sale) => sum + sale.totalCost, 0);
  const fixedCost = costs.reduce((sum, cost) => sum + cost.amount, 0);
  const grossProfit = revenue - variableCost;
  const netProfit = grossProfit - fixedCost;
  const profitRate = revenue > 0 ? netProfit / revenue : 0;
  const costRate = revenue > 0 ? 1 - profitRate : 0;

  return { revenue, quantity, variableCost, fixedCost, grossProfit, netProfit, profitRate, costRate };
}

export function getTopProducts(sales: SaleRecord[], limit = 3) {
  const map = new Map<string, { name: string; quantity: number; revenue: number; profit: number }>();
  for (const sale of sales) {
    for (const item of sale.items) {
      const current = map.get(item.productId) ?? {
        name: item.productName,
        quantity: 0,
        revenue: 0,
        profit: 0
      };
      current.quantity += item.quantity;
      current.revenue += item.subtotal;
      current.profit += item.subtotalProfit;
      map.set(item.productId, current);
    }
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}

export function getHourlySales(sales: SaleRecord[]) {
  const map = new Map<string, number>();
  for (const sale of sales) {
    const hour = new Date(sale.createdAt).getHours().toString().padStart(2, "0");
    map.set(`${hour}:00`, (map.get(`${hour}:00`) ?? 0) + sale.totalRevenue);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function getRecentRevenue(sales: SaleRecord[], minutes = 30) {
  const since = Date.now() - minutes * 60 * 1000;
  return sales
    .filter((sale) => new Date(sale.createdAt).getTime() >= since)
    .reduce((sum, sale) => sum + sale.totalRevenue, 0);
}

export function getLowStockProducts(products: Product[]) {
  return products.filter((product) => product.enabled && product.currentStock > 0 && product.currentStock <= product.warningStock);
}

const trailingQuantityPattern = /(\d+(?:\.\d+)?)\s*([^\d\s]{1,4})\s*$/;

export function isMeatCategoryName(categoryName: string | undefined): boolean {
  return categoryName?.trim() === "肉";
}

function parseTrailingQuantity(name: string): { quantity: number; unit: string } | null {
  const match = name.match(trailingQuantityPattern);
  if (!match) return null;
  const quantity = Number(match[1]);
  if (!quantity || quantity <= 0) return null;
  return { quantity, unit: match[2] };
}

function parseGrams(quantity: number, unit: string): number | null {
  if (/^kg$/i.test(unit)) return quantity * 1000;
  if (/^g$/i.test(unit)) return quantity;
  return null;
}

// Quantity/unit is not a structured field on CostRecord — it's free text embedded at the end of
// the cost name (e.g. "おもちゃ入れる袋　400個", "ラム肉ブロック　1.5kg"). This best-effort parses
// a trailing "<number><unit>" and returns a per-unit price label, or null when it can't be parsed
// confidently (unrecognized text, missing quantity, or a weight-based mode combined with a unit
// that isn't a weight).
//
// A record can override how its price is expressed via cost.unitPriceMode /
// cost.unitPriceBaseGrams (set per-record, e.g. via an inline editor in the cost list). When
// unset, the mode defaults to gram-based pricing (using the app-wide meatUnitPriceBaseGrams
// setting) for the "肉" category, and per-piece pricing (using whatever unit text was parsed)
// for every other category — this matches the original, non-customizable behavior.
export function getCostUnitPriceLabel(cost: CostRecord, categoryName: string | undefined, meatUnitPriceBaseGrams: number): string | null {
  const parsed = parseTrailingQuantity(cost.name);
  if (!parsed) return null;

  const mode: CostUnitPriceMode = cost.unitPriceMode ?? (isMeatCategoryName(categoryName) ? "gram" : "piece");

  if (mode === "piece") {
    const unitPrice = cost.amount / parsed.quantity;
    const unitLabel = cost.unitPriceMode === "piece" ? "個" : parsed.unit;
    return `${yen(unitPrice)} / ${unitLabel}`;
  }

  const grams = parseGrams(parsed.quantity, parsed.unit);
  if (!grams || grams <= 0) return null;

  if (mode === "kilogram") {
    return `${yen((cost.amount / grams) * 1000)} / kg`;
  }

  const baseGrams = cost.unitPriceBaseGrams && cost.unitPriceBaseGrams > 0 ? cost.unitPriceBaseGrams : meatUnitPriceBaseGrams > 0 ? meatUnitPriceBaseGrams : 20;
  return `${yen((cost.amount * baseGrams) / grams)} / ${baseGrams}g`;
}
