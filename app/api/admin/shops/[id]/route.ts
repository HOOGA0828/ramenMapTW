import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminAuth";

type Body = {
  action: "hide" | "delete";
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const body = (await request.json()) as Body;
  if (body.action !== "hide" && body.action !== "delete") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  if (body.action === "delete") {
    const { data, error } = await admin.supabase.from("shops").delete().eq("id", id).select("id,name").single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ shop: data, deleted: true });
  }

  const { data, error } = await admin.supabase
    .from("shops")
    .update({ status: "permanently_closed", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,name,status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shop: data });
}
