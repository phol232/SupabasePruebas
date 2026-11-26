import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function getCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en tu archivo .env"
    );
  }

  return { url, anonKey };
}

export function getSupabaseClient(): SupabaseClient {
  const { url, anonKey } = getCredentials();

  if (typeof window === "undefined") {
    return createClient(url, anonKey, {
      auth: { persistSession: false },
    });
  }

  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  return browserClient;
}

export function getAdminSupabaseClient(): SupabaseClient {
  const { url, anonKey } = getCredentials();

  if (typeof window === "undefined") {
    return createClient(url, anonKey, {
      auth: { persistSession: false },
    });
  }

  if (!adminClient) {
    adminClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  return adminClient;
}
