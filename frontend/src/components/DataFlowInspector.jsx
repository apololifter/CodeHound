import React, { useState, useEffect } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';

const TYPE_META = {
  CAPTURE:       { icon: '📥', color: '#60a5fa', bg: 'rgba(96,165,250,0.10)',  label: 'Captura de Input'     },
  ASSIGN:        { icon: '🔄', color: '#fcd34d', bg: 'rgba(252,211,77,0.08)',  label: 'Asignación'           },
  SANITIZE:      { icon: '🛡️', color: '#10b981', bg: 'rgba(16,185,129,0.10)', label: 'Sanitización'          },
  CONDITION:     { icon: '🔀', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  label: 'Bifurcación'          },
  CALL:          { icon: '→',  color: '#6366f1', bg: 'rgba(99,102,241,0.08)',  label: 'Llamada'              },
  EXTERNAL_CALL: { icon: '🔗', color: '#a855f7', bg: 'rgba(168,85,247,0.12)', label: 'Llamada Externa'       },
  SINK:          { icon: '🚨', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   label: 'Sink Peligroso'       },
  RETURN:        { icon: '↩️', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', label: 'Retorno'             },
  STMT:          { icon: '▸',  color: '#4b5563', bg: 'transparent',            label: 'Instrucción'          },
};

const RISK_BANNER = {
  critical: { bg: 'rgba(239,68,68,0.12)', border: '#ef4444', icon: '🚨', text: 'CRÍTICO — Input externo llega a un Sink sin sanitización', color: '#fca5a5' },
  warning:  { bg: 'rgba(245,158,11,0.10)', border: '#f59e0b', icon: '⚠️', text: 'ADVERTENCIA — Input llega a Sink pero hay sanitización previa', color: '#fcd34d' },
  info:     { bg: 'rgba(168,85,247,0.08)', border: '#a855f7', icon: 'ℹ️', text: 'INFO — Input pasa a funciones externas', color: '#c4b5fd' },
  none:     { bg: 'rgba(16,185,129,0.08)', border: '#10b981', icon: '✅', text: 'Sin flujo peligroso detectado en esta función', color: '#6ee7b7' },
};

function RiskBanner({ summary }) {
  if (!summary) return null;
  const { risk_level } = summary;
  const meta = RISK_BANNER[risk_level] || RISK_BANNER.none;
  return (
    <div style={{
      margin: '10px 14px', padding: '10px 14px', borderRadius: '8px',
      background: meta.bg, border: `1px solid ${meta.border}`,
      display: 'flex', alignItems: 'center', gap: '10px',
    }}>
      <span style={{ fontSize: '18px' }}>{meta.icon}</span>
      <div>
        <div style={{ fontSize: '12px', fontWeight: '700', color: meta.color }}>{meta.text}</div>
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {summary.has_external_input && <span style={{ color: '#60a5fa' }}>📥 Recibe input externo</span>}
          {summary.has_sanitization  && <span style={{ color: '#10b981' }}>🛡️ Sanitización presente</span>}
          {summary.has_dangerous_sink && <span style={{ color: '#ef4444' }}>🚨 {summary.sink_count} Sink(s)</span>}
          {summary.has_external_calls && <span style={{ color: '#a855f7' }}>🔗 Llama a funciones externas</span>}
        </div>
      </div>
    </div>
  );
}

function StepRow({ step, isLast, onNavigate, onSelectLine, onSelectFileAndLine, dynamicExecution }) {
  const meta = TYPE_META[step.type] || TYPE_META.STMT;
  const isImportant = ['CAPTURE', 'SINK', 'SANITIZE', 'EXTERNAL_CALL'].includes(step.type);
  const isCovered = dynamicExecution?.coverage?.includes(step.line_number);
  const memoryTrace = dynamicExecution?.memory_trace?.[String(step.line_number)];
  
  return (
    <div 
      onClick={() => {
        if (step.filepath) {
          onSelectFileAndLine?.(step.filepath, step.line_number);
        } else {
          onSelectLine?.(step.line_number);
        }
      }}
      style={{ 
        display: 'flex', gap: 0, cursor: 'pointer',
        background: isCovered ? 'rgba(255,255,255,0.03)' : 'transparent',
        opacity: step.risk === 'safe' ? 0.7 : 1
      }}
    >
      {/* Timeline line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '32px', flexShrink: 0 }}>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, marginTop: '14px',
          background: meta.color,
          boxShadow: isImportant ? `0 0 8px ${meta.color}` : 'none',
        }} />
        {!isLast && <div style={{ width: '2px', flex: 1, background: '#1f2937', marginTop: '2px' }} />}
      </div>

      {/* Content */}
      <div style={{
        flex: 1, margin: '6px 10px 6px 0',
        background: isImportant ? meta.bg : 'transparent',
        borderRadius: '8px',
        border: isImportant ? `1px solid ${meta.color}22` : '1px solid transparent',
        padding: isImportant ? '8px 12px' : '4px 8px',
        transition: 'background 0.15s',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px' }}>{meta.icon}</span>
          <span style={{
            fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '3px',
            color: meta.color, background: `${meta.color}22`, letterSpacing: '0.5px',
          }}>
            {meta.label}
          </span>
          {step.func_name && (
            <span style={{
              fontSize: '10px', fontWeight: '600', color: '#a78bfa',
              background: 'rgba(167, 139, 250, 0.08)', padding: '1px 6px', borderRadius: '4px',
              fontFamily: 'monospace'
            }}>
              {step.filepath?.split(/[\\/]/).pop()} :: {step.func_name}()
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#374151', fontFamily: 'monospace' }}>
            línea {step.line_number}
          </span>
        </div>

        {/* Code snippet */}
        <div style={{
          fontFamily: "'Fira Code', 'Cascadia Code', monospace",
          fontSize: '12px',
          color: step.type === 'SINK' ? '#fca5a5' : step.type === 'CAPTURE' ? '#93c5fd' : step.type === 'SANITIZE' ? '#6ee7b7' : '#d1d5db',
          background: '#0a0c14',
          padding: '6px 10px',
          borderRadius: '4px',
          marginBottom: step.annotation ? '6px' : '0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {step.raw_code.trim()}
        </div>

        {/* Payload Mutation (Visual PDB) */}
        {step.payload_in !== null && step.payload_in !== undefined && step.payload_out !== null && step.payload_out !== undefined && (
          <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <div style={{ fontSize: '10px', color: '#818cf8', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>
              🔬 Mutación de Estado
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '2px' }}>Input (Antes):</div>
                <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#e5e7eb', background: '#0a0c14', padding: '4px 6px', borderRadius: '4px', wordBreak: 'break-all' }}>
                  {step.payload_in}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '2px' }}>Output (Después):</div>
                <div style={{ 
                  fontFamily: 'monospace', fontSize: '11px', 
                  color: step.payload_in !== step.payload_out ? '#10b981' : '#9ca3af', 
                  background: '#0a0c14', padding: '4px 6px', borderRadius: '4px', 
                  wordBreak: 'break-all', 
                  border: step.payload_in !== step.payload_out ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent' 
                }}>
                  {step.payload_out}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Annotation */}
        {step.annotation && (
          <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.4', marginBottom: '4px' }}>
            {step.annotation}
          </div>
        )}

        {/* Tainted / Sanitized variable states */}
        {((step.tainted_vars && step.tainted_vars.length > 0) || (step.sanitized_vars && step.sanitized_vars.length > 0)) && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px', marginBottom: '6px' }}>
            {step.tainted_vars && step.tainted_vars.map(v => (
              <span key={v} style={{
                fontSize: '10px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px',
                background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px'
              }}>
                💀 {v}
              </span>
            ))}
            {step.sanitized_vars && step.sanitized_vars.map(v => (
              <span key={v} style={{
                fontSize: '10px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px',
                background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#6ee7b7', display: 'inline-flex', alignItems: 'center', gap: '4px'
              }}>
                🛡️ {v}
              </span>
            ))}
          </div>
        )}

        {/* Memory Trace (DAST) */}
        {memoryTrace && Object.keys(memoryTrace).length > 0 && (
          <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(52, 211, 153, 0.05)', borderRadius: '6px', border: '1px dashed rgba(52, 211, 153, 0.3)' }}>
            <div style={{ fontSize: '9px', color: '#10b981', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>
              🧠 Memoria Real (Locals)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', fontSize: '10px', fontFamily: 'monospace' }}>
              {Object.entries(memoryTrace).map(([k, v]) => (
                <React.Fragment key={k}>
                  <div style={{ color: '#9ca3af', textAlign: 'right' }}>{k}:</div>
                  <div style={{ color: '#d1d5db', wordBreak: 'break-all' }}>{v}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* External call target */}
        {step.type === 'EXTERNAL_CALL' && step.external_call && (
          <div style={{ marginTop: '8px' }}>
            {step.external_call.targets?.map((target, i) => (
              <button
                key={i}
                onClick={() => onNavigate?.(target)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  marginRight: '6px', marginTop: '4px',
                  padding: '4px 10px', borderRadius: '5px',
                  background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)',
                  color: '#c4b5fd', cursor: 'pointer', fontSize: '11px', fontWeight: '600',
                }}
              >
                <ArrowRight size={10} />
                {typeof target === 'string' ? target.split('::').pop() + '()' : JSON.stringify(target)}
                <ExternalLink size={9} />
              </button>
            ))}
            {(!step.external_call.targets || step.external_call.targets.length === 0) && (
              <span style={{ fontSize: '11px', color: '#4b5563' }}>
                → {step.external_call.name}() (función no rastreada en el proyecto)
              </span>
            )}
          </div>
        )}

        {/* Sink risk badge */}
        {step.type === 'SINK' && (
          <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
              background: step.risk === 'mitigated' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
              color: step.risk === 'mitigated' ? '#fcd34d' : '#fca5a5',
              fontWeight: '700',
            }}>
              {step.risk === 'mitigated' ? '⚠️ POSIBLEMENTE MITIGADO' : '🚨 INPUT PODRÍA LLEGAR AQUÍ'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function DataFlowInspector({
  nodeId,
  directory,
  simulatedSteps,
  useGlobalFlow,
  setUseGlobalFlow,
  onNavigate,
  onSelectLine,
  onSelectFileAndLine,
  preloadedData
}) {
  const [data, setData] = useState(preloadedData || null);
  const [loading, setLoading] = useState(!preloadedData);
  const [error, setError] = useState('');
  const [lastNodeId, setLastNodeId] = useState('');

  React.useEffect(() => {
    if (preloadedData) {
      setData(preloadedData);
      setLoading(false);
      setError('');
    }
  }, [preloadedData]);

  const analyze = async (id) => {
    if (!id || !directory) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('http://127.0.0.1:8000/api/analyze/dataflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: id, directory }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); setData(null); }
      else { setData(json); setLastNodeId(id); }
    } catch (e) {
      setError(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Auto-analyze when nodeId changes
  useEffect(() => {
    if (nodeId && nodeId !== lastNodeId && nodeId.includes('::')) {
      analyze(nodeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, directory]);

  const showGlobal = useGlobalFlow && simulatedSteps && simulatedSteps.length > 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '12px', color: '#6b7280' }}>
        <div style={{ fontSize: '32px', animation: 'spin 1s linear infinite' }}>⚙️</div>
        <div style={{ fontSize: '13px' }}>Analizando flujo de datos...</div>
      </div>
    );
  }

  if (error && !showGlobal) {
    return (
      <div style={{ padding: '24px', color: '#f87171', fontSize: '13px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
        {error}
      </div>
    );
  }

  if (!showGlobal && (!nodeId || !nodeId.includes('::'))) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '16px', padding: '32px' }}>
        <div style={{ fontSize: '40px' }}>🔍</div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#9ca3af', fontWeight: '600', marginBottom: '8px' }}>Data Flow Inspector</p>
          <p style={{ fontSize: '12px', color: '#4b5563', lineHeight: '1.6' }}>
            Haz clic derecho en una <strong style={{ color: '#6b7280' }}>función</strong> del grafo<br />
            y selecciona <strong style={{ color: '#a78bfa' }}>🔍 Rastrear Flujo de Datos</strong><br />
            para ver el ciclo de vida del input línea a línea.
          </p>
        </div>
        <div style={{ background: '#1a1d27', borderRadius: '8px', padding: '14px', border: '1px solid #1f2937', maxWidth: '280px', width: '100%' }}>
          <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px', fontWeight: '600' }}>¿Qué verás?</p>
          {[
            ['📥', 'Captura', 'Dónde entra el dato externo'],
            ['🔄', 'Transform', 'Qué modificaciones recibe'],
            ['🛡️', 'Sanitiza', 'Si hay filtros de seguridad'],
            ['🔗', 'Llama', 'A qué función/archivo va'],
            ['🚨', 'Sink', 'Si llega a destino peligroso'],
          ].map(([icon, name, desc]) => (
            <div key={name} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '12px', flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: '11px', color: '#6b7280' }}><strong style={{ color: '#9ca3af' }}>{name}:</strong> {desc}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!showGlobal && !data) return null;

  const allSteps = showGlobal ? simulatedSteps : data.steps;

  const summaryToShow = showGlobal ? {
    risk_level: simulatedSteps.some(s => s.type === 'SINK' && s.risk !== 'mitigated') ? 'critical' : 'none',
    has_external_input: simulatedSteps.some(s => s.type === 'CAPTURE'),
    has_dangerous_sink: simulatedSteps.some(s => s.type === 'SINK'),
    has_sanitization: simulatedSteps.some(s => s.type === 'SANITIZE'),
    has_external_calls: simulatedSteps.some(s => s.type === 'EXTERNAL_CALL'),
    sink_count: simulatedSteps.filter(s => s.type === 'SINK').length
  } : data.summary;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 0', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#10b981', fontWeight: '700' }}>
            {showGlobal ? '🌍 Trazado Global del Input' : `ƒ ${data.func_name}()`}
          </span>
          <span style={{ fontSize: '11px', color: '#4b5563' }}>
            {showGlobal 
              ? `${simulatedSteps.length} pasos en múltiples archivos` 
              : `en ${data.filepath?.split(/[\\/]/).pop() || 'archivo'} · líneas ${data.start_line || '?'}–${data.end_line || '?'}`
            }
          </span>
        </div>

        {/* Global/Local Toggle Selector */}
        {simulatedSteps && (
          <div style={{
            display: 'flex', background: '#090b11', padding: '3px', borderRadius: '6px',
            border: '1px solid #1f2937', marginBottom: '10px', width: 'fit-content'
          }}>
            <button
              onClick={() => setUseGlobalFlow(true)}
              style={{
                padding: '4px 10px', fontSize: '11px', fontWeight: '600', border: 'none',
                borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s',
                background: useGlobalFlow ? '#374151' : 'transparent',
                color: useGlobalFlow ? '#f3f4f6' : '#6b7280'
              }}
            >
              🌍 Rastro Global
            </button>
            <button
              onClick={() => setUseGlobalFlow(false)}
              disabled={!nodeId}
              style={{
                padding: '4px 10px', fontSize: '11px', fontWeight: '600', border: 'none',
                borderRadius: '4px', cursor: !nodeId ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                background: !useGlobalFlow ? '#374151' : 'transparent',
                color: !useGlobalFlow ? '#f3f4f6' : '#6b7280',
                opacity: !nodeId ? 0.4 : 1
              }}
            >
              ƒ Función Seleccionada
            </button>
          </div>
        )}

        {data.dynamic_execution && (
          <div style={{ marginTop: '10px', marginBottom: '10px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(251, 191, 36, 0.3)', background: 'rgba(251, 191, 36, 0.05)' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#fbbf24', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⚡</span> Resultado de Ejecución Real (Sandbox)
            </div>
            {data.dynamic_execution.success ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '13px', color: '#f3f4f6', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  <span style={{ color: '#9ca3af' }}>Retornó: </span> 
                  <span style={{ color: data.dynamic_execution.result === 'True' ? '#10b981' : data.dynamic_execution.result === 'False' ? '#ef4444' : '#60a5fa' }}>
                    {data.dynamic_execution.result}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>Tipo devuelto: {data.dynamic_execution.type}</div>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#ef4444', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                <span style={{ fontWeight: '600' }}>Excepción lanzada: </span> {data.dynamic_execution.error}
              </div>
            )}
          </div>
        )}

        <RiskBanner summary={summaryToShow} />
        <div style={{ fontSize: '11px', color: '#374151', paddingBottom: '10px' }}>
          {allSteps.length} instrucciones analizadas
        </div>
      </div>

      {/* Steps timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px 12px 14px' }}>
        
        {/* Intercepted Mocks Alert */}
        {data.dynamic_execution?.intercepted && data.dynamic_execution.intercepted.length > 0 && (
          <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#f87171', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🛡️</span> {data.dynamic_execution.intercepted.length} Llamadas Peligrosas Interceptadas
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.dynamic_execution.intercepted.map((call, idx) => (
                <div key={idx} style={{ fontSize: '11px', fontFamily: 'monospace', color: '#d1d5db', background: '#0a0c14', padding: '6px', borderRadius: '4px' }}>
                  <span style={{ color: '#fca5a5' }}>{call.module}</span>(
                  <span style={{ color: '#a78bfa' }}>{call.args.join(', ')}</span>)
                </div>
              ))}
            </div>
          </div>
        )}

        {allSteps.map((step, i) => (
          <StepRow
            key={i}
            step={step}
            isLast={i === allSteps.length - 1}
            onNavigate={onNavigate}
            onSelectLine={onSelectLine}
            onSelectFileAndLine={onSelectFileAndLine}
            dynamicExecution={data.dynamic_execution}
          />
        ))}

        {allSteps.length === 0 && (
          <div style={{ textAlign: 'center', color: '#4b5563', fontSize: '13px', padding: '32px' }}>
            No se detectaron instrucciones relevantes en esta función.
          </div>
        )}
      </div>
    </div>
  );
}
