// ============================================================
// BYLINE 위젯 프로토타입 — v1 (최초 작성본)
// 컨셉: Vol 카드형 아카이브 그리드 + 뉴스룸 스탬프 톤
// 배경: 1주차 기획서만 참고, Figma 확인 전 상태에서 작성
// ============================================================

import React, { useState, useEffect } from 'react';

const PAPER = '#F7F6F2';
const PAPER_FILLED = '#EDEBE4';
const INK = '#1A1A1A';
const RULE = '#D8D6CF';
const STAMP = '#B23A2E';
const MUTED = '#726F68';
const AUTHOR = 'Lania Lee';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function Byline() {
  const [records, setRecords] = useState([]); // [{ vol, dateKey }]
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stamping, setStamping] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.storage.get('byline-records');
        if (mounted && res?.value) {
          setRecords(JSON.parse(res.value));
        }
      } catch (e) {
        // 키가 아직 없는 최초 상태 - 정상
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const todayStr = todayKey();
  const alreadyPublished = records.some((r) => r.dateKey === todayStr);
  const lastRecord = records[records.length - 1];

  async function handlePublish() {
    if (alreadyPublished || saving) return;
    const newRecord = { vol: records.length + 1, dateKey: todayStr };
    const updated = [...records, newRecord];

    setSaving(true);
    setRecords(updated);
    setStamping(true);

    try {
      const result = await window.storage.set(
        'byline-records',
        JSON.stringify(updated)
      );
      if (!result) {
        console.error('저장 실패: 결과 없음');
      }
    } catch (e) {
      console.error('저장 실패', e);
    } finally {
      setSaving(false);
      setTimeout(() => setStamping(false), 1100);
    }
  }

  const gridItems = [...records];
  if (!alreadyPublished) {
    gridItems.push({ vol: records.length + 1, dateKey: todayStr, pending: true });
  }

  if (!loaded) {
    return (
      <div
        style={{ background: PAPER, minHeight: '100vh', color: MUTED }}
        className="flex items-center justify-center"
      >
        <span className="text-sm tracking-widest uppercase">Loading…</span>
      </div>
    );
  }

  return (
    <div
      style={{ background: PAPER, color: INK, minHeight: '100vh' }}
      className="flex justify-center px-4 py-10"
    >
      <div className="w-full max-w-md">
        {/* 마스트헤드 */}
        <div
          style={{ borderTop: `3px solid ${INK}`, borderBottom: `1px solid ${INK}` }}
          className="pt-3 pb-3 text-center"
        >
          <div
            className="text-[10px] tracking-[0.3em] uppercase"
            style={{ color: MUTED }}
          >
            Daily Transcription Record
          </div>
          <h1 className="font-serif text-5xl tracking-tight mt-1">BYLINE</h1>
          <div className="font-serif italic text-sm mt-1" style={{ color: MUTED }}>
            By {AUTHOR}
          </div>
        </div>

        {/* 데이트라인 */}
        <div
          style={{ borderBottom: `1px solid ${RULE}` }}
          className="flex justify-between items-center py-3 text-xs"
        >
          <span className="uppercase tracking-widest" style={{ color: MUTED }}>
            Vol. Archive
          </span>
          <span style={{ color: MUTED }}>
            {lastRecord
              ? `최근 발행: ${lastRecord.dateKey.replaceAll('-', '.')}`
              : '아직 발행 기록이 없어요'}
          </span>
        </div>

        {/* 아카이브 그리드 */}
        <div className="grid grid-cols-4 gap-2 mt-5">
          {records.length === 0 && (
            <div
              className="col-span-4 text-center py-8 text-sm"
              style={{ color: MUTED }}
            >
              첫 필사를 마치고 오늘의 BYLINE을 발행해보세요.
            </div>
          )}
          {gridItems.map((item) => {
            const isToday = item.dateKey === todayStr;
            const isPending = Boolean(item.pending);
            return (
              <div
                key={`${item.vol}-${item.dateKey}`}
                className="aspect-square flex flex-col items-center justify-center rounded-none text-center"
                style={{
                  border: isToday ? `2px solid ${STAMP}` : `1px solid ${RULE}`,
                  borderStyle: isPending ? 'dashed' : 'solid',
                  background: isPending ? 'transparent' : PAPER_FILLED,
                }}
              >
                <span
                  className="text-[10px] tracking-wider"
                  style={{ color: isPending ? MUTED : INK }}
                >
                  VOL.{pad2(item.vol)}
                </span>
                <span className="text-[9px] mt-1" style={{ color: MUTED }}>
                  {isPending ? '—' : item.dateKey.slice(5).replace('-', '.')}
                </span>
              </div>
            );
          })}
        </div>

        {/* 발행 버튼 */}
        <div className="mt-8 flex flex-col items-center">
          <button
            onClick={handlePublish}
            disabled={alreadyPublished || saving}
            className="w-full py-3 text-sm tracking-widest uppercase transition-opacity"
            style={{
              border: `1px solid ${INK}`,
              color: alreadyPublished ? MUTED : INK,
              background: 'transparent',
              cursor: alreadyPublished ? 'default' : 'pointer',
              opacity: alreadyPublished ? 0.6 : 1,
            }}
          >
            {alreadyPublished ? '오늘은 이미 발행했어요' : '오늘의 BYLINE 발행하기'}
          </button>

          {stamping && (
            <div
              className="mt-3 text-xs tracking-[0.3em] uppercase"
              style={{ color: STAMP }}
            >
              ★ Published — Vol.{pad2(records.length)} ★
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
