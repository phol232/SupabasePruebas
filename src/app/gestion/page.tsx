"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import OrderManageClient from "@/components/OrderManageClient";
import type { Order } from "@/types/store";

function OrderManageContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const token = searchParams.get("token");

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    if (!id || !token) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from("orders")
          .select("*, order_items(*)")
          .eq("id", id)
          .single();

        if (cancelled) return;

        const typedOrder = data as Order | null;
        if (error || !typedOrder || typedOrder.manage_token !== token) {
          setUnauthorized(true);
        } else {
          setOrder(typedOrder);
        }
      } catch {
        if (!cancelled) setUnauthorized(true);
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
          Cargando gestión del pedido...
        </div>
      </div>
    );
  }

  if (unauthorized || !order || !token) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-8 text-center space-y-3">
          <h1 className="text-xl font-bold text-zinc-900">
            Acceso no autorizado
          </h1>
          <p className="text-sm text-zinc-500">
            Este enlace único de gestión no es válido para este pedido.
          </p>
          <Link
            href="/"
            className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold"
          >
            Volver a la tienda
          </Link>
        </div>
      </div>
    );
  }

  return <OrderManageClient initialOrder={order} manageToken={token} />;
}

export default function OrderManagePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center p-4 text-sm text-zinc-500">
          Cargando...
        </div>
      }
    >
      <OrderManageContent />
    </Suspense>
  );
}
