/* 檔案用途：提交檔名與秘密格式的純判斷。所在層：Git 防護。主要關聯：check-staged.ts、harness.test.ts。 */
export function protectedPath(path: string): boolean {
  const name = path.split('/').pop() ?? ''
  return /^\.env(?:\.|$)/.test(name) || /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(name)
    // 真正的私人媒體不能誤入 Git；合成 fixture 有明確、可審查的專用路徑。
    || (/\.(?:mp4|mov|webm|m4v|mp3|wav)$/i.test(name) && !path.startsWith('tests/fixtures/synthetic/'))
}
export function containsSecret(content: string): boolean {
  // 只報檔名，不回印命中內容，避免阻擋訊息本身洩漏憑證。
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)
    || /\bAKIA[A-Z0-9]{16}\b/.test(content)
    || /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}\b/.test(content)
    || /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/.test(content)
}
