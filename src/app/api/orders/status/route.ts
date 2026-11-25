import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase";

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      order_id: string;
      manage_token: string;
      status: string;
    };

    if (!body.order_id || !body.manage_token || !body.status) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos." },
        { status: 400 }
      );
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.rpc("update_order_status_by_token", {
      p_order_id: body.order_id,
      p_manage_token: body.manage_token,
      p_status: body.status,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error al actualizar estado del pedido.",
      },
      { status: 500 }
    );
  }
}
