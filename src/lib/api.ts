import type { Order, OrderStatus, Product } from "@/types/store";

export interface AdminSession {
  access_token: string;
  refresh_token: string;
  user?: { email?: string };
}

const ADMIN_SESSION_STORAGE = "tienda_admin_auth_v1";

export function getStoredAdminSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_STORAGE);
    if (!raw) return null;
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function saveStoredAdminSession(session: AdminSession | null) {
  try {
    if (!session) {
      localStorage.removeItem(ADMIN_SESSION_STORAGE);
    } else {
      localStorage.setItem(ADMIN_SESSION_STORAGE, JSON.stringify(session));
    }
  } catch {
    // ignore
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
    error_description?: string;
  };
  if (!res.ok) {
    throw new Error(
      data.error ||
        data.message ||
        data.error_description ||
        `Error HTTP ${res.status}`
    );
  }
  return data;
}

export async function fetchProducts(accessToken?: string): Promise<Product[]> {
  const url = accessToken ? "/api/products?all=1" : "/api/products";
  const res = await fetch(url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  return parseJson<Product[]>(res);
}

export async function createOrder(payload: {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  notes: string;
  items: Array<{ product_id: string; quantity: number }>;
}) {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<{
    order_id: string;
    order_number: number;
    total: number;
    tracking_token: string;
    manage_token: string;
  }>(res);
}

export async function fetchOrderById(id: string): Promise<Order> {
  const res = await fetch(`/api/orders?id=${encodeURIComponent(id)}`);
  return parseJson<Order>(res);
}

export async function fetchOrdersAdmin(accessToken: string): Promise<Order[]> {
  const res = await fetch("/api/orders", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseJson<Order[]>(res);
}

export async function updateOrderStatus(params: {
  order_id: string;
  manage_token: string;
  status: OrderStatus;
  accessToken?: string;
}) {
  const res = await fetch("/api/orders/status", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(params.accessToken
        ? { Authorization: `Bearer ${params.accessToken}` }
        : {}),
    },
    body: JSON.stringify({
      order_id: params.order_id,
      manage_token: params.manage_token,
      status: params.status,
    }),
  });
  return parseJson<{ status: OrderStatus; updated_at: string }>(res);
}

export async function adminLogin(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseJson<AdminSession>(res);
}

export async function adminLogout(accessToken: string) {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => undefined);
}

export async function adminSaveProduct(
  accessToken: string,
  id: string | null,
  payload: Partial<Product>
): Promise<Product> {
  const res = await fetch(
    id ? `/api/products?id=${encodeURIComponent(id)}` : "/api/products",
    {
      method: id ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    }
  );
  return parseJson<Product>(res);
}

export async function adminDeleteProduct(accessToken: string, id: string) {
  const res = await fetch(`/api/products?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseJson<{ ok: boolean }>(res);
}

export async function adminUploadImage(
  accessToken: string,
  file: File
): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/storage/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
  });
  const data = await parseJson<{ url: string }>(res);
  return data.url;
}
