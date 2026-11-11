// han-site · 后台前端
// 时间：2026-11-11
//
// 认证：直接打 Supabase Auth 的 REST 端点（不引 SDK，避免 CDN 依赖）
//   POST {url}/auth/v1/token?grant_type=password  →  access_token
//   存 sessionStorage（关标签页即失效），调 admin 函数时带 Authorization: Bearer
//
// 失败一律给中文提示，不暴露内部错误细节。

const cfg = window.HAN_SITE_SUPABASE ?? {}
const TOKEN_KEY = 'han_site_admin_token'
const EMAIL_KEY = 'han_site_admin_email'

const $ = (sel: string) => document.querySelector(sel)
const el = (tag: string, cls?: string, text?: string) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}

function token(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? ''
}

async function api(action: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${cfg.url}/functions/v1/admin?action=${action}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401) {
    sessionStorage.clear()
    showLogin()
    throw new Error('unauthorized')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error ?? `http_${res.status}`)
  return data
}

// ── 登录 ────────────────────────────────────────────────────────────
const loginForm = $<HTMLFormElement>('#login-form')
const loginStatus = $('#login-status')

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const email = ($<HTMLInputElement>('#email')).value.trim()
  const password = $<HTMLInputElement>('#password').value
  const btn = loginForm.querySelector('button') as HTMLButtonElement
  btn.disabled = true
  loginStatus.textContent = ''
  try {
    const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.access_token) {
      loginStatus.textContent = '邮箱或密码不对'
      return
    }
    sessionStorage.setItem(TOKEN_KEY, data.access_token)
    sessionStorage.setItem(EMAIL_KEY, email)
    $('#password').value = ''
    await showApp()
  } catch {
    loginStatus.textContent = '网络异常，稍后再试'
  } finally {
    btn.disabled = false
  }
})

$('#logout')?.addEventListener('click', () => {
  sessionStorage.clear()
  showLogin()
})

$('#refresh')?.addEventListener('click', () => { void loadAll() })

function showLogin() {
  $('#login')?.classList.remove('hidden')
  $('#app')?.classList.add('hidden')
}

async function showApp() {
  $('#login')?.classList.add('hidden')
  $('#app')?.classList.remove('hidden')
  $('#who').textContent = sessionStorage.getItem(EMAIL_KEY) ?? ''
  await loadAll()
}

// ── 渲染 ────────────────────────────────────────────────────────────
function renderKpis(s: any) {
  const box = $('#kpis')
  box.innerHTML = ''
  const items: Array<[string, string, string]> = [
    ['总访问 PV', String(s.total_views ?? 0), '累计页面访问'],
    ['独立访客 UV', String(s.total_visitors ?? 0), '按 IP+UA 哈希去重'],
    ['今日 PV', String(s.today_views ?? 0), `今日独立 ${s.today_visitors ?? 0}`],
    ['留言', String(s.total_messages ?? 0), `未读 ${s.new_messages ?? 0}`],
    ['点击事件', String(s.total_events ?? 0), '按钮/外链点击'],
    ['订阅', String(s.subscribers ?? 0), '活跃订阅者'],
  ]
  for (const [label, value, sub] of items) {
    const card = el('div', 'bg-white border border-neutral-200 rounded-lg p-4')
    card.append(el('p', 'text-xs text-neutral-500', label))
    card.append(el('p', 'text-2xl font-semibold mt-1', value))
    card.append(el('p', 'text-xs text-neutral-400 mt-1', sub))
    box.append(card)
  }
}

function renderChart(daily: any[]) {
  const box = $('#chart')
  const legend = $('#chart-legend')
  box.innerHTML = ''
  legend.innerHTML = ''
  if (!daily?.length) return
  const max = Math.max(...daily.map((d) => d.views ?? 0), 1)
  for (const d of daily) {
    const col = el('div', 'flex-1 flex flex-col items-center gap-1')
    const bar = el('div', 'w-full rounded-t bg-neutral-900')
    const h = Math.max(((d.views ?? 0) / max) * 100, 2)
    bar.style.height = `${h}%`
    bar.title = `${d.day}: ${d.views} PV / ${d.visitors} UV`
    const track = el('div', 'w-full h-24 flex items-end')
    track.append(bar)
    col.append(track)
    col.append(el('span', 'text-[10px] text-neutral-400', (d.day ?? '').slice(5)))
    box.append(col)
  }
  legend.append(el('span', '', '柱高 = 当日 PV'))
  legend.append(el('span', '', '悬停柱体看当日 PV / UV'))
}

function renderList(target: string, rows: any[] | undefined, fmt: (r: any) => [string, string]) {
  const box = $(target)
  box.innerHTML = ''
  if (!rows?.length) {
    box.append(el('p', 'text-sm text-neutral-400', '暂无数据'))
    return
  }
  const max = Math.max(...rows.map((r) => Number(fmt(r)[1]) || 0), 1)
  for (const r of rows) {
    const [label, value] = fmt(r)
    const row = el('div')
    const head = el('div', 'flex items-center justify-between text-sm')
    head.append(el('span', 'truncate', label))
    head.append(el('span', 'text-neutral-500 tabular-nums', value))
    const track = el('div', 'h-1.5 bg-neutral-100 rounded-full mt-1')
    const fill = el('div', 'h-1.5 bg-neutral-400 rounded-full')
    fill.style.width = `${(Number(value) / max) * 100}%`
    track.append(fill)
    row.append(head)
    row.append(track)
    box.append(row)
  }
}

function renderMessages(data: any) {
  const box = $('#messages')
  box.innerHTML = ''
  $('#msg-count').textContent = `共 ${data.total ?? 0} 条`
  if (!data.items?.length) {
    box.append(el('p', 'text-sm text-neutral-400', '还没有留言'))
    return
  }
  const labels: Record<string, string> = {
    new: '未读', read: '已读', replied: '已回复', archived: '已归档', spam: '垃圾',
  }
  for (const m of data.items) {
    const card = el('div', 'border border-neutral-200 rounded-lg p-3')
    const head = el('div', 'flex items-center justify-between gap-3 mb-1')
    const who = el('span', 'text-sm font-medium', m.name || '匿名')
    const meta = el('span', 'text-xs text-neutral-400',
      `${labels[m.status] ?? m.status} · ${new Date(m.created_at).toLocaleString('zh-CN')}${m.email ? ` · ${m.email}` : ''}`)
    head.append(who)
    head.append(meta)
    card.append(head)
    card.append(el('p', 'text-sm text-neutral-700 whitespace-pre-wrap', m.body))

    const actions = el('div', 'flex items-center gap-2 mt-2')
    for (const st of ['read', 'replied', 'archived', 'spam']) {
      if (st === m.status) continue
      const btn = el('button', 'h-7 px-2 rounded border border-neutral-200 text-xs hover:border-neutral-400', labels[st])
      btn.addEventListener('click', async () => {
        btn.disabled = true
        try {
          await api('message_status', { method: 'POST', body: JSON.stringify({ id: m.id, status: st }) })
          await loadAll()
        } catch {
          btn.disabled = false
        }
      })
      actions.append(btn)
    }
    card.append(actions)
    box.append(card)
  }
}

function renderSubscribers(data: any) {
  const box = $('#subscribers')
  box.innerHTML = ''
  if (!data.items?.length) {
    box.append(el('p', 'text-sm text-neutral-400', '还没有订阅者'))
    return
  }
  for (const s of data.items) {
    const row = el('div', 'flex items-center justify-between border-b border-neutral-100 py-1')
    row.append(el('span', 'truncate', s.email))
    row.append(el('span', 'text-xs text-neutral-400', new Date(s.created_at).toLocaleDateString('zh-CN')))
    box.append(row)
  }
}

$('#copy-subs')?.addEventListener('click', async () => {
  try {
    const data = await api('subscribers')
    const text = (data.items ?? []).map((s: any) => s.email).join('\n')
    await navigator.clipboard.writeText(text)
    const btn = $('#copy-subs') as HTMLButtonElement
    btn.textContent = '已复制'
    setTimeout(() => { btn.textContent = '复制邮箱列表' }, 1500)
  } catch {
    /* 忽略 */
  }
})

// ── 加载 ────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    const [stats, messages, subs] = await Promise.all([
      api('stats'),
      api('messages'),
      api('subscribers'),
    ])
    const s = stats.stats ?? {}
    renderKpis(s)
    renderChart(s.daily ?? [])
    renderList('#paths', s.top_paths, (r) => [r.path, `${r.views} / ${r.visitors}`])
    renderList('#referrers', s.top_referrers, (r) => [r.host, String(r.views)])
    renderList('#devices', s.devices, (r) => [r.device, String(r.views)])
    renderList('#browsers', s.browsers, (r) => [r.browser, String(r.views)])
    renderList('#events', s.top_events, (r) => [r.label, String(r.count)])
    renderList('#countries', s.countries, (r) => [r.country, String(r.views)])
    renderMessages(messages)
    renderSubscribers(subs)
  } catch (e: any) {
    if (e?.message !== 'unauthorized') console.error('load_failed', e)
  }
}

// ── 启动 ────────────────────────────────────────────────────────────
if (token()) {
  void showApp()
} else {
  showLogin()
}
