import type { SaleRecord, Session } from "@/types";

const header = ["時間", "商品名", "数量", "単価", "単個原価", "小計売上", "小計原価", "小計利益", "場次名"];

const escapeCsv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export function salesToCsv(sales: SaleRecord[], session?: Session) {
  const rows = sales.flatMap((sale) =>
    sale.items.map((item) => [
      new Date(sale.createdAt).toLocaleString("ja-JP"),
      item.productName,
      item.quantity,
      item.unitPrice,
      item.unitCost,
      item.subtotal,
      item.subtotalCost,
      item.subtotalProfit,
      session?.name ?? ""
    ])
  );

  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function downloadTextFile(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([`\uFEFF${content}`], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
