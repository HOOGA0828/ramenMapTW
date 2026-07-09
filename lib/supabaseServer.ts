import { createClient } from "@supabase/supabase-js";

import { getPublicSupabaseEnv, getServiceSupabaseEnv } from "./env";

export function createAnonServerSupabaseClient() {
  const { url, anonKey } = getPublicSupabaseEnv();
  if (!url || !anonKey) {
    return null;
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: false
    }
  });
}

export function createServiceSupabaseClient() {
  const { url, serviceRoleKey } = getServiceSupabaseEnv();
  if (!url || !serviceRoleKey) {
    return null;
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });
}
