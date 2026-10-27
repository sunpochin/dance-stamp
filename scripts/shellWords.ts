/*
檔案用途：把一串 bash／zsh 指令切成「簡單指令 → 字詞」：照 shell 規則去掉引號與跳脫、分出 ; && || | & 與括號、
收下 heredoc／here-string 的內容，並把 $(…)、`…`、<(…)、${…} 等「會被執行的程式碼」另外交出來。
所在層：scripts；純函式，不執行任何東西。由 scripts/mergeGuard.ts（合併前 hook 的判斷）與 scripts/destructiveGuard.ts（破壞性指令閘門）使用，
          tests/unit/mergeGuard.test.ts、tests/unit/destructiveGuard.test.ts 間接鎖住。
主要關聯：.claude/hooks／.codex/hooks 的 require-codex-review-before-merge.sh、issue #1067。

為什麼自己寫而不用 Python shlex（舊 hook 的做法）：shlex 不認得 heredoc、命令替換與 shell 運算子，
舊 hook 只好先把所有引號拿掉再比對字串，結果 commit 訊息、issue 草稿、python heredoc 裡「提到」merge 的文字都被當成指令誤擋
（#1067 列了 2026-10-05 一天三次）。這裡只做 hook 需要的那一小部分語法：分得出「哪些字是指令、哪些字只是資料」就夠，
不追求完整的 bash 文法；看不懂的地方（引號沒有關、找不到對應的括號）交給呼叫端當成「看不見內容」處理。
*/

export type Word = {
  // 去掉引號與跳脫之後的文字；展開（$x、$(…)、glob）保留原始寫法，讓呼叫端還看得到 `/pulls/$pr/merge` 這類形狀。
  value: string
  // 原始寫法（含引號），給「看不見內容時整段比對」用。
  raw: string
  // 含有執行時才知道值的部分：變數、命令替換、未加引號的 glob 或 brace expansion、zsh 的 =cmd。
  dynamic: boolean
}

export type Heredoc = { body: string; quoted: boolean }

export type Command = {
  words: Word[]
  heredocs: Heredoc[]
  herestrings: Word[]
  // `< 來源` 的來源：bash < <(echo …) 時，process substitution 的輸出就是 bash 要執行的腳本（#1090 Codex）。
  inputs: Word[]
  // 寫入的重導向（> x、>| x、>> x、&> x、&>> x、>& x、<> x）：破壞性指令閘門要看有沒有覆寫 .env（#1214）。
  outputs: Array<{ op: string; target: Word }>
  // 用 | 接在前面的指令（stdin 來自它們的輸出）。
  upstream: Command[]
  // 接在這條指令後面的分隔符號（&&、||、;、|、&、換行記成 ;）；最後一條是 null。破壞性指令閘門用它判斷 cd 是否一定成功才往下跑（#1214）。
  next: string | null
  // 在幾層括號 subshell 裡（( D=/tmp/x ) 的賦值不會留到外面，#1220 Codex review 第 2 輪）。
  subshellDepth: number
  raw: string
}

export type Parsed = {
  commands: Command[]
  // $(…)、`…`、<(…)、>(…)、${…} 的內容：不論出現在哪個字詞、雙引號或未加引號的 heredoc 裡，shell 都會執行它們。
  substitutions: string[]
  // 只出現在 <(…)／>(…) 的那幾段：當成腳本餵給 bash／source 時，它們的「輸出」也是程式碼。
  processSubstitutions: string[]
  subshell: boolean
  background: boolean
  // 引號、括號或 heredoc 沒有收尾時，從那裡到結尾的原文；hook 看不出那段是資料還是指令。
  unterminated: string | null
  // 會在執行時把變數或字串「再當成程式算一次」的展開：zsh 的 ${(e)x}、glob qualifier /(e:…:)、算式裡的變數
  // （x='a[$(cmd)]'; : $((x)) 會執行 cmd）。內容不在這裡，呼叫端只能整串比對。
  evalExpansion: boolean
}

const SEPARATORS = ['&&', '||', ';;', '|&', ';', '|', '&', '(', ')']
const REDIRECTIONS = ['<<<', '<<-', '<<', '&>>', '&>', '>>', '>|', '>&', '<&', '<>', '>', '<']

// $' … ' 裡的跳脫：$'\x6d'erge 會被 shell 還原成 merge，不解碼就會被這種寫法繞過。
function decodeAnsiC(text: string): string {
  return text.replace(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|U[0-9a-fA-F]{1,8}|[0-7]{1,3}|c.|.)/g, (_, esc: string) => {
    if (esc[0] === 'x' || esc[0] === 'u' || esc[0] === 'U') return String.fromCodePoint(parseInt(esc.slice(1), 16))
    if (/^[0-7]/.test(esc)) return String.fromCharCode(parseInt(esc, 8))
    const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v' }
    return simple[esc] ?? esc
  })
}

// 從 from（開頭字元之後）找到對應的結尾，跳過引號、跳脫、heredoc 內容與巢狀；回傳結尾的位置，找不到回傳 -1。
// 要認得 heredoc：git commit -m "$(cat <<'EOF' … EOF)" 是最常見的 commit 寫法，內容裡一個撇號（can't）
// 曾讓這裡以為引號沒收尾，整段被當成看不見的程式碼擋下（#1090 暫代審查）。
function matchCloseIn(src: string, from: number, open: string, close: string): number {
  let depth = 1
  let j = from
  const pending: Array<{ delimiter: string; stripTabs: boolean }> = []
  while (j < src.length) {
    const c = src[j]
    if (c === '\\') { j += 2; continue }
    if (src.startsWith('<<', j) && src[j + 2] !== '<') {
      let k = j + 2
      const stripTabs = src[k] === '-'
      if (stripTabs) k += 1
      while (src[k] === ' ' || src[k] === '\t') k += 1
      const word = /^(?:'[^']*'|"[^"]*"|\\.|[^\s;&|()<>])+/.exec(src.slice(k))
      if (word) {
        pending.push({ delimiter: word[0].replace(/['"\\]/g, ''), stripTabs })
        j = k + word[0].length
        continue
      }
    }
    if (c === '\n' && pending.length) {
      j += 1
      for (const doc of pending.splice(0)) {
        while (j < src.length) {
          const end = src.indexOf('\n', j)
          const line = src.slice(j, end < 0 ? src.length : end)
          j = end < 0 ? src.length : end + 1
          if ((doc.stripTabs ? line.replace(/^\t+/, '') : line) === doc.delimiter) break
        }
      }
      continue
    }
    if (c === "'") { const end = src.indexOf("'", j + 1); if (end < 0) return -1; j = end + 1; continue }
    if (c === '"') {
      j += 1
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1
      if (j >= src.length) return -1
      j += 1
      continue
    }
    if (c === '`') { const end = src.indexOf('`', j + 1); if (end < 0) return -1; j = end + 1; continue }
    if (c === open) depth += 1
    else if (c === close) { depth -= 1; if (depth === 0) return j }
    j += 1
  }
  return -1
}

export function parseShell(src: string): Parsed {
  const parsed: Parsed = { commands: [], substitutions: [], processSubstitutions: [], subshell: false, background: false, unterminated: null, evalExpansion: false }
  let i = 0
  // 目前在幾層括號 subshell 裡；要在第一次 newCommand() 之前宣告。
  let parenDepth = 0
  let current: Command = newCommand()
  let commandStart = 0
  let pipeline: Command[] = []
  const pending: Array<{ delimiter: string; stripTabs: boolean; quoted: boolean; command: Command }> = []

  function newCommand(): Command {
    return { words: [], heredocs: [], herestrings: [], inputs: [], outputs: [], upstream: [], next: null, subshellDepth: parenDepth, raw: '' }
  }

  function fail(at: number) {
    // 收不了尾就停在這裡：後面的內容 shell 也不會照我們以為的方式執行，交給呼叫端整段當成看不見的內容。
    parsed.unterminated ??= src.slice(at)
    i = src.length
  }

  const matchClose = (from: number, open: string, close: string) => matchCloseIn(src, from, open, close)

  // 讀一段 $…；回傳原始文字，順便把要執行的內容記進 substitutions。
  function readDollar(word: { value: string; raw: string; dynamic: boolean }, inDouble: boolean) {
    const next = src[i + 1]
    if (next === "'" && !inDouble) {
      let j = i + 2
      while (j < src.length && src[j] !== "'") j += src[j] === '\\' ? 2 : 1
      if (j >= src.length) return fail(i)
      word.value += decodeAnsiC(src.slice(i + 2, j))
      word.raw += src.slice(i, j + 1)
      i = j + 1
      return
    }
    if (next === '(' && src[i + 2] === '(') {
      const end = matchClose(i + 3, '(', ')')
      if (end < 0 || src[end + 1] !== ')') return fail(i)
      // 算式本身不會執行，但裡面的 $(…)／`…` 會：$(( $(gh pr merge 1) )) 照樣合併（#1090 Codex）。
      // 只拆出裡面的命令替換，不把算式當 shell 解析（1 << 2 是位移，不是 heredoc）。
      // 算式裡有變數名稱時，變數的值會再被當算式算一次，見 evalExpansion。
      collectExpansions(src.slice(i + 3, end))
      if (/[A-Za-z_]/.test(src.slice(i + 3, end).replace(/\$\([^)]*\)/g, ''))) parsed.evalExpansion = true
      const text = src.slice(i, end + 2)
      word.value += text
      word.raw += text
      word.dynamic = true
      i = end + 2
      return
    }
    if (next === '(' || next === '{') {
      const end = matchClose(i + 2, next, next === '(' ? ')' : '}')
      if (end < 0) return fail(i)
      const inner = src.slice(i + 2, end)
      if (next === '(') parsed.substitutions.push(inner)
      else {
        // ${…} 本身不是指令，只拆出裡面的 $(…)；zsh 的 (e) 旗標會把值再當成程式展開一次（${(e)x}）。
        collectExpansions(inner)
        if (/^\([^)]*e[^)]*\)/.test(inner)) parsed.evalExpansion = true
      }
      const text = src.slice(i, end + 1)
      word.value += text
      word.raw += text
      word.dynamic = true
      i = end + 1
      return
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*|^[0-9@*#?$!-]/.exec(src.slice(i + 1))
    if (!name) {
      word.value += '$'
      word.raw += '$'
      i += 1
      return
    }
    word.value += '$' + name[0]
    word.raw += '$' + name[0]
    word.dynamic = true
    i += 1 + name[0].length
  }

  function readBacktick(word: { value: string; raw: string; dynamic: boolean }) {
    let j = i + 1
    while (j < src.length && src[j] !== '`') j += src[j] === '\\' ? 2 : 1
    if (j >= src.length) return fail(i)
    parsed.substitutions.push(src.slice(i + 1, j).replace(/\\([`\\$])/g, '$1'))
    word.value += src.slice(i, j + 1)
    word.raw += src.slice(i, j + 1)
    word.dynamic = true
    i = j + 1
  }

  function readWord(): Word | null {
    const word = { value: '', raw: '', dynamic: false }
    let unquoted = ''
    const start = i
    while (i < src.length) {
      const c = src[i]
      if (c === ' ' || c === '\t' || c === '\n') break
      if ((c === '<' || c === '>') && src[i + 1] === '(') {
        const end = matchClose(i + 2, '(', ')')
        if (end < 0) { fail(i); break }
        const inner = src.slice(i + 2, end)
        parsed.substitutions.push(inner)
        parsed.processSubstitutions.push(inner)
        word.value += src.slice(i, end + 1)
        word.raw += src.slice(i, end + 1)
        word.dynamic = true
        i = end + 1
        continue
      }
      if (';&|()<>'.includes(c)) {
        // 緊貼在字後面的 ( 不是 subshell：zsh 的 glob qualifier（/(e:'cmd':) 會執行 cmd）、extglob 或陣列賦值。
        // 函式定義 f() 後面直接接 ) 不算。內容看不懂，交給呼叫端整串比對（#1090 暫代審查）。
        if (c === '(' && word.raw !== '' && src[i + 1] !== ')') parsed.evalExpansion = true
        break
      }
      if (c === '\\') {
        if (src[i + 1] === '\n') { i += 2; continue }
        word.value += src[i + 1] ?? ''
        word.raw += src.slice(i, i + 2)
        i += 2
        continue
      }
      if (c === "'") {
        const end = src.indexOf("'", i + 1)
        if (end < 0) { fail(i); break }
        word.value += src.slice(i + 1, end)
        word.raw += src.slice(i, end + 1)
        i = end + 1
        continue
      }
      if (c === '"' || (c === '$' && src[i + 1] === '"')) {
        if (c === '$') { word.raw += '$'; i += 1 }
        word.raw += '"'
        i += 1
        while (i < src.length && src[i] !== '"') {
          const d = src[i]
          if (d === '\\' && '$`"\\\n'.includes(src[i + 1] ?? '')) {
            if (src[i + 1] !== '\n') word.value += src[i + 1]
            word.raw += src.slice(i, i + 2)
            i += 2
          } else if (d === '$') readDollar(word, true)
          else if (d === '`') readBacktick(word)
          else { word.value += d; word.raw += d; i += 1 }
        }
        if (i >= src.length) { fail(start); break }
        word.raw += '"'
        i += 1
        continue
      }
      if (c === '$') { readDollar(word, false); continue }
      if (c === '`') { readBacktick(word); continue }
      word.value += c
      word.raw += c
      unquoted += c
      i += 1
    }
    if (word.raw === '') return null
    // 未加引號的 glob／brace／zsh =cmd 會在執行時展開成別的字（gh pr {merge,} → gh pr merge），當成看不見的值。
    // [ 要有對應的 ] 才是 glob：test 指令 [ 本身是普通字，當成變數會讓每個 [ -n "$x" ] 迴圈整串被比對（重播歷史指令時發現）。
    if (/[*?]|\[[^\]]+\]/.test(unquoted) || /\{[^{}]*(,|\.\.)[^{}]*\}/.test(unquoted) || /^=[A-Za-z]/.test(unquoted)) word.dynamic = true
    return word
  }

  function endCommand(end: number) {
    current.raw = src.slice(commandStart, end).trim()
    // 只有重導向的指令（> .env）也要留下，寫入目標在 outputs。
    if (current.words.length || current.heredocs.length || current.herestrings.length || current.outputs.length) parsed.commands.push(current)
    current = newCommand()
    commandStart = end
  }

  function readHeredocBodies() {
    // i 指向換行；heredoc 內容從下一行開始，依宣告順序各讀到自己的結束行。
    i += 1
    for (const doc of pending.splice(0)) {
      // 找不到結束行時 bash 只警告，剩下的內容照樣當 heredoc，所以仍算資料。
      const lines: string[] = []
      while (i < src.length) {
        const lineEnd = src.indexOf('\n', i)
        const line = src.slice(i, lineEnd < 0 ? src.length : lineEnd)
        i = lineEnd < 0 ? src.length : lineEnd + 1
        if ((doc.stripTabs ? line.replace(/^\t+/, '') : line) === doc.delimiter) break
        lines.push(line)
      }
      const body = lines.join('\n')
      doc.command.heredocs.push({ body, quoted: doc.quoted })
      // 結束標記沒加引號時，內容裡的 $(…)／`…` 會先被 shell 執行，不論接收的指令是 cat 還是 python。
      if (!doc.quoted) collectExpansions(body)
    }
    commandStart = i
  }

  // 只找會被執行的展開，給未加引號的 heredoc 內容用（那段文字本身是資料，引號在這裡也只是普通字元）。
  function collectExpansions(text: string) {
    let j = 0
    while (j < text.length) {
      const c = text[j]
      if (c === '\\') { j += 2; continue }
      if (c === '`') {
        let end = j + 1
        while (end < text.length && text[end] !== '`') end += text[end] === '\\' ? 2 : 1
        if (end >= text.length) { parsed.unterminated ??= text.slice(j); return }
        parsed.substitutions.push(text.slice(j + 1, end).replace(/\\([`\\$])/g, '$1'))
        j = end + 1
        continue
      }
      if (c === '$' && (text[j + 1] === '(' || text[j + 1] === '{')) {
        const end = matchCloseIn(text, j + 2, text[j + 1], text[j + 1] === '(' ? ')' : '}')
        if (end < 0) { parsed.unterminated ??= text.slice(j); return }
        parsed.substitutions.push(text.slice(j + 2, end))
        j = end + 1
        continue
      }
      j += 1
    }
  }

  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t') { i += 1; continue }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; continue }
    if (c === '\n') {
      // 換行接在 | 或 && 後面時指令還沒結束（cat x |⏎ bash 仍是同一條管線），不能把 upstream 弄丟。
      if (current.words.length) {
        current.next = ';'
        endCommand(i)
        pipeline = []
      }
      if (pending.length) readHeredocBodies()
      else { i += 1; commandStart = i }
      continue
    }
    if (c === '#') {
      const end = src.indexOf('\n', i)
      i = end < 0 ? src.length : end
      continue
    }
    // (( … )) 是算式指令：裡面的 << 是位移，當成 heredoc 會吞掉下一行真正的指令（(( x = 1 << 2 ))⏎gh pr merge 1，#1090 暫代審查）。
    // 找不到成對的 )) 時（例如 ((cd x); y) 這種巢狀 subshell）照一般括號處理。
    if (src.startsWith('((', i)) {
      const end = matchClose(i + 2, '(', ')')
      if (end >= 0 && src[end + 1] === ')') {
        const inner = src.slice(i + 2, end)
        collectExpansions(inner)
        if (/[A-Za-z_]/.test(inner.replace(/\$\([^)]*\)/g, ''))) parsed.evalExpansion = true
        current.words.push({ value: src.slice(i, end + 2), raw: src.slice(i, end + 2), dynamic: false })
        i = end + 2
        continue
      }
    }
    const separator = SEPARATORS.find(op => src.startsWith(op, i) && !(op === '&' && src[i + 1] === '>'))
    if (separator && !((c === '<' || c === '>') && src[i + 1] === '(')) {
      const finished = current
      finished.next = separator
      endCommand(i)
      i += separator.length
      commandStart = i
      if (separator === '|' || separator === '|&') {
        pipeline.push(finished)
        current.upstream = [...pipeline]
      } else pipeline = []
      if (separator === '&') parsed.background = true
      if (separator === '(' || separator === ')') {
        parsed.subshell = true
        parenDepth = Math.max(0, parenDepth + (separator === '(' ? 1 : -1))
        current.subshellDepth = parenDepth
      }
      continue
    }
    const redirection = REDIRECTIONS.find(op => src.startsWith(op, i))
    if (redirection && src[i + 1] !== '(') {
      // 緊貼在重導向前的數字是 fd（2>&1 的 2），不是指令的參數。
      const last = current.words[current.words.length - 1]
      if (last && /^\d+$/.test(last.raw) && i > 0 && /\d/.test(src[i - 1])) current.words.pop()
      i += redirection.length
      while (src[i] === ' ' || src[i] === '\t') i += 1
      const target = readWord()
      if (!target) continue
      if (redirection === '<<' || redirection === '<<-') {
        pending.push({ delimiter: target.value, stripTabs: redirection === '<<-', quoted: target.raw !== target.value, command: current })
      } else if (redirection === '<<<') current.herestrings.push(target)
      else if (redirection === '<' || redirection === '<>') current.inputs.push(target)
      // >&2、>&- 是複製或關閉 fd，不是寫檔。
      if (redirection === '<>' || (redirection.includes('>') && !(redirection === '>&' && /^(\d+|-)$/.test(target.value)))) current.outputs.push({ op: redirection, target })
      continue
    }
    const word = readWord()
    if (word) current.words.push(word)
    else i += 1
  }
  endCommand(src.length)
  return parsed
}
