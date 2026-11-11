// han-site · 订阅表单接线
// 时间：2026-11-11
//
// 设计：无 Supabase 配置时优雅降级为「mailto 兜底」，不静默假装成功。
// 部署时把 assets/supabase-config.js 换成真实值（该文件在 .gitignore 里）。

const cfg = window.HAN_SITE_SUPABASE ?? {}

const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname)

// localOnly：只在本地开发时启用 Supabase。
// 目的：配置没改全就把站点发到公网时，不至于把订阅请求发到 127.0.0.1 然后报错，
// 而是自动退回 mailto 兜底。
const useSupabase = Boolean(cfg.url && cfg.anonKey) && (!cfg.localOnly || isLocal)

const form = document.querySelector('form[data-newsletter]')
if (form) {
  const input = form.querySelector('input[type=email]')
  const button = form.querySelector('button[type=submit]')
  const label = button?.querySelector('span')
  const status = form.querySelector('[data-newsletter-status]')

  const setState = (text, tone) => {
    if (label) label.textContent = text
    if (status) {
      status.textContent = tone === 'error' ? '订阅失败，请稍后再试' : ''
      status.className = tone === 'error'
        ? 'mt-2 text-xs text-red-600'
        : 'mt-2 text-xs text-neutral-500'
    }
  }

  const emailReady = () => useSupabase

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const email = (input?.value ?? '').trim()

    if (!email) return

    if (!emailReady()) {
      // 没配置 / 本地限定 → 走邮件兜底，诚实告知，不假装订阅成功
      const subject = encodeURIComponent('订阅 han-site 更新')
      const body = encodeURIComponent(`我想订阅 han-site 的更新。\n\n邮箱：${email}\n`)
      window.location.href = `mailto:liuhan@hyliton.com?subject=${subject}&body=${body}`
      setState('已打开邮件客户端，发送后即完成订阅', 'ok')
      return
    }

    button.disabled = true
    setState('提交中…', 'ok')

    try {
      const res = await fetch(`${cfg.url}/functions/v1/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.anonKey}`,
        },
        body: JSON.stringify({ email, referrer: document.referrer || null }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.ok) {
        throw new Error(data?.error ?? `http_${res.status}`)
      }
      setState('已订阅', 'ok')
      if (input) input.value = ''
    } catch (err) {
      console.error('newsletter_subscribe_failed', err)
      setState('订阅失败', 'error')
    } finally {
      button.disabled = false
    }
  })
}
