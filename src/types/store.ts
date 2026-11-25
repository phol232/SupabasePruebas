export type OrderStatus =
  | "pending"
  | "preparing"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  notes: string;
  status: OrderStatus;
  total: number;
  tracking_token: string;
  manage_token?: string;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
}

export const ORDER_STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string;
    description: string;
    badgeClass: string;
    stepIndex: number;
  }
> = {
  pending: {
    label: "Pendiente",
    description: "Recibimos tu pedido. El comercio lo confirmará en breve.",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    stepIndex: 0,
  },
  preparing: {
    label: "En preparación",
    description: "Estamos alistando y empacando tus productos.",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    stepIndex: 1,
  },
  on_the_way: {
    label: "En camino",
    description: "Tu pedido salió hacia tu dirección de entrega.",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
    stepIndex: 2,
  },
  delivered: {
    label: "Entregado",
    description: "¡Pedido entregado! Gracias por tu compra.",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    stepIndex: 3,
  },
  cancelled: {
    label: "Cancelado",
    description: "Este pedido fue cancelado.",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    stepIndex: -1,
  },
};
