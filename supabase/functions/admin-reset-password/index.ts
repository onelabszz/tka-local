import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No Authorization" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Token tidak valid" }, 401);

    const { data: callerProfile } = await userClient
      .from("local_profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.status !== "active" ||
        !["admin", "superadmin"].includes(callerProfile.role)) {
      return json({ error: "Bukan admin" }, 403);
    }

    const body = await req.json();
    const { userId, newPassword } = body;
    if (!userId) return json({ error: "userId wajib" }, 400);
    if (!newPassword || newPassword.length < 6) {
      return json({ error: "Password minimal 6 karakter" }, 400);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: targetProfile } = await adminClient
      .from("local_profiles")
      .select("role, email")
      .eq("id", userId)
      .maybeSingle();

    if (!targetProfile) return json({ error: "User tidak ditemukan" }, 404);

    if (callerProfile.role !== "superadmin" && targetProfile.role === "superadmin") {
      return json({ error: "Tidak bisa reset password superadmin" }, 403);
    }

    const { error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true, email: targetProfile.email });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
