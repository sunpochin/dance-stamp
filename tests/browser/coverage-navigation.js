/* 檔案用途：證明產品自己重載也能保留上一頁的覆蓋率。所在層：收集器契約測試。主要關聯：run-app.ts、main.js。 */
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4');
  await page.waitForFunction(() => !document.getElementById('controls').disabled);
  await page.locator('#practice-mirror').check();
  const line = await page.evaluate(() => {
    const coverage = window.__coverage__['web/main.js'], fn = Object.values(coverage.fnMap).find(fn => fn.name === 'drawPractice');
    const last = Math.max(...Object.values(coverage.statementMap).filter(statement => statement.start.line > fn.loc.start.line && statement.end.line < fn.loc.end.line).map(statement => statement.start.line));
    if (!Object.entries(coverage.statementMap).some(([id, statement]) => statement.start.line === last && coverage.s[id] > 0)) throw new Error('未實際繪出鏡像，不能驗證重載保留');
    return last;
  });
  const loaded = page.waitForEvent('load'); await page.evaluate(() => location.reload()); await loaded;
  await page.waitForFunction(() => !document.getElementById('controls').disabled);
  const reset = await page.evaluate(line => {
    const coverage = window.__coverage__['web/main.js'];
    return Object.entries(coverage.statementMap).filter(([, statement]) => statement.start.line === line).every(([id]) => coverage.s[id] === 0);
  }, line);
  assert(reset, '新頁面必須有新的計數器；不能靠不重載掩蓋遺失');
  return { actualProductReload: true, freshPageCounter: true, navigationCoverage: { path: 'web/main.js', line } };
}
