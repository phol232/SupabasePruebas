interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request, env } = context;

  const upgradeHeader = request.headers.get("Upgrade");
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426 });
  }

  const supabaseUrl = (
    env.SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  const anonKey =
    env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !anonKey) {
    return new Response("Missing server configuration", { status: 500 });
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(
    `${supabaseUrl}${incomingUrl.pathname}${incomingUrl.search}`
  );
  // Replace dummy client apikey with the real server-side anon key
  targetUrl.searchParams.set("apikey", anonKey);

  const headers = new Headers(request.headers);
  headers.set("Host", targetUrl.host);

  return fetch(targetUrl.toString(), {
    method: request.method,
    headers,
  });
};
