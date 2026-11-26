"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  LogOut,
  Lock,
  ArrowLeft,
  Package,
  ClipboardList,
  Upload,
  Copy,
  Check,
  ExternalLink,
  X,
  Eye,
  EyeOff,
  Mail,
  KeyRound,
  Loader2,
} from "lucide-react";
import { getAdminSupabaseClient } from "@/lib/supabase";
import { STORE_NAME, formatPrice } from "@/lib/format";
import {
  ORDER_STATUS_CONFIG,
  type Order,
  type OrderStatus,
  type Product,
} from "@/types/store";

interface ProductFormState {
  id: string | null;
  name: string;
  description: string;
  price: string;
  stock: string;
  category: string;
  image_url: string;
  is_active: boolean;
}

const EMPTY_FORM: ProductFormState = {
  id: null,
  name: "",
  description: "",
  price: "",
  stock: "10",
  category: "General",
  image_url: "",
  is_active: true,
};

export default function AdminDashboard() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"products" | "orders">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  // Product modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Check Supabase Auth session on mount
  useEffect(() => {
    const supabase = getAdminSupabaseClient();

    supabase.auth
      .getSession()
      .then(({ data }) => {
        const session = data.session;
        setAuthenticated(Boolean(session));
        setUserEmail(session?.user?.email ?? null);
      })
      .finally(() => {
        setCheckingSession(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAuthenticated(Boolean(session));
        setUserEmail(session?.user?.email ?? null);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Load initial data + subscribe/poll orders when authenticated
  useEffect(() => {
    if (!authenticated) return;
    const supabase = getAdminSupabaseClient();

    (async () => {
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
      if (productsRes.data) setProducts(productsRes.data as Product[]);
      if (ordersRes.data) setOrders(ordersRes.data as Order[]);
    })();

    if (process.env.NEXT_PUBLIC_ENABLE_REALTIME !== "true") {
      const timer = setInterval(async () => {
        const { data } = await supabase
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30);
        if (data) setOrders(data as Order[]);
      }, 5000);
      return () => clearInterval(timer);
    }

    let channel: ReturnType<ReturnType<typeof getAdminSupabaseClient>["channel"]> | null =
      null;
    try {
      channel = supabase
        .channel("admin-orders-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          (payload) => {
            if (payload.eventType === "INSERT") {
              setOrders((prev) => [payload.new as Order, ...prev]);
            } else if (payload.eventType === "UPDATE") {
              const updated = payload.new as Order;
              setOrders((prev) =>
                prev.map((o) =>
                  o.id === updated.id ? { ...o, ...updated } : o
                )
              );
            }
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            supabase.removeChannel(channel!);
          }
        });
    } catch {
      // ignore
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
  }, [authenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const supabase = getAdminSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        throw new Error("Correo o contraseña incorrectos.");
      }
      setPassword("");
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "No se pudo iniciar sesión."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    const supabase = getAdminSupabaseClient();
    await supabase.auth.signOut();
    setAuthenticated(false);
    setProducts([]);
    setOrders([]);
  };

  const openCreateModal = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setForm({
      id: product.id,
      name: product.name,
      description: product.description || "",
      price: String(product.price),
      stock: String(product.stock),
      category: product.category || "General",
      image_url: product.image_url || "",
      is_active: product.is_active,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setFormError(null);
    try {
      const supabase = getAdminSupabaseClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `prod-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);

      setForm((prev) => ({ ...prev, image_url: publicUrlData.publicUrl }));
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Error subiendo imagen"
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProduct(true);
    setFormError(null);
    try {
      if (!form.name.trim()) {
        throw new Error("El nombre del producto es obligatorio");
      }

      const supabase = getAdminSupabaseClient();
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        price: parseFloat(form.price) || 0,
        stock: parseInt(form.stock, 10) || 0,
        category: form.category.trim() || "General",
        image_url: form.image_url.trim() || null,
        is_active: form.is_active,
      };

      if (form.id) {
        const { data, error } = await supabase
          .from("products")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", form.id)
          .select()
          .single();
        if (error || !data) {
          throw new Error(error?.message || "No se pudo actualizar");
        }
        setProducts((prev) =>
          prev.map((p) => (p.id === (data as Product).id ? (data as Product) : p))
        );
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert(payload)
          .select()
          .single();
        if (error || !data) {
          throw new Error(error?.message || "No se pudo crear");
        }
        setProducts((prev) => [data as Product, ...prev]);
      }

      setIsModalOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Error al guardar producto"
      );
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("¿Eliminar este producto?")) return;
    const supabase = getAdminSupabaseClient();
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleOrderStatusChange = async (
    order: Order,
    nextStatus: OrderStatus
  ) => {
    if (!order.manage_token) return;
    const supabase = getAdminSupabaseClient();
    const { error } = await supabase.rpc("update_order_status_by_token", {
      p_order_id: order.id,
      p_manage_token: order.manage_token,
      p_status: nextStatus,
    });
    if (!error) {
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o))
      );
    }
  };

  const copyManageLink = (order: Order) => {
    if (!order.manage_token) return;
    const url = `${window.location.origin}/gestion?id=${order.id}&token=${order.manage_token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(order.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-600">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          Verificando acceso...
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-3xl border border-stone-200 p-7 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div className="w-11 h-11 rounded-2xl bg-zinc-900 text-white flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <Link
              href="/"
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a la tienda
            </Link>
          </div>

          <div>
            <h1 className="text-xl font-extrabold text-zinc-900">
              Acceso Administrativo
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Inicia sesión con tu cuenta de administrador para gestionar el
              catálogo y los pedidos.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@tutienda.com"
                  autoFocus
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                Contraseña
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            {authError && (
              <p className="text-xs font-semibold text-rose-600 text-center">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-bold transition-colors cursor-pointer"
            >
              {authLoading ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-stone-200">
        <div className="w-full px-4 sm:px-8 lg:px-12 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl text-zinc-500 hover:bg-stone-100 hover:text-zinc-900"
              title="Ver tienda"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="font-extrabold text-base text-zinc-900 leading-none">
                Panel de {STORE_NAME}
              </h1>
              <span className="text-[11px] text-zinc-500">
                {userEmail
                  ? `Sesión: ${userEmail}`
                  : "Gestión de catálogo y pedidos"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nuevo producto
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-zinc-500 hover:bg-stone-100 hover:text-rose-600 cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-8 lg:px-12 py-7 space-y-6">
        {/* Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("products")}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === "products"
                ? "bg-zinc-900 text-white shadow-xs"
                : "bg-white text-zinc-600 border border-stone-200 hover:text-zinc-900"
            }`}
          >
            <Package className="w-4 h-4" />
            Productos ({products.length})
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === "orders"
                ? "bg-zinc-900 text-white shadow-xs"
                : "bg-white text-zinc-600 border border-stone-200 hover:text-zinc-900"
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Pedidos ({orders.length})
          </button>
        </div>

        {/* Products Tab */}
        {activeTab === "products" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-2xl border border-stone-200 p-4 flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-20 h-20 rounded-xl bg-stone-100 overflow-hidden shrink-0">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] text-zinc-400">
                        Sin foto
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-stone-100 text-zinc-600">
                        {product.category}
                      </span>
                      {!product.is_active && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 inline-flex items-center gap-1">
                          <EyeOff className="w-3 h-3" /> Oculto
                        </span>
                      )}
                      {product.is_active && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Visible
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-zinc-900 truncate">
                      {product.name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="font-mono font-bold text-sm text-zinc-900">
                        {formatPrice(product.price)}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          product.stock <= 0
                            ? "text-rose-600"
                            : "text-zinc-500"
                        }`}
                      >
                        Stock: {product.stock}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
                  <button
                    onClick={() => openEditModal(product)}
                    className="flex-1 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-zinc-800 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeleteProduct(product.id)}
                    className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === "orders" && (
          <div className="space-y-3">
            {orders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-zinc-500">
                Aún no hay pedidos registrados.
              </div>
            ) : (
              orders.map((order) => {
                const statusMeta = ORDER_STATUS_CONFIG[order.status];
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono font-extrabold text-base text-zinc-900">
                          #{order.order_number}
                        </span>
                        <span className="font-bold text-sm text-zinc-900">
                          {order.customer_name}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {order.delivery_address}
                      </p>
                      <p className="font-mono text-xs font-bold text-zinc-800">
                        Total: {formatPrice(order.total)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={order.status}
                        onChange={(e) =>
                          handleOrderStatusChange(
                            order,
                            e.target.value as OrderStatus
                          )
                        }
                        className="px-3 py-2 rounded-xl border border-stone-200 bg-[#F8F7F4] text-xs font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="pending">Pendiente</option>
                        <option value="preparing">En preparación</option>
                        <option value="on_the_way">En camino</option>
                        <option value="delivered">Entregado</option>
                        <option value="cancelled">Cancelado</option>
                      </select>

                      <button
                        onClick={() => copyManageLink(order)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-zinc-700 cursor-pointer"
                      >
                        {copiedId === order.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Link único
                          </>
                        )}
                      </button>

                      <Link
                        href={`/pedido?id=${order.id}&token=${order.tracking_token}`}
                        target="_blank"
                        className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 text-zinc-600"
                        title="Ver seguimiento del cliente"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* Create / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-zinc-950/45 backdrop-blur-xs"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
              <h2 className="font-bold text-lg text-zinc-900">
                {form.id ? "Editar producto" : "Nuevo producto"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-zinc-400 hover:bg-stone-100 hover:text-zinc-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveProduct}
              className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              {/* Image upload + preview */}
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-2xl bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {form.image_url ? (
                    <img
                      src={form.image_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-zinc-400">Sin foto</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-bold text-zinc-800 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    {uploadingImage ? "Subiendo..." : "Subir imagen"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                      className="hidden"
                    />
                  </label>
                  <input
                    type="url"
                    value={form.image_url}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, image_url: e.target.value }))
                    }
                    placeholder="O pega la URL de una imagen..."
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Ej. Café de Especialidad 250g"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Breve descripción del producto..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1">
                    Precio *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.price}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, price: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1">
                    Stock *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.stock}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, stock: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, category: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm font-medium text-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      is_active: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded accent-emerald-600"
                />
                Visible en el catálogo público
              </label>

              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-zinc-600 hover:bg-stone-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProduct || uploadingImage}
                  className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-bold cursor-pointer"
                >
                  {savingProduct ? "Guardando..." : "Guardar producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
