import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';

const EDGE_TYPE_META = {
  standard_call: { color: '#6366f1', label: 'llama a',       badge: 'CALL',   bg: 'rgba(99,102,241,0.15)' },
  hybrid_call:   { color: '#f59e0b', label: 'ejecuta →',     badge: 'HYBRID', bg: 'rgba(245,158,11,0.15)' },
  api_call:      { color: '#a855f7', label: 'fetch/route →', badge: 'API',    bg: 'rgba(168,85,247,0.15)' },
};

function TypeBadge({ type }) {
  const meta = EDGE_TYPE_META[type] || { color: '#6b7280', label: type, badge: type.toUpperCase(), bg: 'rgba(107,114,128,0.15)' };
  return (
    <span style={{
      fontSize: '9px', fontWeight: '700', padding: '2px 5px', borderRadius: '3px',
      color: meta.color, background: meta.bg, letterSpacing: '0.5px', flexShrink: 0,
    }}>
      {meta.badge}
    </span>
  );
}

function basename(path) {
  return path?.split(/[\\/]/).pop() ?? path;
}

export function ConnectionExplorer({ nodes, edges, onSelectNode, onSelectFile, onAiExplain, onDataFlowInspect, onSandboxTest }) {
  const [expandedFiles, setExpandedFiles] = useState(new Set());
  const [expandedFunctions, setExpandedFunctions] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState('tree'); // 'tree' or 'matrix'
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleContextMenu = (e, nodeId) => {
    e.preventDefault();
    setMenu({ id: nodeId, top: e.clientY, left: e.clientX });
  };

  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const matrixConnections = useMemo(() => {
    return edges.map(e => {
      const srcNode = nodeById.get(e.source);
      const tgtNode = nodeById.get(e.target);
      return {
        ...e,
        srcNode,
        tgtNode,
      };
    });
  }, [edges, nodeById]);

  const filteredMatrix = useMemo(() => {
    if (!filter.trim()) return matrixConnections;
    const q = filter.toLowerCase();
    return matrixConnections.filter(c => {
      const srcMatch = c.srcNode?.label?.toLowerCase().includes(q) || basename(c.source).toLowerCase().includes(q);
      const tgtMatch = c.tgtNode?.label?.toLowerCase().includes(q) || basename(c.target).toLowerCase().includes(q);
      const codeMatch = c.line_code?.toLowerCase().includes(q) || c.label?.toLowerCase().includes(q);
      return srcMatch || tgtMatch || codeMatch;
    });
  }, [matrixConnections, filter]);

  const toggleFile = (id) => setExpandedFiles(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const toggleFn = (id) => setExpandedFunctions(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  // Build structured map: file → functions → outgoing edges
  const structure = useMemo(() => {
    const fileNodes = nodes.filter(n => n.type === 'file');
    const fnNodes   = nodes.filter(n => n.type !== 'file');
    const nodeById  = new Map(nodes.map(n => [n.id, n]));

    return fileNodes.map(file => {
      // Direct edges FROM this file node (file-level calls)
      const fileEdges = edges.filter(e => e.source === file.id).map(e => ({
        ...e,
        targetNode: nodeById.get(e.target),
      }));

      // Functions inside this file
      const fns = fnNodes.filter(fn => fn.parent === file.id).map(fn => {
        const fnEdges = edges.filter(e => e.source === fn.id).map(e => ({
          ...e,
          targetNode: nodeById.get(e.target),
        }));
        return { ...fn, outEdges: fnEdges };
      });

      return { ...file, fns, fileEdges };
    });
  }, [nodes, edges]);

  // Filter logic
  const filtered = useMemo(() => {
    if (!filter.trim()) return structure;
    const q = filter.toLowerCase();
    return structure
      .map(file => {
        const fileMatch = file.label.toLowerCase().includes(q);
        const fns = file.fns.filter(fn =>
          fn.label.toLowerCase().includes(q) ||
          fn.outEdges.some(e => (e.targetNode?.label ?? '').toLowerCase().includes(q) || basename(e.target).toLowerCase().includes(q))
        );
        if (fileMatch || fns.length > 0) return { ...file, fns: fileMatch ? file.fns : fns };
        return null;
      })
      .filter(Boolean);
  }, [structure, filter]);

  if (!nodes || nodes.length === 0) {
    return (
      <div style={{ padding: '32px 20px', textAlign: 'center', color: '#4b5563' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔗</div>
        <p style={{ fontSize: '13px' }}>Escanea un proyecto para ver las conexiones.</p>
      </div>
    );
  }

  const totalConnections = edges.length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Search + summary */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filtrar por archivo o función..."
            style={{
              flex: 1, padding: '6px 10px', background: '#0f111a', color: '#f3f4f6',
              border: '1px solid #374151', borderRadius: '5px', fontSize: '12px', outline: 'none',
            }}
          />
          {filter && (
            <button onClick={() => setFilter('')} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '16px' }}>✕</button>
          )}
        </div>

        {/* View Mode Toggle */}
        <div style={{ display: 'flex', gap: '4px', background: '#0f111a', padding: '2px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #1f2937' }}>
          <button 
            onClick={() => setViewMode('tree')}
            style={{
              flex: 1, padding: '5px 10px', fontSize: '11px', fontWeight: '600',
              background: viewMode === 'tree' ? '#1a1d27' : 'transparent',
              color: viewMode === 'tree' ? '#f3f4f6' : '#6b7280',
              border: 'none', borderRadius: '4px', cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            🌳 Vista de Árbol
          </button>
          <button 
            onClick={() => setViewMode('matrix')}
            style={{
              flex: 1, padding: '5px 10px', fontSize: '11px', fontWeight: '600',
              background: viewMode === 'matrix' ? '#1a1d27' : 'transparent',
              color: viewMode === 'matrix' ? '#f3f4f6' : '#6b7280',
              border: 'none', borderRadius: '4px', cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            📊 Matriz de Relaciones
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {[
            { label: 'Archivos', value: nodes.filter(n => n.type === 'file').length, color: '#60a5fa' },
            { label: 'Funciones', value: nodes.filter(n => n.type !== 'file').length, color: '#34d399' },
            { label: 'Conexiones', value: totalConnections, color: '#a78bfa' },
          ].map(s => (
            <div key={s.label} style={{ fontSize: '11px', color: '#6b7280' }}>
              <span style={{ color: s.color, fontWeight: '700', marginRight: '3px' }}>{s.value}</span>
              {s.label}
            </div>
          ))}
        </div>
      </div>

      {/* Edge type legend mini */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1f2937', display: 'flex', gap: '10px', flexShrink: 0 }}>
        {Object.entries(EDGE_TYPE_META).map(([type, meta]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '14px', height: '2px', background: meta.color }} />
            <span style={{ fontSize: '10px', color: '#6b7280' }}>{meta.badge}</span>
          </div>
        ))}
        <span style={{ fontSize: '10px', color: '#374151', marginLeft: 'auto' }}>Tipo de llamada</span>
      </div>

      {/* Connection List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {viewMode === 'tree' ? (
          <>
            {filtered.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#4b5563', fontSize: '13px' }}>
                No hay resultados para "{filter}"
              </div>
            )}

        {filtered.map(file => {
          const isOpen = expandedFiles.has(file.id);
          const totalOut = file.fileEdges.length + file.fns.reduce((acc, fn) => acc + fn.outEdges.length, 0);

          return (
            <div key={file.id} style={{ borderBottom: '1px solid #111827' }}>
              {/* File row */}
              <button
                onClick={() => { toggleFile(file.id); onSelectFile?.(file.id); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '9px 14px', background: isOpen ? 'rgba(99,102,241,0.06)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                }}
              >
                {isOpen ? <ChevronDown size={13} color="#6b7280" /> : <ChevronRight size={13} color="#6b7280" />}
                <span style={{ fontSize: '14px' }}>
                  {file.language === 'python' ? '🐍' : file.language === 'php' ? '🐘' : '🟨'}
                </span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#f3f4f6', flex: 1 }}>
                  {file.label}
                </span>
                <span style={{
                  fontSize: '10px', padding: '2px 7px', borderRadius: '10px',
                  background: totalOut > 0 ? 'rgba(99,102,241,0.15)' : '#1f2937',
                  color: totalOut > 0 ? '#a5b4fc' : '#4b5563',
                }}>
                  {totalOut} {totalOut === 1 ? 'conexión' : 'conexiones'}
                </span>
              </button>

              {isOpen && (
                <div style={{ borderTop: '1px solid #1a1a2e' }}>
                  {/* File-level edges (e.g. file calls another file) */}
                  {file.fileEdges.map((edge, i) => (
                    <EdgeRow key={i} edge={edge} indent={1} onSelectNode={onSelectNode} onContextMenu={handleContextMenu} />
                  ))}

                  {/* Functions */}
                  {file.fns.length === 0 && file.fileEdges.length === 0 && (
                    <div style={{ padding: '10px 14px 10px 36px', fontSize: '12px', color: '#374151', fontStyle: 'italic' }}>
                      Sin conexiones salientes detectadas
                    </div>
                  )}

                  {file.fns.map(fn => {
                    const fnOpen = expandedFunctions.has(fn.id);
                    return (
                      <div key={fn.id}>
                        {/* Function row */}
                        <button
                          onClick={() => { toggleFn(fn.id); onSelectNode?.(fn.id); }}
                          onContextMenu={(e) => handleContextMenu(e, fn.id)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '7px 14px 7px 28px',
                            background: fnOpen ? 'rgba(52,211,153,0.05)' : 'transparent',
                            border: 'none', cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          {fn.outEdges.length > 0
                            ? (fnOpen ? <ChevronDown size={12} color="#4b5563" /> : <ChevronRight size={12} color="#4b5563" />)
                            : <span style={{ width: '12px' }} />
                          }
                          <span style={{ fontSize: '12px', color: '#34d399', fontFamily: 'monospace', fontWeight: '600' }}>
                            ƒ {fn.label}()
                          </span>
                          {fn.line_number && (
                            <span style={{ fontSize: '10px', color: '#374151' }}>línea {fn.line_number}</span>
                          )}
                          <span style={{ marginLeft: 'auto', fontSize: '10px', color: fn.outEdges.length > 0 ? '#6366f1' : '#374151' }}>
                            {fn.outEdges.length > 0 ? `→ ${fn.outEdges.length} llamada${fn.outEdges.length > 1 ? 's' : ''}` : 'sin llamadas'}
                          </span>
                        </button>

                        {/* Function's outgoing edges */}
                        {fnOpen && fn.outEdges.map((edge, i) => (
                          <EdgeRow key={i} edge={edge} indent={2} onSelectNode={onSelectNode} onContextMenu={handleContextMenu} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </>
    ) : (
        <>
          {filteredMatrix.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: '#4b5563', fontSize: '13px' }}>
              No hay conexiones para "{filter}"
            </div>
          )}
          {filteredMatrix.map((conn, idx) => (
            <MatrixRow
              key={idx}
              conn={conn}
              onSelect={(c) => onSelectNode?.(c.source, c.line_number)}
              onContextMenu={(e, id) => handleContextMenu(e, id)}
            />
          ))}
        </>
      )}
      </div>

      {menu && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menu.top,
            left: menu.left,
            background: '#111827',
            border: '1px solid #374151',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
            zIndex: 9999,
            padding: '6px 0',
            minWidth: '220px',
          }}
        >
          <div style={{ padding: '6px 16px', fontSize: '11px', color: '#6b7280', borderBottom: '1px solid #374151', marginBottom: '4px' }}>
            {menu.id.split('::')[1] || menu.id.split(/[\\/]/).pop()}
          </div>
          <button className="ctx-menu-item" onClick={() => { onAiExplain?.(menu.id); setMenu(null); }}>
            🪄 Explicar Lógica (IA)
          </button>
          {menu.id.includes('::') && (
            <>
              <button className="ctx-menu-item" onClick={() => { onDataFlowInspect?.(menu.id); setMenu(null); }}>
                🔍 Rastrear Flujo de Datos
              </button>
              <button className="ctx-menu-item" onClick={() => { onSandboxTest?.(menu.id); setMenu(null); }}>
                🧪 Inyectar Sandbox (Unit Test)
              </button>
            </>
          )}
          <button className="ctx-menu-item" onClick={() => { setMenu(null); alert(`Nodo enviado al escáner:\n${menu.id}`); }}>
            🐞 Mandar a Escáner de Vulnerabilidades
          </button>
          <button className="ctx-menu-item" onClick={() => { setMenu(null); alert(`Añadido al Reporte:\n${menu.id}`); }}>
            📝 Añadir al Reporte Final
          </button>
        </div>
      )}
    </div>
  );
}

function EdgeRow({ edge, indent, onSelectNode, onContextMenu }) {
  const meta = EDGE_TYPE_META[edge.type] || EDGE_TYPE_META.standard_call;
  const target = edge.targetNode;
  const targetLabel = target
    ? (target.type === 'file' ? `📄 ${target.label}` : `ƒ ${target.label}()`)
    : basename(edge.target);

  return (
    <button
      onClick={() => onSelectNode?.(edge.source, edge.line_number)}
      onContextMenu={(e) => onContextMenu?.(e, edge.target)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
        padding: `6px 14px 6px ${indent * 24}px`,
        background: 'transparent', border: 'none', cursor: 'pointer',
        textAlign: 'left', transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Arrow icon */}
      <ArrowRight size={11} color={meta.color} style={{ flexShrink: 0 }} />

      {/* Type badge */}
      <TypeBadge type={edge.type} />

      {/* Target name */}
      <span style={{ fontSize: '12px', color: '#d1d5db', flex: 1, fontFamily: edge.type !== 'standard_call' ? 'monospace' : 'inherit' }}>
        {targetLabel}
      </span>

      {/* Label (e.g. subprocess.run) */}
      {edge.label && edge.label !== 'calls' && (
        <span style={{ fontSize: '10px', color: '#4b5563', fontFamily: 'monospace', flexShrink: 0 }}>
          {edge.label}
        </span>
      )}

      {/* Line number */}
      {edge.line_number && (
        <span style={{ fontSize: '10px', color: '#374151', flexShrink: 0 }}>
          :{edge.line_number}
        </span>
      )}
    </button>
  );
}

function MatrixRow({ conn, onSelect, onContextMenu }) {
  const meta = EDGE_TYPE_META[conn.type] || { color: '#6b7280', label: conn.type, badge: conn.type?.toUpperCase(), bg: 'rgba(107,114,128,0.15)' };
  
  const srcFile = conn.srcNode?.parent ? basename(conn.srcNode.parent) : basename(conn.source);
  const srcFunc = conn.srcNode?.type === 'function' ? `${conn.srcNode.label}()` : '';
  
  const tgtFile = conn.tgtNode?.parent ? basename(conn.tgtNode.parent) : basename(conn.target);
  const tgtFunc = conn.tgtNode?.type === 'function' ? `${conn.tgtNode.label}()` : '';

  return (
    <div 
      onClick={() => onSelect(conn)}
      onContextMenu={(e) => onContextMenu?.(e, conn.target)}
      style={{
        display: 'flex', flexDirection: 'column', gap: '8px',
        padding: '12px 14px', borderBottom: '1px solid #1f2937',
        cursor: 'pointer', transition: 'background-color 0.15s',
        background: '#1a1d27',
      }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#1a1d27'}
    >
      {/* Top line: Source -> Target */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {/* Source */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '500' }}>{srcFile}</span>
          {srcFunc && (
            <span style={{ fontSize: '11px', color: '#60a5fa', fontFamily: 'monospace', fontWeight: '600' }}>
              :: {srcFunc}
            </span>
          )}
        </div>

        <ArrowRight size={12} color="#4b5563" />

        {/* Target */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '500' }}>{tgtFile}</span>
          {tgtFunc && (
            <span style={{ fontSize: '11px', color: '#a78bfa', fontFamily: 'monospace', fontWeight: '600' }}>
              :: {tgtFunc}
            </span>
          )}
        </div>

        {/* Badge & Line Number */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TypeBadge type={conn.type} />
          {conn.line_number && (
            <span style={{ fontSize: '10px', color: '#6b7280', fontFamily: 'monospace' }}>
              L{conn.line_number}
            </span>
          )}
        </div>
      </div>

      {/* Code Snippet Row */}
      {conn.line_code && (
        <div style={{
          fontFamily: "'Fira Code', 'Cascadia Code', monospace",
          fontSize: '11px',
          color: '#d1d5db',
          background: '#0a0c14',
          padding: '6px 10px',
          borderRadius: '4px',
          borderLeft: `2px solid ${meta.color}`,
          overflowX: 'auto',
          whiteSpace: 'pre',
        }}>
          {conn.line_code}
        </div>
      )}
    </div>
  );
}
