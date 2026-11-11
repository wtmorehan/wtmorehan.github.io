// han-site · 埋点脚本（PV + 点击）
// 时间：2026-11-11
//
// 做什么：
//   1. 页面加载后上报一次 PV（path / title / referrer）
//   2. 拦截带 data-track 的元素点击，上报点击事件
//   3. 报告前端的 JS 错误（event_type=error）
//
// 设计约束：
//   - 用 sendBeacon / fetch keepalive，不阻塞页面
//   - 配置缺失时静默跳过，不报错、不影响浏览
//   - 不采集任何表单内容，只采集「点了哪个按钮」
//   - 统计口径与后端一致：visitor 由后端按 IP+UA 的 HMAC 去重，浏览器不存标识

const cfg = window.HAN_SITE_SUPABASE ?? {}
const enabled = Boolean(cfg.url && cfg.anonKey)
const ENDPOINT = enabled ? `${cfg.url}/functions/v1/track` : ''

function payload(obj) {
  return {
    path: location.pathname + location.search,
    title: document.title,
    referrer: document.referrer || null,
    ...obj,
  }
}

function send(obj, useBeacon = false) {
  if (!enabled) return
  const body = JSON.stringify(payload(obj))
  try {
    if (useBeacon && navigator.sendBeacon) {
      // Beacon 在页面卸载时也能送达，但 Content-Type 只能是 text/plain
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))
      return
    }
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* 埋点失败不影响页面 */
  }
}

// ── 1. PV ───────────────────────────────────────────────────────────
if (enabled) {
  // 等一帧再报，确保 title 已最终确定
  requestAnimationFrame(() => send({}, true))
}

// ── 2. 点击事件 ─────────────────────────────────────────────────────
// 约定：任何元素加 data-track="稳定的机器可读标识" 即被追踪。
// 没有 data-track 的链接不追踪，避免后台被噪声淹没。
document.addEventListener('click', (event) => {
  const el = (event.target as HTMLElement)?.closest?.('[data-track]')
  if (!el) return
  const label = el.getAttribute('data-track')
  if (!label) return
  send({
    event_type: el.getAttribute('data-track-type') || 'click',
    label,
    target_url: el instanceof HTMLAnchorElement ? el.href : null,
  })
}, { capture: true })

// ── 3. 前端错误 ─────────────────────────────────────────────────────
window.addEventListener('error', (event) => {
  send({
    event_type: 'error',
    label: (event.message || 'error').slice(0, 80),
    target_url: event.filename || null,
  })
})
