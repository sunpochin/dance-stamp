<!-- 檔案用途：保存 #249 小修正與固定官方 Lean 的可重播試用證據。所在層：工具實測紀錄。主要關聯：../agents/work-methods.md、../../TECHNICAL.md、spec-kit-lean-249/。 -->
# #249：AWM 漂移提示與 Spec Kit Lean 單線試用

日期：2026-11-03（台北）。[小票 #249](https://github.com/sunpochin/dance-stamp/issues/249)，父票 [#246](https://github.com/sunpochin/dance-stamp/issues/246)，共用選型 [AWM #3](https://github.com/sunpochin/agent-work-methods/issues/3)。本輪授權限小任務、局部工具設定與 PR；三張票不在本輪關閉。沒有合併、auto-merge、部署、發布、AWM 升版／遷移或其他產品操作。

## 結果與原生基準

像檢查到「手冊被塗改」時，提示去原作者處修好，再透過審查換新版本；不再暗示只重貼本地校驗標籤就好。只依 `vendor/agent-work-methods/` 分流指紋錯誤訊息，其他來源原文保留；指紋、缺檔、非法路徑、完整副本、額外追蹤檔、skill／規則入口與 exit code 的判斷都沒有改動。

開工即時 fetch base：`acea4b9d52ad1b7aaa7db2ba1e5b8c070a567b74`。GitHub open pulls collection 回傳空陣列；open issues 沒有重複小票。共用 checkout 是另一任務的乾淨舊分支；用桌面 app 的 managed worktree 從 origin/main 隔離，聊天已附加，編輯、測試與提交都明確使用同一工作區。未 stash、搬移或改寫原 checkout。

原生基準已先記在 #249：owning 規則 → issue → 隔離分支 → 最小改動／既有測試 → Bun check → diff／hooks → commit／push → 非 Draft main PR → CI／獨立審查。原程式於局部 Bun 1.4.4 完整 check：**760 pass、0 fail、4,385 assertions**，34.444 秒。這是未改程式的基準，不是「再做一次同任務」的對照實驗。

需求、計畫、依序任務分別見 [spec](spec-kit-lean-249/spec.md)、[plan](spec-kit-lean-249/plan.md)、[tasks](spec-kit-lean-249/tasks.md)。它們是在官方生成指示被顯式載入後依序產生，非只人工取相同檔名冒充流程。

## 固定工具與安全審查

- 官方 [Spec Kit v1.2.6](https://github.com/github/spec-kit/tree/9eacc24ffe47eadf035a3af601e4dabfb15b8fde)，tag 解參照為 `9eacc24ffe47eadf035a3af601e4dabfb15b8fde`；安裝後 `specify --version` 回報 1.2.6。
- 內建 [presets/lean](https://github.com/github/spec-kit/tree/9eacc24ffe47eadf035a3af601e4dabfb15b8fde/presets/lean) 的 preset 自身版本 **1.0.0**。`specify preset resolve speckit.plan` 實際解析到本地 lean v1.0.0；registry 記錄五個覆寫已註冊，未加任何 extension。
- 按產品 `awm-skill-safety` 先唯讀讀取 pyproject／MIT、CLI init 入口與選定分支、資產定位、Codex／SkillsIntegration setup、shared infrastructure、preset 安裝與 skill 註冊、events 關閉路徑，以及四份 Lean 命令。檢查套件 build backend 為 hatchling；無本輪所需的另行安裝／更新腳本。未執行 self upgrade、preset update、外部 integration、工作流引擎或 MCP server。
- 初始化會寫 `.specify/`、十份 `.agents/skills/speckit-*/SKILL.md`，複製六個 bash helper／templates／內建 workflow 並 chmod helper；這些 core helper 與額外 skills **只生成、未執行／載入**。Lean 四指示本身只要求讀寫文件及依序實作，沒有 research-agent 派工。
- 初始化前 `.specify`、所有 speckit 目的地與 `.codex/config.toml` 不存在；保存 452 個既有追蹤檔 bytes snapshot。使用無 `--force` 的保留式確認，完成後逐檔 SHA 對照：**既有檔案變更 0**。`--events false` 沒有產生 `.codex/config.toml` 或 dispatcher；既有 hooks／AWM 五 skills、vendor、lock、aliases 不變。
- 來源下載到系統暫存；用既有 uv 0.11.31、Python 3.15.2，固定來源建立 wheel，安裝在暫存 venv。沒有全域 tool install／設定、常駐服務、付費 API、憑證輸入或產品資料上傳。必要套件需下載；CLI 執行採 `OTEL_SDK_DISABLED=true`。依賴含 opentelemetry-api，但選定路徑未見 exporter／傳送呼叫；**未作封包觀測，不能聲稱已驗證零網路**。
- 本機 Bun 原為 1.4.2（未拿它冒充檢查成功）；從 Bun 固定 release 局部取得 1.4.4，命令環境 PATH 指向該版本，不修改全域 Bun。依 repo lockfile `bun install --frozen-lockfile --ignore-scripts`，未改 package／lock。

保留的 [source hashes](spec-kit-lean-249/tool-evidence/source.json)、[實際 Python 依賴](spec-kit-lean-249/tool-evidence/python-dependencies.txt)、[生成清單與 SHA-256](spec-kit-lean-249/tool-evidence/generated-files.json)、[MIT](spec-kit-lean-249/tool-evidence/LICENSE.spec-kit) 可供覆核。依賴是當次解析版本；重播可用該清單約束，未宣稱跨平台 wheel／完整供應鏈已重現。

## 實際啟用與依序使用

本輪安裝／初始化的等價命令（暫存根路徑可另選）：

```sh
git clone --filter=blob:none --no-checkout --single-branch --branch v1.2.6 https://github.com/github/spec-kit.git /tmp/dance-stamp-spec-kit-v1.2.6
git -C /tmp/dance-stamp-spec-kit-v1.2.6 checkout --detach 9eacc24ffe47eadf035a3af601e4dabfb15b8fde
UV_CACHE_DIR=/tmp/dance-stamp-trial-runtime/uv-cache uv venv /tmp/dance-stamp-trial-runtime/specify-venv --python python3
UV_CACHE_DIR=/tmp/dance-stamp-trial-runtime/uv-cache uv pip install --python /tmp/dance-stamp-trial-runtime/specify-venv/bin/python /tmp/dance-stamp-spec-kit-v1.2.6
/tmp/dance-stamp-trial-runtime/specify-venv/bin/specify --version
# 先人工核對所有目的地不存在；在本任務隔離 repo root 執行，於官方提示回答 y。
OTEL_SDK_DISABLED=true /tmp/dance-stamp-trial-runtime/specify-venv/bin/specify init --here --integration codex --integration-options="--events false" --preset lean --script sh --ignore-agent-tools
/tmp/dance-stamp-trial-runtime/specify-venv/bin/specify preset resolve speckit.plan
```

第一個 clone／checkout 在受限網路下遇到 DNS 拒絕；原命令經已授權的網路權限取得後成功，沒有改工具來源或版本。`--ignore-agent-tools` 僅略過外部 Codex CLI 可執行檔的存在檢查，因為本輪用桌面聊天承接指示；不是略過產品測試或安全 gate。

官方固定版 [Codex integration](https://github.com/github/spec-kit/blob/9eacc24ffe47eadf035a3af601e4dabfb15b8fde/docs/integrations/codex.md) 生成 `.agents/skills/speckit-*/SKILL.md`，聊天以 `$speckit-*` 引用。亦核對 [OpenAI skills 文件](https://learn.chatgpt.com/docs/build-skills)：選用時載入完整 SKILL.md；repo skill 掃描入口為 `.agents/skills`。本客戶端沒有可呼叫的 slash-command／skill picker 工具，故實際方式為**顯式讀檔載入**，不是自建 runner，也沒有冒充 UI／自動發現驗證。

1. 載入生成的 [specify SKILL](spec-kit-lean-249/tool-evidence/instructions/speckit-specify/SKILL.md)，以本任務文字為輸入，設定 feature directory 為 `docs/evidence/spec-kit-lean-249`，產生 feature.json 與 spec.md。Lean 原文會要求向使用者問路徑；本輪依使用者「局部設定自行處理、不重複詢問」的更高優先授權，自行選這個無衝突路徑。這是一次明列的人工設定／指示調整，不是工具自動推斷。
2. 載入生成的 [plan SKILL](spec-kit-lean-249/tool-evidence/instructions/speckit-plan/SKILL.md)，讀 feature 指標、constitution 與 spec，寫 plan。constitution 以薄指標引用產品 owning AGENTS／workflow／work-methods／skill-security，沒有執行 constitution skill、複製新政策或改根憲法。
3. 載入生成的 [tasks SKILL](spec-kit-lean-249/tool-evidence/instructions/speckit-tasks/SKILL.md)，讀指定上下文，產生帶 ID 的依序 checklist。
4. 載入生成的 [implement SKILL](spec-kit-lean-249/tool-evidence/instructions/speckit-implement/SKILL.md)，重新讀上述文件，依次加回歸、驗證舊版失敗、最小修改、測試、記錄與交付。預期的 regression red 是驗證步驟，非略過失敗；修正後才繼續交付。

設定快照在 [configuration](spec-kit-lean-249/tool-evidence/configuration/init-options.json)、[integration](spec-kit-lean-249/tool-evidence/configuration/integration.json)、[feature](spec-kit-lean-249/tool-evidence/configuration/feature.json)、[registry](spec-kit-lean-249/tool-evidence/configuration/lean-registry.json)、[constitution 原文](spec-kit-lean-249/tool-evidence/configuration/constitution.md.txt)。原文的相對連結以原 `.specify/memory/` 位置解讀。

## 驗證與受控失敗

`tests/unit/harness.test.ts` 原本沒有執行真正 check-harness 的指紋訊息回歸，因此加一個既有 bun:test 案例，直接跑同一檢查器。從公開追蹤檔複製到獨立暫存 Git fixture，保留相對 symlink；只在 fixture 加合成漂移、缺檔、額外追蹤檔與壞規則入口，用 finally 刪自有 fixture。沒有鏡像訊息選擇器或新測試框架。

| 檢查 | 實際結果 |
| --- | --- |
| 修改前完整 `bun run check` | 760 pass／0 fail，34.444 秒 |
| 新回歸＋未修程式（受控 red） | 6 pass／1 fail；確實收到舊「記錄適配與指紋」，未收到預期 AWM 訊息；exit 1，0.676 秒 |
| 最小修正後受影響 harness | 7 pass／0 fail、56 assertions；0.843 秒 |
| AWM 漂移／其他來源漂移 | 各 exit 1；訊息各自正確，互不混用 |
| 缺檔／額外追蹤檔／壞入口 | 各 exit 1，原診斷仍存在；正常 fixture exit 0 |
| 完整 check／正常 pre-commit／pre-push | 最終結果與精確 head 收據見本 PR conversation；未完成時不預填成功 |

重播修正回歸：先使用 `.bun-version` 的 1.4.4 及既有依賴，再執行 `bun --no-env-file test --isolate ./tests/unit/harness.test.ts` 和 `bun run check`。舊版 red 可在另一個自有 fixture 取 base 的 check-harness 與本 PR 測試重現；不要修改產品 vendor 或回退本工作區。

## 正常 hook 發現的 fixture 隔離疏漏與返工

第一輪最終完整 check 曾 761 pass／0 fail（34.414 秒），但首次正常 `git commit` 的 pre-commit 另以真實 hook 環境重跑時，新增 fixture 測試在 `git add` exit 128：760 pass／1 fail，提交未成立、未推送。原因是 hook 匯出的 Git repo 環境會優先於子程序 cwd；fixture 的 `git init` 因此誤用主 repo 的 Git 目錄，將共同設定 `core.bare` 改為 true，短暫使一般 status 失敗。這是本輪新增測試的隔離疏漏，不能歸為 Lean 的自動保護成果。

已只還原這次造成的 `core.bare=false`，確認原分支／index／工作檔及 `.githooks` 仍在，沒有 reset、stash、丟棄檔案或略過 hook。依 [Git 官方 hooks 文件](https://git-scm.com/docs/githooks) 對操作其他 repo 的指引，fixture 子程序清除 `git rev-parse --local-env-vars` 列出的環境；真正產品 check／提交 hook 的環境與檢查不變。修正後必須再通過帶 repo 環境的回歸及正常完整 hook，最終結果另記精確 head。初次失敗沒有計為成功；沒有未推送 commit 堆積。

## 能力與既有 gate 分工

| 項目 | 本輪分類／觀察 |
| --- | --- |
| 生成／註冊 Lean、解析覆寫 | 工具直接做到，版本與雜湊留證 |
| 禁用 events、選 Codex／Lean、feature 路徑、constitution 薄指標 | 經局部設定／人工判斷做到 |
| main PR、Bun 版本、check、hooks、未提交內容保全、範圍與不合併 | 既有工具及人工 gate；Lean 沒有自動執行或強制 |
| head／tested／reviewed／CI 缺項核對 | 既有 PR／CI 與人工收據；不是 Lean 拒絕舊證據 |
| 目的地與既有追蹤檔保全 | 本輪人工 preflight＋前後雜湊核對，沒有聲稱工具能拒絕任意錯工作區 |
| slash UI／自動發現、真實中斷恢復 | 本聊天無呼叫介面／未驗證；用顯式載入與同 session 演練 |
| 重複派工／失聯 owner、共享硬體競爭 | 不適用：單線、無派工／背景任務、不碰硬體 |
| tracked／untracked／ignored 他人內容保全壓力測試 | 未驗證；原 checkout 沒有未提交內容且未被修改，不把無資料當壓力測試成功 |
| AWM 改版、UI／媒體／儲存／雲端、真機／真人／發布 | 未執行；不由工具測試代簽 |

## 時間、成本與文件成本

以下為實際可取得的牆鐘區間或命令耗時；會重疊，不能相加當純人工作時。開工最早閱讀至第一個可用 timestamp 前的時間 **unknown**。

| 階段 | 實際量測 |
| --- | --- |
| 局部設定／來源審查 | 02:10:13–02:13:44 UTC，3 分 31 秒可觀測區間；含來源閱讀、下載與必要套件取得；更早讀規則時間 unknown |
| 官方 init | 02:13:44 UTC 起，0.233 秒，exit 0；套件安裝另約 8 秒（uv 輸出，非完整審查耗時） |
| specify／必要薄設定 | init 後至 02:14:57 UTC，約 73 秒牆鐘 |
| plan | 02:14:57–02:15:44 UTC，47 秒牆鐘 |
| tasks | 02:15:44–02:16:11 UTC，27 秒牆鐘 |
| 程式／回歸實作 | 02:16:11–02:17:31 UTC，約 80 秒牆鐘；之後有空行整理，程式邏輯不變 |
| 測試 | baseline 34.444 秒；red 0.676 秒；green 0.843 秒；最終 check／hook 時間另在 PR 收據 |
| 同 session 接手／完整審查／CI 等待／交付 | 同 session 接手 36.128 秒；後續精確區間與狀態以 PR 收據補記；不能預填獨立審查耗時 |
| 模型費用、工具取得費用、CI 費用 | **unknown**；沒有帳務證據，不填 0、不猜節省比例 |

額外成本是三份 spec／plan／tasks、一次安全檢查與本紀錄、四份生成指示及必要設定證據；程式僅改一個訊息選擇分支，這些流程文件明顯比修正本身多。最終檔案／行數見 PR diff；不把搬移或產生文件當成淘汰程式碼。

## 接手、停用與建議

同 session 接手演練已於 2026-11-03T02:22:20Z–2026-11-03T02:22:56Z 完成（36.128 秒牆鐘）：從本紀錄、spec／tasks、source／configuration 與 Git diff 重新核對目標、完成內容、版本、證據與下一步。確認 T001–T003 已完成，當時仍須 T004 停用與 T005 完整檢查／PR／CI 收據；未把舊基準當新 head 結果。**不是獨立 agent、跨聊天、真實失聯或重啟恢復。**

本輪已完成停用，只保留上述可審證據。初始化前已確認不存在的 `.specify/` 與十個 speckit skill 目錄，按保存清單逐檔核對後移除本輪自有檔案，再移除空目錄；既有 `.agents/skills/awm-*` 等不動。不使用 reset、clean、stash、盲目 force 或刪他人內容。這讓工具不再主動註冊，repo 也無新的常駐依賴；暫存 venv／來源／Bun 可保留供重播，刪除它們只需清理由本輪建立的明確暫存目錄。要重啟試驗，重新按上述命令與 preflight 生成，不直接重用已封存的 registry 當現行狀態。

程式回復應另開 PR 反向還原本次訊息／測試／索引與證據變更，經既有 check／review；不在此輪執行回復或更改 main。未合併，因此 integration commit、合併等待及合併後七日回歸觀察均不適用。

**建議：維持原生流程，縮小 Lean 到需要多步規劃的後續獨立試驗。** 本輪在局部設定及顯式載入下可用，但沒有證據顯示對這種小修正更快或更省；不正式擴大採用、不建補充框架、不修改 AWM 副本。一次小樣本不能推論全專案適用性。
