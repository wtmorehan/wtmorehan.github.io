// han-site · Supabase 运行时配置
// 复制本文件为 supabase-config.js 并填入真实值；supabase-config.js 不入库。
//
// 填法（值来自 Supabase dashboard → Project Settings → API）：
//   url     = https://<project-ref>.supabase.co
//   anonKey = Project API key 里的 anon / publishable key
//
// localOnly: true = 只在 localhost 启用 Supabase，其余情况退回 mailto 兜底。
//   本地开发时用 true；正式上线改成 false（或删掉这一行）。
//
// 注意：这里只能放 anon key。service_role key 属于服务端机密，
// 只存在于 Edge Function 的环境变量里，绝不能进前端仓库。
window.HAN_SITE_SUPABASE = {
  url: '',
  anonKey: '',
  localOnly: false,
}
