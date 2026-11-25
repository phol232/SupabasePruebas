"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChefHat,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  User,
  Phone,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { STORE_NAME, formatPrice } from "@/lib/format";
import { ORDER_STATUS_CONFIG, type Order, type OrderStatus } from "@/types/store";

interface OrderManageClientProps {
  initialOrder: Order;
  manageToken: string;
}

const ACTION_BUTTONS: Array<{
  status: OrderStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
}> = [
  {
    status: "pending",
    label: "Pendiente",
    icon: Clock,
    activeClass: "bg-amber-500 text-white border-amber-500",
  },
  {
    status: "preparing",
    label: "En preparación",
    icon: ChefHat,
    activeClass: "bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-600/20",
  },
  {
    status: "on_the_way",
    label: "En camino",
    icon: Truck,
    activeClass: "bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20",
  },
  {
    status: "delivered",
    label: "Entregado",
    icon: CheckCircle2,
    activeClass: "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20",
  },
  {
    status: "cancelled",
    label: "Cancelar",
    icon: XCircle,
    activeClass: "bg-rose-600 text-white border-rose-600",
  },
];

export default function OrderManageClient({
  initialOrder,
  manageToken,
}: OrderManageClientProps) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [updating, setUpdating] = useState<OrderStatus | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const startPolling = () => {
      if (pollTimer || stopped) return;
      pollTimer = setInterval(async () => {
        const { data } = await supabase
          .from("orders")
          .select("status, updated_at")
          .eq("id", order.id)
          .single();
        if (data && !stopped) {
          setOrder((prev) => ({ ...prev, ...data }));
        }
      }, 4000);
    };

    if (process.env.NEXT_PUBLIC_ENABLE_REALTIME !== "true") {
      startPolling();
      return () => {
        stopped = true;
        if (pollTimer) clearInterval(pollTimer);
      };
    }

    const channel = supabase
      .channel(`order-manage-${order.id}`)
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
          setOrder((prev) => ({ ...prev, ...updated }));
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
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

  const handleStatusChange = async (nextStatus: OrderStatus) => {
    if (order.status === nextStatus) return;
    setUpdating(nextStatus);
    setFeedback(null);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("update_order_status_by_token", {
        p_order_id: order.id,
        p_manage_token: manageToken,
        p_status: nextStatus,
      });
      if (error) throw new Error(error.message);

      setOrder((prev) => ({ ...prev, status: nextStatus }));
      setFeedback(
        `Estado actualizado a "${ORDER_STATUS_CONFIG[nextStatus].label}". El cliente ya lo ve en vivo.`
      );
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : "No se pudo actualizar el estado."
      );
    } finally {
      setUpdating(null);
    }
  };

  const statusMeta = ORDER_STATUS_CONFIG[order.status];

  return (
    <div className="min-h-screen bg-[#F8F7F4] py-8 px-4">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
            <ShieldCheck className="w-4 h-4" />
            Link único de gestión · {STORE_NAME}
          </div>
          <Link
            href={`/pedido?id=${order.id}&token=${order.tracking_token}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
          >
            Vista cliente
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-7 shadow-xs space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-zinc-900">
                Pedido <span className="font-mono">#{order.order_number}</span>
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Toca un estado para notificar al cliente en tiempo real
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${statusMeta.badgeClass}`}
            >
              {statusMeta.label}
            </span>
          </div>

          {/* Quick Status Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {ACTION_BUTTONS.map((btn) => {
              const Icon = btn.icon;
              const isActive = order.status === btn.status;
              const isBusy = updating === btn.status;
              return (
                <button
                  key={btn.status}
                  onClick={() => handleStatusChange(btn.status)}
                  disabled={updating !== null}
                  className={`flex items-center justify-center gap-2 py-3 px-3 rounded-2xl border text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    isActive
                      ? btn.activeClass
                      : "bg-[#F8F7F4] border-stone-200 text-zinc-700 hover:bg-stone-100"
                  } ${btn.status === "cancelled" ? "col-span-2 sm:col-span-1" : ""}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {isBusy ? "Guardando..." : btn.label}
                </button>
              );
            })}
          </div>

          {feedback && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              {feedback}
            </div>
          )}

          {/* Customer Info */}
          <div className="pt-4 border-t border-stone-200 space-y-2.5 text-sm">
            <div className="flex items-center gap-2 text-zinc-700">
              <User className="w-4 h-4 text-zinc-400" />
              <span className="font-semibold text-zinc-900">
                {order.customer_name}
              </span>
            </div>
            {order.customer_phone && (
              <div className="flex items-center gap-2 text-zinc-700">
                <Phone className="w-4 h-4 text-zinc-400" />
                <span>{order.customer_phone}</span>
              </div>
            )}
            <div className="flex items-start gap-2 text-zinc-700">
              <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
              <div>
                <span>{order.delivery_address}</span>
                {order.notes && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Notas: {order.notes}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="pt-4 border-t border-stone-200 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Productos
            </h2>
            {(order.order_items || []).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  <span className="font-mono font-bold">{item.quantity}x</span>{" "}
                  {item.product_name}
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatPrice(item.subtotal)}
                </span>
              </div>
            ))}
            <div className="pt-2.5 border-t border-stone-100 flex items-center justify-between">
              <span className="font-bold">Total</span>
              <span className="font-mono text-lg font-extrabold tabular-nums">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
