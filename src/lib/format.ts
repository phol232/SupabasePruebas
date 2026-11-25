export const STORE_NAME =
  process.env.NEXT_PUBLIC_STORE_NAME || "Tienda Rápida";

export const CURRENCY_SYMBOL =
  process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "$";

export const WHATSAPP_NUMBER = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "51999999999"
).replace(/\D/g, "");

export function formatPrice(amount: number | string): string {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(value)) return `${CURRENCY_SYMBOL}0.00`;
  return `${CURRENCY_SYMBOL}${value.toFixed(2)}`;
}

export function buildWhatsAppOrderUrl(params: {
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  notes: string;
  items: Array<{ name: string; quantity: number; subtotal: number }>;
  total: number;
  trackingUrl: string;
}): string {
  const lines = [
    `*Nuevo Pedido #${params.orderNumber}* - ${STORE_NAME}`,
    "",
    `*Cliente:* ${params.customerName}`,
    params.customerPhone ? `*Teléfono:* ${params.customerPhone}` : null,
    `*Dirección:* ${params.deliveryAddress}`,
    params.notes ? `*Notas:* ${params.notes}` : null,
    "",
    "*Detalle del pedido:*",
    ...params.items.map(
      (item) =>
        `• ${item.quantity}x ${item.name} — ${formatPrice(item.subtotal)}`
    ),
    "",
    `*Total:* ${formatPrice(params.total)}`,
    "",
    `*Seguimiento en vivo (cliente):*`,
    params.trackingUrl,
  ].filter((line): line is string => line !== null);

  const encoded = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
}
