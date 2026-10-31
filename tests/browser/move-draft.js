/* 檔案用途：驗證動作編輯不覆蓋既有／新增草稿，失敗與真正離頁仍保護輸入。所在層：#17 瀏覽器資料保護回歸。主要關聯：main.js、issue-17-moves.md。 */
async (page, phase = 'auto') => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  if (phase === 'verify-navigation' || phase === 'auto' && await page.evaluate(() => !!window.moveDraftExpected)) {
    const result = await page.evaluate(async () => ({ event: window.moveDraftNavigation, expected: window.moveDraftExpected, url: location.href, values: ['move-name', 'move-style', 'move-status'].map(id => document.getElementById(id)?.value), savedLibrary: await (await import('/storage.js')).readLibrary() }));
    // 表單值仍在不代表已存內容安全；拒絕原生離頁後也要讀回完整資料。
    assert(result.event?.trusted && result.event.prevented && result.url.startsWith(result.expected?.origin) && JSON.stringify(result.values) === JSON.stringify(result.expected?.values) && JSON.stringify(result.savedLibrary) === JSON.stringify(result.expected?.savedLibrary), '真正離頁沒有保護動作草稿或已存資料：' + JSON.stringify(result));
    return { realBeforeUnloadDismissed: true, draftRetained: true, savedLibraryRetained: true, event: result.event };
  }
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  const snapshot = () => page.evaluate(async () => await (await import('/storage.js')).readLibrary());
  const values = () => page.evaluate(() => ['move-name', 'move-style', 'move-status'].map(id => document.getElementById(id).value));
  const edit = name => page.locator('#move-results > li').filter({ hasText: name }).getByRole('button', { name: '編輯動作／狀態', exact: true }).click();
  const save = async () => { await page.getByRole('button', { name: '儲存動作', exact: true }).click(); await idle(); };
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) && await page.evaluate(() => window.__danceSyntheticCameraOnly === true), '只能操作本機隔離合成環境');
  await page.context().addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); });
  await page.goto(origin); await idle();
  const initial = await snapshot();
  assert(['videos', 'assets', 'markers', 'takes', 'recipes', 'exports', 'moves'].every(table => initial.data[table].length === 0), '文字回歸必須從空的合成庫開始');
  await page.getByText('分類搜尋與動作庫', { exact: true }).click();
  for (const name of ['合成動作甲', '合成動作乙']) { await page.locator('#move-name').fill(name); await page.locator('#move-style').fill('Salsa'); await save(); }
  await edit('合成動作甲'); await idle();
  await page.locator('#move-name').fill('合成甲尚未保存'); await page.locator('#move-style').fill('合成舞風'); await page.locator('#move-status').selectOption('practicing');
  const draft = await values(), before = await snapshot(); await edit('合成動作乙'); await idle();
  assert(JSON.stringify(await values()) === JSON.stringify(draft), '動作草稿被其他編輯覆蓋');
  assert(JSON.stringify(await snapshot()) === JSON.stringify(before), '切換前改動原資料');
  const followup = { message: await page.locator('#status').textContent(), focus: await page.evaluate(() => document.activeElement.id), element: await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent.slice(0, 80) })) };
  assert(followup.message.includes('先儲存或取消') && followup.focus === 'move-name', '草稿沒有明確接續入口：' + JSON.stringify(followup));
  await save(); assert((await snapshot()).data.moves[0].name === draft[0], '原動作無法保存草稿');
  await page.locator('#move-name').fill('合成新增草稿'); await edit('合成動作乙'); await idle();
  assert((await values())[0] === '合成新增草稿', '新增動作草稿被覆蓋');
  await page.locator('#cancel-move').click(); await edit('合成動作乙'); await idle();
  assert((await values())[0] === '合成動作乙', '明確取消後無法切換');
  await page.locator('#move-name').fill('合成乙 quota 草稿'); const beforeQuota = await snapshot();
  await page.evaluate(() => { window.moveDraftPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args) { if (this.name === 'metadata') throw new DOMException('synthetic draft quota', 'QuotaExceededError'); return window.moveDraftPut.apply(this, args); }; });
  await save(); await page.evaluate(() => { IDBObjectStore.prototype.put = window.moveDraftPut; });
  assert(JSON.stringify(await snapshot()) === JSON.stringify(beforeQuota), 'quota 部分寫入');
  await edit(draft[0]); await idle(); assert((await values())[0] === '合成乙 quota 草稿', 'quota 後失去草稿保護');
  await page.locator('#cancel-move').click(); await edit(draft[0]); await idle(); await page.locator('#move-name').fill('合成衝突草稿');
  const other = await page.context().newPage();
  try {
    await other.goto(origin); await other.evaluate(async () => { const store = await import('/storage.js'), current = await store.readLibrary(); current.data.moves[0].name = '合成較新版本'; current.data.moves[0].revision++; await store.writeLibrary(current.data, current.revision); });
  } finally { await other.close(); }
  const newer = await snapshot(); await save();
  assert(JSON.stringify(await snapshot()) === JSON.stringify(newer) && (await values())[0] === '合成衝突草稿', '衝突覆寫較新版本或清掉輸入');
  await edit('合成動作乙'); await idle(); assert((await values())[0] === '合成衝突草稿', '衝突後失去草稿保護');
  const savedLibrary = await snapshot();
  await page.evaluate(savedLibrary => {
    window.moveDraftExpected = { origin: location.origin, values: ['move-name', 'move-style', 'move-status'].map(id => document.getElementById(id).value), savedLibrary };
    // 真正導覽另由控制器發起與拒絕；單次 run-code 在原生 modal 出現時可能先回傳空結果。
    window.addEventListener('beforeunload', event => { window.moveDraftNavigation = { trusted: event.isTrusted, prevented: event.defaultPrevented }; }, { once: true });
  }, savedLibrary);
  return { existingAndNewDraftPreserved: true, explicitSaveAndCancelWork: true, quotaAndRealTabConflictPreserveDraft: true, beforeUnloadPrepared: true, noMediaOrCamera: true };
}
