const getConfig = () => {
  const app = getApp ? getApp() : null
  const g = app && app.globalData ? app.globalData : {}
  return {
    supabaseUrl: g.supabaseUrl || '',
    supabaseAnonKey: g.supabaseAnonKey || '',
    supabaseFunctionsBaseUrl: g.supabaseFunctionsBaseUrl || '',
    supabaseScrapeKey: g.supabaseScrapeKey || ''
  }
}

const storageKeys = {
  clientId: 'sb_client_id_v1',
  userId: 'sb_user_id_v1',
  userProfile: 'sb_user_profile_v1',
  authSkipped: 'sb_auth_skipped_v1'
}

const DEFAULT_AVATAR_URL =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

const requestJson = (url, { method = 'GET', headers = {}, data = undefined } = {}) =>
  new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header: {
        'content-type': 'application/json',
        ...headers
      },
      success: (res) => {
        const code = Number(res && res.statusCode) || 0
        if (code >= 200 && code < 300) {
          resolve(res)
          return
        }
        const msg =
          res && res.data && typeof res.data === 'object' && res.data.message
            ? String(res.data.message)
            : res && res.data
              ? String(res.data)
              : `http_${code}`
        reject(new Error(msg))
      },
      fail: (err) => reject(err)
    })
  })

const buildAuthHeaders = () => {
  const { supabaseAnonKey } = getConfig()
  if (!supabaseAnonKey) return {}
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`
  }
}

const randomId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

const getClientId = () => {
  try {
    const cached = wx.getStorageSync(storageKeys.clientId)
    if (cached) return String(cached)
  } catch (e) {}
  const id = `c_${randomId()}`
  try {
    wx.setStorageSync(storageKeys.clientId, id)
  } catch (e) {}
  return id
}

const getCurrentUser = () => {
  try {
    const id = wx.getStorageSync(storageKeys.userId)
    const profile = wx.getStorageSync(storageKeys.userProfile)
    if (!id) return null
    if (!profile || typeof profile !== 'object') {
      return { id: String(id), profile: { avatar_url: DEFAULT_AVATAR_URL } }
    }
    const avatar = profile.avatar_url ? String(profile.avatar_url).trim() : ''
    return {
      id: String(id),
      profile: {
        ...profile,
        avatar_url: avatar ? avatar : DEFAULT_AVATAR_URL
      }
    }
  } catch (e) {
    return null
  }
}

const setAuthSkipped = (value) => {
  try {
    wx.setStorageSync(storageKeys.authSkipped, value ? 1 : 0)
  } catch (e) {}
}

const getAuthSkipped = () => {
  try {
    return Boolean(wx.getStorageSync(storageKeys.authSkipped))
  } catch (e) {
    return false
  }
}

const upsertUser = async (wxProfile) => {
  const { supabaseUrl } = getConfig()
  if (!supabaseUrl) throw new Error('missing_supabase_url')

  const clientId = getClientId()
  const userInfo = wxProfile && wxProfile.userInfo ? wxProfile.userInfo : {}
  console.log('[Auth] wx.getUserProfile result:', wxProfile)
  
  const body = {
    client_id: clientId,
    nickname: userInfo.nickName ? String(userInfo.nickName) : null,
    avatar_url: userInfo.avatarUrl ? String(userInfo.avatarUrl) : DEFAULT_AVATAR_URL,
    gender: typeof userInfo.gender === 'number' ? userInfo.gender : null,
    country: userInfo.country ? String(userInfo.country) : null,
    province: userInfo.province ? String(userInfo.province) : null,
    city: userInfo.city ? String(userInfo.city) : null,
    language: userInfo.language ? String(userInfo.language) : null,
    last_seen_at: new Date().toISOString()
  }

  console.log('[Auth] Upserting user to Supabase:', body)

  const url = `${supabaseUrl}/rest/v1/users?on_conflict=client_id&select=*`
  const res = await requestJson(url, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(),
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    data: body
  })
  
  console.log('[Auth] Supabase response:', res.data)
  const row = Array.isArray(res.data) ? res.data[0] : null
  if (!row || !row.id) throw new Error('user_upsert_failed')

  try {
    wx.setStorageSync(storageKeys.userId, String(row.id))
    wx.setStorageSync(storageKeys.userProfile, body)
    setAuthSkipped(false)
  } catch (e) {}

  return { id: String(row.id), profile: body }
}

const authorizeUser = async () => {
  const current = getCurrentUser()
  if (current) return current

  const profile = await new Promise((resolve, reject) => {
    if (!wx.getUserProfile) {
      reject(new Error('wx_getUserProfile_not_supported'))
      return
    }
    wx.getUserProfile({
      desc: '展示个人信息',
      success: resolve,
      fail: (err) => reject(err)
    })
  })
  return upsertUser(profile)
}

const ensureUser = async ({ interactive = false } = {}) => {
  const current = getCurrentUser()
  if (current) return current
  if (!interactive) throw new Error('need_authorization')
  return authorizeUser()
}

const platformToEnum = (platformText) => {
  const s = String(platformText || '').trim()
  if (s === '拼多多' || s === 'PDD' || s === 'pdd') return 'pdd'
  if (s === '淘宝' || s === 'taobao') return 'taobao'
  if (s === '抖音' || s === 'douyin') return 'douyin'
  if (s === '京东' || s === 'jd') return 'jd'
  return 'other'
}

const enumToPlatformText = (platform) => {
  const s = String(platform || '').trim()
  if (s === 'pdd') return '拼多多'
  if (s === 'taobao') return '淘宝'
  if (s === 'douyin') return '抖音'
  if (s === 'jd') return '京东'
  return '其他'
}

const normalizeGoods = (row) => {
  if (!row) return null
  const id = row.id
  const title = row.title || '【3人团】新发布拼团...'
  const image = row.cover_image_url || ''
  const price = typeof row.price === 'number' ? row.price : 19.8
  const originalPrice = typeof row.original_price === 'number' ? row.original_price : 29.9
  const groupSize = typeof row.group_size === 'number' ? row.group_size : 3
  const joinedCount = typeof row.joined_count === 'number' ? row.joined_count : 1
  const endTime = row.end_time ? new Date(row.end_time).getTime() : null
  const platformText = enumToPlatformText(row.platform)

  return {
    id,
    title,
    image,
    price,
    original_price: originalPrice,
    sales_tip: row.sales_tip || '刚刚发布',
    group_size: groupSize,
    joined_count: joinedCount,
    app_id: '',
    path: `/pages/detail/detail?id=${id}`,
    platform: platformText,
    end_time: endTime,
    order_link: row.order_link || '',
    top_until: row.top_until ? new Date(row.top_until).getTime() : 0,
    published_at: row.published_at ? new Date(row.published_at).getTime() : Date.now(),
    creator_user_id: row.creator_user_id || ''
  }
}

const groupPostSelect =
  'id,platform,order_link,title,cover_image_url,price,original_price,sales_tip,group_size,joined_count,end_time,top_until,published_at,creator_user_id'

const getGoodsList = async ({ limit = 20, offset = 0, query = '' } = {}) => {
  const { supabaseUrl } = getConfig()
  if (!supabaseUrl) throw new Error('missing_supabase_url')

  let url = `${supabaseUrl}/rest/v1/group_posts?select=${encodeURIComponent(groupPostSelect)}`
  url += `&order=${encodeURIComponent('top_until.desc.nullslast,published_at.desc')}`
  url += `&limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`

  const q = String(query || '').trim()
  if (q) {
    const orValue = `(title.ilike.*${q}*,order_link.ilike.*${q}*)`
    url += `&or=${encodeURIComponent(orValue)}`
  }

  const res = await requestJson(url, {
    method: 'GET',
    headers: {
      ...buildAuthHeaders(),
      Prefer: 'count=exact'
    }
  })
  const list = Array.isArray(res.data) ? res.data.map(normalizeGoods).filter(Boolean) : []
  const total = Number(
    res.header && (res.header['content-range'] || res.header['Content-Range'])
      ? String(res.header['content-range'] || res.header['Content-Range']).split('/')[1]
      : ''
  ) || 0
  const hasMore = total ? offset + list.length < total : list.length === limit
  return { list, hasMore }
}

const findDuplicateGroupPost = async ({ orderLink } = {}) => {
  const { supabaseUrl } = getConfig()
  if (!supabaseUrl) throw new Error('missing_supabase_url')

  const link = String(orderLink || '').trim()
  if (!link) return null

  const url = `${supabaseUrl}/rest/v1/group_posts?select=${encodeURIComponent(
    'id,order_link'
  )}&order_link=eq.${encodeURIComponent(link)}&limit=1`
  const res = await requestJson(url, { method: 'GET', headers: buildAuthHeaders() })
  const row = Array.isArray(res.data) ? res.data[0] : null
  if (!row || !row.id) return null
  return { id: String(row.id), order_link: row.order_link ? String(row.order_link) : '' }
}

const getGoodsById = async (id) => {
  const { supabaseUrl } = getConfig()
  if (!supabaseUrl) throw new Error('missing_supabase_url')

  const url = `${supabaseUrl}/rest/v1/group_posts?id=eq.${encodeURIComponent(String(id))}&select=${encodeURIComponent(groupPostSelect)}&limit=1`
  const res = await requestJson(url, { method: 'GET', headers: buildAuthHeaders() })
  const row = Array.isArray(res.data) ? res.data[0] : null
  return normalizeGoods(row)
}

const getRelatedGoods = async ({ platform, excludeId, limit = 4 } = {}) => {
  const { supabaseUrl } = getConfig()
  if (!supabaseUrl) throw new Error('missing_supabase_url')

  let url = `${supabaseUrl}/rest/v1/group_posts?select=${encodeURIComponent(groupPostSelect)}&order=${encodeURIComponent('published_at.desc')}`
  url += `&limit=${encodeURIComponent(String(limit))}`
  if (platform) {
    url += `&platform=eq.${encodeURIComponent(String(platform))}`
  }
  if (excludeId) {
    url += `&id=neq.${encodeURIComponent(String(excludeId))}`
  }
  const res = await requestJson(url, { method: 'GET', headers: buildAuthHeaders() })
  return Array.isArray(res.data) ? res.data.map(normalizeGoods).filter(Boolean) : []
}

const addPublishedGoods = async (payload) => {
  const { supabaseUrl } = getConfig()
  if (!supabaseUrl) throw new Error('missing_supabase_url')

  const user = await ensureUser({ interactive: true })
  const meta = payload && payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : null
  const body = {
    platform: platformToEnum(payload.platform),
    order_link: String(payload.order_link || '').trim(),
    title: payload.title ? String(payload.title) : null,
    cover_image_url: payload.image ? String(payload.image) : null,
    price: typeof payload.price === 'number' ? payload.price : null,
    original_price: typeof payload.original_price === 'number' ? payload.original_price : null,
    sales_tip: payload.sales_tip ? String(payload.sales_tip) : null,
    group_size: typeof payload.group_size === 'number' ? payload.group_size : undefined,
    joined_count: typeof payload.joined_count === 'number' ? payload.joined_count : undefined,
    end_time: payload.end_time ? new Date(payload.end_time).toISOString() : null,
    top_until: payload.top_until ? new Date(payload.top_until).toISOString() : null,
    metadata: meta ? meta : undefined,
    published_at: new Date().toISOString(),
    creator_user_id: user.id
  }

  const url = `${supabaseUrl}/rest/v1/group_posts?select=*`
  const res = await requestJson(url, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(),
      Prefer: 'return=representation'
    },
    data: body
  })
  const row = Array.isArray(res.data) ? res.data[0] : null
  return normalizeGoods(row)
}

const addParticipation = async ({ postId, action = 'click_buy' }) => {
  const { supabaseUrl } = getConfig()
  if (!supabaseUrl) throw new Error('missing_supabase_url')

  const user = await ensureUser({ interactive: true })
  const body = {
    post_id: String(postId),
    user_id: String(user.id),
    action: String(action)
  }
  const url = `${supabaseUrl}/rest/v1/group_post_participants?select=*`
  await requestJson(url, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(),
      Prefer: 'return=minimal'
    },
    data: body
  })
}

const getUserStats = async () => {
  const { supabaseUrl } = getConfig()
  if (!supabaseUrl) throw new Error('missing_supabase_url')
  const user = await ensureUser({ interactive: false })

  const postsUrl = `${supabaseUrl}/rest/v1/group_posts?select=id&creator_user_id=eq.${encodeURIComponent(user.id)}&limit=1`
  const partsUrl = `${supabaseUrl}/rest/v1/group_post_participants?select=id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`

  const [postsRes, partsRes] = await Promise.all([
    requestJson(postsUrl, { method: 'GET', headers: { ...buildAuthHeaders(), Prefer: 'count=exact' } }),
    requestJson(partsUrl, { method: 'GET', headers: { ...buildAuthHeaders(), Prefer: 'count=exact' } })
  ])

  const getTotal = (res) =>
    Number(
      res.header && (res.header['content-range'] || res.header['Content-Range'])
        ? String(res.header['content-range'] || res.header['Content-Range']).split('/')[1]
        : ''
    ) || 0

  return {
    user,
    postsCount: getTotal(postsRes),
    participationsCount: getTotal(partsRes)
  }
}

const getMyPublishedGoods = async ({ limit = 10, offset = 0 } = {}) => {
  const { supabaseUrl } = getConfig()
  if (!supabaseUrl) throw new Error('missing_supabase_url')
  const user = await ensureUser({ interactive: false })

  let url = `${supabaseUrl}/rest/v1/group_posts?select=${encodeURIComponent(groupPostSelect)}`
  url += `&creator_user_id=eq.${encodeURIComponent(String(user.id))}`
  url += `&order=${encodeURIComponent('published_at.desc')}`
  url += `&limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`

  const res = await requestJson(url, {
    method: 'GET',
    headers: {
      ...buildAuthHeaders(),
      Prefer: 'count=exact'
    }
  })

  const list = Array.isArray(res.data) ? res.data.map(normalizeGoods).filter(Boolean) : []
  const total = Number(
    res.header && (res.header['content-range'] || res.header['Content-Range'])
      ? String(res.header['content-range'] || res.header['Content-Range']).split('/')[1]
      : ''
  ) || 0
  const hasMore = total ? offset + list.length < total : list.length === limit

  return { list, hasMore }
}

const getMyParticipatedGoods = async ({ limit = 10 } = {}) => {
  const { supabaseUrl } = getConfig()
  if (!supabaseUrl) throw new Error('missing_supabase_url')
  const user = await ensureUser({ interactive: false })

  const select = `id,created_at,post:group_posts(${groupPostSelect})`
  let url = `${supabaseUrl}/rest/v1/group_post_participants?select=${encodeURIComponent(select)}`
  url += `&user_id=eq.${encodeURIComponent(String(user.id))}`
  url += `&order=${encodeURIComponent('created_at.desc')}`
  url += `&limit=${encodeURIComponent(String(Math.max(50, limit * 5)))}`

  const res = await requestJson(url, { method: 'GET', headers: buildAuthHeaders() })
  const rows = Array.isArray(res.data) ? res.data : []

  const seen = new Set()
  const list = []
  for (const r of rows) {
    const post = r && r.post ? normalizeGoods(r.post) : null
    if (!post || !post.id) continue
    const key = String(post.id)
    if (seen.has(key)) continue
    seen.add(key)
    list.push(post)
    if (list.length >= limit) break
  }

  return list
}

const readFileAsBase64 = (filePath) =>
  new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null
    if (!fs || !fs.readFile) {
      reject(new Error('fs_not_supported'))
      return
    }
    fs.readFile({
      filePath: String(filePath || ''),
      encoding: 'base64',
      success: (res) => resolve(res && res.data ? String(res.data) : ''),
      fail: (err) => reject(err)
    })
  })

const ocrScreenshot = async (
  { filePath, mimeType = 'image/jpeg', coverFilePath = '', coverMimeType = 'image/jpeg' } = {}
) => {
  const { supabaseFunctionsBaseUrl, supabaseScrapeKey } = getConfig()
  if (!supabaseFunctionsBaseUrl) {
    throw new Error('missing_supabase_functions_base_url')
  }
  if (!filePath) throw new Error('missing_file_path')

  const imageBase64 = await readFileAsBase64(filePath)
  if (!imageBase64) throw new Error('read_image_failed')
  let coverBase64 = ''
  if (coverFilePath) {
    coverBase64 = await readFileAsBase64(coverFilePath).catch(() => '')
  }

  const url = `${supabaseFunctionsBaseUrl}/swift-action`
  const headers = {
    ...buildAuthHeaders()
  }
  if (supabaseScrapeKey) {
    headers['x-scrape-key'] = supabaseScrapeKey
  }
  const res = await requestJson(url, {
    method: 'POST',
    headers,
    data: {
      image_base64: imageBase64,
      mime_type: String(mimeType || 'image/jpeg'),
      cover_image_base64: coverBase64 || '',
      cover_mime_type: String(coverMimeType || 'image/jpeg')
    }
  })
  if (!res || !res.data || res.data.ok !== true) {
    throw new Error(res && res.data && res.data.error ? String(res.data.error) : 'ocr_failed')
  }
  return {
    title: res.data.title || '',
    price: typeof res.data.price === 'number' ? res.data.price : null,
    original_price: typeof res.data.original_price === 'number' ? res.data.original_price : null,
    group_size: typeof res.data.group_size === 'number' ? res.data.group_size : null,
    missing_count: typeof res.data.missing_count === 'number' ? res.data.missing_count : null,
    remaining_hours: typeof res.data.remaining_hours === 'number' ? res.data.remaining_hours : null,
    is_baiyi_butie: typeof res.data.is_baiyi_butie === 'boolean' ? res.data.is_baiyi_butie : false,
    cover_image_url: res.data.cover_image_url ? String(res.data.cover_image_url) : ''
  }
}

const uploadCoverImage = async ({ filePath, mimeType = 'image/jpeg' } = {}) => {
  const { supabaseFunctionsBaseUrl, supabaseScrapeKey } = getConfig()
  if (!supabaseFunctionsBaseUrl) {
    throw new Error('missing_supabase_functions_base_url')
  }
  if (!filePath) throw new Error('missing_file_path')

  const coverBase64 = await readFileAsBase64(filePath)
  if (!coverBase64) throw new Error('read_image_failed')

  const url = `${supabaseFunctionsBaseUrl}/swift-action`
  const headers = {
    ...buildAuthHeaders()
  }
  if (supabaseScrapeKey) {
    headers['x-scrape-key'] = supabaseScrapeKey
  }
  const res = await requestJson(url, {
    method: 'POST',
    headers,
    data: {
      task: 'upload_cover',
      cover_image_base64: coverBase64,
      cover_mime_type: String(mimeType || 'image/jpeg')
    }
  })
  if (!res || !res.data || res.data.ok !== true) {
    throw new Error(res && res.data && res.data.error ? String(res.data.error) : 'upload_failed')
  }
  return { cover_image_url: res.data.cover_image_url ? String(res.data.cover_image_url) : '' }
}

module.exports = {
  getAuthSkipped,
  setAuthSkipped,
  getCurrentUser,
  ensureUser,
  authorizeUser,
  getUserStats,
  getMyPublishedGoods,
  getMyParticipatedGoods,
  getGoodsList,
  findDuplicateGroupPost,
  getGoodsById,
  getRelatedGoods,
  addPublishedGoods,
  addParticipation,
  ocrScreenshot,
  uploadCoverImage
}
