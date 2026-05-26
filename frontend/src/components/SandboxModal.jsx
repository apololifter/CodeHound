import { useState, useEffect } from 'react';

const STEP_KIND_META = {
  mutate:   { label: 'Mutación',   color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.12)' },
  derive:   { label: 'Evaluado',   color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)' },
  update:   { label: 'Actualizado', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)' },
  evaluate: { label: 'Usa input',  color: '#6b7280', bg: 'rgba(107, 114, 128, 0.08)' },
};

export function SandboxModal({ nodeId, directory, onClose, onSimulate, onRunDast, onRunFuzzer }) {
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
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
    if (!selectedParam || language !== 'python') return;
    onRunDast(nodeId, selectedParam, payload);
    onClose();
  };

  const handleFuzzer = () => {
    if (!selectedParam || language !== 'python') return;
    onRunFuzzer(nodeId, selectedParam);
    onClose();
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
        width: '500px',
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
          ) : error ? (
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
            </>
          )}
        </div>

        <div style={{
          backgroundColor: '#1f2937', padding: '16px 24px', borderTop: '1px solid #374151',
          display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleDastSandbox}
              disabled={loading || !selectedParam || language !== 'python'}
              title="Abre el DebuggerPanel para ver cómo muta este payload específico línea a línea"
              style={{
                padding: '8px 12px', fontSize: '12px', fontWeight: '700', color: '#ffffff',
                backgroundColor: '#f59e0b', border: 'none', borderRadius: '8px',
                cursor: (loading || !selectedParam || language !== 'python') ? 'not-allowed' : 'pointer',
                opacity: (loading || !selectedParam || language !== 'python') ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <span>🔬</span> Sandbox 1 Payload
            </button>
            <button
              onClick={handleFuzzer}
              disabled={loading || !selectedParam || language !== 'python'}
              title="Lanza Fuzzer con 12 payloads y abre el DebuggerPanel"
              style={{
                padding: '8px 12px', fontSize: '12px', fontWeight: '700', color: '#ffffff',
                backgroundColor: '#ef4444', border: 'none', borderRadius: '8px',
                cursor: (loading || !selectedParam || language !== 'python') ? 'not-allowed' : 'pointer',
                opacity: (loading || !selectedParam || language !== 'python') ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <span>🎯</span> Lanzar Fuzzer
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onClose} style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: '#9ca3af',
              backgroundColor: 'transparent', border: 'none', cursor: 'pointer'
            }}>Cancelar</button>
            <button
              onClick={handleSimulate}
              disabled={loading || !selectedParam}
              style={{
                padding: '8px 20px', fontSize: '13px', fontWeight: '700', color: '#ffffff',
                backgroundColor: '#2563eb', border: 'none', borderRadius: '8px',
                cursor: (loading || !selectedParam) ? 'not-allowed' : 'pointer',
                opacity: (loading || !selectedParam) ? 0.5 : 1,
              }}
            >
              Simulación Estática
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
