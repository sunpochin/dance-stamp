/* 檔案用途：檢查公開內容常見的私人識別。所在層：純判斷。主要關聯：check-public.ts、harness.test.ts。 */
import { containsSecret, protectedPath } from './stagedSafety'

export function publicProblems(path: string, content: string): string[] {
  const problems: string[] = []
  if (path.startsWith('vendor/jia-jian-log-harness/source/')) problems.push('local-reference')
  if (protectedPath(path)) problems.push('protected-file')
  if (containsSecret(content)) problems.push('credential-pattern')
  // 範例域名與假的 DB fixture 可留下；不把所有 tests/ 都列白名單，以免真資料混進去。
  const emails = content.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) ?? []
  const safeEmail = (email: string) => /@(?:example\.(?:com|org|net)|localhost)$/.test(email)
    || ['postgres@db.abcdefghijklmnopqrst.supabase.co', 'pw@db.abcdefghijklmnopqrst.supabase.co'].includes(email)
  if (emails.some(email => !safeEmail(email))) problems.push('non-example-email')
  if (/\/Users\/(?!example(?:\/|\b))[^/\s"']+|\/home\/(?!example(?:\/|\b))[^/\s"']+/.test(content)) problems.push('personal-home-path')
  // 真正部署的 hosted 專案識別不應公開；唯一允許的是全字母序的合成 fixture。
  const hosted = [...content.matchAll(/\b([a-z0-9]{20})\.supabase\.(?:co|in)\b/g)].map(match => match[1])
  if (hosted.some(ref => ref !== 'abcdefghijklmnopqrst')) problems.push('hosted-project-reference')
  if (/\b09\d{8}\b/.test(content)) problems.push('phone-pattern')
  return problems
}
