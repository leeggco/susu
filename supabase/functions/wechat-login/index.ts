const WECHAT_APPID = Deno.env.get("WECHAT_APPID") ?? ""
const WECHAT_SECRET = Deno.env.get("WECHAT_SECRET") ?? ""

const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-scrape-key",
  "access-control-allow-methods": "POST,OPTIONS"
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" }
  })

const safeText = async (res: Response) => {
  try {
    return await res.text()
  } catch {
    return ""
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" })

  if (!WECHAT_APPID || !WECHAT_SECRET) {
    return json(500, { ok: false, error: "missing_wechat_config" })
  }

  const ct = (req.headers.get("content-type") || "").toLowerCase()
  if (!ct.includes("application/json")) return json(400, { ok: false, error: "invalid_content_type" })

  const body = await req.json().catch(() => null)
  const code = body && typeof body === "object" && typeof (body as any).code === "string" ? String((body as any).code).trim() : ""
  if (!code) return json(400, { ok: false, error: "missing_code" })

  const url =
    "https://api.weixin.qq.com/sns/jscode2session" +
    `?appid=${encodeURIComponent(WECHAT_APPID)}` +
    `&secret=${encodeURIComponent(WECHAT_SECRET)}` +
    `&js_code=${encodeURIComponent(code)}` +
    "&grant_type=authorization_code"

  const res = await fetch(url, { method: "GET" })
  const text = await safeText(res)
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!res.ok) {
    return json(502, { ok: false, error: "wechat_http_error", status: res.status })
  }

  const errcode = data && typeof data.errcode === "number" ? Number(data.errcode) : 0
  if (errcode) {
    return json(401, { ok: false, error: "wechat_code_invalid", errcode, errmsg: String(data?.errmsg || "") })
  }

  const openid = data && typeof data.openid === "string" ? String(data.openid).trim() : ""
  if (!openid) return json(502, { ok: false, error: "missing_openid" })

  const unionid = data && typeof data.unionid === "string" ? String(data.unionid).trim() : ""
  return json(200, { ok: true, openid, unionid: unionid || null })
})

