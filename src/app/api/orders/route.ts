import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      customer_name: string;
      customer_phone?: string;
      delivery_address: string;
      notes?: string;
      items: Array<{ product_id: string; quantity: number }>;
    };

    if (!body.customer_name?.trim() || !body.delivery_address?.trim()) {
      return NextResponse.json(
        { error: "Nombre y dirección son obligatorios." },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "El carrito está vacío." },
        { status: 400 }
      );
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.rpc("create_order_with_items", {
      p_customer_name: body.customer_name.trim(),
      p_customer_phone: (body.customer_phone || "").trim(),
      p_delivery_address: body.delivery_address.trim(),
      p_notes: (body.notes || "").trim(),
      p_items: body.items,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Error al registrar pedido.",
      },
      { status: 500 }
    );
  }
}
