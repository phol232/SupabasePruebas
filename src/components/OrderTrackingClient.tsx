"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock,
  ChefHat,
  Truck,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  MapPin,
  Radio,
  Store,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { STORE_NAME, formatPrice } from "@/lib/format";
import { ORDER_STATUS_CONFIG, type Order, type OrderStatus } from "@/types/store";

interface OrderTrackingClientProps {
  initialOrder: Order;
}

const STEPS: Array<{
  key: OrderStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "pending", label: "Pendiente", icon: Clock },
  { key: "preparing", label: "En preparación", icon: ChefHat },
  { key: "on_the_way", label: "En camino", icon: Truck },
  { key: "delivered", label: "Entregado", icon: CheckCircle2 },
];

export default function OrderTrackingClient({
  initialOrder,
}: OrderTrackingClientProps) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [liveConnected, setLiveConnected] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const startPolling = () => {
      if (pollTimer || stopped) return;
      setLiveConnected(true);
      pollTimer = setInterval(async () => {
        const { data } = await supabase
          .from("orders")
          .select("status, updated_at")
          .eq("id", order.id)
          .single();
        if (data && !stopped) {
          setOrder((prev) => ({ ...prev, ...data }));
        }
      }, 3000);
    };

    if (process.env.NEXT_PUBLIC_ENABLE_REALTIME !== "true") {
      startPolling();
      return () => {
        stopped = true;
        if (pollTimer) clearInterval(pollTimer);
      };
    }

    const channel = supabase
      .channel(`order-tracking-${order.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${order.id}`,
        },
        (payload) => {
          const updated = payload.new as Partial<Order>;
          setOrder((prev) => ({
            ...prev,
            ...updated,
          }));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLiveConnected(true);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          supabase.removeChannel(channel);
          startPolling();
        }
      });

    return () => {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, [order.id]);

  const statusMeta = ORDER_STATUS_CONFIG[order.status];
  const currentStep = statusMeta.stepIndex;

  return (
    <div className="min-h-screen bg-[#F8F7F4] py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a {STORE_NAME}
          </Link>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-stone-200 text-xs font-semibold text-zinc-700 shadow-2xs">
            <Radio
              className={`w-3.5 h-3.5 ${
                liveConnected ? "text-emerald-500 animate-pulse" : "text-zinc-400"
              }`}
            />
            {liveConnected ? "Actualizado" : "Sincronizando..."}
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                <Store className="w-3.5 h-3.5" />
                {STORE_NAME}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900">
                Pedido <span className="font-mono">#{order.order_number}</span>
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                Hola, <span className="font-semibold text-zinc-800">{order.customer_name}</span>
              </p>
            </div>

            <span
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border ${statusMeta.badgeClass}`}
            >
              {statusMeta.label}
            </span>
          </div>

          {/* Status Message */}
          <div className="p-4 rounded-2xl bg-[#F8F7F4] border border-stone-200/80">
            <p className="text-sm font-medium text-zinc-800">
              {statusMeta.description}
            </p>
          </div>

          {/* Stepper */}
          {order.status === "cancelled" ? (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800">
              <XCircle className="w-6 h-6 shrink-0" />
              <div className="text-sm">
                <p className="font-bold">Pedido cancelado</p>
                <p className="text-xs text-rose-700">
                  Si tienes dudas, comunícate con la tienda por WhatsApp.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:gap-4 pt-2">
              {STEPS.map((step, idx) => {
                const Icon = step.icon;
                const completed = idx <= currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <div
                    key={step.key}
                    className="flex flex-col items-center text-center gap-2"
                  >
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                        isCurrent
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-4 ring-emerald-100"
                          : completed
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-stone-100 text-stone-400"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span
                      className={`text-[11px] sm:text-xs font-semibold leading-tight ${
                        completed ? "text-zinc-900" : "text-zinc-400"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Address */}
          <div className="pt-4 border-t border-stone-200 flex items-start gap-2.5 text-sm text-zinc-600">
            <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-zinc-900 block text-xs">
                Dirección de entrega
              </span>
              {order.delivery_address}
              {order.notes && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  Nota: {order.notes}
                </p>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="pt-4 border-t border-stone-200 space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Resumen de productos
            </h2>
            <div className="space-y-2">
              {(order.order_items || []).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-zinc-700">
                    <span className="font-mono font-bold text-zinc-900">
                      {item.quantity}x
                    </span>{" "}
                    {item.product_name}
                  </span>
                  <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                    {formatPrice(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
              <span className="font-bold text-zinc-900">Total</span>
              <span className="font-mono text-lg font-extrabold text-zinc-900 tabular-nums">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
