import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const PDD_CLIENT_ID = Deno.env.get("PDD_CLIENT_ID") ?? ""
const PDD_CLIENT_SECRET = Deno.env.get("PDD_CLIENT_SECRET") ?? ""
const PDD_PID = Deno.env.get("PDD_PID") ?? ""
const PDD_API_URL = "https://gw-api.pinduoduo.com/api/router"

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-client-id",
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function signRequest(params: Record<string, any>, secret: string): Promise<string> {
  // 1. Sort keys
  const keys = Object.keys(params).sort()
  
  // 2. Concatenate key+value
  let s = secret
  for (const k of keys) {
    if (params[k] !== undefined && params[k] !== null) {
      s += k + String(params[k])
    }
  }
  s += secret

  // 3. MD5
  const data = new TextEncoder().encode(s)
  const hashBuffer = await crypto.subtle.digest("MD5", data)
  return toHex(hashBuffer).toUpperCase()
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, ...payload } = await req.json()

    if (!PDD_CLIENT_ID || !PDD_CLIENT_SECRET) {
      throw new Error("Missing PDD_CLIENT_ID or PDD_CLIENT_SECRET env vars")
    }

    const commonParams = {
      client_id: PDD_CLIENT_ID,
      timestamp: Math.floor(Date.now() / 1000),
      data_type: "JSON",
      version: "V1",
    }

    let apiParams: Record<string, any> = {}

    if (action === "get-list") {
      // pdd.ddk.goods.recommend.get
      apiParams = {
        ...commonParams,
        type: "pdd.ddk.goods.recommend.get",
        channel_type: payload.channel_type || 5, // 5: Real-time best sellers
        limit: payload.limit || 20,
        offset: payload.offset || 0,
      }
      if (payload.pid || PDD_PID) apiParams.pid = payload.pid || PDD_PID
      if (payload.cat_id) apiParams.cat_id = payload.cat_id
      
    } else if (action === "get-promotion-url") {
      const pid = payload.p_id || PDD_PID
      if (!pid) {
        throw new Error("Missing PDD_PID. Please set it in Supabase Secrets.")
      }

      // pdd.ddk.goods.promotion.url.generate
      apiParams = {
        ...commonParams,
        type: "pdd.ddk.goods.promotion.url.generate",
        p_id: pid,
        goods_sign_list: payload.goods_sign_list ? JSON.stringify(payload.goods_sign_list) : undefined,
        generate_we_app: true,
      }
      // If passing single goods_sign instead of list
      if (payload.goods_sign) {
          apiParams.goods_sign_list = JSON.stringify([payload.goods_sign])
      }
    } else {
      throw new Error("Invalid action")
    }

    // Sign
    apiParams.sign = await signRequest(apiParams, PDD_CLIENT_SECRET)

    // Call PDD API
    const response = await fetch(PDD_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiParams),
    })

    const data = await response.json()

    if (data.error_response) {
      throw new Error(JSON.stringify(data.error_response))
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
