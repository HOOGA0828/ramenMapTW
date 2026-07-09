import { NextRequest, NextResponse } from "next/server";

import { createServiceSupabaseClient } from "@/lib/supabaseServer";

export async function requireAdmin(request: NextRequest) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return {
      error: NextResponse.json({ error: "Supabase service role environment variables are not configured." }, { status: 500 })
    };
  }

  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) {
    return {
      error: NextResponse.json({ error: "Admin password environment variable is not configured." }, { status: 500 })
    };
  }

  const providedPassword = request.headers.get("x-admin-password") ?? "";

  if (providedPassword !== expectedPassword) {
    return { error: NextResponse.json({ error: "後台密碼錯誤。" }, { status: 401 }) };
  }

  return { supabase };
}
