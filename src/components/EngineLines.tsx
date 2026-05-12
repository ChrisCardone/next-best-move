import { useMemo, useRef, useEffect, useState } from 'react';
import { useEngineStore } from '../engine/engineStore';
import { useAnalysisStore } from '../engine/analysisStore';
import { startRunAnalysis, cancelRunAnalysis } from '../engine/useRunAnalysis';
import { useGameStore } from '../game/store';
import { formatScore } from '../engine/uciParser';
import { pvToSan, type PvBoard } from '../engine/pvToSan';
import { PvMiniBoard } from './PvMiniBoard';

const HASH_OPTIONS = [16, 32, 64, 128, 256] as const;

interface HoverState {
  lineKey: number;
  boards: PvBoard[];
  index: number;
}

interface PopupPosition {
  top: number;
  left: number;
}

/**
 * Engine UI panel: toggle, gear settings panel, and collapsible PV lines.
 */
export function EngineLines() {
  const replayTokenRef = useRef(0);
  const replayTimeoutRef = useRef<number | null>(null);

  const enabled = useEngineStore((s) => s.enabled);
  const multipv = useEngineStore((s) => s.multipv);
  const depth = useEngineStore((s) => s.depth);
  const analysisStatus = useAnalysisStore((s) => s.status);
  const hashMb = useEngineStore((s) => s.hashMb);
  const analyseMode = useEngineStore((s) => s.analyseMode);
  const analysisMultiPv = useEngineStore((s) => s.analysisMultiPv);
  const analysisDepth = useEngineStore((s) => s.analysisDepth);
  const analysisHashMb = useEngineStore((s) => s.analysisHashMb);
  const threatMode = useEngineStore((s) => s.threatMode);
  const lines = useEngineStore((s) => s.lines);
  const threatLines = useEngineStore((s) => s.threatLines);
  const analyzedFen = useEngineStore((s) => s.analyzedFen);
  const threatAnalyzedFen = useEngineStore((s) => s.threatAnalyzedFen);
  const toggle = useEngineStore((s) => s.toggle);
  const showArrows = useEngineStore((s) => s.showArrows);
  const toggleArrows = useEngineStore((s) => s.toggleArrows);
  const toggleThreatMode = useEngineStore((s) => s.toggleThreatMode);
  const setMultiPv = useEngineStore((s) => s.setMultiPv);
  const setDepth = useEngineStore((s) => s.setDepth);
  const setHashMb = useEngineStore((s) => s.setHashMb);
  const setAnalyseMode = useEngineStore((s) => s.setAnalyseMode);
  const setAnalysisMultiPv = useEngineStore((s) => s.setAnalysisMultiPv);
  const setAnalysisDepth = useEngineStore((s) => s.setAnalysisDepth);
  const setAnalysisHashMb = useEngineStore((s) => s.setAnalysisHashMb);

  const fen = useGameStore((s) => s.currentFen());
  const playUci = useGameStore((s) => s.playUci);

  const activeLines = threatMode ? threatLines : lines;
  const showFen = (threatMode ? threatAnalyzedFen : analyzedFen) ?? fen;
  const whiteToMove = showFen.split(' ')[1] === 'w';

  const [showSettings, setShowSettings] = useState(false);
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [popupPos, setPopupPos] = useState<PopupPosition>({ top: 0, left: 0 });

  const orientation = useGameStore((s) => s.orientation);
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLUListElement>(null);

  // Mirror hoverState into a ref so the wheel handler never sees a stale closure.
  const hoverStateRef = useRef(hoverState);
  useEffect(() => { hoverStateRef.current = hoverState; }, [hoverState]);

  function setPreviewState(next: HoverState | null) {
    hoverStateRef.current = next;
    setHoverState(next);
  }

  function updatePreviewState(updater: (prev: HoverState | null) => HoverState | null) {
    setHoverState((prev) => {
      const next = updater(prev);
      hoverStateRef.current = next;
      return next;
    });
  }

  // Auto-increment to the next move after hover starts, so the first move
  // animates automatically without needing to scroll.
  useEffect(() => {
    if (!hoverState || hoverState.index !== 0 || hoverState.boards.length < 2) return;
    const timeout = setTimeout(() => {
      updatePreviewState((prev) => prev && prev.index === 0 ? { ...prev, index: 1 } : prev);
    }, 270);
    return () => clearTimeout(timeout);
  }, [hoverState?.lineKey]);

  // Non-passive wheel listener: when a line is being previewed, scroll the
  // move index instead of scrolling the lines list.
  useEffect(() => {
    if (!enabled) return;
    const el = linesRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      const current = hoverStateRef.current;
      if (!current) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      updatePreviewState((prev) => {
        if (!prev) return prev;
        const nextIndex = Math.max(0, Math.min(prev.boards.length - 1, prev.index + dir));
        return nextIndex === prev.index ? prev : { ...prev, index: nextIndex };
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled]);

  // Close settings when clicking outside.
  useEffect(() => {
    if (!showSettings) return;
    function onPointerDown(e: PointerEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showSettings]);

  const sorted = useMemo(
    () => Array.from(activeLines.values()).sort((a, b) => a.multipv - b.multipv),
    [activeLines],
  );

  function toggleExpand(idx: number) {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function cancelReplay() {
    replayTokenRef.current += 1;
    if (replayTimeoutRef.current !== null) {
      window.clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
  }

  function replayLineToIndex(pvMoves: string[], targetIndex: number) {
    cancelReplay();
    const token = replayTokenRef.current;
    let i = 0;

    const step = () => {
      if (replayTokenRef.current !== token) return;
      if (i > targetIndex) return;

      const uci = pvMoves[i];
      if (!uci) return;

      playUci(uci);
      i += 1;

      if (i <= targetIndex) {
        replayTimeoutRef.current = window.setTimeout(step, 230);
      }
    };

    step();
  }

  useEffect(() => () => cancelReplay(), []);

  return (
    <div ref={containerRef} className="engine__container">
      <div className="engine">
        <header className="engine__header">
        <button
          type="button"
          className={`engine__toggle ${enabled ? 'is-on' : ''}`}
          onClick={toggle}
        >
          {enabled ? 'Engine on' : 'Engine off'}
        </button>
        {enabled && (
          <button
            type="button"
            className={`engine__threat-btn ${threatMode ? 'is-on' : ''}`}
            onClick={toggleThreatMode}
            title={threatMode ? 'Hide threat lines' : 'Show threat lines'}
            aria-label={threatMode ? 'Hide threat lines' : 'Show threat lines'}
          >
            <svg
              className="engine__threat-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              <path d="M12 2.75V6M12 18V21.25M2.75 12H6M18 12H21.25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {enabled && (
          <button
            type="button"
            className={`engine__arrows-btn ${showArrows ? 'is-on' : ''}`}
            onClick={toggleArrows}
            title={showArrows ? 'Hide board arrows' : 'Show board arrows'}
            aria-label={showArrows ? 'Hide board arrows' : 'Show board arrows'}
          >
            ↗
          </button>
        )}
        {enabled && (
          <button
            type="button"
            className={`engine__run-analysis${analysisStatus === 'running' ? ' is-running' : ''}`}
            onClick={analysisStatus === 'running' ? cancelRunAnalysis : startRunAnalysis}
            title={analysisStatus === 'running' ? 'Cancel analysis' : 'Analyze full game'}
            aria-label={analysisStatus === 'running' ? 'Cancel analysis' : 'Run Analysis'}
          >
            {analysisStatus === 'running' ? '■' : '⚡'}
          </button>
        )}
        {enabled && (
          <div className="engine__header-actions" ref={settingsRef}>
            <button
              type="button"
              className={`engine__gear ${showSettings ? 'is-active' : ''}`}
              onClick={() => setShowSettings((v) => !v)}
              title="Engine settings"
              aria-label="Engine settings"
            >
              ⚙
            </button>
            {showSettings && (
              <div className="engine__settings">
                <div className="engine__settings-row">
                  <label htmlFor="eng-multipv">Lines</label>
                  <input
                    id="eng-multipv"
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={multipv}
                    onChange={(e) => setMultiPv(parseInt(e.target.value, 10))}
                  />
                  <span className="engine__settings-val">{multipv}</span>
                </div>
                <div className="engine__settings-row">
                  <label htmlFor="eng-depth">Depth</label>
                  <input
                    id="eng-depth"
                    type="range"
                    min={1}
                    max={99}
                    step={1}
                    value={depth}
                    onChange={(e) => setDepth(parseInt(e.target.value, 10))}
                  />
                  <span className="engine__settings-val">{depth}</span>
                </div>
                <div className="engine__settings-row">
                  <label htmlFor="eng-hash">Hash</label>
                  <select
                    id="eng-hash"
                    value={hashMb}
                    onChange={(e) => setHashMb(parseInt(e.target.value, 10))}
                  >
                    {HASH_OPTIONS.map((mb) => (
                      <option key={mb} value={mb}>
                        {mb} MB
                      </option>
                    ))}
                  </select>
                </div>
                <div className="engine__settings-row">
                  <label htmlFor="eng-analysemode">Analysis mode</label>
                  <input
                    id="eng-analysemode"
                    type="checkbox"
                    checked={analyseMode}
                    onChange={(e) => setAnalyseMode(e.target.checked)}
                  />
                </div>
                <div className="engine__settings-section-label">Run Analysis</div>
                <div className="engine__settings-row">
                  <label htmlFor="eng-analysis-multipv">Lines</label>
                  <input
                    id="eng-analysis-multipv"
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={analysisMultiPv}
                    onChange={(e) => setAnalysisMultiPv(parseInt(e.target.value, 10))}
                  />
                  <span className="engine__settings-val">{analysisMultiPv}</span>
                </div>
                <div className="engine__settings-row">
                  <label htmlFor="eng-analysis-depth">Depth</label>
                  <input
                    id="eng-analysis-depth"
                    type="range"
                    min={1}
                    max={99}
                    step={1}
                    value={analysisDepth}
                    onChange={(e) => setAnalysisDepth(parseInt(e.target.value, 10))}
                  />
                  <span className="engine__settings-val">{analysisDepth}</span>
                </div>
                <div className="engine__settings-row">
                  <label htmlFor="eng-analysis-hash">Hash</label>
                  <select
                    id="eng-analysis-hash"
                    value={analysisHashMb}
                    onChange={(e) => setAnalysisHashMb(parseInt(e.target.value, 10))}
                  >
                    {HASH_OPTIONS.map((mb) => (
                      <option key={`analysis-${mb}`} value={mb}>
                        {mb} MB
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {enabled && (
        <ul ref={linesRef} className="engine__lines">
          {threatMode && (
            <li className="engine__mode-label">showing opponent threats</li>
          )}
          {sorted.length === 0 && (
            <li className="engine__empty">analyzing…</li>
          )}
          {sorted.map((pv) => {
            const { sans, startPly, boards } = pvToSan(showFen, pv.pv);
            const isExpanded = expandedLines.has(pv.multipv);
            return (
              <li
                key={pv.multipv}
                className={`engine__line ${isExpanded ? 'is-expanded' : ''}`}
                onMouseEnter={(e) => {
                  const lineRect = e.currentTarget.getBoundingClientRect();
                  const popupSize = 300;
                  const pad = 8;
                  const leftUnclamped = lineRect.left;
                  const topUnclamped = lineRect.bottom + 6;
                  const left = Math.max(pad, Math.min(window.innerWidth - popupSize - pad, leftUnclamped));
                  const top = Math.max(pad, Math.min(window.innerHeight - popupSize - pad, topUnclamped));
                  setPopupPos({ top, left });
                  setPreviewState({ lineKey: pv.multipv, boards, index: 0 });
                }}
                onMouseLeave={() => {
                  updatePreviewState((prev) => (prev?.lineKey === pv.multipv ? null : prev));
                }}
              >
                <span className="engine__score">{formatScore(pv, whiteToMove)}</span>
                <span className="engine__depth">d{pv.depth}</span>
                <span className={`engine__pv ${isExpanded ? 'is-expanded' : ''}`}>
                  {sans.map((san, i) => {
                    const ply = startPly + i;
                    const isWhite = ply % 2 === 0;
                    const moveNum = Math.floor(ply / 2) + 1;
                    const prefix =
                      isWhite ? `${moveNum}.` : i === 0 ? `${moveNum}…` : '';
                    return (
                      <span key={i} className="engine__movepair">
                        {prefix && (
                          <span className="engine__num">{prefix}</span>
                        )}
                        <button
                          type="button"
                          className="engine__san"
                          onClick={() => replayLineToIndex(pv.pv, i)}
                          title="Go to this position"
                        >
                          {san}
                        </button>
                      </span>
                    );
                  })}
                </span>
                <button
                  type="button"
                  className={`engine__expand ${isExpanded ? 'is-expanded' : ''}`}
                  onClick={() => toggleExpand(pv.multipv)}
                  aria-label={isExpanded ? 'Collapse line' : 'Expand line'}
                >
                  ▾
                </button>
              </li>
            );
          })}
        </ul>
      )}
      </div>
      {hoverState && (
        <PvMiniBoard
          boards={hoverState.boards}
          index={hoverState.index}
          lineKey={hoverState.lineKey}
          orientation={orientation}
          style={{ top: popupPos.top, left: popupPos.left }}
        />
      )}
    </div>
  );
}
