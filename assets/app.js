
const $ = id => document.getElementById(id);

let draws = JSON.parse(localStorage.getItem('bingo10_draws') || '[]');
let recs = JSON.parse(localStorage.getItem('bingo10_recs') || '[]');

const nums = a => a.map(x => String(x).padStart(2, '0'));

function parseLines(s) {
  return s.split(/\n/)
    .map(l => l.match(/\d{1,2}/g) || [])
    .filter(a => a.length >= 20)
    .map(a => [...new Set(a.slice(-20).map(Number).filter(n => n >= 1 && n <= 80))])
    .filter(a => a.length >= 20)
    .map(a => a.slice(0, 20).sort((x, y) => x - y));
}

function save() {
  localStorage.setItem('bingo10_draws', JSON.stringify(draws));
  localStorage.setItem('bingo10_recs', JSON.stringify(recs));
  render();
}

function score(pool) {
  let freq = Array(81).fill(0);
  [30, 100, 300].forEach((n, i) => {
    pool.slice(0, n).forEach(d => d.forEach(x => freq[x] += [1, 0.6, 0.3][i]));
  });
  return freq;
}

function pick(pool) {
  let f = score(pool);
  let rank = Array.from({length: 80}, (_, i) => i + 1)
    .sort((a, b) => f[b] - f[a] || Math.random() - 0.5);
  let chosen = [];
  while (chosen.length < 10) {
    let top = rank.slice(0, Math.min(35, rank.length));
    let x = top[Math.floor(Math.random() * top.length)];
    if (!chosen.includes(x)) chosen.push(x);
    rank = rank.filter(v => v !== x);
  }
  return chosen.sort((a, b) => a - b);
}

function render() {
  $('dataCount').textContent = `目前資料：${draws.length} 期`;

  let f = score(draws);
  $('stats').innerHTML = draws.length
    ? `<div class="statgrid">${[30, 100, 300].map(n => {
        let top = Array.from({length: 80}, (_, i) => i + 1)
          .sort((a, b) => f[b] - f[a]).slice(0, 10);
        return `<div class="stat"><b>近 ${n} 期</b>${draws.length < n ? '資料不足，使用現有資料' : '前 10 高頻：' + nums(top).join('、')}</div>`;
      }).join('')}</div>`
    : '<p class="muted">尚未匯入開獎資料。</p>';

  $('history').innerHTML = recs.length
    ? recs.slice(0, 10).map(r => `<div class="record">${r.date}：${nums(r.n).join('、')}</div>`).join('')
    : '尚無紀錄';
}

// 最新開獎：優先使用台灣彩券 API
async function updateLatestData(silent = false) {
  const status = $('updateStatus');
  const button = $('updateLatest');

  if (button) button.disabled = true;
  if (status) status.textContent = '正在向台灣彩券查詢最新開獎資料…';

  try {
    const url = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/LatestBingoResult';
    const response = await fetch(url, {cache: 'no-store'});

    if (!response.ok) throw new Error('官方資料服務暫時無法連線');

    const json = await response.json();
    const content = json.content || json;
    let result = content.lotteryBingoLatestPost || content;

    if (Array.isArray(result)) result = result[0];

    // 兼容官方回應中可能使用的欄位名稱
    const numberFields = [
      'bigShowOrder',
      'openShowOrder',
      'showOrder',
      '開獎號碼',
      'numbers'
    ];

    let rawNumbers = null;
    let period = '';

    if (result && typeof result === 'object') {
      for (const key of numberFields) {
        if (result[key]) {
          rawNumbers = result[key];
          break;
        }
      }
      period = String(result.drawTerm || result.period || result.term || '');
    }

    if (typeof rawNumbers === 'string') {
      rawNumbers = rawNumbers.match(/\d{1,2}/g) || [];
    }

    if (!Array.isArray(rawNumbers)) {
      throw new Error('官方回傳格式尚未能辨識，請稍後再試或手動匯入。');
    }

    const latest = [...new Set(
      rawNumbers.map(Number).filter(n => n >= 1 && n <= 80)
    )].sort((a, b) => a - b);

    if (latest.length !== 20) {
      throw new Error('取得的號碼不是20個，為避免匯入錯誤，本次沒有更新。');
    }

    const same = draws.some(d =>
      Array.isArray(d) &&
      d.length === 20 &&
      [...d].sort((a, b) => a - b).join(',') === latest.join(',')
    );

    if (same || (period && localStorage.getItem('bingo10_latest_period') === period)) {
      if (status) status.textContent = '目前資料已是最新，沒有重複匯入。';
      return;
    }

    draws.unshift(latest);
    if (period) localStorage.setItem('bingo10_latest_period', period);
    save();

    if (status) {
      status.textContent = `更新成功！${period ? '期別：' + period + '；' : ''}已加入最新一期20個號碼。`;
    }
  } catch (error) {
    if (status) {
      status.textContent = '更新未成功：' + error.message + '。原有資料保留，你仍可使用手動匯入。';
    }
    if (!silent) alert('最新開獎資料更新失敗。\n' + error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

$('updateLatest').onclick = () => updateLatestData(false);

$('recommend').onclick = () => {
  if (draws.length < 1) {
    alert('請先匯入歷史開獎資料，才能依歷史統計推薦。');
    return;
  }
  let n = pick(draws);
  recs.unshift({date: new Date().toLocaleString('zh-TW'), n});
  save();
  $('numbers').innerHTML = nums(n).map(x => `<span class="ball">${x}</span>`).join('');
  $('reason').textContent = '依目前匯入資料的近30／100／300期頻率加權抽樣；非預測保證。';
};

$('importText').onclick = () => {
  let a = parseLines($('paste').value);
  if (!a.length) {
    alert('找不到有效資料。請每期提供20個不同的01–80號碼。');
    return;
  }
  draws = [...a, ...draws];
  save();
  $('paste').value = '';
  alert(`已匯入 ${a.length} 期資料。`);
};

$('file').onchange = async e => {
  let f = e.target.files[0];
  if (!f) return;

  let t = await f.text();
  try {
    let a;
    if (f.name.endsWith('.json')) {
      let j = JSON.parse(t);
      a = Array.isArray(j)
        ? j.map(x => Array.isArray(x) ? x : (x.numbers || x.開獎號碼 || []))
        : (j.draws || []);
    } else {
      a = parseLines(t);
    }

    a = a.map(x => [...new Set(x.map(Number).filter(n => n >= 1 && n <= 80))])
      .filter(x => x.length >= 20)
      .map(x => x.slice(0, 20).sort((a, b) => a - b));

    if (!a.length) throw Error();

    draws = [...a, ...draws];
    save();
    alert(`匯入完成：${a.length} 期`);
  } catch (_) {
    alert('檔案格式無法辨識。請使用每期含20個號碼的 CSV 或 JSON。');
  }
  e.target.value = '';
};

$('export').onclick = () => {
  let b = new Blob([JSON.stringify({draws, recs}, null, 2)], {type: 'application/json'});
  let a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'Bingo10Star_backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

$('backtest').onclick = () => {
  if (draws.length < 31) {
    $('backtestResult').textContent = '至少需要 31 期資料才能進行簡易回測。';
    return;
  }

  let total = 0, hits = 0, dist = Array(11).fill(0);
  for (let i = Math.max(30, draws.length - 100); i < draws.length; i++) {
    let p = pick(draws.slice(i - 300, i));
    let n = draws[i];
    let k = p.filter(x => n.includes(x)).length;
    dist[k]++;
    hits += k;
    total++;
  }

  $('backtestResult').innerHTML =
    `<p>回測 ${total} 期，平均每組命中：${(hits / total).toFixed(2)} 個</p><p>命中分布（0至10個）：${dist.join('、')}</p>`;
};

render();

// 開啟網頁時自動檢查一次
updateLatestData(true);
