/**
 * AniList Cloudflare Worker - 数据同步 API
 * 粘贴到 Cloudflare Dashboard → Workers & Pages → 创建 Worker
 * 需要绑定 KV 命名空间，变量名: ANILIST_KV
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  // CORS 头（允许跨域请求）
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // ===== GET /entries 获取全部数据 =====
    if (method === 'GET' && path === '/entries') {
      const data = await ANILIST_KV.get('entries', { type: 'json' })
      return new Response(JSON.stringify(data || {}), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // ===== PUT /entries 全量替换（导入/重置） =====
    if (method === 'PUT' && path === '/entries') {
      const body = await request.json()
      await ANILIST_KV.put('entries', JSON.stringify(body))
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // ===== DELETE /entries 清空全部 =====
    if (method === 'DELETE' && path === '/entries') {
      await ANILIST_KV.put('entries', JSON.stringify({}))
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // ===== POST /entries 添加单条 =====
    if (method === 'POST' && path === '/entries') {
      const entry = await request.json()
      const data = (await ANILIST_KV.get('entries', { type: 'json' })) || {}
      data[entry.id] = entry
      await ANILIST_KV.put('entries', JSON.stringify(data))
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // ===== PUT /entries/:id 更新单条 =====
    if (method === 'PUT' && path.startsWith('/entries/')) {
      const id = path.split('/')[2]
      const entry = await request.json()
      const data = (await ANILIST_KV.get('entries', { type: 'json' })) || {}
      data[id] = entry
      await ANILIST_KV.put('entries', JSON.stringify(data))
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // ===== DELETE /entries/:id 删除单条 =====
    if (method === 'DELETE' && path.startsWith('/entries/')) {
      const id = path.split('/')[2]
      const data = (await ANILIST_KV.get('entries', { type: 'json' })) || {}
      delete data[id]
      await ANILIST_KV.put('entries', JSON.stringify(data))
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    return new Response('Not Found', { status: 404 })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
}
