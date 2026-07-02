import type { CostRecord, Product, SaleRecord, SessionSummary } from "@/types";

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
