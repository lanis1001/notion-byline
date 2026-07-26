// ============================================================
// BYLINE 위젯 프로토타입 — v3
// 변경 이력:
//   v1: 최초 프로토타입 (Vol 카드형 아카이브 그리드, Figma 확인 전)
//   v2: Figma 디자인 시스템(Ink/Cream/Stone/Mist, Inter) 반영 리빌드
//       (요일 캘린더 그리드, 발행취소, 목업데이터, 세로·가로/라이트·다크 토글)
//   v3: 1주차 기획 원안(미완료=점선 빈 칸) 재정렬 +
//       최근 발행일 공백 경고 장치 추가
//
// ⚠️ 저장 방식 주의:
//   지금은 Claude 아티팩트 전용 window.storage API로 임시 저장 중입니다.
//   실제 Notion 임베드로 배포할 때는 이 부분을 교체해야 합니다.
//   (관련 결정 대기 중: GitHub 이슈 #1 "노션 API 연동 방식 결정")
//   → 배포 시 Notion API 직접 연동 / 자체 백엔드 DB 중 하나로 교체 필요
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';

// ---- Figma 기준 디자인 토큰 ----
const THEME = {
  light: {
    bg: '#FAFAF8',
    text: '#1A1A1A',
    muted: '#9E9E9E',
    filled: '#1A1A1A',
    border: '#1A1A1A',
    divider: '#E0E0E0', // 미완료 셀 점선 색상으로도 사용
  },
  dark: {
    bg: '#141414',
    text: '#F5F3EC',
    muted: '#8C8C8C',
    filled: '#F5F3EC',
    border: '#F5F3EC',
    divider: '#2E2E2E',
  },
};

const AUTHOR = 'Lania Lee';
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function pad3(n) {
  return String(n).padStart(3, '0');
}
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}
function fmt(d) {
  return dateKey(d).replaceAll('-', '.');
}
function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

// 2026.06.01(월) ~ 2026.07.25 = 정확히 8주(56일). 오늘(07.26)은 별도 상호작용 셀로 처리.
const RANGE_START = new Date(2026, 5, 1);
const MOCK_DAYS = 56;

// 완료:미완료 = 7:3 비율의 결정적 목업 패턴 (10일 주기 중 3일 미완료)
function mockCompleted(index) {
  const r = index % 10;
  return r !== 2 && r !== 6 && r !== 9;
}

export default function Byline() {
  const [theme, setTheme] = useState('light');
  const [orientation, setOrientation] = useState('portrait');
  const [loaded, setLoaded] = useState(false);
  const [todayPublished, setTodayPublished] = useState(false);
  const [justPublished, setJustPublished] = useState(false);

  const T = THEME[theme];
  const today = useMemo(() => new Date(2026, 6, 26), []); // 2026.07.26
  const todayKeyStr = dateKey(today);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // 프로토타입 임시 저장소 — 실배포 시 Notion API 등으로 교체 예정
        const res = await window.storage.get('byline-today-published');
        if (mounted && res?.value === 'true') setTodayPublished(true);
      } catch (e) {
        // 아직 저장된 값 없음 - 정상
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 6/1 ~ 7/25 목업 데이터 + 오늘(7/26)은 실시간 상태
  const mockRecords = useMemo(() => {
    const arr = [];
    for (let i = 0; i < MOCK_DAYS; i++) {
      const d = addDays(RANGE_START, i);
      arr.push({ date: d, key: dateKey(d), completed: mockCompleted(i) });
    }
    arr.push({ date: today, key: todayKeyStr, completed: todayPublished });
    return arr;
  }, [todayPublished, today, todayKeyStr]);

  const volCount = mockRecords.filter((r) => r.completed).length;
  const lastCompleted = [...mockRecords].reverse().find((r) => r.completed);
  const gapDays = lastCompleted
    ? Math.round((today - lastCompleted.date) / 86400000)
    : null;
  const isStale = gapDays !== null && gapDays >= 3;

  async function handlePublish() {
    setTodayPublished(true);
    setJustPublished(true);
    try {
      await window.storage.set('byline-today-published', 'true');
    } catch (e) {
      console.error('저장 실패', e);
    }
  }

  async function handleCancel() {
    setTodayPublished(false);
    setJustPublished(false);
    try {
      await window.storage.set('byline-today-published', 'false');
    } catch (e) {
      console.error('취소 저장 실패', e);
    }
  }

  // 주 단위로 묶기 (7일씩)
  const weeks = [];
  for (let i = 0; i < mockRecords.length; i += 7) {
    weeks.push(mockRecords.slice(i, i + 7));
  }

  if (!loaded) {
    return (
      <div
        style={{ background: T.bg, color: T.muted, minHeight: '100vh' }}
        className="flex items-center justify-center font-sans"
      >
        <span className="text-sm tracking-widest uppercase">Loading…</span>
      </div>
    );
  }

  const isLandscape = orientation === 'landscape';

  const Masthead = (
    <div>
      <div className="flex items-end justify-between">
        <h1
          className="font-sans font-bold tracking-tight"
          style={{ fontSize: 28, color: T.text, lineHeight: 1 }}
        >
          BYLINE
        </h1>
        <span
          className="font-sans font-medium"
          style={{ fontSize: 12, color: T.muted }}
        >
          Vol.{pad3(volCount)}
        </span>
      </div>
      <div
        className="font-sans mt-1"
        style={{ fontSize: 14, color: T.muted }}
      >
        By {AUTHOR}
      </div>
    </div>
  );

  const Footer = (
    <div>
      <div
        className="font-sans"
        style={{
          fontSize: 12,
          color: isStale ? T.text : T.muted,
          fontWeight: isStale ? 600 : 400,
          marginBottom: 10,
        }}
      >
        {lastCompleted
          ? `${isStale ? '⚠ ' : ''}최근 발행: ${fmt(lastCompleted.date)}${
              isStale ? ` · ${gapDays}일째 공백` : ''
            }`
          : '아직 발행 기록이 없어요'}
      </div>
      {!todayPublished ? (
        <button
          onClick={handlePublish}
          className="w-full py-2.5 font-sans font-semibold transition-opacity"
          style={{
            fontSize: 13,
            background: T.filled,
            color: T.bg,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          오늘의 BYLINE 발행하기
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 items-center">
          <div
            className="w-full py-2.5 text-center font-sans font-semibold"
            style={{ fontSize: 13, background: T.filled, color: T.bg }}
          >
            오늘의 BYLINE이 발행되었습니다 ✓
          </div>
          <button
            onClick={handleCancel}
            className="font-sans underline underline-offset-2"
            style={{ fontSize: 11, color: T.muted, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            오늘 발행 취소
          </button>
        </div>
      )}
    </div>
  );

  const Grid = (
    <div>
      <div className="grid grid-cols-7 gap-[3px] mb-1.5">
        {WEEKDAYS.map((w, i) => (
          <div
            key={i}
            className="text-center font-sans"
            style={{ fontSize: 11, color: T.muted }}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-[3px]">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-[3px]">
            {week.map((day) => {
              const isToday = day.key === todayKeyStr;
              return (
                <div
                  key={day.key}
                  title={`${fmt(day.date)} · ${day.completed ? '완료' : '미완료'}`}
                  style={{
                    aspectRatio: '1 / 1',
                    background: day.completed ? T.filled : 'transparent',
                    border: isToday
                      ? `2px solid ${T.border}`
                      : day.completed
                      ? 'none'
                      : `1px dashed ${T.divider}`,
                    boxSizing: 'border-box',
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const Controls = (
    <div className="flex items-center justify-between mb-4 font-sans" style={{ fontSize: 11 }}>
      <div className="flex gap-1">
        {['portrait', 'landscape'].map((o) => (
          <button
            key={o}
            onClick={() => setOrientation(o)}
            style={{
              padding: '3px 8px',
              border: `1px solid ${T.divider}`,
              background: orientation === o ? T.text : 'transparent',
              color: orientation === o ? T.bg : T.muted,
              cursor: 'pointer',
            }}
          >
            {o === 'portrait' ? '세로' : '가로'}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        {['light', 'dark'].map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            style={{
              padding: '3px 8px',
              border: `1px solid ${T.divider}`,
              background: theme === t ? T.text : 'transparent',
              color: theme === t ? T.bg : T.muted,
              cursor: 'pointer',
            }}
          >
            {t === 'light' ? '라이트' : '다크'}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      style={{ background: theme === 'light' ? '#F0EEE8' : '#0A0A0A', minHeight: '100vh' }}
      className="flex items-center justify-center p-6"
    >
      <div style={{ width: isLandscape ? 560 : 320 }}>
        {Controls}
        <div
          style={{
            background: T.bg,
            color: T.text,
            padding: 20,
            border: `1px solid ${T.divider}`,
          }}
          className={isLandscape ? 'flex gap-8 items-stretch' : ''}
        >
          {isLandscape ? (
            <>
              <div className="flex flex-col justify-between" style={{ width: 180 }}>
                {Masthead}
                <div style={{ borderTop: `1px solid ${T.divider}`, marginTop: 16, paddingTop: 16 }}>
                  {Footer}
                </div>
              </div>
              <div style={{ borderLeft: `1px solid ${T.divider}` }} />
              <div className="flex-1 flex items-center">{Grid}</div>
            </>
          ) : (
            <>
              {Masthead}
              <div style={{ borderTop: `1px solid ${T.divider}`, margin: '16px 0' }} />
              {Grid}
              <div style={{ borderTop: `1px solid ${T.divider}`, margin: '16px 0' }} />
              {Footer}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
