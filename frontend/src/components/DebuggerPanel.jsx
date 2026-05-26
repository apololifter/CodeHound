import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_BASE = 'http://127.0.0.1:8000';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

const EVENT_META = {
  sink:      { label: 'SINK',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    icon: '💥', tip: 'El payload llegó a una función peligrosa' },
  propagate: { label: 'PROPAGATE', color: '#f97316', bg: 'rgba(249,115,22,0.12)',   icon: '🔴', tip: 'El payload se propagó a una nueva variable' },
  mutate:    { label: 'MUTATE',    color: '#eab308', bg: 'rgba(234,179,8,0.12)',    icon: '🟠', tip: 'El valor del parámetro cambió' },
  derive:    { label: 'DERIVE',    color: '#6366f1', bg: 'rgba(99,102,241,0.12)',   icon: '🔵', tip: 'Nueva variable derivada del input' },
  evaluate:  { label: 'EVALUATE',  color: '#22d3ee', bg: 'rgba(34,211,238,0.10)',   icon: '⚪', tip: 'El input se usó sin cambiar' },
  observe:   { label: 'OBSERVE',   color: '#64748b', bg: 'rgba(100,116,139,0.08)',  icon: '⚫', tip: 'Instrucción sin relación con el payload' },
};

function getEventMeta(event) {
  return EVENT_META[event] || EVENT_META.observe;
}

function SeverityBadge({ severity }) {
  const map = {
    critical: { color: '#ef4444', label: '🔴 Crítico' },
    warning:  { color: '#f97316', label: '🟠 Advertencia' },
    info:     { color: '#22d3ee', label: '🔵 Info' },
  };
  const s = map[severity] || map.info;
  return (
    <span style={{
      fontSize: '11px', fontWeight: 700, color: s.color,
      background: s.color + '1a', borderRadius: 6, padding: '2px 8px',
      border: `1px solid ${s.color}40`
    }}>
      {s.label}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Payload Tracker (barra superior con el valor actual del payload)
// ──────────────────────────────────────────────────────────────
function PayloadTracker({ frames, activeIdx, targetParam }) {
  const activeFrame = frames[activeIdx];
  const currentVal = activeFrame?.vars?.[targetParam];
  const isTainted = activeFrame?.tainted_vars?.includes(targetParam);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px',
      background: 'rgba(15,18,28,0.95)',
      borderBottom: '1px solid rgba(99,102,241,0.2)',
      fontFamily: 'monospace', fontSize: 13, flexWrap: 'wrap',
    }}>
      <span style={{ color: '#64748b', fontFamily: 'inherit' }}>Payload Tracker:</span>
      <span style={{
        color: '#a5b4fc', fontWeight: 600,
        background: 'rgba(99,102,241,0.1)', borderRadius: 6, padding: '2px 8px',
        border: '1px solid rgba(99,102,241,0.3)',
      }}>
        {targetParam}
      </span>
      <span style={{ color: '#64748b' }}>=</span>
      {currentVal !== undefined ? (
        <span style={{
          color: isTainted ? '#ef4444' : '#94a3b8',
          background: isTainted ? 'rgba(239,68,68,0.08)' : 'rgba(100,116,139,0.08)',
          border: `1px solid ${isTainted ? 'rgba(239,68,68,0.3)' : 'rgba(100,116,139,0.2)'}`,
          borderRadius: 6, padding: '2px 10px', maxWidth: 320,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {currentVal || '""'}
        </span>
      ) : (
        <span style={{ color: '#475569', fontStyle: 'italic' }}>— no definido aún —</span>
      )}
      {isTainted && (
        <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 700 }}>⚠ TAINTED</span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// FrameItem — un frame en la timeline rail
// ──────────────────────────────────────────────────────────────
function FrameItem({ frame, isActive, onClick }) {
  const meta = getEventMeta(frame.event);
  return (
    <div
      onClick={onClick}
      title={meta.tip}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '8px 10px', cursor: 'pointer', borderRadius: 8,
        background: isActive ? meta.bg : 'transparent',
        border: isActive ? `1px solid ${meta.color}50` : '1px solid transparent',
        transition: 'all 0.15s ease',
        marginBottom: 2,
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = 'rgba(99,102,241,0.07)';
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* Line badge */}
      <div style={{
        minWidth: 36, height: 20, borderRadius: 5, fontSize: 10, fontWeight: 700,
        background: isActive ? meta.color : 'rgba(100,116,139,0.2)',
        color: isActive ? '#fff' : '#64748b',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace', flexShrink: 0,
      }}>
        L{frame.line}
      </div>

      {/* Event icon */}
      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 2 }}>{meta.icon}</span>

      {/* Code line */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'monospace', fontSize: 11.5,
          color: isActive ? '#e2e8f0' : '#94a3b8',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {frame.code || <em style={{ color: '#475569' }}>— sin código —</em>}
        </div>

        {/* Tainted chips */}
        {frame.tainted_vars?.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
            {frame.tainted_vars.slice(0, 4).map(v => (
              <span key={v} style={{
                fontSize: 9.5, fontWeight: 700, fontFamily: 'monospace',
                color: frame.new_tainted?.includes(v) ? '#ef4444' : '#f97316',
                background: frame.new_tainted?.includes(v) ? 'rgba(239,68,68,0.15)' : 'rgba(249,115,22,0.12)',
                borderRadius: 4, padding: '1px 5px',
                border: `1px solid ${frame.new_tainted?.includes(v) ? 'rgba(239,68,68,0.4)' : 'rgba(249,115,22,0.3)'}`,
              }}>
                {frame.new_tainted?.includes(v) ? '⚡' : ''}{v}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Event badge */}
      <span style={{
        fontSize: 9, fontWeight: 700, flexShrink: 0,
        color: meta.color, background: meta.color + '18',
        borderRadius: 4, padding: '2px 5px', marginTop: 1,
        fontFamily: 'monospace', letterSpacing: 0.5,
      }}>
        {meta.label}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// VariableInspector — tabla de variables del frame activo
// ──────────────────────────────────────────────────────────────
function VariableInspector({ frame }) {
  const [expanded, setExpanded] = useState({});
  if (!frame) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#475569', fontSize: 13 }}>
        <span style={{ fontSize: 28 }}>🔍</span><br />
        Selecciona un frame para ver las variables
      </div>
    );
  }

  const vars = frame.vars || {};
  const tainted = new Set(frame.tainted_vars || []);
  const newTainted = new Set(frame.new_tainted || []);

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600, letterSpacing: 0.5 }}>
        VARIABLES — Línea {frame.line}
      </div>
      {Object.keys(vars).length === 0 ? (
        <div style={{ color: '#475569', fontSize: 12, fontStyle: 'italic' }}>Sin variables en este frame</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: '#475569', fontSize: 10 }}>
              <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Nombre</th>
              <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Valor</th>
              <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(vars).map(([k, v]) => {
              const isNew = newTainted.has(k);
              const isTainted = tainted.has(k);
              const isExpanded = expanded[k];
              const longVal = String(v).length > 60;
              const displayVal = isExpanded ? String(v) : String(v).slice(0, 60) + (longVal ? '…' : '');

              return (
                <tr
                  key={k}
                  style={{
                    background: isNew ? 'rgba(239,68,68,0.07)' : isTainted ? 'rgba(249,115,22,0.05)' : 'transparent',
                    borderRadius: 4,
                  }}
                >
                  <td style={{
                    padding: '4px 6px', fontFamily: 'monospace', fontWeight: 600,
                    color: isNew ? '#ef4444' : isTainted ? '#f97316' : '#94a3b8',
                  }}>
                    {isNew && '⚡ '}{k}
                  </td>
                  <td
                    style={{ padding: '4px 6px', fontFamily: 'monospace', color: '#cbd5e1', cursor: longVal ? 'pointer' : 'default' }}
                    onClick={() => longVal && setExpanded(p => ({ ...p, [k]: !p[k] }))}
                    title={longVal ? 'Clic para expandir' : undefined}
                  >
                    {displayVal}
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    {isNew ? (
                      <span style={{ fontSize: 9.5, color: '#ef4444', fontWeight: 700, background: 'rgba(239,68,68,0.15)', borderRadius: 4, padding: '1px 5px' }}>🔴 TAINTED</span>
                    ) : isTainted ? (
                      <span style={{ fontSize: 9.5, color: '#f97316', fontWeight: 700, background: 'rgba(249,115,22,0.12)', borderRadius: 4, padding: '1px 5px' }}>🟠 tainted</span>
                    ) : (
                      <span style={{ fontSize: 9.5, color: '#475569', fontWeight: 600, background: 'rgba(100,116,139,0.1)', borderRadius: 4, padding: '1px 5px' }}>⚫ limpio</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// AIExplain — explicación IA para el frame activo
// ──────────────────────────────────────────────────────────────
function AIExplain({ frame, payload, funcName, directory }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const cacheRef = useRef({});

  const cacheKey = frame ? `${frame.frame_id}:${payload}` : null;

  useEffect(() => {
    setResult(cacheRef.current[cacheKey] || null);
  }, [cacheKey]);

  const handleExplain = useCallback(async () => {
    if (!frame) return;
    if (cacheRef.current[cacheKey]) {
      setResult(cacheRef.current[cacheKey]);
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/ai/explain_frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line: frame.line,
          code: frame.code,
          vars: frame.vars || {},
          tainted_vars: frame.tainted_vars || [],
          event: frame.event,
          payload: payload || '',
          func_name: funcName || '',
          vuln_type: frame.is_sink ? 'Potential Injection Sink' : '',
        }),
      });
      const data = await resp.json();
      cacheRef.current[cacheKey] = data;
      setResult(data);
    } catch (err) {
      setResult({ explanation: `Error: ${err.message}`, severity: 'info' });
    } finally {
      setLoading(false);
    }
  }, [frame, payload, funcName, cacheKey]);

  if (!frame) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#475569', fontSize: 13 }}>
        <span style={{ fontSize: 28 }}>🤖</span><br />
        Selecciona un frame y presiona<br />"Explicar esta línea"
      </div>
    );
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Frame context summary */}
      <div style={{
        background: 'rgba(15,18,28,0.8)', borderRadius: 8, padding: '8px 12px',
        border: '1px solid rgba(99,102,241,0.2)', fontFamily: 'monospace', fontSize: 12,
        color: '#94a3b8',
      }}>
        <span style={{ color: '#6366f1', fontWeight: 700 }}>L{frame.line}</span>{' '}
        <span style={{ color: '#e2e8f0' }}>{frame.code || '—'}</span>
      </div>

      {/* Explain button */}
      <button
        onClick={handleExplain}
        disabled={loading}
        style={{
          padding: '9px 16px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          background: loading ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center',
          gap: 8, justifyContent: 'center', transition: 'opacity 0.2s',
          opacity: loading ? 0.7 : 1,
          boxShadow: loading ? 'none' : '0 2px 12px rgba(99,102,241,0.35)',
        }}
      >
        {loading ? (
          <>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 15 }}>⏳</span>
            Analizando…
          </>
        ) : (
          <>🤖 Explicar esta línea</>
        )}
      </button>

      {/* Result */}
      {result && (
        <div style={{
          background: 'rgba(10,12,20,0.8)', borderRadius: 10, padding: 14,
          border: '1px solid rgba(99,102,241,0.25)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>ANÁLISIS DE IA</span>
            <SeverityBadge severity={result.severity} />
          </div>
          <div className="prose prose-invert prose-sm max-w-none prose-a:text-indigo-400 prose-strong:text-indigo-400 prose-code:text-indigo-300" style={{
            fontSize: 13, color: '#cbd5e1', lineHeight: 1.65,
          }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {result.explanation}
            </ReactMarkdown>
          </div>
          {result.fix_suggestion && (
            <div style={{
              marginTop: 4, background: 'rgba(34,197,94,0.07)', borderRadius: 8,
              border: '1px solid rgba(34,197,94,0.25)', padding: '8px 12px',
              fontFamily: 'monospace', fontSize: 12, color: '#86efac',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', marginBottom: 4 }}>✅ SUGERENCIA DE FIX</div>
              {result.fix_suggestion}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main DebuggerPanel component
// ──────────────────────────────────────────────────────────────
export default function DebuggerPanel({
  sandboxResult,      // { frames, execution_summary, func_name, filepath, ... }
  fuzzResults,        // array de { payload, category, frames, execution_summary, ... }
  targetParam,
  directory,
  onFrameSelect,      // callback(frame) → Monaco highlight
  style = {},
}) {
  const [mode, setMode] = useState('sandbox'); // 'sandbox' | 'fuzzer'
  const [activeFuzzIdx, setActiveFuzzIdx] = useState(0);
  const [activeFrameIdx, setActiveFrameIdx] = useState(0);
  const [activeTab, setActiveTab] = useState('vars'); // 'vars' | 'ai'
  const timelineRef = useRef(null);

  // Determinar qué frames mostrar
  const frames = mode === 'fuzzer'
    ? (fuzzResults?.[activeFuzzIdx]?.frames || [])
    : (sandboxResult?.frames || []);

  const activeFrame = frames[activeFrameIdx] || null;
  const funcName = sandboxResult?.func_name || '';
  const activeSummary = mode === 'fuzzer'
    ? fuzzResults?.[activeFuzzIdx]?.execution_summary
    : sandboxResult?.execution_summary;
  const activePayload = mode === 'fuzzer'
    ? fuzzResults?.[activeFuzzIdx]?.payload
    : sandboxResult?.initial_payload;

  // Reset frame idx when switching payload or mode
  useEffect(() => {
    setActiveFrameIdx(0);
  }, [activeFuzzIdx, mode]);

  // Notify parent when frame changes
  useEffect(() => {
    if (activeFrame && onFrameSelect) {
      onFrameSelect(activeFrame);
    }
  }, [activeFrame]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setActiveFrameIdx(i => Math.min(i + 1, frames.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setActiveFrameIdx(i => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [frames.length]);

  // Scroll active frame into view
  useEffect(() => {
    if (timelineRef.current) {
      const active = timelineRef.current.querySelector('[data-active="true"]');
      if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeFrameIdx]);

  const hasSandbox = sandboxResult?.frames?.length > 0;
  const hasFuzzer = fuzzResults?.length > 0;

  if (!hasSandbox && !hasFuzzer) return null;

  const tabBtn = (id, label) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
        fontWeight: 600,
        background: activeTab === id ? 'rgba(99,102,241,0.25)' : 'transparent',
        color: activeTab === id ? '#a5b4fc' : '#64748b',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: 'rgba(10,13,22,0.97)',
      border: '1px solid rgba(99,102,241,0.25)',
      borderRadius: 12, overflow: 'hidden',
      fontFamily: "'Inter', system-ui, sans-serif",
      ...style,
    }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .dbg-frame-list::-webkit-scrollbar { width: 5px; }
        .dbg-frame-list::-webkit-scrollbar-track { background: transparent; }
        .dbg-frame-list::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 10px; }
      `}</style>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: 'rgba(6,8,16,0.9)',
        borderBottom: '1px solid rgba(99,102,241,0.2)',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 15 }}>🐛</span>
        <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>Debugger</span>

        {/* Mode toggle */}
        <div style={{
          display: 'flex', gap: 4, background: 'rgba(15,18,28,0.8)',
          borderRadius: 8, padding: 3, border: '1px solid rgba(99,102,241,0.2)',
          marginLeft: 6,
        }}>
          {hasSandbox && (
            <button onClick={() => setMode('sandbox')} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: mode === 'sandbox' ? 'rgba(99,102,241,0.3)' : 'transparent',
              color: mode === 'sandbox' ? '#a5b4fc' : '#64748b', fontSize: 12, fontWeight: 600,
            }}>
              🔬 Sandbox
            </button>
          )}
          {hasFuzzer && (
            <button onClick={() => setMode('fuzzer')} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: mode === 'fuzzer' ? 'rgba(239,68,68,0.2)' : 'transparent',
              color: mode === 'fuzzer' ? '#fca5a5' : '#64748b', fontSize: 12, fontWeight: 600,
            }}>
              🎯 Fuzzer
            </button>
          )}
        </div>

        {/* Fuzzer payload selector */}
        {mode === 'fuzzer' && fuzzResults?.length > 0 && (
          <select
            value={activeFuzzIdx}
            onChange={e => setActiveFuzzIdx(Number(e.target.value))}
            style={{
              background: 'rgba(15,18,28,0.9)', border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 7, color: '#cbd5e1', padding: '4px 10px', fontSize: 12,
              cursor: 'pointer', maxWidth: 240,
            }}
          >
            {fuzzResults.map((r, i) => (
              <option key={i} value={i}>
                [{r.category}] {r.payload.slice(0, 30)}{r.payload.length > 30 ? '…' : ''}
                {' '}{r.execution_summary?.sink_count > 0 ? '💥' : r.frames?.length > 0 ? '✓' : '✗'}
              </option>
            ))}
          </select>
        )}

        {/* Frame navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button
            onClick={() => setActiveFrameIdx(i => Math.max(i - 1, 0))}
            disabled={activeFrameIdx === 0}
            style={{
              width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(99,102,241,0.3)',
              background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', cursor: 'pointer',
              fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: activeFrameIdx === 0 ? 0.3 : 1,
            }}
          >◀</button>
          <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>
            {frames.length > 0 ? `${activeFrameIdx + 1} / ${frames.length}` : '—'}
          </span>
          <button
            onClick={() => setActiveFrameIdx(i => Math.min(i + 1, frames.length - 1))}
            disabled={activeFrameIdx >= frames.length - 1}
            style={{
              width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(99,102,241,0.3)',
              background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', cursor: 'pointer',
              fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: activeFrameIdx >= frames.length - 1 ? 0.3 : 1,
            }}
          >▶</button>
        </div>

        {/* Execution summary chips */}
        {activeSummary && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {activeSummary.sink_count > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', borderRadius: 6, padding: '2px 8px', border: '1px solid rgba(239,68,68,0.3)' }}>
                💥 {activeSummary.sink_count} SINK{activeSummary.sink_count > 1 ? 'S' : ''}
              </span>
            )}
            {activeSummary.tainted_vars_all?.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#f97316', background: 'rgba(249,115,22,0.1)', borderRadius: 6, padding: '2px 8px', border: '1px solid rgba(249,115,22,0.25)' }}>
                🔴 {activeSummary.tainted_vars_all.length} var(s) tainted
              </span>
            )}
            <span style={{ fontSize: 11, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 6, padding: '2px 8px' }}>
              {activeSummary.total_frames ?? activeSummary.lines_executed ?? 0} frames
            </span>
          </div>
        )}
      </div>

      {/* ── Payload Tracker ─────────────────────────────────── */}
      {targetParam && frames.length > 0 && (
        <PayloadTracker frames={frames} activeIdx={activeFrameIdx} targetParam={targetParam} />
      )}

      {/* ── Body: Timeline + Inspector/AI ───────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Timeline Rail */}
        <div
          ref={timelineRef}
          className="dbg-frame-list"
          style={{
            width: 280, minWidth: 220, flexShrink: 0,
            overflowY: 'auto', padding: '8px 6px',
            borderRight: '1px solid rgba(99,102,241,0.15)',
          }}
        >
          {frames.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#475569', fontSize: 12 }}>
              Sin frames capturados
            </div>
          ) : frames.map((f, i) => (
            <div key={f.frame_id ?? i} data-active={i === activeFrameIdx ? 'true' : 'false'}>
              <FrameItem
                frame={f}
                isActive={i === activeFrameIdx}
                onClick={() => setActiveFrameIdx(i)}
              />
            </div>
          ))}
        </div>

        {/* Right panel: tabs Variable Inspector + AI */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', gap: 2, padding: '6px 10px',
            borderBottom: '1px solid rgba(99,102,241,0.15)',
            background: 'rgba(6,8,16,0.6)',
          }}>
            {tabBtn('vars', '🔍 Variables')}
            {tabBtn('ai', '🤖 IA Explica')}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto' }} className="dbg-frame-list">
            {activeTab === 'vars' && <VariableInspector frame={activeFrame} />}
            {activeTab === 'ai' && (
              <AIExplain
                frame={activeFrame}
                payload={activePayload}
                funcName={funcName}
                directory={directory}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
