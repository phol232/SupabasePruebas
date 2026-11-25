import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getServerSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      id?: string | null;
      name: string;
      description?: string;
      price: number;
      stock: number;
      category?: string;
      image_url?: string | null;
      is_active?: boolean;
    };

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "El nombre del producto es obligatorio" },
        { status: 400 }
      );
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.rpc("admin_upsert_product", {
      p_id: body.id || null,
      p_name: body.name.trim(),
      p_description: (body.description || "").trim(),
      p_price: Number(body.price),
      p_stock: Number(body.stock),
      p_category: (body.category || "General").trim(),
      p_image_url: body.image_url?.trim() || null,
      p_is_active: body.is_active ?? true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ product: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al guardar" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const { error } = await supabase.rpc("admin_delete_product", {
      p_id: id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al eliminar" },
      { status: 500 }
    );
  }
}
