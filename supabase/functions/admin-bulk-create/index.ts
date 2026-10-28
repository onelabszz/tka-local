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
    if (!authHeader) return json({ error: "No Authorization header" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Token tidak valid" }, 401);

    const { data: profile } = await userClient
      .from("local_profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin" || profile.status !== "active") {
      return json({ error: "Bukan admin yang aktif" }, 403);
    }

    const body = await req.json();
    const rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) return json({ error: "rows kosong" }, 400);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const created: unknown[] = [];
    const failed: unknown[] = [];

    for (const row of rows) {
      try {
        const email = (row.email || "").trim().toLowerCase();
        const password = row.password || "";
        const school_name = (row.school_name || "").trim();
        const role = row.role || "teacher";
        let expires_at = row.expires_at || null;

        if (!email || !email.includes("@")) {
          failed.push({ email, error: "Email tidak valid" });
          continue;
        }
        if (!password || password.length < 6) {
          failed.push({ email, error: "Password minimal 6 karakter" });
          continue;
        }
        if (!school_name) {
          failed.push({ email, error: "school_name kosong" });
          continue;
        }
        if (!["teacher", "admin"].includes(role)) {
          failed.push({ email, error: "role harus teacher/admin" });
          continue;
        }
        if (!expires_at) {
          expires_at = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
        }

        const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (authErr) {
          failed.push({ email, error: authErr.message });
          continue;
        }

        const { error: profErr } = await adminClient
          .from("local_profiles")
          .insert({
            id: authUser.user.id,
            email,
            school_name,
            status: "active",
            role,
            expires_at,
          });

        if (profErr) {
          await adminClient.auth.admin.deleteUser(authUser.user.id);
          failed.push({ email, error: "Profile: " + profErr.message });
          continue;
        }

        created.push({ email, id: authUser.user.id, school_name, role });
      } catch (e) {
        failed.push({ email: row.email || "?", error: (e as Error).message });
      }
    }

    return json({ created, failed, total_created: created.length, total_failed: failed.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
