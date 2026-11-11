// han-site · 后台前端
// 时间：2026-11-11
//
// 认证：直接打 Supabase Auth 的 REST 端点（不引 SDK，避免 CDN 依赖）
//   POST {url}/auth/v1/token?grant_type=password  →  access_token
//   存 sessionStorage（关标签页即失效），调 admin 函数时带 Authorization: Bearer
//
// 失败一律给中文提示，不暴露内部错误细节。
//
// 注意：本文件是**浏览器原生执行的 .js**，不能写 TypeScript 类型标注（浏览器会 SyntaxError）。

const cfg = window.HAN_SITE_SUPABASE || {}
const TOKEN_KEY = 'han_site_admin_token'
const EMAIL_KEY = 'han_site_admin_email'

const $ = function (sel) { return document.querySelector(sel) }

function el(tag, cls, text) {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}

function token() {
  return sessionStorage.getItem(TOKEN_KEY) || ''
}

async function api(action, init) {
  const res = await fetch(cfg.url + '/functions/v1/admin?action=' + action, Object.assign({}, init, {
    headers: Object.assign({
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token(),
    }, (init && init.headers) || {}),
  }))
  if (res.status === 401) {
    sessionStorage.clear()
    showLogin()
    throw new Error('unauthorized')
  }
  const data = await res.json().catch(function () { return {} })
  if (!res.ok || data.ok === false) throw new Error(data.error || ('http_' + res.status))
  return data
}

// ── 登录 ────────────────────────────────────────────────────────────
const loginForm = $('#login-form')
const loginStatus = $('#login-status')

if (loginForm) {
  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault()
    const email = ($('#email') ? $('#email').value : '').trim()
    const password = $('#password') ? $('#password').value : ''
    const btn = loginForm.querySelector('button')
    if (btn) btn.disabled = true
    loginStatus.textContent = ''
    try {
      const res = await fetch(cfg.url + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey },
        body: JSON.stringify({ email: email, password: password }),
      })
      const data = await res.json().catch(function () { return {} })
      if (!res.ok || !data.access_token) {
        loginStatus.textContent = '邮箱或密码不对'
        return
      }
      sessionStorage.setItem(TOKEN_KEY, data.access_token)
      sessionStorage.setItem(EMAIL_KEY, email)
      $('#password').value = ''
      await showApp()
    } catch (err) {
      loginStatus.textContent = '网络异常，稍后再试'
    } finally {
      if (btn) btn.disabled = false
    }
  })
}

const logoutBtn = $('#logout')
if (logoutBtn) {
  logoutBtn.addEventListener('click', function () {
    sessionStorage.clear()
    showLogin()
  })
}

const refreshBtn = $('#refresh')
if (refreshBtn) {
  refreshBtn.addEventListener('click', function () { loadAll() })
}

function showLogin() {
  const login = $('#login')
  const app = $('#app')
  if (login) login.classList.remove('hidden')
  if (app) app.classList.add('hidden')
}

async function showApp() {
  const login = $('#login')
  const app = $('#app')
  if (login) login.classList.add('hidden')
  if (app) app.classList.remove('hidden')
  const who = $('#who')
  if (who) who.textContent = sessionStorage.getItem(EMAIL_KEY) || ''
  await loadAll()
}

// ── 渲染 ────────────────────────────────────────────────────────────
function renderKpis(s) {
  const box = $('#kpis')
  if (!box) return
  box.innerHTML = ''
  const items = [
    ['总访问 PV', String(s.total_views || 0), '累计页面访问'],
    ['独立访客 UV', String(s.total_visitors || 0), '按 IP+UA 哈希去重'],
    ['今日 PV', String(s.today_views || 0), '今日独立 ' + (s.today_visitors || 0)],
    ['留言', String(s.total_messages || 0), '未读 ' + (s.new_messages || 0)],
    ['点击事件', String(s.total_events || 0), '按钮/外链点击'],
    ['订阅', String(s.subscribers || 0), '活跃订阅者'],
  ]
  for (const item of items) {
    const card = el('div', 'bg-white border border-neutral-200 rounded-lg p-4')
    card.append(el('p', 'text-xs text-neutral-500', item[0]))
    card.append(el('p', 'text-2xl font-semibold mt-1', item[1]))
    card.append(el('p', 'text-xs text-neutral-400 mt-1', item[2]))
    box.append(card)
  }
}

function renderChart(daily) {
  const box = $('#chart')
  const legend = $('#chart-legend')
  if (!box || !legend) return
  box.innerHTML = ''
  legend.innerHTML = ''
  if (!daily || !daily.length) return
  let max = 1
  for (const d of daily) { if ((d.views || 0) > max) max = d.views || 0 }
  for (const d of daily) {
    const col = el('div', 'flex-1 flex flex-col items-center gap-1')
    const bar = el('div', 'w-full rounded-t bg-neutral-900')
    const h = Math.max(((d.views || 0) / max) * 100, 2)
    bar.style.height = h + '%'
    bar.title = d.day + ': ' + (d.views || 0) + ' PV / ' + (d.visitors || 0) + ' UV'
    const track = el('div', 'w-full h-24 flex items-end')
    track.append(bar)
    col.append(track)
    col.append(el('span', 'text-[10px] text-neutral-400', String(d.day || '').slice(5)))
    box.append(col)
  }
  legend.append(el('span', '', '柱高 = 当日 PV'))
  legend.append(el('span', '', '悬停柱体看当日 PV / UV'))
}

function renderList(target, rows, fmt) {
  const box = $(target)
  if (!box) return
  box.innerHTML = ''
  if (!rows || !rows.length) {
    box.append(el('p', 'text-sm text-neutral-400', '暂无数据'))
    return
  }
  let max = 1
  for (const r of rows) {
    const v = Number(fmt(r)[1]) || 0
    if (v > max) max = v
  }
  for (const r of rows) {
    const pair = fmt(r)
    const row = el('div')
    const head = el('div', 'flex items-center justify-between text-sm')
    head.append(el('span', 'truncate', pair[0]))
    head.append(el('span', 'text-neutral-500 tabular-nums', pair[1]))
    const track = el('div', 'h-1.5 bg-neutral-100 rounded-full mt-1')
    const fill = el('div', 'h-1.5 bg-neutral-400 rounded-full')
    fill.style.width = ((Number(pair[1]) / max) * 100) + '%'
    track.append(fill)
    row.append(head)
    row.append(track)
    box.append(row)
  }
}

function renderMessages(data) {
  const box = $('#messages')
  if (!box) return
  box.innerHTML = ''
  const count = $('#msg-count')
  if (count) count.textContent = '共 ' + (data.total || 0) + ' 条'
  if (!data.items || !data.items.length) {
    box.append(el('p', 'text-sm text-neutral-400', '还没有留言'))
    return
  }
  const labels = {
    new: '未读', read: '已读', replied: '已回复', archived: '已归档', spam: '垃圾',
  }
  for (const m of data.items) {
    const card = el('div', 'border border-neutral-200 rounded-lg p-3')
    const head = el('div', 'flex items-center justify-between gap-3 mb-1')
    head.append(el('span', 'text-sm font-medium', m.name || '匿名'))
    head.append(el('span', 'text-xs text-neutral-400',
      (labels[m.status] || m.status) + ' · ' + new Date(m.created_at).toLocaleString('zh-CN') +
      (m.email ? ' · ' + m.email : '')))
    card.append(head)
    card.append(el('p', 'text-sm text-neutral-700 whitespace-pre-wrap', m.body))

    const actions = el('div', 'flex items-center gap-2 mt-2')
    for (const st of ['read', 'replied', 'archived', 'spam']) {
      if (st === m.status) continue
      const btn = el('button', 'h-7 px-2 rounded border border-neutral-200 text-xs hover:border-neutral-400', labels[st])
      btn.addEventListener('click', async function () {
        btn.disabled = true
        try {
          await api('message_status', {
            method: 'POST',
            body: JSON.stringify({ id: m.id, status: st }),
          })
          await loadAll()
        } catch (err) {
          btn.disabled = false
        }
      })
      actions.append(btn)
    }
    card.append(actions)
    box.append(card)
  }
}

function renderSubscribers(data) {
  const box = $('#subscribers')
  if (!box) return
  box.innerHTML = ''
  if (!data.items || !data.items.length) {
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

const copyBtn = $('#copy-subs')
if (copyBtn) {
  copyBtn.addEventListener('click', async function () {
    try {
      const data = await api('subscribers')
      const items = data.items || []
      const text = items.map(function (s) { return s.email }).join('\n')
      await navigator.clipboard.writeText(text)
      copyBtn.textContent = '已复制'
      setTimeout(function () { copyBtn.textContent = '复制邮箱列表' }, 1500)
    } catch (err) {
      /* 忽略 */
    }
  })
}

// ── 加载 ────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    const results = await Promise.all([
      api('stats'),
      api('messages'),
      api('subscribers'),
    ])
    const stats = results[0].stats || {}
    renderKpis(stats)
    renderChart(stats.daily || [])
    renderList('#paths', stats.top_paths, function (r) { return [r.path, r.views + ' / ' + r.visitors] })
    renderList('#referrers', stats.top_referrers, function (r) { return [r.host, String(r.views)] })
    renderList('#devices', stats.devices, function (r) { return [r.device, String(r.views)] })
    renderList('#browsers', stats.browsers, function (r) { return [r.browser, String(r.views)] })
    renderList('#events', stats.top_events, function (r) { return [r.label, String(r.count)] })
    renderList('#countries', stats.countries, function (r) { return [r.country, String(r.views)] })
    renderMessages(results[1])
    renderSubscribers(results[2])
  } catch (e) {
    if (!e || e.message !== 'unauthorized') console.error('load_failed', e)
  }
}

// ── 启动 ────────────────────────────────────────────────────────────
if (token()) {
  showApp()
} else {
  showLogin()
}
