const SCRAPE_API_KEY = Deno.env.get("SCRAPE_API_KEY") ?? ""
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY") ?? ""
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const STORAGE_BUCKET = Deno.env.get("STORAGE_BUCKET") ?? "group-covers"

const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-scrape-key",
  "access-control-allow-methods": "POST,OPTIONS"
}

const json = (status: number, body: unknown, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  })

const stripDataUrlPrefix = (raw: string) => {
  const s = String(raw || "").trim()
  const idx = s.indexOf("base64,")
  if (s.startsWith("data:") && idx >= 0) return s.slice(idx + "base64,".length).trim()
  return s
}

const base64ToBytes = (base64: string) => {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

const parseJsonLoose = (text: string) => {
  const t = String(text || "").trim()
  if (!t) return null
  try {
    return JSON.parse(t)
  } catch {}
  const m = t.match(/\{[\s\S]*\}/)
  if (!m?.[0]) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

const normalizeExtracted = (raw: any) => {
  const title = raw && typeof raw.title === "string" ? String(raw.title).trim() : ""
  const price = raw && typeof raw.price === "number" ? Number(raw.price) : null
  const original_price = raw && typeof raw.original_price === "number" ? Number(raw.original_price) : null
  const group_size = raw && typeof raw.group_size === "number" ? Number(raw.group_size) : null
  const missing_count = raw && typeof raw.missing_count === "number" ? Number(raw.missing_count) : null
  const remaining_hours = raw && typeof raw.remaining_hours === "number" ? Number(raw.remaining_hours) : null
  const is_baiyi_butie =
    raw && typeof raw.is_baiyi_butie === "boolean"
      ? Boolean(raw.is_baiyi_butie)
      : raw && typeof raw.is_baiyi_butie === "string"
        ? ["true", "1", "yes", "y"].includes(String(raw.is_baiyi_butie).trim().toLowerCase())
        : false
  return { title, price, original_price, group_size, missing_count, remaining_hours, is_baiyi_butie }
}

const callGeminiOcr = async (imageBase64: string, mimeType: string) => {
  if (!GEMINI_API_KEY) throw new Error("missing_gemini_key")
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent`

  const prompt =
    "你在做 OCR + 信息抽取。请从这张拼团分享截图中提取一个 JSON，字段如下：" +
    "title（字符串）、price（数字）、original_price（数字，可为空）、group_size（整数，可为空）、" +
    "missing_count（整数：还差多少人，可为空）、remaining_hours（数字：剩余多少小时，可为空）、is_baiyi_butie（布尔：是否百亿补贴）。" +
    "只输出纯 JSON，不要代码块，不要解释。"

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType || "image/jpeg",
                data: imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: { temperature: 0 }
    })
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = data && typeof data === "object" ? JSON.stringify(data) : `http_${res.status}`
    throw new Error(msg)
  }
  const parts = data?.candidates?.[0]?.content?.parts
  const text = Array.isArray(parts) ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("\n") : ""
  const parsed = parseJsonLoose(text)
  return normalizeExtracted(parsed)
}

const uploadCoverToStorage = async (coverBase64: string, mimeType: string) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("missing_supabase_storage_config")
  const bytes = base64ToBytes(coverBase64)
  const ext = (mimeType || "").toLowerCase().includes("png") ? "png" : "jpg"
  const objectPath = `covers/${crypto.randomUUID()}.${ext}`

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}/${objectPath}`
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": mimeType || "image/jpeg",
      "x-upsert": "true"
    },
    body: bytes
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = data && typeof data === "object" ? JSON.stringify(data) : `http_${res.status}`
    throw new Error(msg)
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(STORAGE_BUCKET)}/${objectPath}`
  return publicUrl
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" })

  if (SCRAPE_API_KEY) {
    const key = req.headers.get("x-scrape-key") || ""
    if (key !== SCRAPE_API_KEY) return json(401, { ok: false, error: "unauthorized" })
  }

  const ct = (req.headers.get("content-type") || "").toLowerCase()
  if (!ct.includes("application/json")) return json(400, { ok: false, error: "invalid_content_type" })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return json(400, { ok: false, error: "invalid_body" })

  const imageBase64Raw =
    typeof (body as any).image_base64 === "string"
      ? String((body as any).image_base64)
      : typeof (body as any).imageBase64 === "string"
        ? String((body as any).imageBase64)
        : ""
  const mimeType =
    typeof (body as any).mime_type === "string"
      ? String((body as any).mime_type)
      : typeof (body as any).mimeType === "string"
        ? String((body as any).mimeType)
        : "image/jpeg"

  const coverBase64Raw =
    typeof (body as any).cover_image_base64 === "string"
      ? String((body as any).cover_image_base64)
      : typeof (body as any).coverImageBase64 === "string"
        ? String((body as any).coverImageBase64)
        : ""
  const coverMimeType =
    typeof (body as any).cover_mime_type === "string"
      ? String((body as any).cover_mime_type)
      : typeof (body as any).coverMimeType === "string"
        ? String((body as any).coverMimeType)
        : "image/jpeg"

  const imageBase64 = stripDataUrlPrefix(imageBase64Raw)
  const coverBase64 = stripDataUrlPrefix(coverBase64Raw)
  if (!imageBase64) return json(400, { ok: false, error: "missing_image_base64" })
  if (imageBase64.length > 12_000_000) return json(413, { ok: false, error: "image_too_large" })
  if (coverBase64 && coverBase64.length > 8_000_000) return json(413, { ok: false, error: "cover_too_large" })

  try {
    const [extracted, coverUrl] = await Promise.all([
      callGeminiOcr(imageBase64, mimeType),
      coverBase64 ? uploadCoverToStorage(coverBase64, coverMimeType) : Promise.resolve("")
    ])
    return json(200, { ok: true, cover_image_url: coverUrl || "", ...extracted })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json(502, { ok: false, error: "ocr_failed", message: msg })
  }
})

