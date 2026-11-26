(() => {
  'use strict';

  const STORAGE_KEY = 'nefes.v1';
  const DEFAULT_STATE = {
    version: 1,
    entries: [],
    settings: {
      dailyLimit: 10,
      packPrice: 100,
      packSize: 20,
      currency: '₺',
    },
  };

  const TAGS = [
    { id: 'kahve', emoji: '☕', label: 'Kahve' },
    { id: 'stres', emoji: '😤', label: 'Stres' },
    { id: 'yemek', emoji: '🍽️', label: 'Yemek sonrası' },
    { id: 'is', emoji: '💼', label: 'İş molası' },
    { id: 'sosyal', emoji: '👥', label: 'Sosyal' },
    { id: 'can_sikintisi', emoji: '😐', label: 'Can sıkıntısı' },
    { id: 'yol', emoji: '🚗', label: 'Yolda' },
  ];

  const MILESTONES = [
    { ms: 20 * 60 * 1000, title: '20 dakika', desc: 'Nabız ve tansiyon normale dönmeye başlar.' },
    { ms: 8 * 3600 * 1000, title: '8 saat', desc: 'Kandaki karbonmonoksit seviyesi yarıya iner.' },
    { ms: 24 * 3600 * 1000, title: '24 saat', desc: 'Kalp krizi riski azalmaya başlar.' },
    { ms: 48 * 3600 * 1000, title: '48 saat', desc: 'Tat ve koku duyusu belirgin şekilde keskinleşir.' },
    { ms: 72 * 3600 * 1000, title: '72 saat', desc: 'Bronşlar gevşer, nefes alıp vermek rahatlar.' },
    { ms: 14 * 24 * 3600 * 1000, title: '2 hafta', desc: 'Kan dolaşımı ve akciğer fonksiyonu güçlenir.' },
  ];

  const WEEKDAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  let state = loadState();
  let storageCorrupted = false;
  let activeTab = 'home';
  let statsRange = '7';
  let quickSheetEntryId = null;
  let quickSheetTimer = null;
  let modalMode = 'edit'; // 'edit' | 'add'
  let modalEntryId = null;
  let modalSelectedTags = new Set();

  const $ = (id) => document.getElementById(id);

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredCloneSafe(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
        storageCorrupted = true;
        return structuredCloneSafe(DEFAULT_STATE);
      }
      const cleanEntries = parsed.entries
        .filter((e) => e && typeof e.t === 'number' && Number.isFinite(e.t))
        .map((e) => ({
          id: String(e.id || genId()),
          t: Math.round(e.t),
          tags: Array.isArray(e.tags) ? e.tags.filter((x) => typeof x === 'string') : [],
          note: typeof e.note === 'string' ? e.note : '',
        }))
        .sort((a, b) => a.t - b.t);

      const s = parsed.settings || {};
      return {
        version: 1,
        entries: cleanEntries,
        settings: {
          dailyLimit: clampNum(s.dailyLimit, 1, 100, 10),
          packPrice: clampNum(s.packPrice, 1, 5000, 100),
          packSize: clampNum(s.packSize, 1, 100, 20),
          currency: typeof s.currency === 'string' && s.currency ? s.currency : '₺',
        },
      };
    } catch (err) {
      console.error('Veri okuma hatası:', err);
      storageCorrupted = true;
      return structuredCloneSafe(DEFAULT_STATE);
    }
  }

  function structuredCloneSafe(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function clampNum(val, min, max, fallback) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function genId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function saveState() {
    state.entries.sort((a, b) => a.t - b.t);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageCorrupted = false;
    } catch (err) {
      console.error('Veri kaydetme hatası:', err);
    }
  }

  // Date helpers
  function dayKey(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function formatDurationTimer(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hrs = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (days >= 1) {
      return `${days}g ${hrs}s ${String(mins).padStart(2, '0')}dk`;
    }
    return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
  }

  function formatShortGap(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 1) return '<1 dk';
    const days = Math.floor(totalMin / 1440);
    const hrs = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}g ${hrs}s`;
    if (hrs > 0) return mins > 0 ? `${hrs}s ${mins}dk` : `${hrs}s`;
    return `${mins} dk`;
  }

  function formatCurrency(amount) {
    const cur = state.settings.currency || '₺';
    if (amount >= 100) return `${cur}${Math.round(amount).toLocaleString('tr-TR')}`;
    return `${cur}${amount.toFixed(1).replace('.', ',')}`;
  }

  function formatTimeHM(ts) {
    return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  function toDatetimeLocalValue(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function computeGaps(entries) {
    const gaps = [];
    for (let i = 1; i < entries.length; i++) {
      const g = entries[i].t - entries[i - 1].t;
      if (g >= 0) gaps.push({ t: entries[i].t, gap: g });
    }
    return gaps;
  }

  function getAverageGapLastDays(days, now = Date.now()) {
    const cutoff = now - days * 86400000;
    const gaps = computeGaps(state.entries).filter((g) => g.t >= cutoff);
    if (!gaps.length) return null;
    return gaps.reduce((s, x) => s + x.gap, 0) / gaps.length;
  }

  function getLongestGap(now = Date.now()) {
    const gaps = computeGaps(state.entries);
    let max = gaps.reduce((m, g) => Math.max(m, g.gap), 0);
    if (state.entries.length > 0) {
      const live = Math.max(0, now - state.entries[state.entries.length - 1].t);
      if (live > max) max = live;
    }
    return max > 0 ? max : null;
  }

  // Rendering: Timer & Home
  function updateLiveTimer() {
    const now = Date.now();
    const timerEl = $('live-timer');
    const avgLabelEl = $('timer-avg-label');
    const recLabelEl = $('timer-record-label');
    const ringEl = $('timer-ring-fill');
    const radius = 94;
    const circumference = 2 * Math.PI * radius;
    ringEl.style.strokeDasharray = `${circumference} ${circumference}`;

    const last = state.entries[state.entries.length - 1];
    if (!last) {
      timerEl.textContent = '--:--:--';
      avgLabelEl.textContent = storageCorrupted
        ? 'Kayıt okunamadı (yedek yükleyebilirsin)'
        : 'İlk kaydını bekliyor';
      recLabelEl.textContent = 'Rekor: —';
      ringEl.style.strokeDashoffset = circumference;
      updateMilestone(0, false);
      return;
    }

    const elapsed = Math.max(0, now - last.t);
    timerEl.textContent = formatDurationTimer(elapsed);

    const avg7 = getAverageGapLastDays(7, now);
    if (avg7 && avg7 > 0) {
      const pct = Math.round((elapsed / avg7) * 100);
      const clamped = Math.min(1, elapsed / avg7);
      ringEl.style.strokeDashoffset = circumference * (1 - clamped);
      avgLabelEl.textContent = `Ortalamana %${pct}`;
    } else {
      ringEl.style.strokeDashoffset = circumference * 0.85;
      avgLabelEl.textContent = 'Ortalama hesaplanıyor';
    }

    const longest = getLongestGap(now);
    recLabelEl.textContent = longest ? `Rekor: ${formatShortGap(longest)}` : 'Rekor: —';
    updateMilestone(elapsed, true);
  }

  function updateMilestone(elapsedMs, hasData) {
    const titleEl = $('milestone-title');
    const descEl = $('milestone-desc');
    const pctEl = $('milestone-pct');
    const barEl = $('milestone-bar');
    const footerEl = $('milestone-footer');

    if (!hasData) {
      titleEl.textContent = 'İlk hedef: 20 dakika';
      descEl.textContent = MILESTONES[0].desc;
      pctEl.textContent = '%0';
      barEl.style.width = '0%';
      footerEl.textContent = 'Sigara eklediğinde iyileşme sayacı başlar.';
      return;
    }

    let next = MILESTONES.find((m) => elapsedMs < m.ms);
    if (!next) {
      const lastM = MILESTONES[MILESTONES.length - 1];
      titleEl.textContent = `Harika! ${lastM.title} aşıldı`;
      descEl.textContent = lastM.desc;
      pctEl.textContent = '%100';
      barEl.style.width = '100%';
      footerEl.textContent = 'Tüm başlangıç sağlık eşiklerini geçtin 🎉';
      return;
    }

    const prevMs = 0;
    const pct = Math.min(100, Math.max(0, Math.round(((elapsedMs - prevMs) / (next.ms - prevMs)) * 100)));
    const remaining = Math.max(0, next.ms - elapsedMs);
    titleEl.textContent = `Sıradaki hedef: ${next.title}`;
    descEl.textContent = next.desc;
    pctEl.textContent = `%${pct}`;
    barEl.style.width = `${pct}%`;
    footerEl.textContent = `Kalan süre: ${formatShortGap(remaining)}`;
  }

  function renderHomeCards() {
    const now = Date.now();
    const todayStart = startOfDay(now);
    const todayEntries = state.entries.filter((e) => e.t >= todayStart);
    const todayCount = todayEntries.length;
    const limit = state.settings.dailyLimit;

    // Header pill
    const pill = $('header-streak-pill');
    $('header-pill-text').textContent = `Bugün: ${todayCount} / ${limit}`;
    pill.classList.remove('warn', 'over');
    if (todayCount > limit) pill.classList.add('over');
    else if (todayCount >= Math.ceil(limit * 0.8)) pill.classList.add('warn');

    // Today vs Limit
    $('today-limit-badge').textContent = `${todayCount} / ${limit}`;
    $('today-count-val').textContent = `${todayCount} adet`;
    const limitBar = $('today-limit-bar');
    const ratio = Math.min(100, Math.round((todayCount / limit) * 100));
    limitBar.style.width = `${ratio}%`;
    limitBar.classList.remove('warn', 'over');
    if (todayCount > limit) limitBar.classList.add('over');
    else if (todayCount >= Math.ceil(limit * 0.8)) limitBar.classList.add('warn');

    // Today avg gap
    const todayGaps = [];
    for (let i = 1; i < todayEntries.length; i++) {
      todayGaps.push(todayEntries[i].t - todayEntries[i - 1].t);
    }
    if (todayGaps.length > 0) {
      const avg = todayGaps.reduce((a, b) => a + b, 0) / todayGaps.length;
      $('today-avg-gap').textContent = formatShortGap(avg);
      $('today-last-gap').textContent = `Son ara: ${formatShortGap(todayGaps[todayGaps.length - 1])}`;
    } else {
      $('today-avg-gap').textContent = '—';
      $('today-last-gap').textContent = todayCount === 1 ? 'Bugün 1. kayıt' : 'Henüz veri yok';
    }

    // Today spend
    const perCig = state.settings.packPrice / state.settings.packSize;
    $('today-spend').textContent = formatCurrency(todayCount * perCig);
    $('today-pack-sub').textContent = `Paket: ${state.settings.currency}${state.settings.packPrice} / ${state.settings.packSize}`;

    // Yesterday same-time comparison
    const yesterdayStart = todayStart - 86400000;
    const elapsedToday = now - todayStart;
    const yesterdaySameTimeEnd = yesterdayStart + elapsedToday;
    const yesterdayEntriesAll = state.entries.filter((e) => e.t >= yesterdayStart && e.t < todayStart);
    const yesterdayByNow = yesterdayEntriesAll.filter((e) => e.t <= yesterdaySameTimeEnd).length;

    const compEl = $('yesterday-compare');
    const compSubEl = $('yesterday-compare-sub');
    if (state.entries.length === 0 || (yesterdayEntriesAll.length === 0 && todayCount === 0)) {
      compEl.textContent = 'Veri birikiyor';
      compSubEl.textContent = 'Dünle aynı saat kıyası';
    } else {
      let badge = '';
      if (todayCount < yesterdayByNow) badge = '✅';
      else if (todayCount > yesterdayByNow) badge = '⚠️';
      else badge = '➖';
      compEl.textContent = `Dün bu saatte ${yesterdayByNow} → bugün ${todayCount} ${badge}`;
      compSubEl.textContent = `Dün toplam: ${yesterdayEntriesAll.length} adet`;
    }
  }

  // Rendering: Statistics
  function getFilteredEntriesForRange() {
    if (statsRange === 'all') return state.entries.slice();
    const days = Number(statsRange);
    const todayStart = startOfDay(Date.now());
    const cutoff = todayStart - (days - 1) * 86400000;
    return state.entries.filter((e) => e.t >= cutoff);
  }

  function renderStats() {
    const entries = getFilteredEntriesForRange();
    renderSummaryTiles(entries);
    renderDailyChart(entries);
    renderHourlyChart(entries);
    renderGapTrendChart(entries);
    renderWeekdayChart(entries);
    renderTagsChart(entries);
    renderInsights();
  }

  function renderSummaryTiles(entries) {
    const container = $('stats-summary-tiles');
    const total = entries.length;
    const perCig = state.settings.packPrice / state.settings.packSize;
    const totalCost = total * perCig;

    let daySpan = 1;
    if (statsRange === '7') daySpan = 7;
    else if (statsRange === '30') daySpan = 30;
    else if (entries.length > 0) {
      daySpan = Math.max(1, Math.floor((startOfDay(Date.now()) - startOfDay(entries[0].t)) / 86400000) + 1);
    }

    const dailyAvg = total > 0 ? (total / daySpan).toFixed(1).replace('.', ',') : '0';
    const gaps = computeGaps(entries);
    const avgGap = gaps.length ? formatShortGap(gaps.reduce((s, g) => s + g.gap, 0) / gaps.length) : '—';
    const maxGap = gaps.length ? formatShortGap(gaps.reduce((m, g) => Math.max(m, g.gap), 0)) : '—';

    // Days under limit & current streak (based on all entries)
    const byDay = groupCountsByDay(state.entries);
    const limit = state.settings.dailyLimit;
    let underDays = 0;
    const activeDayKeys = Object.keys(byDay);
    activeDayKeys.forEach((k) => {
      if (byDay[k] <= limit) underDays++;
    });

    let streak = 0;
    if (state.entries.length > 0) {
      const firstDay = startOfDay(state.entries[0].t);
      let cursor = startOfDay(Date.now());
      while (cursor >= firstDay) {
        const k = dayKey(cursor);
        const cnt = byDay[k] || 0;
        if (cnt <= limit) {
          streak++;
          cursor -= 86400000;
        } else {
          break;
        }
      }
    }

    const tiles = [
      { label: 'Toplam Sigara', val: `${total} adet`, sub: `${daySpan} günlük dönem` },
      { label: 'Günlük Ortalama', val: `${dailyAvg}`, sub: `Hedef: ${limit}/gün` },
      { label: 'Ortalama Aralık', val: avgGap, sub: `En uzun: ${maxGap}` },
      { label: 'Toplam Harcama', val: formatCurrency(totalCost), sub: `${streak} gün hedef serisi` },
    ];

    container.innerHTML = tiles
      .map(
        (t) => `
      <div class="card metric-card">
        <span class="metric-label">${t.label}</span>
        <div class="metric-val">${t.val}</div>
        <div class="metric-sub">${t.sub}</div>
      </div>`
      )
      .join('');
  }

  function groupCountsByDay(entries) {
    const map = {};
    for (const e of entries) {
      const k = dayKey(e.t);
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  }

  function renderDailyChart(entries) {
    const box = $('chart-daily');
    if (entries.length === 0) {
      box.innerHTML = '<div class="empty-state">Bu aralıkta henüz kayıt yok.</div>';
      return;
    }

    const todayStart = startOfDay(Date.now());
    let numDays = statsRange === '7' ? 7 : statsRange === '30' ? 30 : 14;
    if (statsRange === 'all') {
      const span = Math.floor((todayStart - startOfDay(entries[0].t)) / 86400000) + 1;
      numDays = Math.min(30, Math.max(7, span));
    }

    const countsMap = groupCountsByDay(entries);
    const days = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const ts = todayStart - i * 86400000;
      const k = dayKey(ts);
      const d = new Date(ts);
      days.push({
        key: k,
        label: numDays <= 7 ? WEEKDAYS_TR[(d.getDay() + 6) % 7] : `${d.getDate()}`,
        count: countsMap[k] || 0,
      });
    }

    const limit = state.settings.dailyLimit;
    const maxVal = Math.max(limit + 1, ...days.map((d) => d.count), 4);
    const w = 340;
    const h = 150;
    const padL = 24;
    const padR = 8;
    const padT = 12;
    const padB = 24;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const barW = Math.max(4, (chartW / days.length) * 0.62);
    const step = chartW / days.length;

    const limitY = padT + chartH - (limit / maxVal) * chartH;

    let barsSvg = '';
    days.forEach((d, idx) => {
      const x = padL + idx * step + (step - barW) / 2;
      const bh = (d.count / maxVal) * chartH;
      const y = padT + chartH - bh;
      const fill = d.count > limit ? '#f43f5e' : 'url(#barGrad)';
      barsSvg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(2, bh).toFixed(1)}" rx="3" fill="${fill}" opacity="${d.count ? 0.95 : 0.25}" />`;
      if (numDays <= 10 || idx % 5 === 0 || idx === days.length - 1) {
        barsSvg += `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle" fill="#94a3b8" font-size="9">${d.label}</text>`;
      }
    });

    box.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" aria-label="Günlük tüketim grafiği">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2dd4bf" />
            <stop offset="100%" stop-color="#8b5cf6" />
          </linearGradient>
        </defs>
        <line x1="${padL}" y1="${limitY.toFixed(1)}" x2="${w - padR}" y2="${limitY.toFixed(1)}" stroke="#fb923c" stroke-width="1.2" stroke-dasharray="4 3" />
        <text x="${padL - 4}" y="${(limitY + 3).toFixed(1)}" text-anchor="end" fill="#fb923c" font-size="9">${limit}</text>
        <text x="${padL - 4}" y="${padT + 6}" text-anchor="end" fill="#64748b" font-size="9">${maxVal}</text>
        ${barsSvg}
      </svg>
    `;
  }

  function renderHourlyChart(entries) {
    const box = $('chart-hourly');
    const sub = $('chart-hourly-sub');
    if (entries.length === 0) {
      box.innerHTML = '<div class="empty-state">Saatlik dağılım için kayıt ekle.</div>';
      sub.textContent = 'Günün hangi saatlerinde daha sık';
      return;
    }

    const hours = new Array(24).fill(0);
    for (const e of entries) {
      hours[new Date(e.t).getHours()]++;
    }
    const maxH = Math.max(...hours, 1);
    const peakHour = hours.indexOf(maxH);
    sub.textContent = `En yoğun saat: ${String(peakHour).padStart(2, '0')}:00–${String((peakHour + 1) % 24).padStart(2, '0')}:00 (${maxH} adet)`;

    const w = 340;
    const h = 130;
    const padL = 10;
    const padR = 10;
    const padT = 10;
    const padB = 22;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const step = chartW / 24;
    const barW = step * 0.66;

    let svg = '';
    hours.forEach((cnt, hr) => {
      const x = padL + hr * step + (step - barW) / 2;
      const bh = (cnt / maxH) * chartH;
      const y = padT + chartH - bh;
      const isPeak = hr === peakHour && cnt > 0;
      const fill = isPeak ? '#fb923c' : '#2dd4bf';
      svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(2, bh).toFixed(1)}" rx="2.5" fill="${fill}" opacity="${cnt ? 0.92 : 0.18}" />`;
      if (hr % 4 === 0 || hr === 23) {
        svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 5}" text-anchor="middle" fill="#94a3b8" font-size="9">${String(hr).padStart(2, '0')}</text>`;
      }
    });

    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" aria-label="Saatlik dağılım">${svg}</svg>`;
  }

  function renderGapTrendChart(entries) {
    const box = $('chart-gap-trend');
    const gaps = computeGaps(entries);
    if (gaps.length < 2) {
      box.innerHTML = '<div class="empty-state">Aralık trendi için en az 3 kayıt gerekir.</div>';
      return;
    }

    const byDay = {};
    for (const g of gaps) {
      const k = dayKey(g.t);
      if (!byDay[k]) byDay[k] = [];
      byDay[k].push(g.gap / 60000); // minutes
    }

    const keys = Object.keys(byDay).sort().slice(-14);
    if (keys.length < 2) {
      box.innerHTML = '<div class="empty-state">Trend çizgisi için en az 2 farklı gün verisi gerekir.</div>';
      return;
    }

    const pts = keys.map((k) => {
      const arr = byDay[k];
      return {
        label: k.slice(8),
        avgMin: arr.reduce((a, b) => a + b, 0) / arr.length,
      };
    });

    const maxM = Math.max(...pts.map((p) => p.avgMin), 30);
    const w = 340;
    const h = 135;
    const padL = 32;
    const padR = 12;
    const padT = 14;
    const padB = 22;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const coords = pts.map((p, i) => {
      const x = padL + (i / (pts.length - 1)) * chartW;
      const y = padT + chartH - (p.avgMin / maxM) * chartH;
      return { x, y, ...p };
    });

    const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaD = `${pathD} L${coords[coords.length - 1].x.toFixed(1)},${padT + chartH} L${coords[0].x.toFixed(1)},${padT + chartH} Z`;

    const dots = coords
      .map(
        (c, i) => `
      <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.2" fill="#2dd4bf" />
      ${pts.length <= 8 || i % 2 === 0 ? `<text x="${c.x.toFixed(1)}" y="${h - 5}" text-anchor="middle" fill="#94a3b8" font-size="9">${c.label}</text>` : ''}
    `
      )
      .join('');

    box.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" aria-label="Ortalama aralık trendi">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2dd4bf" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#2dd4bf" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <text x="${padL - 5}" y="${padT + 5}" text-anchor="end" fill="#64748b" font-size="9">${Math.round(maxM)}dk</text>
        <text x="${padL - 5}" y="${padT + chartH}" text-anchor="end" fill="#64748b" font-size="9">0</text>
        <path d="${areaD}" fill="url(#areaGrad)" />
        <path d="${pathD}" fill="none" stroke="#2dd4bf" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
      </svg>
    `;
  }

  function renderWeekdayChart(entries) {
    const box = $('chart-weekday');
    if (entries.length === 0) {
      box.innerHTML = '<div class="empty-state">Haftanın günleri için kayıt bekleniyor.</div>';
      return;
    }

    const dayMap = groupCountsByDay(entries);
    const sums = new Array(7).fill(0);
    const counts = new Array(7).fill(0);
    for (const [k, cnt] of Object.entries(dayMap)) {
      const d = new Date(k + 'T12:00:00');
      const wd = (d.getDay() + 6) % 7;
      sums[wd] += cnt;
      counts[wd] += 1;
    }

    const avgs = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
    const maxA = Math.max(...avgs, 1);

    const w = 340;
    const h = 125;
    const padL = 12;
    const padR = 12;
    const padT = 18;
    const padB = 22;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const step = chartW / 7;
    const barW = step * 0.52;

    let svg = '';
    avgs.forEach((avg, i) => {
      const x = padL + i * step + (step - barW) / 2;
      const bh = (avg / maxA) * chartH;
      const y = padT + chartH - bh;
      svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(2, bh).toFixed(1)}" rx="5" fill="url(#barGrad)" opacity="${avg ? 0.92 : 0.18}" />`;
      if (avg > 0) {
        svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" fill="#cbd5e1" font-size="9">${avg.toFixed(1)}</text>`;
      }
      svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 5}" text-anchor="middle" fill="#94a3b8" font-size="10">${WEEKDAYS_TR[i]}</text>`;
    });

    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" aria-label="Haftalık ortalama">${svg}</svg>`;
  }

  function renderTagsChart(entries) {
    const box = $('chart-tags');
    const counts = {};
    let totalTagged = 0;
    for (const e of entries) {
      for (const tid of e.tags) {
        counts[tid] = (counts[tid] || 0) + 1;
        totalTagged++;
      }
    }

    if (totalTagged === 0) {
      box.innerHTML = '<div class="empty-state">Henüz tetikleyici etiketi eklenmemiş. Sigara ekledikten sonra çıkan etiketlere dokunabilirsin.</div>';
      return;
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted[0][1];
    box.innerHTML = `<div class="tag-bar-list">${sorted
      .map(([tid, cnt]) => {
        const meta = TAGS.find((t) => t.id === tid) || { emoji: '🏷️', label: tid };
        const pct = Math.round((cnt / max) * 100);
        return `
          <div class="tag-bar-row">
            <div class="tag-bar-meta">
              <span>${meta.emoji} ${meta.label}</span>
              <span>${cnt} kez</span>
            </div>
            <div class="tag-bar-track">
              <div class="tag-bar-fill" style="width:${pct}%"></div>
            </div>
          </div>`;
      })
      .join('')}</div>`;
  }

  function renderInsights() {
    const list = $('insights-list');
    const all = state.entries;
    if (all.length < 3) {
      list.innerHTML = '<li>En az 3 kayıt biriktiğinde kişiselleştirilmiş içgörüler burada görünecek.</li>';
      return;
    }

    const insights = [];
    const now = Date.now();
    const todayStart = startOfDay(now);

    // 1. Peak hour
    const hours = new Array(24).fill(0);
    all.forEach((e) => hours[new Date(e.t).getHours()]++);
    const maxH = Math.max(...hours);
    const peakH = hours.indexOf(maxH);
    insights.push(`⏰ En çok <strong>${String(peakH).padStart(2, '0')}:00–${String((peakH + 1) % 24).padStart(2, '0')}:00</strong> arasında içiyorsun.`);

    // 2. Week over week count & gap
    const thisWeekStart = todayStart - 6 * 86400000;
    const prevWeekStart = thisWeekStart - 7 * 86400000;
    const thisWeek = all.filter((e) => e.t >= thisWeekStart);
    const prevWeek = all.filter((e) => e.t >= prevWeekStart && e.t < thisWeekStart);

    if (prevWeek.length >= 2 && thisWeek.length > 0) {
      const diffPct = Math.round(((thisWeek.length - prevWeek.length) / prevWeek.length) * 100);
      if (diffPct < 0) {
        insights.push(`📉 Bu hafta geçen haftaya göre <strong>%${Math.abs(diffPct)} daha az</strong> sigara içtin.`);
      } else if (diffPct > 0) {
        insights.push(`📈 Bu hafta geçen haftaya göre <strong>%${diffPct} daha fazla</strong> sigara içtin.`);
      } else {
        insights.push(`➖ Bu hafta tüketimin geçen haftayla aynı (${thisWeek.length} adet).`);
      }

      const gThis = computeGaps(thisWeek);
      const gPrev = computeGaps(prevWeek);
      if (gThis.length && gPrev.length) {
        const avgThis = Math.round(gThis.reduce((s, x) => s + x.gap, 0) / gThis.length / 60000);
        const avgPrev = Math.round(gPrev.reduce((s, x) => s + x.gap, 0) / gPrev.length / 60000);
        const delta = avgThis - avgPrev;
        if (delta > 0) {
          insights.push(`⏱️ Ortalama aralığın <strong>${avgThis} dk</strong>; geçen haftadan ${delta} dk daha uzun.`);
        } else if (delta < 0) {
          insights.push(`⏱️ Ortalama aralığın <strong>${avgThis} dk</strong>; geçen haftadan ${Math.abs(delta)} dk daha kısa.`);
        }
      }
    }

    // 3. Top trigger
    const tagCounts = {};
    all.forEach((e) => e.tags.forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
    const topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];
    if (topTag) {
      const meta = TAGS.find((t) => t.id === topTag[0]);
      if (meta) {
        insights.push(`${meta.emoji} En sık tetikleyicin: <strong>${meta.label}</strong> (${topTag[1]} kez).`);
      }
    }

    // 4. Monthly spend & yearly projection
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthCount = all.filter((e) => e.t >= monthStart.getTime()).length;
    const perCig = state.settings.packPrice / state.settings.packSize;
    const monthSpend = monthCount * perCig;
    const daysElapsedInMonth = Math.max(1, new Date(now).getDate());
    const yearlyProj = (monthSpend / daysElapsedInMonth) * 365;
    insights.push(`💸 Bu ay ≈ <strong>${formatCurrency(monthSpend)}</strong> harcadın; bu hızla yıllık projeksiyon <strong>${formatCurrency(yearlyProj)}</strong>.`);

    list.innerHTML = insights.map((html) => `<li>${html}</li>`).join('');
  }

  // Rendering: History
  function renderHistory() {
    const container = $('history-list');
    if (state.entries.length === 0) {
      container.innerHTML = '<div class="card empty-state">Henüz hiç kayıt yok. Ana sayfadan "Sigara İçtim" veya "+ Ekle" ile başlayabilirsin.</div>';
      return;
    }

    const todayKey = dayKey(Date.now());
    const yesterdayKey = dayKey(Date.now() - 86400000);

    // Precompute gaps using ascending entries
    const gapById = {};
    for (let i = 0; i < state.entries.length; i++) {
      if (i === 0) gapById[state.entries[i].id] = null;
      else gapById[state.entries[i].id] = state.entries[i].t - state.entries[i - 1].t;
    }

    const groups = new Map();
    for (let i = state.entries.length - 1; i >= 0; i--) {
      const e = state.entries[i];
      const k = dayKey(e.t);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }

    let html = '';
    for (const [k, items] of groups.entries()) {
      let title;
      if (k === todayKey) title = 'Bugün';
      else if (k === yesterdayKey) title = 'Dün';
      else {
        title = new Date(items[0].t).toLocaleDateString('tr-TR', {
          day: 'numeric',
          month: 'long',
          weekday: 'long',
        });
      }

      const rowsHtml = items
        .map((e) => {
          const gap = gapById[e.id];
          const gapTxt = gap !== null ? `+${formatShortGap(gap)}` : 'İlk kayıt';
          const tagEmojis = e.tags
            .map((tid) => TAGS.find((t) => t.id === tid)?.emoji || '')
            .join('');
          const noteHtml = e.note ? `<span class="history-note">${escapeHtml(e.note)}</span>` : '';
          return `
            <button type="button" class="history-row" data-id="${escapeHtml(e.id)}">
              <div class="history-row-left">
                <span class="history-time">${formatTimeHM(e.t)}</span>
                ${noteHtml}
              </div>
              <div class="history-row-right">
                ${tagEmojis ? `<span class="history-tags">${tagEmojis}</span>` : ''}
                <span class="history-gap">${gapTxt}</span>
              </div>
            </button>`;
        })
        .join('');

      html += `
        <div class="day-group">
          <div class="day-header">
            <span>${title}</span>
            <span class="day-count-pill">${items.length} adet</span>
          </div>
          <div class="history-items">${rowsHtml}</div>
        </div>`;
    }

    container.innerHTML = html;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Rendering: Settings
  function renderSettingsInputs() {
    $('set-daily-limit').value = state.settings.dailyLimit;
    $('set-pack-price').value = state.settings.packPrice;
    $('set-pack-size').value = state.settings.packSize;
  }

  function renderAll() {
    updateLiveTimer();
    renderHomeCards();
    if (activeTab === 'stats') renderStats();
    if (activeTab === 'history') renderHistory();
    if (activeTab === 'settings') renderSettingsInputs();
  }

  // Quick Sheet (after logging)
  function showQuickSheet(entryId) {
    quickSheetEntryId = entryId;
    renderQuickSheetChips();
    $('quick-sheet').classList.remove('hidden');
    resetQuickSheetTimeout();
  }

  function hideQuickSheet() {
    $('quick-sheet').classList.add('hidden');
    quickSheetEntryId = null;
    if (quickSheetTimer) {
      clearTimeout(quickSheetTimer);
      quickSheetTimer = null;
    }
  }

  function resetQuickSheetTimeout() {
    if (quickSheetTimer) clearTimeout(quickSheetTimer);
    quickSheetTimer = setTimeout(hideQuickSheet, 6000);
  }

  function renderQuickSheetChips() {
    const entry = state.entries.find((e) => e.id === quickSheetEntryId);
    if (!entry) return;
    $('quick-tag-chips').innerHTML = TAGS.map((t) => {
      const sel = entry.tags.includes(t.id) ? 'selected' : '';
      return `<button type="button" class="tag-chip ${sel}" data-tag="${t.id}">${t.emoji} ${t.label}</button>`;
    }).join('');
  }

  // Modal (Add backdated / Edit)
  function openAddModal() {
    modalMode = 'add';
    modalEntryId = null;
    modalSelectedTags = new Set();
    $('modal-title').textContent = 'Geçmiş Saatle Ekle';
    $('modal-datetime').value = toDatetimeLocalValue(Date.now());
    $('modal-note').value = '';
    $('btn-modal-delete').classList.add('hidden');
    renderModalTagChips();
    $('entry-modal').classList.remove('hidden');
  }

  function openEditModal(entryId) {
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return;
    modalMode = 'edit';
    modalEntryId = entryId;
    modalSelectedTags = new Set(entry.tags);
    $('modal-title').textContent = 'Kaydı Düzenle';
    $('modal-datetime').value = toDatetimeLocalValue(entry.t);
    $('modal-note').value = entry.note || '';
    $('btn-modal-delete').classList.remove('hidden');
    renderModalTagChips();
    $('entry-modal').classList.remove('hidden');
  }

  function closeModal() {
    $('entry-modal').classList.add('hidden');
  }

  function renderModalTagChips() {
    $('modal-tag-chips').innerHTML = TAGS.map((t) => {
      const sel = modalSelectedTags.has(t.id) ? 'selected' : '';
      return `<button type="button" class="tag-chip ${sel}" data-tag="${t.id}">${t.emoji} ${t.label}</button>`;
    }).join('');
  }

  // Actions
  function addCigaretteNow() {
    const btn = $('btn-smoke-now');
    btn.classList.remove('pulse');
    void btn.offsetWidth;
    btn.classList.add('pulse');

    if (navigator.vibrate) navigator.vibrate(25);

    const entry = {
      id: genId(),
      t: Date.now(),
      tags: [],
      note: '',
    };
    state.entries.push(entry);
    saveState();
    renderAll();
    showQuickSheet(entry.id);
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-view').forEach((v) => {
      v.classList.toggle('active', v.id === `view-${tab}`);
    });
    renderAll();
  }

  async function exportBackup() {
    const payload = JSON.stringify(state, null, 2);
    const dateStr = dayKey(Date.now());
    const fileName = `nefes-yedek-${dateStr}.json`;
    const blob = new Blob([payload], { type: 'application/json' });

    try {
      const file = new File([blob], fileName, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Nefes Sigara Takip Yedeği',
        });
        $('backup-feedback').textContent = 'Yedek paylaşıldı / kaydedildi.';
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('backup-feedback').textContent = `${fileName} indirildi.`;
  }

  function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.entries)) {
          throw new Error('Geçersiz dosya biçimi');
        }
        const validIncoming = parsed.entries.filter(
          (e) => e && typeof e.t === 'number' && Number.isFinite(e.t)
        );
        if (!confirm(`${validIncoming.length} kayıt mevcut verilerinle birleştirilsin mi? (Tekrarlar eklenmez)`)) {
          return;
        }
        const existingIds = new Set(state.entries.map((e) => e.id));
        let added = 0;
        for (const raw of validIncoming) {
          const id = String(raw.id || genId());
          if (existingIds.has(id)) continue;
          existingIds.add(id);
          state.entries.push({
            id,
            t: Math.round(raw.t),
            tags: Array.isArray(raw.tags) ? raw.tags.filter((x) => typeof x === 'string') : [],
            note: typeof raw.note === 'string' ? raw.note : '',
          });
          added++;
        }
        if (parsed.settings && typeof parsed.settings === 'object') {
          state.settings.dailyLimit = clampNum(parsed.settings.dailyLimit, 1, 100, state.settings.dailyLimit);
          state.settings.packPrice = clampNum(parsed.settings.packPrice, 1, 5000, state.settings.packPrice);
          state.settings.packSize = clampNum(parsed.settings.packSize, 1, 100, state.settings.packSize);
        }
        saveState();
        renderAll();
        $('backup-feedback').textContent = `İçe aktarma tamamlandı: ${added} yeni kayıt eklendi.`;
      } catch (err) {
        $('backup-feedback').textContent = 'Hata: Yedek dosyası okunamadı.';
      }
    };
    reader.readAsText(file);
  }

  // Event bindings
  function bindEvents() {
    $('btn-smoke-now').addEventListener('click', addCigaretteNow);
    $('btn-open-backdate').addEventListener('click', openAddModal);
    $('btn-history-add').addEventListener('click', openAddModal);

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        statsRange = btn.dataset.range;
        document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderStats();
      });
    });

    // Quick sheet tags & undo
    $('quick-tag-chips').addEventListener('click', (ev) => {
      const chip = ev.target.closest('.tag-chip');
      if (!chip || !quickSheetEntryId) return;
      const entry = state.entries.find((e) => e.id === quickSheetEntryId);
      if (!entry) return;
      const tid = chip.dataset.tag;
      const idx = entry.tags.indexOf(tid);
      if (idx >= 0) entry.tags.splice(idx, 1);
      else entry.tags.push(tid);
      saveState();
      renderQuickSheetChips();
      if (activeTab === 'history') renderHistory();
      resetQuickSheetTimeout();
    });

    $('btn-undo-last').addEventListener('click', () => {
      if (!quickSheetEntryId) return;
      state.entries = state.entries.filter((e) => e.id !== quickSheetEntryId);
      saveState();
      hideQuickSheet();
      renderAll();
    });

    // History row click
    $('history-list').addEventListener('click', (ev) => {
      const row = ev.target.closest('.history-row');
      if (!row) return;
      openEditModal(row.dataset.id);
    });

    // Modal events
    $('btn-modal-close').addEventListener('click', closeModal);
    $('entry-modal').addEventListener('click', (ev) => {
      if (ev.target === $('entry-modal')) closeModal();
    });

    $('modal-tag-chips').addEventListener('click', (ev) => {
      const chip = ev.target.closest('.tag-chip');
      if (!chip) return;
      const tid = chip.dataset.tag;
      if (modalSelectedTags.has(tid)) modalSelectedTags.delete(tid);
      else modalSelectedTags.add(tid);
      renderModalTagChips();
    });

    $('btn-modal-save').addEventListener('click', () => {
      const val = $('modal-datetime').value;
      const parsedMs = new Date(val).getTime();
      if (!Number.isFinite(parsedMs)) return;
      const note = $('modal-note').value.trim();
      const tags = Array.from(modalSelectedTags);

      if (modalMode === 'add') {
        state.entries.push({ id: genId(), t: parsedMs, tags, note });
      } else {
        const entry = state.entries.find((e) => e.id === modalEntryId);
        if (entry) {
          entry.t = parsedMs;
          entry.tags = tags;
          entry.note = note;
        }
      }
      saveState();
      closeModal();
      renderAll();
    });

    $('btn-modal-delete').addEventListener('click', () => {
      if (!modalEntryId) return;
      if (!confirm('Bu sigara kaydını silmek istediğine emin misin?')) return;
      state.entries = state.entries.filter((e) => e.id !== modalEntryId);
      saveState();
      closeModal();
      renderAll();
    });

    // Settings events
    $('btn-save-settings').addEventListener('click', () => {
      state.settings.dailyLimit = clampNum($('set-daily-limit').value, 1, 100, 10);
      state.settings.packPrice = clampNum($('set-pack-price').value, 1, 5000, 100);
      state.settings.packSize = clampNum($('set-pack-size').value, 1, 100, 20);
      saveState();
      renderAll();
      $('settings-feedback').textContent = 'Ayarlar kaydedildi.';
      setTimeout(() => { $('settings-feedback').textContent = ''; }, 3000);
    });

    $('btn-export').addEventListener('click', exportBackup);
    $('btn-import-trigger').addEventListener('click', () => $('import-file-input').click());
    $('import-file-input').addEventListener('change', (ev) => {
      const file = ev.target.files[0];
      handleImportFile(file);
      ev.target.value = '';
    });

    $('btn-clear-all').addEventListener('click', () => {
      if (!confirm('Tüm sigara kayıtların ve istatistiklerin silinecek. Emin misin?')) return;
      if (!confirm('Son onay: Bu işlem geri alınamaz! Yedek aldıysan devam et.')) return;
      state = structuredCloneSafe(DEFAULT_STATE);
      saveState();
      hideQuickSheet();
      renderAll();
      $('backup-feedback').textContent = 'Tüm veriler temizlendi.';
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) renderAll();
    });
    window.addEventListener('focus', () => renderAll());
  }

  // Init
  function init() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('SW kaydı başarısız:', err);
      });
    }
    bindEvents();
    renderAll();
    setInterval(updateLiveTimer, 1000);
  }

  init();
})();
