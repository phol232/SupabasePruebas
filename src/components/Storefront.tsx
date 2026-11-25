"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  MessageCircle,
  Lock,
  Sparkles,
  PackageCheck,
  MapPin,
  User,
  Phone,
  FileText,
  ArrowRight,
  Store,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  STORE_NAME,
  formatPrice,
  buildWhatsAppOrderUrl,
} from "@/lib/format";
import type { CartItem, Product } from "@/types/store";

const CART_STORAGE_KEY = "tienda_rapida_cart_v1";

export default function Storefront() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");

  // Checkout form state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hydrate cart from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CartItem[];
        if (Array.isArray(parsed)) {
          setCart(parsed);
        }
      }
    } catch {
      // ignore storage errors
    } finally {
      setCartHydrated(true);
    }
  }, []);

  // Persist cart to localStorage
  useEffect(() => {
    if (!cartHydrated) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage errors
    }
  }, [cart, cartHydrated]);

  // Fetch active products on mount (100% static compatible)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from("products")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false });
        if (!cancelled && data) {
          setProducts(data as Product[]);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to realtime product/stock updates (only when Realtime WS is enabled)
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_REALTIME !== "true") return;
    let channel: ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null =
      null;
    try {
      const supabase = getSupabaseClient();
      channel = supabase
        .channel("storefront-products")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "products" },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const incoming = payload.new as Product;
              if (incoming.is_active) {
                setProducts((prev) => [incoming, ...prev]);
              }
            } else if (payload.eventType === "UPDATE") {
              const updated = payload.new as Product;
              setProducts((prev) => {
                if (!updated.is_active) {
                  return prev.filter((p) => p.id !== updated.id);
                }
                const exists = prev.some((p) => p.id === updated.id);
                return exists
                  ? prev.map((p) => (p.id === updated.id ? updated : p))
                  : [updated, ...prev];
              });
            } else if (payload.eventType === "DELETE") {
              const deleted = payload.old as { id: string };
              setProducts((prev) => prev.filter((p) => p.id !== deleted.id));
            }
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            supabase.removeChannel(channel!);
          }
        });
    } catch {
      // ignore if env not configured yet
    }

    return () => {
      if (channel) {
        try {
          getSupabaseClient().removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(products.map((p) => p.category || "General"))
    );
    return ["Todos", ...unique];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory =
        selectedCategory === "Todos" || p.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const getCartQuantity = (productId: string) =>
    cart.find((item) => item.product.id === productId)?.quantity ?? 0;

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, product, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const liveProduct =
            products.find((p) => p.id === productId) || item.product;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          if (nextQty > liveProduct.stock) return item;
          return { product: liveProduct, quantity: nextQty };
        })
        .filter((x): x is CartItem => x !== null)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const totalItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const totalAmount = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + Number(item.product.price) * item.quantity,
        0
      ),
    [cart]
  );

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (cart.length === 0) {
      setErrorMsg("Tu carrito está vacío.");
      return;
    }
    if (!customerName.trim() || !deliveryAddress.trim()) {
      setErrorMsg("Por favor completa tu nombre y dirección de entrega.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getSupabaseClient();
      const payloadItems = cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
      }));

      const { data, error } = await supabase.rpc("create_order_with_items", {
        p_customer_name: customerName.trim(),
        p_customer_phone: customerPhone.trim(),
        p_delivery_address: deliveryAddress.trim(),
        p_notes: notes.trim(),
        p_items: payloadItems,
      });

      if (error || !data) {
        throw new Error(error?.message || "No se pudo registrar el pedido.");
      }

      const result = data as {
        order_id: string;
        order_number: number;
        total: number;
        tracking_token: string;
        manage_token: string;
      };

      const origin =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
        window.location.origin;
      const trackingPath = `/pedido?id=${result.order_id}&token=${result.tracking_token}`;
      const trackingUrl = `${origin}${trackingPath}`;
      const manageUrl = `${origin}/gestion?id=${result.order_id}&token=${result.manage_token}`;

      const whatsappUrl = buildWhatsAppOrderUrl({
        orderNumber: result.order_number,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deliveryAddress: deliveryAddress.trim(),
        notes: notes.trim(),
        items: cart.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          subtotal: Number(i.product.price) * i.quantity,
        })),
        total: Number(result.total),
        trackingUrl,
        manageUrl,
      });

      // Clear cart & close drawer
      setCart([]);
      localStorage.removeItem(CART_STORAGE_KEY);
      setIsCartOpen(false);

      // Open WhatsApp in new tab
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");

      // Navigate customer to live tracking page
      router.push(trackingPath);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al registrar tu pedido."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#F8F7F4]/85 border-b border-stone-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-sm group-hover:bg-emerald-600 transition-colors">
              <Store className="w-4.5 h-4.5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-zinc-900 block leading-none">
                {STORE_NAME}
              </span>
              <span className="text-[11px] text-zinc-500 font-medium">
                Pedidos directos por WhatsApp
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-stone-200/60 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Panel Dueño</span>
            </Link>

            <button
              onClick={() => setIsCartOpen(true)}
              className="relative inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Carrito</span>
              {totalItems > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-xs font-bold font-mono">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Compact Hero Banner */}
        <section className="mb-8 rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950 text-white p-6 sm:p-8 shadow-sm relative overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-emerald-300 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Sin registro · Seguimiento en tiempo real
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-2">
              Elige tus productos y pide en segundos
            </h1>
            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
              Arma tu carrito, ingresa tu dirección y envía tu pedido directo por
              WhatsApp. Podrás ver cada cambio de estado al instante.
            </p>
          </div>
          <div className="absolute -right-12 -bottom-12 w-56 h-56 rounded-full bg-emerald-500/15 blur-2xl pointer-events-none" />
        </section>

        {/* Search & Categories */}
        <section className="mb-7 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {categories.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    active
                      ? "bg-zinc-900 text-white shadow-sm"
                      : "bg-white text-zinc-600 border border-stone-200 hover:border-stone-300 hover:text-zinc-900"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-stone-200 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
        </section>

        {/* Product Grid */}
        {loadingProducts ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-20 sm:pb-6">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-80 rounded-2xl bg-white border border-stone-200 animate-pulse"
              />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-3xl bg-white border border-stone-200 p-12 text-center">
            <PackageCheck className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-zinc-800">
              No encontramos productos
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Prueba con otra categoría o limpia el buscador.
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-20 sm:pb-6">
            {filteredProducts.map((product) => {
              const qty = getCartQuantity(product.id);
              const outOfStock = product.stock <= 0;
              const lowStock = product.stock > 0 && product.stock <= 5;

              return (
                <article
                  key={product.id}
                  className="group bg-white rounded-2xl border border-stone-200/90 overflow-hidden flex flex-col hover:shadow-md hover:border-stone-300 transition-all duration-200"
                >
                  <div className="relative aspect-[4/3] bg-stone-100 overflow-hidden">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className={`w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 ${
                          outOfStock ? "grayscale opacity-60" : ""
                        }`}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs font-medium">
                        Sin imagen
                      </div>
                    )}

                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-lg bg-white/90 backdrop-blur-sm text-[11px] font-semibold text-zinc-700 shadow-xs">
                        {product.category}
                      </span>
                    </div>

                    <div className="absolute top-3 right-3">
                      {outOfStock ? (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold shadow-xs">
                          Agotado
                        </span>
                      ) : lowStock ? (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-bold shadow-xs">
                          Últimas {product.stock}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-600/90 text-white text-[11px] font-semibold shadow-xs">
                          Stock: {product.stock}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4.5 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h3 className="font-bold text-base text-zinc-900 leading-snug">
                        {product.name}
                      </h3>
                      <span className="font-mono font-bold text-base text-zinc-900 shrink-0 tabular-nums">
                        {formatPrice(product.price)}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2 mb-4 flex-1">
                      {product.description || "Producto disponible para entrega rápida."}
                    </p>

                    {outOfStock ? (
                      <button
                        disabled
                        className="w-full py-2.5 rounded-xl bg-stone-100 text-stone-400 text-sm font-semibold cursor-not-allowed"
                      >
                        Sin stock disponible
                      </button>
                    ) : qty === 0 ? (
                      <button
                        onClick={() => addToCart(product)}
                        className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-emerald-600 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        Agregar al carrito
                      </button>
                    ) : (
                      <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-1">
                        <button
                          onClick={() => updateQuantity(product.id, -1)}
                          className="w-9 h-9 rounded-lg bg-white text-zinc-800 hover:bg-stone-100 flex items-center justify-center shadow-2xs cursor-pointer"
                          aria-label="Disminuir cantidad"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-mono font-bold text-sm text-emerald-900">
                          {qty} en carrito
                        </span>
                        <button
                          onClick={() => updateQuantity(product.id, 1)}
                          disabled={qty >= product.stock}
                          className="w-9 h-9 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center shadow-2xs cursor-pointer"
                          aria-label="Aumentar cantidad"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {/* Mobile Floating Cart Bar */}
      {totalItems > 0 && !isCartOpen && (
        <div className="fixed bottom-4 left-4 right-4 z-30 sm:hidden">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full py-3.5 px-5 rounded-2xl bg-zinc-900 text-white shadow-xl flex items-center justify-between font-semibold"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold font-mono flex items-center justify-center">
                {totalItems}
              </span>
              <span className="text-sm">Ver mi pedido</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-sm">
              <span>{formatPrice(totalAmount)}</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Slide-over Cart & Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-zinc-950/45 backdrop-blur-xs transition-opacity"
            onClick={() => setIsCartOpen(false)}
          />
          <aside className="relative z-10 w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-600" />
                <h2 className="font-bold text-lg text-zinc-900">
                  Tu Pedido ({totalItems})
                </h2>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-2 rounded-xl text-zinc-500 hover:bg-stone-100 hover:text-zinc-900 cursor-pointer"
                aria-label="Cerrar carrito"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {cart.length === 0 ? (
                <div className="py-16 text-center">
                  <ShoppingBag className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                  <p className="font-semibold text-zinc-700">
                    Tu carrito está vacío
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Agrega productos del catálogo para pedir por WhatsApp.
                  </p>
                </div>
              ) : (
                <>
                  {/* Cart items */}
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div
                        key={item.product.id}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-[#F8F7F4] border border-stone-200/80"
                      >
                        <div className="w-14 h-14 rounded-xl bg-stone-200 overflow-hidden shrink-0">
                          {item.product.image_url && (
                            <img
                              src={item.product.image_url}
                              alt={item.product.name}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm text-zinc-900 truncate">
                            {item.product.name}
                          </h4>
                          <p className="font-mono text-xs text-zinc-500 mt-0.5">
                            {formatPrice(item.product.price)} c/u
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(item.product.id, -1)
                              }
                              className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center hover:bg-stone-100 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-mono text-xs font-bold w-5 text-center">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.product.id, 1)}
                              className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center hover:bg-stone-100 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end gap-2">
                          <span className="font-mono font-bold text-sm text-zinc-900">
                            {formatPrice(
                              Number(item.product.price) * item.quantity
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.product.id)}
                            className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer"
                            aria-label="Eliminar producto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Delivery Form */}
                  <form
                    id="checkout-form"
                    onSubmit={handleCheckout}
                    className="space-y-3.5 pt-2 border-t border-stone-200"
                  >
                    <h3 className="font-bold text-sm text-zinc-900">
                      Datos para la entrega
                    </h3>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-600 mb-1">
                        Tu nombre *
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Ej. María Pérez"
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-600 mb-1">
                        WhatsApp / Teléfono (opcional)
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="Ej. +51 987 654 321"
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-600 mb-1">
                        Dirección de entrega *
                      </label>
                      <div className="relative">
                        <MapPin className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                        <textarea
                          required
                          rows={2}
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="Calle, número, piso/dpto, referencia..."
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-600 mb-1">
                        Notas adicionales (opcional)
                      </label>
                      <div className="relative">
                        <FileText className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Ej. Pago con Yape / efectivo, sin timbre..."
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    {errorMsg && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                        {errorMsg}
                      </div>
                    )}
                  </form>
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-5 border-t border-stone-200 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-600">
                    Total a pagar
                  </span>
                  <span className="font-mono text-xl font-extrabold text-zinc-900 tabular-nums">
                    {formatPrice(totalAmount)}
                  </span>
                </div>
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={submitting}
                  className="w-full py-3.5 px-5 rounded-2xl bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-60 text-white font-bold text-sm shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5" />
                  {submitting
                    ? "Registrando pedido..."
                    : "Pedir por WhatsApp"}
                </button>
                <p className="text-[11px] text-center text-zinc-400">
                  Se guardará tu pedido y abrirá WhatsApp con el resumen listo.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
