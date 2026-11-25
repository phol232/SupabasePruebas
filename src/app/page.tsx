import { getServerSupabaseClient } from "@/lib/supabase";
import Storefront from "@/components/Storefront";
import type { Product } from "@/types/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let products: Product[] = [];

  try {
    const supabase = getServerSupabaseClient();
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (data) {
      products = data as Product[];
    }
  } catch {
    // Render gracefully if env vars aren't set yet
  }

  return <Storefront initialProducts={products} />;
}
