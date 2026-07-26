// ============================================================
// BYLINE 위젯 프로토타입 — v4
// 변경 이력:
//   v1: 최초 프로토타입 (Vol 카드형 아카이브 그리드, Figma 확인 전)
//   v2: Figma 디자인 시스템 반영 리빌드 (요일 캘린더 그리드, 발행취소,
//       목업데이터, 세로·가로/라이트·다크 토글)
//   v3: 1주차 기획 원안(점선 빈 칸) 정렬 + 최근 발행일 공백 경고 장치
//   v4: 빈티지 신문 컨셉 전면 재설계
//       - 다크모드 완료/미완료 대비 개선
//       - 가로모드에서 마스트헤드 유지(컬럼 분할 방식으로 변경)
//       - 일/주/월 보기 모드 추가
//       - 날짜 클릭 → Vol 확인, 발행 취소/수정(상세 패널)
//       - 마스트헤드 데이트라인, 이중 룰선, 오늘 스탬프 배지 추가
//
// ⚠️ 저장 방식: 여전히 Claude 아티팩트 전용 window.storage 사용 (프로토타입).
//    실배포 시 Notion API 등으로 교체 필요 (GitHub 이슈 #1 의존)
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';

const THEME = {
  light: {
    label: '주간판',
    bg: '#F2ECDE',
    ink: '#22201B',
    muted: '#8A806D',
    rule: '#C9BFA8',
    filled: '#22201B',
    onFilled: '#F2ECDE',
    emptyTint: 'rgba(34,32,27,0.07)',
    emptyBorder: '#B9AD90',
    accent: '#8B2E2A',
    vignette: 'inset 0 0 70px rgba(34,32,27,0.08)',
    disabled: '#C9BFA8',
  },
  dark: {
    label: '야간판',
    bg: '#1C1A16',
    ink: '#EDE6D3',
    muted: '#A79C87',
    rule: '#3A362C',
    filled: '#EDE6D3',
    onFilled: '#1C1A16',
    emptyTint: 'rgba(237,230,211,0.08)',
    emptyBorder: '#4A4438',
    accent: '#D9736D',
    vignette: 'inset 0 0 90px rgba(0,0,0,0.55)',
    disabled: '#3A362C',
  },
};

const AUTHOR = 'Lania Lee';
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const RANGE_START = new Date(2026, 5, 1); // 2026.06.01 (월)
const TODAY = new Date(2026, 6, 26); // 2026.07.26 (일)

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
function dayIndex(d) {
  return Math.round((d - RANGE_START) / 86400000);
}
function inRange(d) {
  return d >= RANGE_START && d <= TODAY;
}
function baseCompleted(d) {
  if (!inRange(d)) return false;
  const r = dayIndex(d) % 10;
  return r !== 2 && r !== 6 && r !== 9; // 10일 중 3일 미완료 ≈ 7:3
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

export default function Byline() {
  const [theme, setTheme] = useState('light');
  const [orientation, setOrientation] = useState('portrait');
  const [viewMode, setViewMode] = useState('month'); // 'day' | 'week' | 'month'
  const [monthCursor, setMonthCursor] = useState(new Date(2026, 6, 1)); // 7월
  const [selected, setSelected] = useState(dk(TODAY));
  const [overrides, setOverrides] = useState({});
  const [loaded, setLoaded] = useState(false);

  const T = THEME[theme];
  const todayKey = dk(TODAY);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.storage.get('byline-overrides');
        if (mounted && res?.value) setOverrides(JSON.parse(res.value));
      } catch (e) {
        // 최초 상태 - 정상
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  function getCompleted(dateKey, d) {
    if (dateKey in overrides) return overrides[dateKey];
    return baseCompleted(d);
  }

  async function toggleDay(dateKey, d) {
    const next = { ...overrides, [dateKey]: !getCompleted(dateKey, d) };
    setOverrides(next);
    try {
      await window.storage.set('byline-overrides', JSON.stringify(next));
    } catch (e) {
      console.error('저장 실패', e);
    }
  }

  function volAt(d) {
    let count = 0;
    const idx = dayIndex(d);
    for (let i = 0; i <= idx; i++) {
      const day = addDays(RANGE_START, i);
      if (getCompleted(dk(day), day)) count++;
    }
    return count;
  }

  const volCount = useMemo(() => (inRange(TODAY) ? volAt(TODAY) : 0), [overrides]);

  const lastCompleted = useMemo(() => {
    for (let i = dayIndex(TODAY); i >= 0; i--) {
      const day = addDays(RANGE_START, i);
      if (getCompleted(dk(day), day)) return day;
    }
    return null;
  }, [overrides]);

  const gapDays = lastCompleted ? Math.round((TODAY - lastCompleted) / 86400000) : null;
  const isStale = gapDays !== null && gapDays >= 3;

  if (!loaded) {
    return (
      <div style={{ background: T.bg, color: T.muted, minHeight: '100vh' }} className="flex items-center justify-center font-sans">
        <span className="text-sm tracking-widest uppercase">Loading…</span>
      </div>
    );
  }

  const isLandscape = orientation === 'landscape';
  const selectedDate = new Date(selected + 'T00:00:00');

  // ---------- 셀 컴포넌트 ----------
  function Cell({ date, size = 28, disabled = false }) {
    const key = dk(date);
    const completed = inRange(date) ? getCompleted(key, date) : false;
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
        <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 34, color: T.ink, lineHeight: 1, fontWeight: 700 }}>
          BYLINE
        </h1>
        <StampBadge visible={selected === todayKey} T={T} />
      </div>
      <div className="flex justify-between items-center mt-1.5">
        <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 13, color: T.muted }}>
          By {AUTHOR}
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

    const canPrev = monthCursor.getMonth() > RANGE_START.getMonth() || monthCursor.getFullYear() > RANGE_START.getFullYear();
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
    const completed = inRange(selectedDate) ? getCompleted(selected, selectedDate) : false;
    const vol = completed ? volAt(selectedDate) : null;
    const canPrev = selectedDate > RANGE_START;
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
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 40, color: T.ink, fontWeight: 700, margin: '4px 0' }}>
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
    const completed = inRange(selectedDate) ? getCompleted(selected, selectedDate) : false;
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
          onClick={() => toggleDay(selected, selectedDate)}
          className="mt-2 underline underline-offset-2"
          style={{ fontSize: 11, color: T.muted, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {completed ? '이 날짜 발행 취소' : '이 날짜 발행으로 표시'}
        </button>
      </div>
    );
  }

  // ---------- 하단 오늘의 CTA ----------
  const todayCompleted = getCompleted(todayKey, TODAY);
  const Footer = (
    <div style={{ marginTop: 14 }}>
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
          onClick={() => toggleDay(todayKey, TODAY)}
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
            onClick={() => toggleDay(todayKey, TODAY)}
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
    <div className="flex items-center justify-between mb-3 font-sans" style={{ fontSize: 11 }}>
      <div className="flex gap-1">
        {['portrait', 'landscape'].map((o) => (
          <ToggleBtn key={o} active={orientation === o} onClick={() => setOrientation(o)} T={T}>
            {o === 'portrait' ? '세로' : '가로'}
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
    <div style={{ background: theme === 'light' ? '#E9E3D2' : '#0C0B09', minHeight: '100vh' }} className="flex items-center justify-center p-6">
      <div style={{ width: isLandscape ? 620 : 320 }}>
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
