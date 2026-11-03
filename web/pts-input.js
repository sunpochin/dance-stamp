/* 用途：拒絕庫會略過的 BMFF edit，防止有聲音卻對到錯片段。所在層：本機輸入邊界。關聯：Mediabunny1.65.0、export-pts-core.js。 */
export async function auditEdits(blob, signal, bmff) {
  let reads = 0, edits = 0, movieScale, seenMovie = false;
  const tracks = [];
  const read = async (at, size) => { signal.throwIfAborted(); if (++reads > 10000) throw Error('影片索引超出有界檢查預算。'); const bytes = await blob.slice(at, at + size).arrayBuffer(); signal.throwIfAborted(); if (bytes.byteLength !== size) throw Error('影片索引截斷。'); return new DataView(bytes); };
  if (typeof bmff !== 'boolean') throw Error('尚未確認影片容器。');
  if (!bmff) return { container: 'non-bmff', editsChecked: 0 };
  if (blob.size < 8) throw Error('影片檔案太短。');
  const name = view => String.fromCharCode(...new Uint8Array(view.buffer, 4, 4));
  async function walk(start, end, scope = 'root', track) {
    for (let at = start; at < end;) {
      if (end - at < 8) throw Error('影片 box 索引截斷。');
      let header = await read(at, 8), size = header.getUint32(0), length = 8;
      const type = name(header);
      if (size === 1) { header = await read(at, 16); const large = header.getBigUint64(8); if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('影片 box 太大。'); size = Number(large); length = 16; }
      if (size === 0) size = end - at;
      if (size < length || at + size > end) throw Error('影片 box 範圍無效。');
      // tag 名稱不是身分：錯層或重複 metadata 不能覆蓋真正 movie timescale／track ID 而把原聲誤補靜音。
      const owner = { moov: 'root', mvhd: 'moov', trak: 'moov', tkhd: 'trak', edts: 'trak', elst: 'edts' }[type];
      if (owner && owner !== scope) throw Error('影片 metadata 層級無效。');
      if (type === 'mvhd' || type === 'tkhd') {
        if ((type === 'mvhd' && movieScale !== undefined) || (type === 'tkhd' && track.id !== undefined)) throw Error('影片 metadata 重複。');
        const version = (await read(at + length, 1)).getUint8(0), offset = version === 1 ? 20 : 12;
        if (![0, 1].includes(version) || length + offset + 4 > size) throw Error('影片 header 無效。');
        const value = (await read(at + length + offset, 4)).getUint32(0);
        if (type === 'mvhd') movieScale = value;
        else track.id = value;
      }
      if (type === 'moov') {
        if (seenMovie) throw Error('影片 movie metadata 重複。');
        seenMovie = true; await walk(at + length, at + size, 'moov');
      }
      if (type === 'edts') {
        if (track.seenEdits) throw Error('影片 edit metadata 重複。');
        track.seenEdits = true; await walk(at + length, at + size, 'edts', track);
      }
      if (type === 'trak') { const child = {}; await walk(at + length, at + size, 'trak', child); tracks.push(child); }
      if (type === 'elst') {
        if (length + 8 > size || track?.edit) throw Error('影片 edit header 無效。');
        const meta = await read(at + length, 8), version = meta.getUint8(0), count = meta.getUint32(4);
        // 只審核庫會略過的 edit，不重寫 sample／codec demux；8MiB 沿既有音訊索引預算。
        if (!track || ![0, 1].includes(version) || !count || count * (version ? 20 : 12) > 8 * 1024 * 1024 || length + 8 + count * (version ? 20 : 12) !== size) throw Error('不支援這份影片的 edit list，原片保留。');
        const entries = await read(at + length + 8, count * (version ? 20 : 12));
        let active = false, delay = 0;
        for (let i = 0; i < count; i++) {
          const p = i * (version ? 20 : 12), media = version ? entries.getBigInt64(p + 8) : BigInt(entries.getInt32(p + 4));
          const duration = version ? Number(entries.getBigUint64(p)) : entries.getUint32(p);
          const rateAt = p + (version ? 16 : 8);
          if (active || media < -1n || !Number.isSafeInteger(duration)) throw Error('不支援多段 edit list，原片保留。');
          if (!Number.isSafeInteger(delay + duration)) throw Error('影片 edit 時間超出可確認範圍。');
          if (media === -1n) { delay += duration; continue; }
          if (entries.getInt16(rateAt) !== 1 || entries.getInt16(rateAt + 2) !== 0) throw Error('不支援變速 edit list，原片保留。');
          active = true; track.edit = { start: delay, end: delay + duration };
        }
        if (!active) throw Error('無法確認純空白 edit 的有效內容。');
        edits++;
      }
      at += size;
    }
  }
  await walk(0, blob.size);
  if (edits && (!Number.isInteger(movieScale) || movieScale <= 0)) throw Error('缺少 edit list 的 movie timescale。');
  const bounds = {};
  const ids = new Set();
  for (const track of tracks) {
    if (!Number.isInteger(track.id) || track.id <= 0 || ids.has(track.id)) throw Error('無法綁定唯一 track ID 到媒體軌。');
    ids.add(track.id);
    if (track.edit) bounds[track.id] = { start: track.edit.start / movieScale, end: track.edit.end / movieScale };
  }
  return { container: 'bmff', editsChecked: edits, headerReads: reads, trackBounds: bounds };
}
