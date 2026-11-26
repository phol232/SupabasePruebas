interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: { path?: string[] };
}

const MEMORY_LIMITER = new Map<string, { count: number; expiresAt: number }>();

async function checkRateLimit(
  request: Request,
  bucket: "read" | "write",
  limit: number,
  windowSec = 60
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown";

  const nowSec = Math.floor(Date.now() / 1000);
  const windowId = Math.floor(nowSec / windowSec);
  const resetIn = (windowId + 1) * windowSec - nowSec;
  const key = `${bucket}:${ip}:${windowId}`;

  // Try Cloudflare Edge Cache first (shared per PoP)
  try {
    const cache = (caches as unknown as { default?: Cache }).default;
    if (cache) {
      const cacheUrl = `https://rate-limit.internal/${encodeURIComponent(key)}`;
      const cached = await cache.match(cacheUrl);
      const current = cached ? parseInt(await cached.text(), 10) || 0 : 0;

      if (current >= limit) {
        return { allowed: false, remaining: 0, retryAfter: resetIn };
      }

      const next = current + 1;
      await cache.put(
        cacheUrl,
        new Response(String(next), {
          headers: { "Cache-Control": `max-age=${windowSec}` },
        })
      );

      return {
        allowed: true,
        remaining: Math.max(0, limit - next),
        retryAfter: resetIn,
      };
    }
  } catch {
    // Fallback to in-memory limiter in local dev
  }

  const nowMs = Date.now();
  const entry = MEMORY_LIMITER.get(key);
  if (!entry || entry.expiresAt <= nowMs) {
    MEMORY_LIMITER.set(key, { count: 1, expiresAt: nowMs + windowSec * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfter: resetIn };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, retryAfter: resetIn };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - entry.count),
    retryAfter: resetIn,
  };
}

function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function getSupabaseConfig(env: Env) {
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
    /\/$/,
    ""
  );
  const anonKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !anonKey) {
    throw new Error("Configuración de servidor incompleta.");
  }
  return { url, anonKey };
}

function buildSupabaseHeaders(
  anonKey: string,
  authHeader: string | null,
  contentType = "application/json"
): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: authHeader || `Bearer ${anonKey}`,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return headers;
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const method = request.method.toUpperCase();

  const isWrite = method !== "GET";
  const rate = await checkRateLimit(
    request,
    isWrite ? "write" : "read",
    isWrite ? 20 : 100,
    60
  );

  const rateHeaders = {
    "X-RateLimit-Limit": isWrite ? "20" : "100",
    "X-RateLimit-Remaining": String(rate.remaining),
  };

  if (!rate.allowed) {
    return jsonResponse(
      { error: "Demasiadas solicitudes. Intenta nuevamente en unos segundos." },
      429,
      { ...rateHeaders, "Retry-After": String(rate.retryAfter) }
    );
  }

  let config: { url: string; anonKey: string };
  try {
    config = getSupabaseConfig(env);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Error de configuración" },
      500,
      rateHeaders
    );
  }

  const authHeader = request.headers.get("Authorization");

  try {
    // 1. PRODUCTS
    if (route === "products") {
      if (method === "GET") {
        const includeAll = url.searchParams.get("all") === "1" && Boolean(authHeader);
        const query = includeAll
          ? "select=*&order=created_at.desc"
          : "select=*&is_active=eq.true&order=created_at.desc";

        const res = await fetch(`${config.url}/rest/v1/products?${query}`, {
          headers: buildSupabaseHeaders(config.anonKey, authHeader, ""),
        });
        const data = await res.json();
        return jsonResponse(data, res.status, rateHeaders);
      }

      if (!authHeader) {
        return jsonResponse({ error: "No autorizado" }, 401, rateHeaders);
      }

      if (method === "POST") {
        const body = await request.json();
        const res = await fetch(`${config.url}/rest/v1/products`, {
          method: "POST",
          headers: {
            ...buildSupabaseHeaders(config.anonKey, authHeader),
            Prefer: "return=representation",
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return jsonResponse(
          Array.isArray(data) ? data[0] : data,
          res.status,
          rateHeaders
        );
      }

      if (method === "PATCH") {
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "Falta id" }, 400, rateHeaders);
        const body = await request.json();
        const res = await fetch(
          `${config.url}/rest/v1/products?id=eq.${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: {
              ...buildSupabaseHeaders(config.anonKey, authHeader),
              Prefer: "return=representation",
            },
            body: JSON.stringify(body),
          }
        );
        const data = await res.json();
        return jsonResponse(
          Array.isArray(data) ? data[0] : data,
          res.status,
          rateHeaders
        );
      }

      if (method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "Falta id" }, 400, rateHeaders);
        const res = await fetch(
          `${config.url}/rest/v1/products?id=eq.${encodeURIComponent(id)}`,
          {
            method: "DELETE",
            headers: buildSupabaseHeaders(config.anonKey, authHeader, ""),
          }
        );
        return jsonResponse({ ok: res.ok }, res.status, rateHeaders);
      }
    }

    // 2. ORDERS
    if (route === "orders") {
      if (method === "GET") {
        const id = url.searchParams.get("id");
        if (id) {
          const res = await fetch(
            `${config.url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=*,order_items(*)`,
            {
              headers: buildSupabaseHeaders(config.anonKey, authHeader, ""),
            }
          );
          const data = await res.json();
          const row = Array.isArray(data) ? data[0] : null;
          if (!row) {
            return jsonResponse({ error: "Pedido no encontrado" }, 404, rateHeaders);
          }
          return jsonResponse(row, 200, rateHeaders);
        }

        if (!authHeader) {
          return jsonResponse({ error: "No autorizado" }, 401, rateHeaders);
        }

        const res = await fetch(
          `${config.url}/rest/v1/orders?select=*&order=created_at.desc&limit=30`,
          {
            headers: buildSupabaseHeaders(config.anonKey, authHeader, ""),
          }
        );
        const data = await res.json();
        return jsonResponse(data, res.status, rateHeaders);
      }

      if (method === "POST") {
        const body = (await request.json()) as {
          customer_name?: string;
          customer_phone?: string;
          delivery_address?: string;
          notes?: string;
          items?: Array<{ product_id: string; quantity: number }>;
        };

        if (
          !body.customer_name?.trim() ||
          !body.delivery_address?.trim() ||
          !Array.isArray(body.items) ||
          body.items.length === 0 ||
          body.items.length > 50
        ) {
          return jsonResponse(
            { error: "Datos del pedido inválidos." },
            400,
            rateHeaders
          );
        }

        const res = await fetch(
          `${config.url}/rest/v1/rpc/create_order_with_items`,
          {
            method: "POST",
            headers: buildSupabaseHeaders(config.anonKey, null),
            body: JSON.stringify({
              p_customer_name: body.customer_name.trim(),
              p_customer_phone: (body.customer_phone || "").trim(),
              p_delivery_address: body.delivery_address.trim(),
              p_notes: (body.notes || "").trim(),
              p_items: body.items,
            }),
          }
        );
        const data = await res.json();
        return jsonResponse(data, res.status, rateHeaders);
      }
    }

    // 3. ORDER STATUS
    if (route === "orders/status" && method === "PATCH") {
      const body = (await request.json()) as {
        order_id?: string;
        manage_token?: string;
        status?: string;
      };
      if (!body.order_id || !body.manage_token || !body.status) {
        return jsonResponse({ error: "Faltan parámetros." }, 400, rateHeaders);
      }

      const res = await fetch(
        `${config.url}/rest/v1/rpc/update_order_status_by_token`,
        {
          method: "POST",
          headers: buildSupabaseHeaders(config.anonKey, authHeader),
          body: JSON.stringify({
            p_order_id: body.order_id,
            p_manage_token: body.manage_token,
            p_status: body.status,
          }),
        }
      );
      const data = await res.json();
      return jsonResponse(data, res.status, rateHeaders);
    }

    // 4. AUTH (Login / Refresh / Logout — No Register!)
    if (route === "auth/login" && method === "POST") {
      const body = (await request.json()) as {
        email?: string;
        password?: string;
      };
      if (!body.email || !body.password) {
        return jsonResponse(
          { error: "Correo y contraseña requeridos." },
          400,
          rateHeaders
        );
      }
      const res = await fetch(
        `${config.url}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: buildSupabaseHeaders(config.anonKey, null),
          body: JSON.stringify({
            email: body.email.trim(),
            password: body.password,
          }),
        }
      );
      const data = await res.json();
      return jsonResponse(data, res.status, rateHeaders);
    }

    if (route === "auth/refresh" && method === "POST") {
      const body = (await request.json()) as { refresh_token?: string };
      if (!body.refresh_token) {
        return jsonResponse({ error: "Falta refresh_token" }, 400, rateHeaders);
      }
      const res = await fetch(
        `${config.url}/auth/v1/token?grant_type=refresh_token`,
        {
          method: "POST",
          headers: buildSupabaseHeaders(config.anonKey, null),
          body: JSON.stringify({ refresh_token: body.refresh_token }),
        }
      );
      const data = await res.json();
      return jsonResponse(data, res.status, rateHeaders);
    }

    if (route === "auth/logout" && method === "POST") {
      if (authHeader) {
        await fetch(`${config.url}/auth/v1/logout`, {
          method: "POST",
          headers: buildSupabaseHeaders(config.anonKey, authHeader),
        });
      }
      return jsonResponse({ ok: true }, 200, rateHeaders);
    }

    // 5. STORAGE UPLOAD
    if (route === "storage/upload" && method === "POST") {
      if (!authHeader) {
        return jsonResponse({ error: "No autorizado" }, 401, rateHeaders);
      }

      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return jsonResponse({ error: "No se recibió archivo" }, 400, rateHeaders);
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ];
      if (!allowedTypes.includes(file.type)) {
        return jsonResponse(
          { error: "Formato no permitido. Usa JPG, PNG, WebP o GIF." },
          400,
          rateHeaders
        );
      }

      if (file.size > 5 * 1024 * 1024) {
        return jsonResponse(
          { error: "La imagen supera el límite de 5 MB." },
          400,
          rateHeaders
        );
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `prod-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;

      const uploadRes = await fetch(
        `${config.url}/storage/v1/object/product-images/${fileName}`,
        {
          method: "POST",
          headers: {
            apikey: config.anonKey,
            Authorization: authHeader,
            "Content-Type": file.type,
          },
          body: await file.arrayBuffer(),
        }
      );

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        return jsonResponse(
          {
            error:
              (errData as { message?: string }).message ||
              "Error al subir imagen",
          },
          uploadRes.status,
          rateHeaders
        );
      }

      return jsonResponse(
        {
          url: `${config.url}/storage/v1/object/public/product-images/${fileName}`,
        },
        200,
        rateHeaders
      );
    }

    return jsonResponse({ error: "Ruta no encontrada" }, 404, rateHeaders);
  } catch (err) {
    return jsonResponse(
      {
        error: err instanceof Error ? err.message : "Error interno del proxy",
      },
      500,
      rateHeaders
    );
  }
};
