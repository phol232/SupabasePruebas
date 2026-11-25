import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getServerSupabaseClient } from "@/lib/supabase";
import AdminDashboard from "@/components/AdminDashboard";
import type { Order, Product } from "@/types/store";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authenticated = await isAdminAuthenticated();
  let products: Product[] = [];
  let orders: Order[] = [];

  if (authenticated) {
    try {
      const supabase = getServerSupabaseClient();
      const [productsRes, ordersRes] = await Promise.all([
        supabase
          .from("products")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      products = (productsRes.data as Product[]) || [];
      orders = (ordersRes.data as Order[]) || [];
    } catch {
      // ignore if env not ready
    }
  }

  return (
    <AdminDashboard
      initialAuthenticated={authenticated}
      initialProducts={products}
      initialOrders={orders}
    />
  );
}
