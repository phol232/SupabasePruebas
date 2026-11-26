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
  Sparkles,
  PackageCheck,
  MapPin,
  User,
  Phone,
  FileText,
  ArrowRight,
  Store,
  Zap,
  ShieldCheck,
  Clock,
  SlidersHorizontal,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  STORE_NAME,
  WHATSAPP_NUMBER,
  formatPrice,
  buildWhatsAppOrderUrl,
} from "@/lib/format";
import type { CartItem, Product } from "@/types/store";

const CART_STORAGE_KEY = "tienda_rapida_cart_v1";

type SortOption = "featured" | "price_asc" | "price_desc" | "in_stock";

export default function Storefront() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(
    null
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [onlyInStock, setOnlyInStock] = useState(false);

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

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const cat = p.category || "General";
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return [
      { name: "Todos", count: products.length },
      ...Array.from(counts.entries()).map(([name, count]) => ({ name, count })),
    ];
  }, [products]);

  const featuredProduct = useMemo(
    () => products.find((p) => p.stock > 0 && p.image_url) || products[0] || null,
    [products]
  );

  const filteredProducts = useMemo(() => {
    const list = products.filter((p) => {
      const matchesCategory =
        selectedCategory === "Todos" || p.category === selectedCategory;
      const matchesStock = !onlyInStock || p.stock > 0;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return matchesCategory && matchesStock && matchesSearch;
    });

    if (sortBy === "price_asc") {
      return [...list].sort((a, b) => Number(a.price) - Number(b.price));
    }
    if (sortBy === "price_desc") {
      return [...list].sort((a, b) => Number(b.price) - Number(a.price));
    }
    if (sortBy === "in_stock") {
      return [...list].sort((a, b) => b.stock - a.stock);
    }
    return list;
  }, [products, selectedCategory, onlyInStock, searchQuery, sortBy]);

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
      });

      setCart([]);
      localStorage.removeItem(CART_STORAGE_KEY);
      setIsCartOpen(false);

      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
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
    <div className="min-h-screen flex flex-col bg-[#F6F5F1]">
      {/* Announcement Bar (full width) */}
      <div className="w-full bg-zinc-950 text-zinc-200 text-xs py-2 px-4 sm:px-8 lg:px-12">
        <div className="w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 truncate">
            <span className="inline-flex w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="truncate font-medium">
              Envíos a domicilio · Atención personalizada por WhatsApp
            </span>
          </div>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold shrink-0"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Chat directo
          </a>
        </div>
      </div>

      {/* Main Sticky Full-Width Header */}
      <header className="sticky top-0 z-30 w-full backdrop-blur-md bg-white/90 border-b border-stone-200/90 shadow-2xs">
        <div className="w-full px-4 sm:px-8 lg:px-12 h-18 flex items-center justify-between gap-4">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-sm group-hover:bg-emerald-600 transition-colors">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-zinc-900 block leading-none">
                {STORE_NAME}
              </span>
              <span className="text-[11px] text-zinc-500 font-medium">
                Tienda Online
              </span>
            </div>
          </Link>

          {/* Header Search (Desktop) */}
          <div className="hidden md:flex flex-1 max-w-xl mx-4">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="¿Qué estás buscando hoy? Ej. café, pan, matcha..."
                className="w-full pl-11 pr-10 py-2.5 rounded-2xl bg-[#F6F5F1] border border-stone-200 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-zinc-900 text-white text-sm font-semibold hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Mi Carrito</span>
              {totalItems > 0 ? (
                <span className="inline-flex items-center gap-1.5 pl-2 border-l border-white/20 font-mono text-xs font-bold text-emerald-300">
                  <span>{totalItems}</span>
                  <span className="hidden lg:inline">· {formatPrice(totalAmount)}</span>
                </span>
              ) : (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/15 text-white text-xs font-bold font-mono">
                  0
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Full-Width Editorial Hero */}
      <section className="w-full bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 text-white border-b border-zinc-800">
        <div className="w-full px-4 sm:px-8 lg:px-12 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 text-xs font-bold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              CATÁLOGO SELECCIONADO · COMPRA DIRECTA
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1]">
              Calidad seleccionada,{" "}
              <span className="text-emerald-400">directo a tu puerta.</span>
            </h1>

            <p className="text-sm sm:text-base text-zinc-300 max-w-2xl leading-relaxed">
              Explora nuestros productos disponibles, arma tu pedido en segundos y
              coordina la entrega directamente con nuestro equipo por WhatsApp.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="#catalogo"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20"
              >
                Explorar catálogo
                <ArrowRight className="w-4 h-4" />
              </a>
              {totalItems > 0 && (
                <button
                  onClick={() => setIsCartOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm transition-all cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4 text-emerald-300" />
                  Completar pedido ({totalItems})
                </button>
              )}
            </div>

            {/* Trust indicators */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10 max-w-xl">
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Compra sin registro</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Seguimiento de pedido</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Atención directa</span>
              </div>
            </div>
          </div>

          {/* Featured Product Spotlight */}
          {featuredProduct && (
            <div className="lg:col-span-5">
              <div className="rounded-3xl bg-white/10 backdrop-blur-md border border-white/15 p-4 sm:p-5 flex flex-col sm:flex-row lg:flex-row items-center gap-4 shadow-2xl">
                <div className="w-full sm:w-40 h-44 sm:h-40 rounded-2xl overflow-hidden bg-zinc-800 shrink-0">
                  {featuredProduct.image_url ? (
                    <img
                      src={featuredProduct.image_url}
                      alt={featuredProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
                      Destacado
                    </div>
                  )}
                </div>
                <div className="flex-1 w-full space-y-2.5">
                  <span className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[11px] font-bold uppercase tracking-wider">
                    Producto destacado
                  </span>
                  <h2 className="font-bold text-lg text-white leading-snug">
                    {featuredProduct.name}
                  </h2>
                  <p className="text-xs text-zinc-300 line-clamp-2">
                    {featuredProduct.description}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-mono text-xl font-extrabold text-white">
                      {formatPrice(featuredProduct.price)}
                    </span>
                    <button
                      onClick={() => addToCart(featuredProduct)}
                      disabled={featuredProduct.stock <= 0}
                      className="px-4 py-2 rounded-xl bg-white text-zinc-950 hover:bg-emerald-400 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      + Agregar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Main Full-Width Catalog Area */}
      <main
        id="catalogo"
        className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8 space-y-7"
      >
        {/* Mobile Search */}
        <div className="md:hidden relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-stone-200 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        {/* Category Pills + Sort & Filter Toolbar */}
        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200/90 shadow-2xs">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
            {categoryCounts.map((cat) => {
              const active = selectedCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    active
                      ? "bg-zinc-900 text-white shadow-xs"
                      : "bg-[#F6F5F1] text-zinc-600 hover:bg-stone-200/70 hover:text-zinc-900"
                  }`}
                >
                  <span>{cat.name}</span>
                  <span
                    className={`font-mono text-[11px] px-1.5 py-0.2 rounded-md ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-white text-zinc-500"
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F6F5F1] text-xs font-semibold text-zinc-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => setOnlyInStock(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-emerald-600"
              />
              Solo disponibles
            </label>

            <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F6F5F1] border border-stone-200/70 text-xs font-semibold text-zinc-700">
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-transparent focus:outline-none cursor-pointer font-semibold"
              >
                <option value="featured">Orden: Recientes</option>
                <option value="in_stock">Disponibles primero</option>
                <option value="price_asc">Precio: menor a mayor</option>
                <option value="price_desc">Precio: mayor a menor</option>
              </select>
            </div>
          </div>
        </section>

        {/* Results header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-extrabold text-zinc-900 tracking-tight">
            {selectedCategory === "Todos"
              ? "Catálogo completo"
              : selectedCategory}
            <span className="ml-2 text-sm font-mono font-semibold text-zinc-500">
              ({filteredProducts.length})
            </span>
          </h2>
        </div>

        {/* Product Grid (4 cols on xl, full width) */}
        {loadingProducts ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6 pb-20 sm:pb-6">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-96 rounded-3xl bg-white border border-stone-200 animate-pulse"
              />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-3xl bg-white border border-stone-200 p-14 text-center">
            <PackageCheck className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-zinc-800">
              No encontramos productos con esos filtros
            </h3>
            <p className="text-sm text-zinc-500 mt-1 mb-4">
              Prueba limpiando la búsqueda o seleccionando otra categoría.
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("Todos");
                setOnlyInStock(false);
              }}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6 pb-20 sm:pb-6">
            {filteredProducts.map((product) => {
              const qty = getCartQuantity(product.id);
              const outOfStock = product.stock <= 0;
              const lowStock = product.stock > 0 && product.stock <= 5;

              return (
                <article
                  key={product.id}
                  className="group bg-white rounded-3xl border border-stone-200/90 overflow-hidden flex flex-col hover:shadow-xl hover:shadow-zinc-900/5 hover:-translate-y-0.5 hover:border-stone-300 transition-all duration-200"
                >
                  <div
                    onClick={() => setQuickViewProduct(product)}
                    className="relative aspect-[4/3] bg-stone-100 overflow-hidden cursor-pointer"
                  >
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${
                          outOfStock ? "grayscale opacity-60" : ""
                        }`}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs font-medium">
                        Sin imagen
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="absolute top-3 left-3">
                      <span className="px-2.5 py-1 rounded-xl bg-white/95 backdrop-blur-sm text-[11px] font-bold text-zinc-700 shadow-xs">
                        {product.category}
                      </span>
                    </div>

                    <div className="absolute top-3 right-3">
                      {outOfStock ? (
                        <span className="px-2.5 py-1 rounded-xl bg-rose-600 text-white text-[11px] font-bold shadow-xs">
                          Agotado
                        </span>
                      ) : lowStock ? (
                        <span className="px-2.5 py-1 rounded-xl bg-amber-500 text-white text-[11px] font-bold shadow-xs">
                          Últimas {product.stock}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[11px] font-semibold shadow-xs">
                          {product.stock} disp.
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-900/85 text-white text-[11px] font-semibold backdrop-blur-sm">
                        <Eye className="w-3.5 h-3.5" />
                        Ver detalle
                      </span>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h3
                        onClick={() => setQuickViewProduct(product)}
                        className="font-bold text-base text-zinc-900 leading-snug cursor-pointer hover:text-emerald-700 transition-colors"
                      >
                        {product.name}
                      </h3>
                    </div>

                    <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2 mb-4 flex-1">
                      {product.description ||
                        "Producto disponible para entrega rápida."}
                    </p>

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-stone-100">
                      <span className="font-mono font-extrabold text-lg text-zinc-900 tabular-nums">
                        {formatPrice(product.price)}
                      </span>

                      {outOfStock ? (
                        <span className="px-3.5 py-2 rounded-xl bg-stone-100 text-stone-400 text-xs font-bold">
                          Agotado
                        </span>
                      ) : qty === 0 ? (
                        <button
                          onClick={() => addToCart(product)}
                          className="py-2.5 px-4 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-emerald-600 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Plus className="w-4 h-4" />
                          Agregar
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl p-1">
                          <button
                            onClick={() => updateQuantity(product.id, -1)}
                            className="w-7 h-7 rounded-lg bg-white text-zinc-800 hover:bg-stone-100 flex items-center justify-center shadow-2xs cursor-pointer"
                            aria-label="Disminuir cantidad"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-mono font-bold text-xs text-emerald-900 w-5 text-center">
                            {qty}
                          </span>
                          <button
                            onClick={() => updateQuantity(product.id, 1)}
                            disabled={qty >= product.stock}
                            className="w-7 h-7 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center shadow-2xs cursor-pointer"
                            aria-label="Aumentar cantidad"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {/* Full-Width Store Footer */}
      <footer className="w-full bg-white border-t border-stone-200 mt-10">
        <div className="w-full px-4 sm:px-8 lg:px-12 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-extrabold text-zinc-900">
              <Store className="w-4 h-4 text-emerald-600" />
              {STORE_NAME}
            </div>
            <p className="text-xs text-zinc-500">
              Productos seleccionados con atención personalizada y envío rápido.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Escribir por WhatsApp
            </a>
          </div>
        </div>
      </footer>

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

      {/* Product Quick View Modal */}
      {quickViewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-zinc-950/50 backdrop-blur-xs"
            onClick={() => setQuickViewProduct(null)}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 sm:grid-cols-2">
            <button
              onClick={() => setQuickViewProduct(null)}
              className="absolute top-3 right-3 z-20 p-2 rounded-full bg-white/90 text-zinc-600 hover:text-zinc-900 shadow-sm cursor-pointer"
              aria-label="Cerrar detalle"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="aspect-square sm:aspect-auto bg-stone-100">
              {quickViewProduct.image_url ? (
                <img
                  src={quickViewProduct.image_url}
                  alt={quickViewProduct.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
                  Sin imagen
                </div>
              )}
            </div>
            <div className="p-6 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <span className="inline-block px-2.5 py-1 rounded-lg bg-stone-100 text-[11px] font-bold text-zinc-600">
                  {quickViewProduct.category}
                </span>
                <h3 className="text-xl font-extrabold text-zinc-900">
                  {quickViewProduct.name}
                </h3>
                <p className="font-mono text-2xl font-extrabold text-emerald-700">
                  {formatPrice(quickViewProduct.price)}
                </p>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  {quickViewProduct.description ||
                    "Producto disponible para entrega rápida."}
                </p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Stock disponible: {quickViewProduct.stock} unidades
                </div>
              </div>

              <button
                onClick={() => {
                  addToCart(quickViewProduct);
                  setQuickViewProduct(null);
                  setIsCartOpen(true);
                }}
                disabled={quickViewProduct.stock <= 0}
                className="w-full py-3.5 rounded-2xl bg-zinc-900 hover:bg-emerald-600 disabled:bg-stone-200 disabled:text-stone-400 text-white text-sm font-bold transition-colors cursor-pointer"
              >
                {quickViewProduct.stock <= 0
                  ? "Producto agotado"
                  : "Agregar y ver carrito"}
              </button>
            </div>
          </div>
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
                        className="flex items-center gap-3 p-3 rounded-2xl bg-[#F6F5F1] border border-stone-200/80"
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
                  Al confirmar, te redirigiremos a WhatsApp para finalizar tu pedido.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
