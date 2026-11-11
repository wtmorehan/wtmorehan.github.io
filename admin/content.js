// han-site · 后台「内容」模块
// 时间：2026-11-11
//
// 做什么：
//   - 文章列表 / 新建 / 编辑 / 删除 / 发布
//   - markdown 预览（渲染在服务端做，前端只显示结果）
//   - 首页区块编辑（profile / now_items / timeline / business_items / contact）
//   - 一键发布：渲染 → GitHub 提交 → Pages 自动重建
//
// 注意：浏览器原生执行的 classic script，整个文件包在 IIFE 里，避免与 admin.js
//       的顶层 const 撞名（那会让脚本直接 SyntaxError 不执行）。

;(function () {
  const cfg = window.HAN_SITE_SUPABASE || {}
  const TOKEN_KEY = 'han_site_admin_token'

  const $ = function (sel) { return document.querySelector(sel) }
  const $$ = function (sel) { return Array.from(document.querySelectorAll(sel)) }

  function el(tag, cls, text) {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text !== undefined) n.textContent = text
    return n
  }

  function token() { return sessionStorage.getItem(TOKEN_KEY) || '' }

  async function api(action, body) {
    let res
    try {
      res = await fetch(cfg.url + '/functions/v1/admin-content?action=' + action, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (e) {
      // 网络异常：不静默失败，调用方能拿到 null 并给出提示
      console.error('api_network_error', action, e)
      return null
    }
    if (res.status === 401) { sessionStorage.clear(); location.reload(); return null }
    const data = await res.json().catch(function () { return {} })
    if (!res.ok || data.ok === false) {
      alert('操作失败：' + (data.error || ('http_' + res.status)) + (data.detail ? '\n' + data.detail : ''))
      return null
    }
    return data
  }

  // ══════════════════════════════════════════════════════════════════
  // 状态
  // ══════════════════════════════════════════════════════════════════
  let articles = []
  let blocks = {}
  let editing = null   // 当前编辑的 slug，null = 新建

  // ══════════════════════════════════════════════════════════════════
  // 标签页
  // ══════════════════════════════════════════════════════════════════
  function switchTab(name) {
    $$('[data-tab]').forEach(function (b) {
      const on = b.getAttribute('data-tab') === name
      b.classList.toggle('bg-neutral-900', on)
      b.classList.toggle('text-white', on)
      b.classList.toggle('bg-white', !on)
      b.classList.toggle('text-neutral-700', !on)
    })
    $$('[data-panel]').forEach(function (p) {
      p.classList.toggle('hidden', p.getAttribute('data-panel') !== name)
    })
  }

  $$('[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')) })
  })

  // ══════════════════════════════════════════════════════════════════
  // 文章列表
  // ══════════════════════════════════════════════════════════════════
  function statusLabel(s) {
    return { draft: '草稿', published: '已发布', archived: '已归档' }[s] || s
  }

  function renderArticleList() {
    const box = $('#article-list')
    if (!box) return
    box.innerHTML = ''
    if (!articles.length) {
      box.append(el('p', 'text-sm text-neutral-400', '还没有文章，点「新建文章」开始'))
      return
    }
    for (const a of articles) {
      const row = el('div', 'flex items-center justify-between gap-3 border-b border-neutral-100 py-2')
      const left = el('div', 'min-w-0')
      left.append(el('p', 'text-sm font-medium truncate', a.title))
      left.append(el('p', 'text-xs text-neutral-400 truncate', '/' + a.slug + ' · ' + statusLabel(a.status) +
        ' · ' + new Date(a.updated_at).toLocaleString('zh-CN')))
      row.append(left)
      const acts = el('div', 'flex items-center gap-1 shrink-0')
      const edit = el('button', 'h-7 px-2 rounded border border-neutral-200 text-xs hover:border-neutral-400', '编辑')
      edit.addEventListener('click', function () { openEditor(a.slug) })
      acts.append(edit)
      if (a.status === 'published') {
        const un = el('button', 'h-7 px-2 rounded border border-neutral-200 text-xs hover:border-neutral-400', '下线')
        un.addEventListener('click', async function () {
          un.disabled = true
          const r = await api('upsert', Object.assign({}, a, { status: 'archived' }))
          if (r) { await loadArticles(); openEditor(a.slug) }
          else un.disabled = false
        })
        acts.append(un)
      }
      const del = el('button', 'h-7 px-2 rounded border border-neutral-200 text-xs text-red-600 hover:border-neutral-400', '删除')
      del.addEventListener('click', async function () {
        if (!confirm('删除文章「' + a.title + '」？该操作不可撤销。')) return
        del.disabled = true
        const r = await api('delete', { slug: a.slug })
        if (r) { editing = null; await loadArticles() }
        else del.disabled = false
      })
      acts.append(del)
      row.append(acts)
      box.append(row)
    }
  }

  async function loadArticles() {
    const data = await api('list')
    if (!data) return
    articles = data.articles || []
    renderArticleList()
  }

  // ══════════════════════════════════════════════════════════════════
  // 编辑器
  // ══════════════════════════════════════════════════════════════════
  function openEditor(slug) {
    editing = slug
    const a = slug ? articles.find(function (x) { return x.slug === slug }) : null
    $('#ed-slug').value = a ? a.slug : ''
    $('#ed-slug').readOnly = Boolean(a)
    $('#ed-title').value = a ? a.title : ''
    $('#ed-summary').value = a ? (a.summary || '') : ''
    $('#ed-body').value = a ? (a.body_md || '') : ''
    $('#ed-status').value = a ? a.status : 'draft'
    $('#ed-minutes').value = a ? a.minutes : 5
    $('#ed-sort').value = a ? a.sort_order : 0
    $('#ed-tags').value = a ? (a.tags || []).join(', ') : ''
    $('#ed-preview').innerHTML = '<p class="text-sm text-neutral-400">预览会显示在这里</p>'
    $('#editor-title').textContent = a ? ('编辑：' + a.title) : '新建文章'
    $('#editor').classList.remove('hidden')
    $('#article-list-wrap').classList.add('hidden')
    $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function closeEditor() {
    editing = null
    $('#editor').classList.add('hidden')
    $('#article-list-wrap').classList.remove('hidden')
  }

  const newBtn = $('#btn-new-article')
  if (newBtn) newBtn.addEventListener('click', function () { openEditor(null) })
  const cancelBtn = $('#btn-cancel-edit')
  if (cancelBtn) cancelBtn.addEventListener('click', closeEditor)

  const saveBtn = $('#btn-save-article')
  if (saveBtn) {
    saveBtn.addEventListener('click', async function () {
      saveBtn.disabled = true
      const hint = $('#save-hint')
      try {
        const payload = {
          slug: $('#ed-slug').value.trim(),
          title: $('#ed-title').value.trim(),
          summary: $('#ed-summary').value.trim(),
          body_md: $('#ed-body').value,
          status: $('#ed-status').value,
          minutes: Number($('#ed-minutes').value || 5),
          sort_order: Number($('#ed-sort').value || 0),
          tags: $('#ed-tags').value.split(',').map(function (s) { return s.trim() }).filter(Boolean),
        }
        const r = await api('upsert', payload)
        if (!r) {
          if (hint) hint.textContent = '保存失败，请检查网络后重试'
          return
        }
        editing = payload.slug
        await loadArticles()
        openEditor(payload.slug)
        if (hint) hint.textContent = '已保存。点「发布到线上」后才会生效。'
      } catch (e) {
        console.error('save_failed', e)
        if (hint) hint.textContent = '保存出错：' + (e && e.message ? e.message : e)
      } finally {
        saveBtn.disabled = false
      }
    })
  }

  const previewBtn = $('#btn-preview')
  if (previewBtn) {
    previewBtn.addEventListener('click', async function () {
      previewBtn.disabled = true
      const r = await api('preview', { body_md: $('#ed-body').value })
      previewBtn.disabled = false
      if (r) $('#ed-preview').innerHTML = r.html || '<p class="text-sm text-neutral-400">（空）</p>'
    })
  }

  // ══════════════════════════════════════════════════════════════════
  // 首页区块
  // ══════════════════════════════════════════════════════════════════
  const BLOCK_LABELS = {
    profile: '个人简介（name / description / tagline / location）',
    now_items: '「现在」板块条目（数组：title / desc / url）',
    timeline: '「经历」时间线（数组：period / title / desc）',
    business_items: '「零人公司」条目（数组：title / desc）',
    contact: '联系方式（email）',
  }

  function renderBlocks() {
    const box = $('#block-list')
    if (!box) return
    box.innerHTML = ''
    for (const key of Object.keys(BLOCK_LABELS)) {
      const wrap = el('div', 'border border-neutral-200 rounded-lg p-4')
      const head = el('div', 'flex items-center justify-between mb-2')
      head.append(el('span', 'text-sm font-medium', BLOCK_LABELS[key]))
      const btn = el('button', 'h-7 px-2 rounded border border-neutral-200 text-xs hover:border-neutral-400', '保存')
      const ta = el('textarea', 'w-full h-28 rounded border border-neutral-200 p-2 font-mono text-xs')
      ta.value = JSON.stringify(blocks[key] ?? {}, null, 2)
      btn.addEventListener('click', async function () {
        let parsed
        try {
          parsed = JSON.parse(ta.value)
        } catch (e) {
          alert('JSON 格式不对：' + e.message)
          return
        }
        btn.disabled = true
        const r = await api('set_block', { key: key, value: parsed })
        btn.disabled = false
        if (r) { blocks[key] = parsed; $('#block-hint').textContent = '已保存。点「发布到线上」后才会生效。' }
      })
      head.append(btn)
      wrap.append(head)
      wrap.append(ta)
      box.append(wrap)
    }
  }

  async function loadBlocks() {
    const data = await api('blocks')
    if (!data) return
    blocks = data.blocks || {}
    renderBlocks()
  }

  // ══════════════════════════════════════════════════════════════════
  // 发布
  // ══════════════════════════════════════════════════════════════════
  const publishBtn = $('#btn-publish')
  if (publishBtn) {
    publishBtn.addEventListener('click', async function () {
      if (!confirm('发布到线上？会重新生成 index.html / 文章页 / rss / sitemap 并提交到 GitHub，Pages 随后自动重建（约 1 分钟生效）。')) return
      publishBtn.disabled = true
      publishBtn.textContent = '发布中…'
      const r = await api('publish', { summary: '后台发布 ' + new Date().toLocaleString('zh-CN') })
      publishBtn.disabled = false
      publishBtn.textContent = '发布到线上'
      const box = $('#publish-result')
      if (r && r.ok) {
        box.className = 'mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'
        box.textContent = '✅ 发布成功，已提交 ' + (r.written || []).length + ' 个文件：' + (r.written || []).join('、') +
          '。Pages 将在约 1 分钟内重建完成。'
        await loadPublishLog()
      } else if (r) {
        box.className = 'mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700'
        box.textContent = '❌ 发布失败：' + (r.errors || []).join(' | ')
      }
    })
  }

  async function loadPublishLog() {
    const data = await api('publish_log')
    if (!data) return
    const box = $('#publish-log')
    if (!box) return
    box.innerHTML = ''
    const log = data.log || []
    if (!log.length) { box.append(el('p', 'text-sm text-neutral-400', '还没有发布记录')); return }
    for (const row of log.slice(0, 8)) {
      const item = el('div', 'flex items-start justify-between gap-3 border-b border-neutral-100 py-2')
      const left = el('div', 'min-w-0')
      left.append(el('p', 'text-sm', row.summary || '(无标题)'))
      left.append(el('p', 'text-xs text-neutral-400',
        new Date(row.created_at).toLocaleString('zh-CN') + ' · ' + (row.files || []).length + ' 个文件'))
      item.append(left)
      item.append(el('span', 'text-xs shrink-0 ' + (row.ok ? 'text-emerald-700' : 'text-red-600'), row.ok ? '成功' : '失败'))
      box.append(item)
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 启动
  // ══════════════════════════════════════════════════════════════════
  // 兜底：未捕获的 Promise rejection 直接提示，避免「点了没反应又没报错」
  window.addEventListener('unhandledrejection', function (e) {
    console.error('unhandled_rejection', e.reason)
    const hint = $('#save-hint')
    if (hint) hint.textContent = '操作出错：' + (e.reason && e.reason.message ? e.reason.message : e.reason)
  })

  async function init() {
    switchTab('overview')
    await Promise.all([loadArticles(), loadBlocks(), loadPublishLog()])
  }
  // 登录后才初始化（admin.js 登录完成会派发 han-site:ready）
  window.addEventListener('han-site:ready', function () { init() })
  if (token()) init()
})()
