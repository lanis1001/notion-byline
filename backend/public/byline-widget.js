// ============================================================
// BYLINE 위젯 — 배포판 (v6)
// v5(프로토타입, window.storage + 고정 목업 데이터)를 실제 백엔드
// API(/api/status, /api/records, /api/publish, /api/publish/:date)에
// 연결한 버전. 브라우저에서 Babel standalone으로 직접 트랜스파일되므로
// import/export 없이 전역 React를 사용한다.
// ============================================================

const { useState, useEffect, useMemo } = React;

// LÉTRA 브랜드 팔레트: Ivory #F5F1E8 · Black #111111 · Warm Gray #B8B1A7 · Paper Beige #E7DFD4
const THEME = {
  light: {
    label: '주간판',
    bg: '#F5F1E8',
    ink: '#111111',
    muted: '#B8B1A7',
    rule: '#E7DFD4',
    filled: '#111111',
    onFilled: '#F5F1E8',
    emptyTint: 'rgba(17,17,17,0.06)',
    emptyBorder: '#B8B1A7',
    accent: '#8B2E2A',
    vignette: 'inset 0 0 70px rgba(17,17,17,0.06)',
    disabled: '#E7DFD4',
  },
  dark: {
    label: '야간판',
    bg: '#111111',
    ink: '#F5F1E8',
    muted: '#B8B1A7',
    rule: '#2A2A28',
    filled: '#F5F1E8',
    onFilled: '#111111',
    emptyTint: 'rgba(245,241,232,0.08)',
    emptyBorder: '#4A4640',
    accent: '#D9736D',
    vignette: 'inset 0 0 90px rgba(0,0,0,0.6)',
    disabled: '#2A2A28',
  },
};

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SIZE_SCALE = { sm: 0.82, md: 1, lg: 1.2 };
const SIZE_LABELS = { sm: '작게', md: '기본', lg: '크게' };
const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
const TODAY = todayDate();

function pad3(n) {
  return String(Math.max(0, n)).padStart(3, '0');
}
function dk(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}
function fmtDot(d) {
  return dk(d).replaceAll('-', '.');
}
function fmtKorean(d) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${KO_WEEKDAYS[d.getDay()]})`;
}
function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}
function inRange(d) {
  return d <= TODAY;
}
// 월요일 시작 기준 요일 인덱스 (0=월 ... 6=일)
function mondayIndex(d) {
  return (d.getDay() + 6) % 7;
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function FontStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;700&family=Inter:wght@400;500;600;700&display=swap');
      .byline-widget-root, .byline-widget-root * { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif !important; }
      .byline-widget-root h1, .byline-widget-root [data-serif] { font-family: 'Cormorant Garamond', Georgia, serif !important; }
    `}</style>
  );
}

// 쿠키 대신 localStorage에 토큰을 들고 다닌다 (iframe 안 서드파티 쿠키가 모바일에서
// 자주 막혀서, 제작자 아닌 다른 사용자는 로그인 자체가 안 되는 문제가 있었음).
const TOKEN_KEY = 'byline_token';
function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* 저장 불가 환경 — 무시 */ }
}
function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function apiGet(path) {
  const res = await fetch(path, { headers: { ...authHeaders() } });
  if (res.status === 401) setToken(null);
  if (!res.ok) throw new Error(`${path} 요청 실패 (${res.status})`);
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body ?? {}),
  });
  if (res.status === 401) setToken(null);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `${path} 요청 실패 (${res.status})`);
  }
  return res.json().catch(() => ({}));
}
async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE', headers: { ...authHeaders() } });
  if (res.status === 401) setToken(null);
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `${path} 요청 실패 (${res.status})`);
  }
}

function openAuthPopup() {
  window.open('/auth/notion', 'byline-oauth', 'width=480,height=720');
}

function Byline() {
  const [theme, setTheme] = useState('light');
  const [orientation, setOrientation] = useState('portrait');
  const [size, setSize] = useState('md'); // 'sm' | 'md' | 'lg'
  const [viewMode, setViewMode] = useState('month'); // 'day' | 'week' | 'month'
  const [monthCursor, setMonthCursor] = useState(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));
  const todayKey = dk(TODAY);
  const [selected, setSelected] = useState(todayKey);

  const [status, setStatus] = useState(null); // null=로딩중
  const [records, setRecords] = useState(null); // Set<'YYYY-MM-DD'> (필사 완료된 날짜들), null=아직 미로딩
  const [error, setError] = useState(null);

  const T = THEME[theme];

  async function loadRecords() {
    try {
      const data = await apiGet('/api/records');
      setRecords(new Set((data.records || []).map((r) => r.date)));
    } catch (e) {
      setError('필사 일지를 불러오지 못했습니다.');
      if (!getToken()) setStatus({ connected: false });
    }
  }

  async function loadStatus() {
    try {
      const data = await apiGet('/api/status');
      setStatus(data);
      if (data.connected && !data.needsDatabaseSetup) {
        await loadRecords();
      }
    } catch (e) {
      setError('상태를 불러오지 못했습니다.');
    }
  }

  useEffect(() => {
    // 팝업이 막혀 새 창 대신 같은 창에서 콜백이 열렸을 경우의 폴백: URL 해시에서 토큰 회수
    const hash = window.location.hash;
    if (hash.indexOf('#token=') === 0) {
      setToken(decodeURIComponent(hash.slice('#token='.length)));
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    loadStatus();

    function onMessage(e) {
      if (e.data && e.data.source === 'byline-auth' && e.data.token) {
        setToken(e.data.token);
        loadStatus();
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function connectDatabase(databaseId) {
    setError(null);
    try {
      const data = await apiPost('/api/setup/database', { databaseId });
      if (data.token) setToken(data.token);
      await loadStatus();
    } catch (e) {
      setError(e.message);
    }
  }

  function getCompleted(dateKey) {
    return records ? records.has(dateKey) : false;
  }

  async function toggleDay(dateKey) {
    if (!records) return;
    const wasCompleted = records.has(dateKey);
    const next = new Set(records);
    if (wasCompleted) next.delete(dateKey);
    else next.add(dateKey);
    setRecords(next); // optimistic update
    try {
      if (wasCompleted) {
        await apiDelete(`/api/publish/${dateKey}`);
      } else {
        await apiPost('/api/publish', { date: dateKey });
      }
    } catch (e) {
      setRecords(records); // 실패 시 롤백
      if (!getToken()) {
        setStatus({ connected: false });
        setError('연결이 끊어졌어요. 다시 연결해주세요.');
      } else {
        setError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    }
  }

  function volAt(d) {
    if (!records) return 0;
    const key = dk(d);
    let count = 0;
    records.forEach((dateStr) => {
      if (dateStr <= key) count++;
    });
    return count;
  }

  const volCount = useMemo(() => volAt(TODAY), [records]);

  const lastCompleted = useMemo(() => {
    if (!records || records.size === 0) return null;
    let latest = null;
    records.forEach((dateStr) => {
      if (dateStr <= todayKey && (!latest || dateStr > latest)) latest = dateStr;
    });
    return latest ? new Date(latest + 'T00:00:00') : null;
  }, [records]);

  const gapDays = lastCompleted ? Math.round((TODAY - lastCompleted) / 86400000) : null;
  const isStale = gapDays !== null && gapDays >= 3;

  // ---------- 연결/설정 전 단계 화면 ----------
  if (status === null && !error) {
    return (
      <div style={{ background: THEME.light.bg, color: THEME.light.muted, minHeight: '100vh' }} className="byline-widget-root flex items-center justify-center">
        <FontStyles />
        <span className="text-sm tracking-widest uppercase">Loading…</span>
      </div>
    );
  }

  if (status && !status.connected) {
    return (
      <GateScreen T={THEME.light}>
        <p style={{ marginBottom: 16 }}>BYLINE을 쓰려면 먼저 Notion 워크스페이스에 연결해야 해요.</p>
        <button
          onClick={openAuthPopup}
          className="font-sans font-semibold"
          style={{ display: 'inline-block', padding: '10px 20px', background: THEME.light.filled, color: THEME.light.onFilled, border: 'none', cursor: 'pointer' }}
        >
          Notion에 연결하기
        </button>
      </GateScreen>
    );
  }

  if (status && status.connected && status.needsDatabaseSetup) {
    return (
      <GateScreen T={THEME.light}>
        <p style={{ marginBottom: 16 }}>연결할 필사 일지 데이터베이스를 골라주세요.</p>
        {error && <p style={{ color: THEME.light.accent, marginBottom: 12, fontSize: 12 }}>{error}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', width: 280 }}>
          {(status.databases || []).length === 0 && (
            <p style={{ fontSize: 12, color: THEME.light.muted }}>연결 가능한 데이터베이스를 찾지 못했습니다. Notion에서 이 앱에 필사 일지 DB 접근 권한을 부여했는지 확인해주세요.</p>
          )}
          {(status.databases || []).map((db) => (
            <button
              key={db.id}
              onClick={() => connectDatabase(db.id)}
              className="font-sans"
              style={{ padding: '10px 14px', textAlign: 'left', background: THEME.light.bg, border: `1px solid ${THEME.light.rule}`, cursor: 'pointer' }}
            >
              {db.title || '(제목 없음)'}
            </button>
          ))}
        </div>
      </GateScreen>
    );
  }

  if (records === null) {
    return (
      <div style={{ background: T.bg, color: T.muted, minHeight: '100vh' }} className="byline-widget-root flex items-center justify-center">
        <FontStyles />
        <span className="text-sm tracking-widest uppercase">Loading…</span>
      </div>
    );
  }

  const isLandscape = orientation === 'landscape';
  const selectedDate = new Date(selected + 'T00:00:00');

  // ---------- 셀 컴포넌트 ----------
  function Cell({ date, size = 28, disabled = false }) {
    const key = dk(date);
    const completed = inRange(date) ? getCompleted(key) : false;
    const isToday = key === todayKey;
    const isSelected = key === selected;
    return (
      <button
        onClick={() => !disabled && inRange(date) && setSelected(key)}
        disabled={disabled || !inRange(date)}
        title={`${fmtDot(date)} · ${completed ? '완료' : '미완료'}`}
        style={{
          width: size,
          height: size,
          background: disabled || !inRange(date) ? 'transparent' : completed ? T.filled : T.emptyTint,
          border: disabled || !inRange(date)
            ? 'none'
            : isToday
            ? `2px solid ${T.ink}`
            : `1px dashed ${T.emptyBorder}`,
          boxShadow: isSelected && !isToday ? `inset 0 0 0 2px ${T.accent}` : 'none',
          boxSizing: 'border-box',
          cursor: disabled || !inRange(date) ? 'default' : 'pointer',
          padding: 0,
        }}
      />
    );
  }

  // ---------- 마스트헤드 (항상 전체 폭) ----------
  const Masthead = (
    <div>
      <div className="flex justify-between items-baseline font-sans" style={{ fontSize: 11, color: T.muted, letterSpacing: '0.12em' }}>
        <span>NO. {pad3(volCount)}</span>
        <span>{fmtKorean(TODAY).toUpperCase()}</span>
      </div>
      <div className="flex items-end justify-between mt-1">
        <h1 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 34, color: T.ink, lineHeight: 1, fontWeight: 700 }}>
          BYLINE
        </h1>
        <StampBadge visible={selected === todayKey} T={T} />
      </div>
      <div className="flex justify-between items-center mt-1.5">
        <span data-serif style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontStyle: 'italic', fontSize: 13, color: T.muted }}>
          By {status?.userName || status?.workspaceName || '나'}
        </span>
        <span className="font-sans" style={{ fontSize: 10, color: T.muted, letterSpacing: '0.1em' }}>
          DAILY TRANSCRIPTION RECORD
        </span>
      </div>
    </div>
  );

  const DoubleRule = (
    <div style={{ margin: '12px 0' }}>
      <div style={{ borderTop: `3px solid ${T.ink}` }} />
      <div style={{ borderTop: `1px solid ${T.rule}`, marginTop: 3 }} />
    </div>
  );

  // ---------- 뷰 모드 탭 ----------
  const ViewTabs = (
    <div className="flex font-sans" style={{ fontSize: 12, marginBottom: 12, borderBottom: `1px solid ${T.rule}` }}>
      {[['day', '일'], ['week', '주'], ['month', '월']].map(([m, label]) => (
        <button
          key={m}
          onClick={() => setViewMode(m)}
          style={{
            padding: '6px 14px 8px',
            color: viewMode === m ? T.ink : T.muted,
            borderBottom: viewMode === m ? `2px solid ${T.ink}` : '2px solid transparent',
            background: 'none',
            fontWeight: viewMode === m ? 700 : 400,
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // ---------- 월(月) 뷰 ----------
  function MonthView() {
    const first = startOfMonth(monthCursor);
    const total = daysInMonth(monthCursor);
    const lead = mondayIndex(first);
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);

    const canPrev = true;
    const canNext = monthCursor.getMonth() < TODAY.getMonth() || monthCursor.getFullYear() < TODAY.getFullYear();

    return (
      <div>
        <div className="flex items-center justify-between font-sans mb-2" style={{ fontSize: 12, color: T.muted }}>
          <button
            onClick={() => canPrev && setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
            disabled={!canPrev}
            style={{ background: 'none', border: 'none', color: canPrev ? T.ink : T.disabled, cursor: canPrev ? 'pointer' : 'default' }}
          >
            ← 이전 달
          </button>
          <span style={{ color: T.ink, fontWeight: 600 }}>{monthCursor.getFullYear()}. {monthCursor.getMonth() + 1}</span>
          <button
            onClick={() => canNext && setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
            disabled={!canNext}
            style={{ background: 'none', border: 'none', color: canNext ? T.ink : T.disabled, cursor: canNext ? 'pointer' : 'default' }}
          >
            다음 달 →
          </button>
        </div>
        <div className="grid grid-cols-7 gap-[3px] mb-1.5">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="text-center font-sans" style={{ fontSize: 10, color: T.muted }}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-[3px]">
          {cells.map((d, i) =>
            d ? <Cell key={i} date={d} size={30} /> : <div key={i} style={{ width: 30, height: 30 }} />
          )}
        </div>
      </div>
    );
  }

  // ---------- 주(週) 뷰 ----------
  function WeekView() {
    const wIdx = mondayIndex(selectedDate);
    const monday = addDays(selectedDate, -wIdx);
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    return (
      <div>
        <div className="flex items-center justify-between font-sans mb-3" style={{ fontSize: 12, color: T.ink, fontWeight: 600 }}>
          <span>{fmtDot(monday)} – {fmtDot(addDays(monday, 6))}</span>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="font-sans" style={{ fontSize: 10, color: T.muted }}>{WEEKDAYS[i]}</span>
              <Cell date={d} size={40} />
              <span className="font-sans" style={{ fontSize: 9, color: T.muted }}>{d.getDate()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- 일(日) 뷰 ----------
  function DayView() {
    const completed = inRange(selectedDate) ? getCompleted(selected) : false;
    const vol = completed ? volAt(selectedDate) : null;
    const canPrev = true;
    const canNext = selectedDate < TODAY;
    return (
      <div className="flex flex-col items-center text-center" style={{ padding: '8px 0' }}>
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => canPrev && setSelected(dk(addDays(selectedDate, -1)))}
            disabled={!canPrev}
            style={{ background: 'none', border: 'none', color: canPrev ? T.ink : T.disabled, fontSize: 16, cursor: canPrev ? 'pointer' : 'default' }}
          >
            ←
          </button>
          <div>
            <div className="font-sans" style={{ fontSize: 12, color: T.muted }}>{fmtKorean(selectedDate)}</div>
            <div data-serif style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 40, color: T.ink, fontWeight: 700, margin: '4px 0' }}>
              {completed ? `Vol.${pad3(vol)}` : '—'}
            </div>
            <div className="font-sans" style={{ fontSize: 12, color: T.muted }}>{completed ? '발행 완료' : '미발행'}</div>
          </div>
          <button
            onClick={() => canNext && setSelected(dk(addDays(selectedDate, 1)))}
            disabled={!canNext}
            style={{ background: 'none', border: 'none', color: canNext ? T.ink : T.disabled, fontSize: 16, cursor: canNext ? 'pointer' : 'default' }}
          >
            →
          </button>
        </div>
      </div>
    );
  }

  // ---------- 상세 패널 (일 뷰가 아닐 때, 선택된 날짜 요약 + 토글) ----------
  function DetailPanel() {
    const completed = inRange(selectedDate) ? getCompleted(selected) : false;
    const vol = completed ? volAt(selectedDate) : null;
    if (!inRange(selectedDate)) return null;
    return (
      <div
        className="font-sans"
        style={{ fontSize: 12, marginTop: 14, padding: '10px 12px', border: `1px solid ${T.rule}`, background: T.emptyTint }}
      >
        <div className="flex justify-between items-center">
          <span style={{ color: T.ink, fontWeight: 600 }}>{fmtDot(selectedDate)}</span>
          <span style={{ color: T.muted }}>{completed ? `Vol.${pad3(vol)} · 완료` : '미완료'}</span>
        </div>
        <button
          onClick={() => toggleDay(selected)}
          className="mt-2 underline underline-offset-2"
          style={{ fontSize: 11, color: T.muted, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {completed ? '이 날짜 발행 취소' : '이 날짜 발행으로 표시'}
        </button>
      </div>
    );
  }

  // ---------- 하단 오늘의 CTA ----------
  const todayCompleted = getCompleted(todayKey);
  const Footer = (
    <div style={{ marginTop: 14 }}>
      {error && (
        <div className="font-sans" style={{ fontSize: 11, color: T.accent, marginBottom: 8 }}>{error}</div>
      )}
      <div
        className="font-sans"
        style={{ fontSize: 12, color: isStale ? T.ink : T.muted, fontWeight: isStale ? 700 : 400, marginBottom: 10 }}
      >
        {lastCompleted
          ? `${isStale ? '⚠ ' : ''}최근 발행: ${fmtDot(lastCompleted)}${isStale ? ` · ${gapDays}일째 공백` : ''}`
          : '아직 발행 기록이 없어요'}
      </div>
      {!todayCompleted ? (
        <button
          onClick={() => toggleDay(todayKey)}
          className="w-full py-2.5 font-sans font-semibold"
          style={{ fontSize: 13, background: T.filled, color: T.onFilled, border: 'none', cursor: 'pointer' }}
        >
          오늘의 BYLINE 발행하기
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 items-center">
          <div className="w-full py-2.5 text-center font-sans font-semibold" style={{ fontSize: 13, background: T.filled, color: T.onFilled }}>
            오늘의 BYLINE이 발행되었습니다 ✓
          </div>
          <button
            onClick={() => toggleDay(todayKey)}
            className="font-sans underline underline-offset-2"
            style={{ fontSize: 11, color: T.muted, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            오늘 발행 취소
          </button>
        </div>
      )}
    </div>
  );

  const Controls = (
    <div className="flex items-center justify-between mb-3 font-sans flex-wrap gap-2" style={{ fontSize: 11 }}>
      <div className="flex gap-1">
        {['portrait', 'landscape'].map((o) => (
          <ToggleBtn key={o} active={orientation === o} onClick={() => setOrientation(o)} T={T}>
            {o === 'portrait' ? '세로' : '가로'}
          </ToggleBtn>
        ))}
      </div>
      <div className="flex gap-1">
        {['sm', 'md', 'lg'].map((s) => (
          <ToggleBtn key={s} active={size === s} onClick={() => setSize(s)} T={T}>
            {SIZE_LABELS[s]}
          </ToggleBtn>
        ))}
      </div>
      <div className="flex gap-1">
        {['light', 'dark'].map((t) => (
          <ToggleBtn key={t} active={theme === t} onClick={() => setTheme(t)} T={T}>
            {THEME[t].label}
          </ToggleBtn>
        ))}
      </div>
    </div>
  );

  const ViewBody = (
    <div>
      {ViewTabs}
      {viewMode === 'month' && <MonthView />}
      {viewMode === 'week' && <WeekView />}
      {viewMode === 'day' && <DayView />}
      {viewMode !== 'day' && <DetailPanel />}
    </div>
  );

  return (
    <div
      style={{ background: 'transparent', minHeight: '100vh' }}
      className="byline-widget-root flex items-center justify-center p-6"
    >
      <FontStyles />
      <div style={{ width: isLandscape ? 620 : 320, transform: `scale(${SIZE_SCALE[size]})`, transformOrigin: 'top center' }}>
        {Controls}
        <div style={{ background: T.bg, color: T.ink, padding: 22, boxShadow: T.vignette }}>
          {Masthead}
          {DoubleRule}
          {isLandscape ? (
            <div className="flex gap-8">
              <div style={{ flex: 1 }}>{ViewBody}</div>
              <div style={{ width: 1, background: T.rule }} />
              <div style={{ width: 190 }}>{Footer}</div>
            </div>
          ) : (
            <>
              {ViewBody}
              {DoubleRule}
              {Footer}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GateScreen({ T, children }) {
  return (
    <div
      className="byline-widget-root flex items-center justify-center p-6 font-sans text-center"
      style={{ background: 'transparent', minHeight: '100vh' }}
    >
      <FontStyles />
      <div style={{ background: T.bg, color: T.ink, padding: 32, width: 320 }}>
        <h1 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 28, marginBottom: 16 }}>BYLINE</h1>
        {children}
      </div>
    </div>
  );
}

function ToggleBtn({ active, onClick, T, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 8px',
        border: `1px solid ${T.rule}`,
        background: active ? T.ink : 'transparent',
        color: active ? T.bg : T.muted,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function StampBadge({ visible, T }) {
  if (!visible) return null;
  return (
    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: '50%',
        border: `2px solid ${T.accent}`,
        boxShadow: `inset 0 0 0 2px ${T.accent}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: 'rotate(-8deg)',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 8, color: T.accent, fontWeight: 700, letterSpacing: '0.08em' }}>오늘</span>
    </div>
  );
}
