import { useMemo, useRef, useEffect, useState } from 'react';
import { useEngineStore } from '../engine/engineStore';
import { useEnginePvStore } from '../engine/enginePvStore';
import { useGameStore } from '../game/store';
import { formatScore } from '../engine/uciParser';
import { pvToSan, type PvBoard } from '../engine/pvToSan';
import { PvMiniBoard } from './PvMiniBoard';
import { EngineSettingsPanel } from './EngineSettingsPanel';

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
  const threatMode = useEngineStore((s) => s.threatMode);
  const lines = useEnginePvStore((s) => s.lines);
  const threatLines = useEnginePvStore((s) => s.threatLines);
  const analyzedFen = useEnginePvStore((s) => s.analyzedFen);
  const threatAnalyzedFen = useEnginePvStore((s) => s.threatAnalyzedFen);
  const toggle = useEngineStore((s) => s.toggle);
  const showArrows = useEngineStore((s) => s.showArrows);
  const toggleArrows = useEngineStore((s) => s.toggleArrows);
  const toggleThreatMode = useEngineStore((s) => s.toggleThreatMode);

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

  // Auto-increment to the next move after hover starts, so the first move
  // animates automatically without needing to scroll.
  useEffect(() => {
    if (!hoverState || hoverState.index !== 0 || hoverState.boards.length < 2) return;
    const timeout = setTimeout(() => {
      setHoverState((prev) => prev && prev.index === 0 ? { ...prev, index: 1 } : prev);
    }, 270);
    return () => clearTimeout(timeout);
  }, [hoverState?.lineKey]);

  // Non-passive wheel listener: when a line is being previewed, scroll the
  // move index instead of scrolling the lines list. Re-attached when
  // hoverState becomes (non-)null so the handler sees the current state.
  useEffect(() => {
    if (!enabled || !hoverState) return;
    const el = linesRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      setHoverState((prev) => {
        if (!prev) return prev;
        const nextIndex = Math.max(0, Math.min(prev.boards.length - 1, prev.index + dir));
        return nextIndex === prev.index ? prev : { ...prev, index: nextIndex };
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled, hoverState !== null]);

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
            {showSettings && <EngineSettingsPanel />}
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
                  setHoverState({ lineKey: pv.multipv, boards, index: 0 });
                }}
                onMouseLeave={() => {
                  setHoverState((prev) => (prev?.lineKey === pv.multipv ? null : prev));
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
                    // Each SAN button maps to boards[i + 1] — boards[0] is the
                    // starting position, boards[k] is the position after the
                    // k-th move in the PV.
                    const previewIndex = i + 1;
                    return (
                      <span key={i} className="engine__movepair">
                        {prefix && (
                          <span className="engine__num">{prefix}</span>
                        )}
                        <button
                          type="button"
                          className="engine__san"
                          onClick={() => replayLineToIndex(pv.pv, i)}
                          onMouseEnter={(e) => {
                            // Set the WHOLE hover state from this button alone —
                            // engine info updates can cause React to drop the
                            // line-level hover state, so per-SAN hover stands
                            // on its own. Position the popup below the line.
                            const li = (e.currentTarget as HTMLElement).closest('.engine__line');
                            if (!li) return;
                            const lineRect = li.getBoundingClientRect();
                            const popupSize = 300;
                            const pad = 8;
                            const left = Math.max(pad, Math.min(window.innerWidth - popupSize - pad, lineRect.left));
                            const top = Math.max(pad, Math.min(window.innerHeight - popupSize - pad, lineRect.bottom + 6));
                            setPopupPos({ top, left });
                            const clampedIndex = Math.max(0, Math.min(previewIndex, boards.length - 1));
                            setHoverState({ lineKey: pv.multipv, boards, index: clampedIndex });
                          }}
                          title="Hover to preview position, click to play"
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
