"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { fetchOrderById } from "@/lib/api";
import OrderTrackingClient from "@/components/OrderTrackingClient";
import type { Order } from "@/types/store";

function OrderTrackingContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const token = searchParams.get("token");

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id || !token) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const typedOrder = await fetchOrderById(id);

        if (cancelled) return;

        if (
          !typedOrder ||
          (typedOrder.tracking_token !== token &&
            typedOrder.manage_token !== token)
        ) {
          setNotFound(true);
        } else {
          const safeOrder: Order = { ...typedOrder };
          delete safeOrder.manage_token;
          setOrder(safeOrder);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center p-4">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-zinc-600">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          Cargando tu pedido...
        </div>
      </div>
    );
  }

  if (notFound || !order) {
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

  return <OrderTrackingClient initialOrder={order} />;
}

export default function OrderTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center p-4 text-sm text-zinc-500">
          Cargando...
        </div>
      }
    >
      <OrderTrackingContent />
    </Suspense>
  );
}
