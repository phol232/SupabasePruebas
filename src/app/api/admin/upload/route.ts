import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getServerSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "No se recibió archivo" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `prod-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const supabase = getServerSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message },
        { status: 400 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);

    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error subiendo imagen" },
      { status: 500 }
    );
  }
}
