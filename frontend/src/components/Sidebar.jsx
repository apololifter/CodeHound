import { useState, useEffect, useRef } from 'react';
import { FolderSearch, Target, Play, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';

function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{
          position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
          background: '#0f111a', color: '#e5e7eb', fontSize: '12px', padding: '8px 12px',
          borderRadius: '6px', border: '1px solid #374151', whiteSpace: 'nowrap',
          zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          maxWidth: '220px', lineHeight: '1.5',
          pointerEvents: 'none',
        }}>
          {text}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            border: '5px solid transparent', borderTopColor: '#374151'
          }} />
        </div>
      )}
    </div>
  );
}

function StepBadge({ number, done }) {
  return (
    <div style={{
      width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '11px', fontWeight: '700',
      background: done ? '#10b981' : '#6366f1',
      color: 'white',
    }}>
      {done ? '✓' : number}
    </div>
  );
}

function Section({ title, icon, step, done, open, onToggle, children, hint }) {
  return (
    <div style={{ marginBottom: '4px' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          background: open ? 'rgba(99,102,241,0.08)' : 'transparent',
          border: 'none', borderRadius: '8px', padding: '10px 10px',
          cursor: 'pointer', color: done ? '#10b981' : '#f3f4f6',
          transition: 'background 0.2s',
        }}
      >
        <StepBadge number={step} done={done} />
        <span style={{ fontSize: '13px', fontWeight: '600', flex: 1, textAlign: 'left' }}>
          {icon} {title}
        </span>
        {open ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
      </button>
      {open && (
        <div style={{ padding: '4px 10px 12px 42px' }}>
          {hint && (
            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px', lineHeight: '1.5' }}>
              {hint}
            </p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ 
  onScanTrigger, 
  loading, 
  error, 
  scanResult, 
  directory, 
  setDirectory,
  globalNodes, 
  discoveredSources = [],
  focusedNodeId, 
  setFocusedNodeId, 
  onSimulate 
}) {
  const [sourceId, setSourceId] = useState('');
  const [payload, setPayload] = useState("' OR 1=1 --");
  const [simLoading, setSimLoading] = useState(false);

  const [openSection, setOpenSection] = useState('scan');

  const functionNodes = globalNodes?.filter(n => n.type !== 'file') ?? [];
  const fileNodes = globalNodes?.filter(n => n.type === 'file') ?? [];
  const hasData = functionNodes.length > 0;

  const toggle = (s) => setOpenSection(prev => prev === s ? null : s);

  const prevHasData = useRef(false);
  useEffect(() => {
    if (hasData && !prevHasData.current) {
      setOpenSection('explore');
    }
    prevHasData.current = hasData;
  }, [hasData]);

  const handleSimulate = async () => {
    if (!sourceId || !directory) return;
    setSimLoading(true);
    await onSimulate(sourceId, payload, directory);
    setSimLoading(false);
  };

  return (
    <div className="sidebar" style={{ padding: '12px 8px', gap: 0 }}>

      {/* Header */}
      <div style={{ padding: '8px 10px 16px', borderBottom: '1px solid #1f2937', marginBottom: '8px' }}>
        <div style={{ fontSize: '15px', fontWeight: '700', color: '#f3f4f6' }}>🔬 Nexus Graph</div>
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>Static Code Analyzer</div>
      </div>

      {/* STEP 1: SCAN */}
      <Section
        step={1} done={hasData} icon="📂" title="Escanear Proyecto"
        open={openSection === 'scan'} onToggle={() => toggle('scan')}
        hint="Escribe la ruta completa a la carpeta de tu proyecto y haz clic en Escanear. El motor analizará todos los archivos Python, PHP y JavaScript automáticamente."
      >
        <div style={{ marginBottom: '8px' }}>
          <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '5px' }}>
            Ruta del proyecto
          </label>
          <input
            type="text"
            value={directory}
            onChange={e => setDirectory(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onScanTrigger(directory)}
            placeholder="C:/mi-proyecto"
            style={{
              width: '100%', padding: '9px 12px', background: '#0f111a', color: '#f3f4f6',
              border: '1px solid #374151', borderRadius: '6px', fontSize: '12px', outline: 'none'
            }}
          />
        </div>

        <button
          className="btn"
          onClick={() => onScanTrigger(directory)}
          disabled={loading || !directory.trim()}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <FolderSearch size={15} />
          {loading ? 'Analizando...' : 'Escanear Proyecto'}
        </button>

        {error && (
          <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)', fontSize: '12px', color: '#fca5a5' }}>
            ❌ {error}
          </div>
        )}

        {scanResult && (
          <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
            {[
              { label: 'Archivos', value: scanResult.files, color: '#60a5fa' },
              { label: 'Funciones', value: scanResult.functions, color: '#34d399' },
              { label: 'Conexiones', value: scanResult.edges, color: '#a78bfa' },
            ].map(s => (
              <div key={s.label} style={{ background: '#0f111a', borderRadius: '6px', padding: '8px', textAlign: 'center', border: '1px solid #1f2937' }}>
                <div style={{ fontSize: '18px', fontWeight: '700', color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* STEP 2: EXPLORE */}
      <Section
        step={2} done={false} icon="🗺️" title="Explorar el Grafo"
        open={openSection === 'explore'} onToggle={() => toggle('explore')}
        hint="El grafo muestra quién llama a quién. Cada caja es un archivo o función. Las flechas indican que uno llama al otro."
      >
        {!hasData ? (
          <p style={{ fontSize: '12px', color: '#4b5563', fontStyle: 'italic' }}>
            Primero escanea un proyecto para ver el grafo.
          </p>
        ) : (
          <>
            {/* Legend */}
            <div style={{ marginBottom: '14px' }}>
              <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Leyenda del grafo</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {[
                  { color: '#34d399', label: '📄 Archivo Python (.py)' },
                  { color: '#60a5fa', label: '📄 Archivo PHP (.php)' },
                  { color: '#fcd34d', label: '📄 Archivo JS (.js)' },
                  { color: '#6366f1', label: '➡ Llamada normal' },
                  { color: '#f59e0b', label: '⤳ Llamada híbrida (entre idiomas)', dashed: true },
                  { color: '#a855f7', label: '🌐 Llamada API fetch/route', dashed: true },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '28px', height: '3px', flexShrink: 0,
                      background: item.color,
                      borderTop: item.dashed ? `2px dashed ${item.color}` : 'none',
                      opacity: item.dashed ? 1 : 1,
                    }} />
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactions guide */}
            <div style={{ background: '#0f111a', borderRadius: '8px', padding: '10px', border: '1px solid #1f2937' }}>
              <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', marginBottom: '8px' }}>¿Cómo interactuar?</p>
              {[
                ['🖱️ Clic en caja', 'Ver el código fuente'],
                ['🔓 Botón + en caja', 'Expandir sus llamadas'],
                ['📁 Ícono carpeta', 'Colapsar/expandir archivo'],
                ['🖱️ Clic derecho', 'Menú: IA, Escáner, Reporte'],
                ['🔍 Rueda del mouse', 'Zoom in/out'],
              ].map(([action, desc]) => (
                <div key={action} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '11px', color: '#6b7280' }}>{action}</span>
                  <span style={{ fontSize: '11px', color: '#d1d5db' }}>{desc}</span>
                </div>
              ))}
            </div>

            {/* Focused tracing */}
            <div style={{ marginTop: '14px' }}>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                <Target size={12} />
                Trazado Focalizado
                <Tooltip text="Filtra el grafo para ver solo las llamadas que salen de una función específica. Útil para rastrear un endpoint.">
                  <HelpCircle size={11} color="#4b5563" style={{ cursor: 'help' }} />
                </Tooltip>
              </label>
              <select
                value={focusedNodeId || ''}
                onChange={e => setFocusedNodeId(e.target.value || null)}
                style={{
                  width: '100%', padding: '8px', background: '#0f111a', color: 'white',
                  border: '1px solid #374151', borderRadius: '6px', fontSize: '12px'
                }}
              >
                <option value="">— Ver Arquitectura Completa —</option>
                {fileNodes.map(n => (
                  <optgroup key={n.id} label={`📄 ${n.label}`}>
                    {functionNodes.filter(fn => fn.parent === n.id).map(fn => (
                      <option key={fn.id} value={fn.id}>  ⤷ {fn.label}()</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p style={{ fontSize: '11px', color: '#4b5563', marginTop: '5px', lineHeight: '1.4' }}>
                Selecciona una función para aislar su flujo de llamadas en el grafo.
              </p>
            </div>
          </>
        )}
      </Section>

      {/* STEP 3: SIMULATE */}
      <Section
        step={3} done={false} icon="🧪" title="Simular Ataque"
        open={openSection === 'simulate'} onToggle={() => toggle('simulate')}
        hint="Elige de dónde entra el dato del atacante (Source) y adónde queremos que llegue (Sink). El motor trazará el camino y te dirá si el payload pasa sin filtros."
      >
        {!hasData ? (
          <p style={{ fontSize: '12px', color: '#4b5563', fontStyle: 'italic' }}>
            Primero escanea un proyecto.
          </p>
        ) : (
          <>
            {/* How it works mini-guide */}
            <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(239,68,68,0.15)', marginBottom: '14px' }}>
              <p style={{ fontSize: '11px', color: '#fca5a5', fontWeight: '600', marginBottom: '6px' }}>¿Cómo funciona?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                  ['Vector', '🎯', 'Punto de entrada detectado automáticamente.'],
                  ['Payload', '💉', 'El dato malicioso a simular.'],
                ].map(([name, emoji, desc]) => (
                  <div key={name} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '12px' }}>{emoji}</span>
                    <div>
                      <span style={{ fontSize: '11px', color: '#f87171', fontWeight: '600' }}>{name}: </span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>{desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Source Auto-Discovery Panel */}
            {discoveredSources && discoveredSources.length > 0 && (
              <div style={{ background: '#0a0c14', borderRadius: '8px', padding: '10px', border: '1px solid #1f2937', marginBottom: '14px' }}>
                <p style={{ fontSize: '11px', color: '#60a5fa', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  🎯 Vectores Detectados ({discoveredSources.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {discoveredSources.map((src, i) => (
                    <button
                      key={i}
                      onClick={() => setSourceId(src.node_id)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                        padding: '6px 10px', background: sourceId === src.node_id ? 'rgba(99,102,241,0.15)' : 'transparent',
                        border: sourceId === src.node_id ? '1px solid #6366f1' : '1px solid #374151',
                        borderRadius: '6px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s'
                      }}
                    >
                      <span style={{ fontSize: '11px', color: '#f3f4f6', fontWeight: '600', fontFamily: 'monospace' }}>
                        {src.label}()
                      </span>
                      <span style={{ fontSize: '10px', color: '#9ca3af', marginTop: '3px' }}>
                        Usa: {src.patterns.join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Source Selection (Fallback) */}
            {(!discoveredSources || discoveredSources.length === 0) && (
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: '#86efac', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                  🟢 Vector Manual (Fallback)
                </label>
                <select
                  value={sourceId}
                  onChange={e => setSourceId(e.target.value)}
                  style={{ width: '100%', padding: '7px', background: '#0f111a', color: '#86efac', border: '1px solid #374151', borderRadius: '6px', fontSize: '12px' }}
                >
                  <option value="">Seleccionar función de entrada...</option>
                  {fileNodes.map(n => (
                    <optgroup key={n.id} label={`📄 ${n.label}`}>
                      {functionNodes.filter(fn => fn.parent === n.id).map(fn => (
                        <option key={fn.id} value={fn.id}>  ⤷ {fn.label}()</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                💉 Payload malicioso
                <Tooltip text="El dato de ataque que vas a inyectar. Ejemplos: SQL Injection, comandos de shell, scripts XSS.">
                  <HelpCircle size={11} color="#4b5563" style={{ cursor: 'help' }} />
                </Tooltip>
              </label>
              <input
                type="text"
                value={payload}
                onChange={e => setPayload(e.target.value)}
                style={{
                  width: '100%', padding: '7px', background: '#0f111a', color: '#f87171',
                  border: '1px solid #374151', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px'
                }}
              />
              {/* Preset payloads */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '5px', flexWrap: 'wrap' }}>
                {["' OR 1=1 --", "; rm -rf /", "<script>alert(1)</script>"].map(p => (
                  <button key={p} onClick={() => setPayload(p)} style={{
                    fontSize: '10px', padding: '2px 6px', background: 'rgba(239,68,68,0.1)',
                    color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px', cursor: 'pointer'
                  }}>
                    {p.length > 15 ? p.slice(0, 14) + '…' : p}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="btn"
              onClick={handleSimulate}
              disabled={simLoading || !sourceId}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: simLoading ? '#374151' : 'linear-gradient(135deg, #ef4444, #b91c1c)',
              }}
            >
              <Play size={14} />
              {simLoading ? 'Simulando...' : '▶ Lanzar Simulación'}
            </button>

            {sourceId && (
              <div style={{ marginTop: '10px', padding: '8px', background: 'rgba(99,102,241,0.08)', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.2)' }}>
                <p style={{ fontSize: '11px', color: '#a5b4fc' }}>
                  El motor analizará todas las rutas posibles hacia adelante desde este punto.
                </p>
              </div>
            )}
          </>
        )}
      </Section>

      {/* Help */}
      <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #1f2937' }}>
        <div style={{ fontSize: '11px', color: '#374151', textAlign: 'center', lineHeight: '1.5' }}>
          Clic derecho en cualquier nodo del grafo<br />para analizar con IA 🪄
        </div>
      </div>
    </div>
  );
}
