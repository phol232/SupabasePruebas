import Link from "next/link";
import { getServerSupabaseClient } from "@/lib/supabase";
import OrderTrackingClient from "@/components/OrderTrackingClient";
import type { Order } from "@/types/store";

export const dynamic = "force-dynamic";

export default async function OrderTrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  const supabase = getServerSupabaseClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", id)
    .single();

  const typedOrder = order as Order | null;
  const isAuthorized =
    typedOrder &&
    token &&
    (typedOrder.tracking_token === token || typedOrder.manage_token === token);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-8 text-center space-y-3">
          <h1 className="text-xl font-bold text-zinc-900">
            Pedido no encontrado
          </h1>
          <p className="text-sm text-zinc-500">
            El enlace de seguimiento no es válido o ha expirado.
          </p>
          <Link
            href="/"
            className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold"
          >
            Ir a la tienda
          </Link>
        </div>
      </div>
    );
  }

  // Strip manage_token before passing to public client
  const safeOrder: Order = { ...typedOrder };
  delete safeOrder.manage_token;

  return <OrderTrackingClient initialOrder={safeOrder} />;
}
