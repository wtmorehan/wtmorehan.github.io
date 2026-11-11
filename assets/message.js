// han-site · 留言表单接线
// 时间：2026-11-11
//
// 原则沿用 newsletter.js：
//   - 无 Supabase 配置时诚实降级（显示「暂未开放线上留言，mailto 兜底」），不假装成功
//   - 不采集多余信息：只有留言人自己填的姓名/邮箱会入库
//   - 蜜罐字段 website 对真人不可见，机器人填了后端静默丢弃
//
// 注意：本文件是**浏览器原生执行的 .js**，不能写 TypeScript 类型标注（浏览器会 SyntaxError）。

const cfg = window.HAN_SITE_SUPABASE || {}
const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname)
const useSupabase = Boolean(cfg.url && cfg.anonKey) && (!cfg.localOnly || isLocal)

const form = document.querySelector('form[data-message]')
if (form) {
  const input = form.querySelector('textarea[name=body]')
  const nameInput = form.querySelector('input[name=name]')
  const emailInput = form.querySelector('input[name=email]')
  const honeypot = form.querySelector('input[name=website]')
  const button = form.querySelector('button[type=submit]')
  const label = button ? button.querySelector('span') : null
  const status = form.querySelector('[data-message-status]')

  const setState = function (text, tone) {
    if (label) label.textContent = text
    if (status) {
      status.textContent = tone === 'error' ? text : (tone === 'ok' ? text : '')
      status.className = tone === 'error'
        ? 'mt-2 text-xs text-red-600'
        : (tone === 'ok'
          ? 'mt-2 text-xs text-emerald-700'
          : 'mt-2 text-xs text-neutral-500')
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault()
    const body = (input ? input.value : '').trim()
    if (!body) return

    if (!useSupabase) {
      const subject = encodeURIComponent('给 han-site 留言')
      const text = encodeURIComponent(
        body + '\n\n—— ' + ((nameInput ? nameInput.value : '').trim() || '匿名') +
        '\n' + ((emailInput ? emailInput.value : '').trim()) + '\n'
      )
      window.location.href = 'mailto:liuhan@hyliton.com?subject=' + subject + '&body=' + text
      setState('已打开邮件客户端，发送后即完成留言', 'ok')
      return
    }

    button.disabled = true
    setState('提交中…', '')

    try {
      const res = await fetch(cfg.url + '/functions/v1/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body,
          name: (nameInput ? nameInput.value : '').trim(),
          email: (emailInput ? emailInput.value : '').trim(),
          path: location.pathname,
          website: honeypot ? honeypot.value : '',
        }),
      })
      const data = await res.json().catch(function () { return {} })

      if (res.ok && data.ok) {
        form.reset()
        setState('收到，会回复你', 'ok')
      } else if (res.status === 429) {
        setState('提交太频繁了，稍后再试', 'error')
      } else if (data.error === 'invalid_email') {
        setState('邮箱格式不对，再检查一下', 'error')
      } else {
        setState('提交失败，可以直接发邮件到 liuhan@hyliton.com', 'error')
      }
    } catch (err) {
      setState('网络不通，可以直接发邮件到 liuhan@hyliton.com', 'error')
    } finally {
      button.disabled = false
    }
  })
}
