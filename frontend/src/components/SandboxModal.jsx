import { useState, useEffect } from 'react';

const STEP_KIND_META = {
  mutate:   { label: 'Mutación',   color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.12)' },
  derive:   { label: 'Evaluado',   color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)' },
  update:   { label: 'Actualizado', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)' },
  evaluate: { label: 'Usa input',  color: '#6b7280', bg: 'rgba(107, 114, 128, 0.08)' },
};

function DastTracePanel({ dast, targetParam, payload }) {
  const timeline = dast?.mutation_timeline || [];
  const intercepted = dast?.intercepted || [];
  const summary = dast?.execution_summary || {};

  return (
    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Resumen de ejecución */}
      <div style={{
        padding: '12px 14px', borderRadius: '8px',
        background: dast?.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
        border: `1px solid ${dast?.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
      }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: dast?.success ? '#6ee7b7' : '#fca5a5', marginBottom: '6px' }}>
          {dast?.success ? '✓ Ejecución aislada completada' : '✗ Error en ejecución aislada'}
        </div>
        {dast?.success && dast?.result != null && (
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
            Retorno: <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{String(dast.result)}</span>
            {dast?.type && <span style={{ color: '#6b7280' }}> ({dast.type})</span>}
          </div>
        )}
        {dast?.error && (
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#fca5a5' }}>{dast.error}</div>
        )}
        <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px' }}>
          Payload inyectado en <code style={{ color: '#fbbf24' }}>{targetParam}</code>:{' '}
          <span style={{ fontFamily: 'monospace', color: '#a78bfa' }}>{payload}</span>
        </div>
        {summary.input_unchanged_note && (
          <div style={{
            marginTop: '10px', padding: '8px 10px', borderRadius: '6px',
            background: 'rgba(96, 165, 250, 0.08)', border: '1px solid rgba(96, 165, 250, 0.25)',
            fontSize: '11px', color: '#93c5fd', lineHeight: '1.45',
          }}>
            ℹ️ {summary.input_unchanged_note}
          </div>
        )}
        {summary.derived_variables?.length > 0 && (
          <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '8px' }}>
            Valores derivados del input:{' '}
            {summary.derived_variables.map(v => (
              <code key={v} style={{ color: '#c4b5fd', marginRight: '6px' }}>{v}</code>
            ))}
          </div>
        )}
      </div>

      {/* Llamadas peligrosas interceptadas (mock, sin efecto real) */}
      {intercepted.length > 0 && (
        <div style={{ background: '#0a0c14', borderRadius: '8px', border: '1px solid #374151', overflow: 'hidden' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#f59e0b', padding: '8px 12px', background: '#1f2937', borderBottom: '1px solid #374151' }}>
            🛡️ Llamadas interceptadas en sandbox ({intercepted.length})
          </div>
          <div style={{ maxHeight: '100px', overflowY: 'auto', padding: '8px 12px' }}>
            {intercepted.map((call, i) => (
              <div key={i} style={{ fontSize: '10px', fontFamily: 'monospace', color: '#d1d5db', marginBottom: '4px' }}>
                {call.module}({call.args?.join(', ')})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mutación línea a línea */}
      <div style={{ background: '#0a0c14', borderRadius: '8px', border: '1px solid #374151', overflow: 'hidden' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#10b981', padding: '8px 12px', background: '#1f2937', borderBottom: '1px solid #374151' }}>
          🔬 Ejecución línea a línea de la función ({timeline.length} pasos)
        </div>
        <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
          {timeline.length === 0 ? (
            <p style={{ padding: '16px', fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>
              No se capturó actividad en la función. Puede ser una función vacía o el trace no alcanzó el cuerpo.
            </p>
          ) : (
            timeline.map((step) => {
              const meta = STEP_KIND_META[step.step_kind] || STEP_KIND_META.evaluate;
              return (
              <div
                key={step.line_number}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #1f2937',
                  background: step.highlight ? meta.bg : 'transparent',
                  borderLeft: step.highlight ? `3px solid ${meta.color}` : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: '700', fontFamily: 'monospace',
                    color: '#60a5fa', background: 'rgba(96, 165, 250, 0.12)',
                    padding: '2px 6px', borderRadius: '4px',
                  }}>
                    L{step.line_number}
                  </span>
                  <span style={{
                    fontSize: '9px', fontWeight: '700', color: meta.color,
                    padding: '2px 6px', borderRadius: '4px', background: meta.bg,
                  }}>
                    {meta.label}
                  </span>
                </div>

                {step.raw_code && (
                  <pre style={{
                    margin: '0 0 8px', padding: '6px 8px', background: '#030712',
                    borderRadius: '4px', fontSize: '11px', color: '#d1d5db',
                    fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>{step.raw_code}</pre>
                )}

                {step.events?.length > 0 && (
                  <div style={{ marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {step.events.map((ev, idx) => (
                      <div key={idx} style={{ fontSize: '10px', lineHeight: '1.4' }}>
                        <span style={{ color: '#9ca3af' }}>{ev.message}</span>
                        {ev.after != null && (
                          <span style={{ fontFamily: 'monospace', marginLeft: '6px' }}>
                            <span style={{ color: '#fca5a5' }}>{String(ev.before)}</span>
                            {' → '}
                            <span style={{ color: '#4ade80' }}>{String(ev.after)}</span>
                          </span>
                        )}
                        {ev.value != null && ev.after == null && (
                          <span style={{ fontFamily: 'monospace', color: '#c4b5fd', marginLeft: '6px' }}>
                            = {String(ev.value)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {step.locals && Object.keys(step.locals).length > 0 && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px',
                    fontSize: '10px', fontFamily: 'monospace',
                  }}>
                    {Object.entries(step.locals).map(([k, v]) => (
                      <span key={k} style={{ display: 'contents' }}>
                        <span style={{ color: k === targetParam ? '#fbbf24' : '#6b7280', textAlign: 'right' }}>{k}:</span>
                        <span style={{ color: '#d1d5db', wordBreak: 'break-all' }}>{v}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );})
          )}
        </div>
      </div>
    </div>
  );
}

export function SandboxModal({ nodeId, directory, onClose, onSimulate }) {
  const [params, setParams] = useState([]);
  const [selectedParam, setSelectedParam] = useState('');
  const [payload, setPayload] = useState('\' OR 1=1 --');
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState('python');
  const [runningDast, setRunningDast] = useState(false);
  const [dastResult, setDastResult] = useState(null);
  const [error, setError] = useState('');

  const apiBase = 'http://127.0.0.1:8000';

  useEffect(() => {
    fetch(`${apiBase}/api/analyze/dataflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId, directory })
    })
      .then(res => res.json())
      .then(data => {
        setLoading(false);
        setLanguage(data.language || 'python');
        if (data.error) {
          setError(data.error);
        } else {
          const extractedParams = data.parameters?.length
            ? data.parameters
            : (data.steps?.[0]?.tainted_vars || []);
          setParams(extractedParams);
          if (extractedParams.length > 0) {
            setSelectedParam(extractedParams[0]);
          } else {
            setError("No se detectaron parámetros en esta función.");
          }
        }
      })
      .catch(() => {
        setLoading(false);
        setError("Error al conectar con el servidor.");
      });
  }, [nodeId, directory]);

  const handleSimulate = () => {
    if (!selectedParam) return;
    onSimulate(nodeId, selectedParam, payload);
  };

  const handleDastSandbox = () => {
    if (!selectedParam) return;
    if (language !== 'python') {
      setError('El micro-sandbox ejecutable solo está disponible para funciones Python.');
      return;
    }
    setRunningDast(true);
    setDastResult(null);
    setError('');
    fetch(`${apiBase}/api/simulate/dast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node_id: nodeId,
        directory,
        target_param: selectedParam,
        payload,
      })
    })
      .then(res => res.json())
      .then(data => {
        setRunningDast(false);
        if (data.status === 'success' && data.dynamic_execution) {
          setDastResult(data.dynamic_execution);
        } else {
          setError(data.error || 'Error al ejecutar el micro-sandbox');
        }
      })
      .catch(() => {
        setRunningDast(false);
        setError("Error al conectar con el servidor.");
      });
  };

  const funcLabel = nodeId.split('::')[1] || nodeId;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        backgroundColor: '#111827',
        border: '1px solid #374151',
        borderRadius: '12px',
        width: dastResult ? '720px' : '500px',
        maxHeight: '90vh',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.3s ease'
      }}>

        <div style={{
          backgroundColor: '#1f2937', padding: '16px 24px',
          borderBottom: '1px solid #374151', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#f3f4f6', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🧪</span> Sandbox de Función
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#9ca3af',
            cursor: 'pointer', fontSize: '18px', padding: 0
          }}>✕</button>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.5' }}>
            Aislando <span style={{ fontFamily: 'monospace', color: '#60a5fa', backgroundColor: '#1f2937', padding: '2px 6px', borderRadius: '4px' }}>{funcLabel}()</span>.
            El <strong style={{ color: '#fbbf24' }}>Auto-Fuzzer</strong> ejecuta un micro-sandbox en memoria (sin modificar tu código) para observar cómo muta el payload línea a línea.
            La <strong style={{ color: '#93c5fd' }}>Micro-Simulación</strong> analiza el flujo estático y lo abre en el panel de datos.
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <div style={{
                width: '32px', height: '32px', border: '3px solid rgba(59, 130, 246, 0.2)',
                borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite'
              }} />
            </div>
          ) : error && !dastResult ? (
            <div style={{
              backgroundColor: 'rgba(127, 29, 29, 0.2)', border: '1px solid rgba(153, 27, 27, 0.5)',
              color: '#f87171', padding: '12px 16px', borderRadius: '8px', fontSize: '13px'
            }}>{error}</div>
          ) : (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Parámetro Objetivo
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {params.map(p => (
                    <button
                      key={p}
                      onClick={() => setSelectedParam(p)}
                      style={{
                        padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace',
                        border: selectedParam === p ? '1px solid #3b82f6' : '1px solid #374151',
                        backgroundColor: selectedParam === p ? '#2563eb' : '#1f2937',
                        color: selectedParam === p ? '#ffffff' : '#9ca3af', cursor: 'pointer',
                      }}
                    >{p}</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Payload (dato a inyectar)
                </label>
                <input
                  type="text"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  spellCheck="false"
                  style={{
                    width: '100%', backgroundColor: '#030712', border: '1px solid #374151',
                    color: '#4ade80', fontFamily: 'monospace', fontSize: '13px',
                    borderRadius: '8px', padding: '10px 14px', outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>

              {runningDast && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '12px', padding: '16px 0' }}>
                  <div style={{
                    width: '24px', height: '24px', border: '3px solid rgba(245, 158, 11, 0.2)',
                    borderTop: '3px solid #f59e0b', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                  }} />
                  <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '600' }}>
                    Ejecutando micro-sandbox aislado…
                  </span>
                </div>
              )}

              {dastResult && !runningDast && (
                <DastTracePanel dast={dastResult} targetParam={selectedParam} payload={payload} />
              )}
            </>
          )}
        </div>

        <div style={{
          backgroundColor: '#1f2937', padding: '16px 24px', borderTop: '1px solid #374151',
          display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexShrink: 0,
        }}>
          <button
            onClick={handleDastSandbox}
            disabled={loading || !selectedParam || runningDast}
            title="Ejecuta la función en un entorno aislado y muestra cómo muta el payload"
            style={{
              padding: '8px 16px', fontSize: '12px', fontWeight: '700', color: '#ffffff',
              backgroundColor: '#f59e0b', border: 'none', borderRadius: '8px',
              cursor: (loading || !selectedParam || runningDast) ? 'not-allowed' : 'pointer',
              opacity: (loading || !selectedParam || runningDast) ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <span>⚡</span> Auto-Fuzzer (micro-sandbox)
          </button>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onClose} style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: '#9ca3af',
              backgroundColor: 'transparent', border: 'none', cursor: 'pointer'
            }}>Cancelar</button>
            <button
              onClick={handleSimulate}
              disabled={loading || !selectedParam || runningDast}
              style={{
                padding: '8px 20px', fontSize: '13px', fontWeight: '700', color: '#ffffff',
                backgroundColor: '#2563eb', border: 'none', borderRadius: '8px',
                cursor: (loading || !selectedParam || runningDast) ? 'not-allowed' : 'pointer',
                opacity: (loading || !selectedParam || runningDast) ? 0.5 : 1,
              }}
            >
              Micro-Simulación (flujo estático)
            </button>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
}
