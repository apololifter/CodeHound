import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { GraphCanvas } from './components/GraphCanvas';
import { CodeViewer } from './components/CodeViewer';
import { useGraphDerivation } from './hooks/useGraphDerivation';
import { ConnectionExplorer } from './components/ConnectionExplorer';
import { DataFlowInspector } from './components/DataFlowInspector';
import { SequenceDiagram } from './components/SequenceDiagram';
import { SandboxModal } from './components/SandboxModal';
import { SkipBack, SkipForward } from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Rnd } from 'react-rnd';

function formatAiExplanation(text, onSelectLine) {
  if (!text) return null;

  const lines = text.split('\n');
  const rendered = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for "Línea X:" pattern anywhere in the line
    const lineMatch = line.match(/(?:Línea|Linea)\s+(\d+):(.*)/i);
    if (lineMatch) {
      const lineNum = parseInt(lineMatch[1], 10);
      const rest = lineMatch[2];

      // split the rest by "->"
      const arrowParts = rest.split('->');
      let codePart = rest;
      let explanationPart = '';
      if (arrowParts.length > 1) {
        codePart = arrowParts[0];
        explanationPart = arrowParts.slice(1).join('->');
      }

      rendered.push(
        <div 
          key={i} 
          onClick={() => onSelectLine?.(lineNum)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '8px 12px',
            margin: '6px 0',
            borderRadius: '6px',
            background: 'rgba(99, 102, 241, 0.04)',
            borderLeft: '3px solid #6366f1',
            cursor: 'pointer',
            transition: 'background 0.15s, border-left-color 0.15s',
          }}
          className="ai-explanation-line-item"
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
            e.currentTarget.style.borderLeftColor = '#818cf8';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.04)';
            e.currentTarget.style.borderLeftColor = '#6366f1';
          }}
        >
          <span style={{
            fontSize: '10px',
            fontWeight: '700',
            color: '#818cf8',
            background: 'rgba(99, 102, 241, 0.15)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            flexShrink: 0,
            marginTop: '2px'
          }}>
            L{lineNum}
          </span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {codePart.trim() && (
              <code style={{
                fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                fontSize: '12px',
                color: '#e2e8f0',
                background: '#090b11',
                padding: '2px 6px',
                borderRadius: '4px',
                width: 'fit-content',
                wordBreak: 'break-all'
              }}>
                {codePart.trim()}
              </code>
            )}
            {explanationPart && (
              <span style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px', lineHeight: '1.5' }}>
                {explanationPart.trim()}
              </span>
            )}
          </div>
        </div>
      );
      continue;
    }

    // Parse markdown headers
    if (line.startsWith('###') || line.startsWith('##') || line.startsWith('#')) {
      const cleanText = line.replace(/^[#\s]+/, '').replace(/\*\*+/g, '');
      rendered.push(
        <h4 key={i} style={{ 
          color: '#818cf8', 
          fontSize: '14px', 
          fontWeight: '700', 
          marginTop: '18px', 
          marginBottom: '8px',
          borderBottom: '1px solid #1f2937',
          paddingBottom: '6px'
        }}>
          {cleanText}
        </h4>
      );
      continue;
    }

    // Check for bold headers or bullet points with bold text
    const boldHeaderMatch = line.match(/^(\s*[-*]?\s*\d*\.?\s*)\*\*(.*?)\*\*(.*)/);
    if (boldHeaderMatch) {
      const prefix = boldHeaderMatch[1];
      const headerTitle = boldHeaderMatch[2];
      const rest = boldHeaderMatch[3];
      
      const isSection = /^(?:Qué hace|Explicación|Riesgos|Inputs|Recomendación|Parche)/i.test(headerTitle) || prefix.includes('.');
      if (isSection) {
        rendered.push(
          <h4 key={i} style={{ 
            color: '#10b981', 
            fontSize: '14px', 
            fontWeight: '700', 
            marginTop: '18px', 
            marginBottom: '8px',
            borderBottom: '1px solid #1f2937',
            paddingBottom: '6px'
          }}>
            {headerTitle} {rest}
          </h4>
        );
        continue;
      }
    }

    // Default inline markdown formatting
    let temp = line;
    let parts = [];
    let keyIdx = 0;
    
    const regex = /(\*\*.*?\*\*|`.*?`)/g;
    const splitParts = temp.split(regex);
    
    for (let p of splitParts) {
      if (p.startsWith('**') && p.endsWith('**')) {
        parts.push(<strong key={keyIdx++} style={{ color: '#f3f4f6', fontWeight: '600' }}>{p.slice(2, -2)}</strong>);
      } else if (p.startsWith('`') && p.endsWith('`')) {
        parts.push(<code key={keyIdx++} style={{ fontFamily: 'monospace', color: '#f43f5e', background: '#1e1b4b', padding: '1px 4px', borderRadius: '3px', fontSize: '11px' }}>{p.slice(1, -1)}</code>);
      } else {
        parts.push(p);
      }
    }

    rendered.push(
      <div key={i} style={{ minHeight: '18px', margin: '6px 0', fontSize: '13px', color: '#9ca3af', lineHeight: '1.6' }}>
        {parts.length > 0 ? parts : line}
      </div>
    );
  }

  return <div style={{ paddingBottom: '20px' }}>{rendered}</div>;
}

// ─── Welcome Screen shown before any scan ─────────────────────────────────────
function WelcomeScreen() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0f111a', color: '#f3f4f6', gap: '32px', padding: '40px'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🔬</div>
        <h1 style={{ fontSize: '26px', fontWeight: '700', marginBottom: '10px' }}>
          Nexus Graph — Static Analyzer
        </h1>
        <p style={{ fontSize: '15px', color: '#9ca3af', maxWidth: '500px', lineHeight: '1.7' }}>
          Visualiza el flujo de tu código, detecta vulnerabilidades y simula ataques — 
          todo sin ejecutar una sola línea.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', maxWidth: '620px', width: '100%' }}>
        {[
          { icon: '📂', step: '1', title: 'Escanear', desc: 'Apunta a tu carpeta de proyecto en el panel izquierdo y dale a "Escanear Proyecto".' },
          { icon: '🗺️', step: '2', title: 'Explorar', desc: 'Haz clic en los nodos del grafo. Expande funciones con el botón +. Clic derecho para IA.' },
          { icon: '🧪', step: '3', title: 'Simular', desc: 'Elige Source y Sink, lanza el payload y navega el ataque paso a paso con ⏮ ⏭.' },
        ].map(card => (
          <div key={card.step} style={{
            background: '#1a1d27', borderRadius: '12px', padding: '20px',
            border: '1px solid #1f2937', textAlign: 'center'
          }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>{card.icon}</div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '22px', height: '22px', borderRadius: '50%', background: '#6366f1',
              fontSize: '11px', fontWeight: '700', color: 'white', marginBottom: '8px'
            }}>{card.step}</div>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '6px' }}>{card.title}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.5' }}>{card.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#1a1d27', borderRadius: '10px', padding: '16px 24px', border: '1px solid #1f2937', maxWidth: '500px', width: '100%' }}>
        <p style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', lineHeight: '1.6' }}>
          💡 <strong style={{ color: '#9ca3af' }}>Tip:</strong> Después de escanear, el grafo muestra cada archivo como una caja. 
          Las flechas indican qué funciones llaman a otras. Expande los archivos con el ícono 📁 para ver las funciones internas.
        </p>
      </div>
      
    </div>
  );
}

// ─── Graph Legend Overlay ──────────────────────────────────────────────────────
function GraphLegend() {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 20 }}>
      <button
        onClick={() => setVisible(v => !v)}
        style={{
          background: '#1a1d27', border: '1px solid #374151', color: '#9ca3af',
          padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}
      >
        {visible ? '✕ Cerrar' : '📖 Leyenda'}
      </button>
      {visible && (
        <div style={{
          position: 'absolute', top: '36px', right: '0', background: '#1a1d27',
          border: '1px solid #374151', borderRadius: '10px', padding: '16px',
          minWidth: '240px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#f3f4f6', marginBottom: '12px' }}>Leyenda del Grafo</p>

          <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nodos (Cajas)</p>
          {[
            { color: '#34d399', label: 'Python (.py)' },
            { color: '#60a5fa', label: 'PHP (.php)' },
            { color: '#fcd34d', label: 'JavaScript (.js)' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: item.color, flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: '#d1d5db' }}>{item.label}</span>
            </div>
          ))}

          <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px', marginTop: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Flechas (Conexiones)</p>
          {[
            { color: '#6366f1', label: 'Llamada normal', dashed: false },
            { color: '#f59e0b', label: 'Llamada entre lenguajes', dashed: true },
            { color: '#a855f7', label: 'API fetch ↔ route', dashed: true },
            { color: '#ef4444', label: 'Ruta infectada (tainted)', dashed: false },
            { color: '#10b981', label: 'Ruta sanitizada (safe)', dashed: false },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
              <div style={{
                width: '28px', height: '2px', flexShrink: 0, background: item.color,
                borderTop: item.dashed ? `2px dashed ${item.color}` : 'none',
                backgroundImage: item.dashed ? 'none' : undefined,
              }} />
              <span style={{ fontSize: '12px', color: '#d1d5db' }}>{item.label}</span>
            </div>
          ))}

          <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px', marginTop: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Interacciones</p>
          {[
            ['🖱️ Clic', 'Ver código fuente'],
            ['🖱️ Clic derecho', 'Menú IA / Reporte'],
            ['➕ Botón', 'Expandir llamadas'],
            ['📁 Ícono', 'Colapsar archivo'],
          ].map(([action, desc]) => (
            <div key={action} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>{action}</span>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>{desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [globalData, setGlobalData] = useState({ nodes: [], edges: [], discovered_sources: [] });
  const [directory, setDirectory] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [layoutMode, setLayoutMode] = useState('hierarchical');

  const [isScanLoading, setIsScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanResult, setScanResult] = useState(null);
  
  const [sandboxNodeId, setSandboxNodeId] = useState(null);
  const [sandboxData, setSandboxData] = useState(null);

  const [selectedFilepath, setSelectedFilepath] = useState(null);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [collapsedFiles, setCollapsedFiles] = useState(new Set());

  const [activeTab, setActiveTab] = useState('connections');
  const [aiExplanation, setAiExplanation] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [highlightLine, setHighlightLine] = useState(null);
  const [dataFlowNodeId, setDataFlowNodeId] = useState(null); // node being inspected in DataFlow tab
  const [showAiHud, setShowAiHud] = useState(false);

  const [simulatedEdges, setSimulatedEdges] = useState({});
  const [inactiveNodes, setInactiveNodes] = useState([]);
  const [tracePath, setTracePath] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [vulnAlert, setVulnAlert] = useState(null);
  const [simulatedDataFlow, setSimulatedDataFlow] = useState(null);
  const [useGlobalFlow, setUseGlobalFlow] = useState(true);

  const handleScanComplete = (data, dir) => {
    setGlobalData(data);
    setDirectory(dir);
    setHasScanned(true);
    const allFiles = new Set(data.nodes.filter(n => n.type === 'file').map(n => n.id));
    setCollapsedFiles(allFiles);
    setFocusedNodeId(null);
    setExpandedNodes(new Set());
    clearSimulation();
    setActiveTab('connections'); // Show connections tree immediately after scan
  };

  const handleScan = async (dirPath) => {
    if (!dirPath.trim()) return;
    setIsScanLoading(true);
    setScanError('');
    setScanResult(null);
    setDirectory(dirPath.trim());
    try {
      const res = await fetch('http://127.0.0.1:8000/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: dirPath.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      const result = {
        files: data.nodes.filter(n => n.type === 'file').length,
        functions: data.nodes.filter(n => n.type !== 'file').length,
        edges: data.edges.length
      };
      setScanResult(result);
      setTimeout(() => {
        handleScanComplete(data, dirPath.trim());
        setIsScanLoading(false);
      }, 800);
    } catch (err) {
      setScanError(err.message);
      setIsScanLoading(false);
    }
  };

  const handleSimulate = async (sourceId, payload, scanDir) => {
    setVulnAlert(null);
    setCurrentStepIndex(-1);
    setTracePath([]);
    setSimulatedEdges({});
    setSandboxData(null);
    setSimulatedDataFlow(null);
    setUseGlobalFlow(false);
    setCurrentStepIndex(-1);
    setHighlightLine(null);
    setVulnAlert(null);
    setHighlightedNodeId(null);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/simulate/taint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId, payload, directory: scanDir || directory }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSimulatedEdges(data.simulated_edges || {});
        setInactiveNodes(data.inactive_nodes || []);
        setTracePath(data.trace_path || []);
        setSimulatedDataFlow(data.interprocedural_dataflow || null);
        setUseGlobalFlow(true);
        setCurrentStepIndex(-1);
        setVulnAlert({
          type: data.is_safe ? 'safe' : 'danger',
          message: data.is_safe 
            ? '🛡️ El payload fue neutralizado por sanitización en todas las rutas al Sink.' 
            : '🚨 ¡Vulnerabilidad Confirmada! El payload alcanzó un Sink sin ser filtrado.'
        });
        setLayoutMode('attack_path');
        setActiveTab('dataflow');
      } else if (data.status === 'no_path') {
        setVulnAlert({ message: 'ℹ️ El vector seleccionado no llama a ninguna función (Sin rutas).', type: 'warn' });
      } else {
        setVulnAlert({ message: `⚠️ Error del backend: ${JSON.stringify(data)}`, type: 'warn' });
      }
    } catch (e) {
      setVulnAlert({ type: 'warning', message: 'Error de red en la simulación: ' + e.message });
    }
  };

  const handleSandboxSimulate = async (nodeId, targetParam, payload) => {
    setSandboxNodeId(null);
    setVulnAlert(null);
    setCurrentStepIndex(-1);
    setTracePath([{ type: 'node', id: nodeId }]);
    setSimulatedEdges({});

    try {
      const res = await fetch('http://127.0.0.1:8000/api/simulate/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: nodeId,
          directory,
          target_param: targetParam,
          payload
        })
      });
      const resData = await res.json();
      if (resData.status === 'success' && resData.dataflow) {
        setSandboxData(resData.dataflow);
        setDataFlowNodeId(nodeId);
        setActiveTab('dataflow');
      } else {
        setVulnAlert({ type: 'danger', message: 'Error en la simulación del Sandbox' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSandboxTest = (nodeId) => {
    setSandboxNodeId(nodeId);
  };

  const clearSimulation = () => {
    setSimulatedEdges({});
    setInactiveNodes([]);
    setTracePath([]);
    setSimulatedDataFlow(null);
    setUseGlobalFlow(false);
    setCurrentStepIndex(-1);
    setHighlightLine(null);
    setVulnAlert(null);
    setHighlightedNodeId(null);
  };

  const handleSelectNode = (nodeId, customLine) => {
    const n = globalData.nodes.find(x => x.id === nodeId);
    if (n) {
      setSelectedFilepath(n.parent || n.id);
      setHighlightLine(customLine || n.line_number || null);
    }
  };

  const handleAiExplain = async (nodeId) => {
    setShowAiHud(true);
    setIsAiLoading(true);
    setAiExplanation('Analizando con IA...');
    try {
      const res = await fetch('http://127.0.0.1:8000/api/ai/explain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nodeId }),
      });
      const data = await res.json();
      setAiExplanation(data.explanation || 'Sin análisis disponible.');
    } catch (err) {
      setAiExplanation(`Error: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleDataFlowInspect = (nodeId) => {
    setDataFlowNodeId(nodeId);
    setSandboxData(null);
    setActiveTab('dataflow');
  };

  const handleSelectFileAndLine = (filepath, line) => {
    if (filepath) setSelectedFilepath(filepath);
    if (line) setHighlightLine(line);
  };

  const handleNextStep = () => {
    if (currentStepIndex >= tracePath.length - 1) return;
    const nextIdx = currentStepIndex + 1;
    setCurrentStepIndex(nextIdx);
    jumpToItem(tracePath[nextIdx]);
  };

  const handlePrevStep = () => {
    if (currentStepIndex <= -1) return;
    const prevIdx = currentStepIndex - 1;
    setCurrentStepIndex(prevIdx);
    if (prevIdx >= 0) jumpToItem(tracePath[prevIdx]);
  };

  const jumpToItem = (item) => {
    let filepath = null, line = null;
    if (item.type === 'node') {
      const n = globalData.nodes.find(n => n.id === item.id);
      if (n) { filepath = n.parent || n.id; line = n.line_number || 1; }
    } else if (item.type === 'edge') {
      const e = globalData.edges.find(e => e.id === item.id);
      if (e) {
        const src = globalData.nodes.find(n => n.id === e.source);
        if (src) { filepath = src.parent || src.id; line = e.line_number || src.line_number || 1; }
      }
    }
    if (filepath) { setSelectedFilepath(filepath); }
    if (line) setHighlightLine(line);
  };

  const handleSaveCode = async (filepath, content) => {
    try {
      await fetch('http://127.0.0.1:8000/api/save_file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath, content }),
      });
      if (directory) {
        const res = await fetch('http://127.0.0.1:8000/api/scan', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directory }),
        });
        const data = await res.json();
        handleScanComplete(data, directory);
        setSelectedFilepath(filepath);
      }
    } catch (e) { console.error('Hot-Reload error:', e); }
  };

  const { visibleNodes, visibleEdges } = useGraphDerivation(
    globalData.nodes, globalData.edges, focusedNodeId, expandedNodes,
    collapsedFiles, simulatedEdges, inactiveNodes, tracePath, currentStepIndex,
    selectedFilepath, layoutMode
  );

  const hasSimulation = tracePath.length > 0;
  const isFinalDanger = currentStepIndex === tracePath.length - 1 && Object.values(simulatedEdges).includes('tainted');

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>🔬 Nexus Graph — Static Analyzer</span>
          {hasScanned && (
            <span style={{ fontSize: '12px', color: '#4b5563', fontWeight: '400' }}>
              {globalData.nodes.filter(n => n.type === 'file').length} archivos · {globalData.nodes.filter(n => n.type !== 'file').length} funciones
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {hasScanned && (
            <button 
              onClick={() => setShowAiHud(!showAiHud)} 
              style={{ 
                background: showAiHud ? 'rgba(99, 102, 241, 0.2)' : '#374151', 
                color: showAiHud ? '#818cf8' : '#f9fafb', 
                border: `1px solid ${showAiHud ? '#6366f1' : '#4b5563'}`, 
                padding: '6px 14px', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontSize: '12px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s'
              }}
            >
              🪄 Asistente IA
            </button>
          )}
          {hasScanned && (
            <select
              value={layoutMode}
              onChange={(e) => setLayoutMode(e.target.value)}
              style={{
                background: '#1f2937', color: '#f3f4f6', border: '1px solid #4b5563',
                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', outline: 'none'
              }}
            >
              <option value="hierarchical">🌳 Vista Jerárquica</option>
              <option value="force">🌌 Red Orgánica</option>
              <option value="radial">🎯 Vista Radial</option>
              <option value="sequence">⏱️ Diagrama de Secuencia</option>
              {hasSimulation && <option value="attack_path">☠️ Cadena de Explotación</option>}
            </select>
          )}
          {hasSimulation && (
            <button onClick={clearSimulation} style={{ background: '#374151', color: '#f9fafb', border: '1px solid #4b5563', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
              ✕ Limpiar Simulación
            </button>
          )}
        </div>
      </header>

      <div className="main-content">
        {!hasScanned ? (
          <Group direction="horizontal" key="welcome-layout">
            {/* Panel 1: Sidebar */}
            <Panel defaultSize={20} minSize={15} maxSize={30} id="sidebar-panel">
              <Sidebar
                onScanTrigger={handleScan}
                loading={isScanLoading}
                error={scanError}
                scanResult={scanResult}
                directory={directory}
                setDirectory={setDirectory}
                globalNodes={globalData.nodes}
                discoveredSources={globalData.discovered_sources}
                focusedNodeId={focusedNodeId}
                setFocusedNodeId={(id) => { setFocusedNodeId(id); if (id) setExpandedNodes(p => new Set(p).add(id)); }}
                onSimulate={handleSimulate}
                sandboxData={sandboxData}
              />
            </Panel>

            <Separator className="resize-handle-horizontal" />

            {/* Panel 2: Center Panel (Welcome Screen / Loader) */}
            <Panel defaultSize={80} id="center-panel">
              <div className="center-panel" style={{ height: '100%' }}>
                <div className="graph-container" style={{ position: 'relative', height: '100%' }}>
                  {isScanLoading ? (
                    <div style={{
                      flex: 1, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      background: '#0f111a', color: '#f3f4f6', gap: '20px', height: '100%',
                      position: 'relative', zIndex: 10
                    }}>
                      <div style={{
                        width: '48px', height: '48px',
                        border: '4px solid rgba(99, 102, 241, 0.1)',
                        borderTop: '4px solid #6366f1',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                        boxShadow: '0 0 15px rgba(99, 102, 241, 0.2)'
                      }} />
                      <style dangerouslySetInnerHTML={{__html: `
                        @keyframes spin {
                          0% { transform: rotate(0deg); }
                          100% { transform: rotate(360deg); }
                        }
                      `}} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '15px', fontWeight: '600', color: '#e2e8f0', letterSpacing: '0.5px' }}>
                          Escaneando Proyecto
                        </span>
                        <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>
                          {directory}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <WelcomeScreen />
                  )}
                </div>
              </div>
            </Panel>
          </Group>
        ) : (
          <Group direction="horizontal" key="main-workspace">
            {/* Panel 1: Sidebar */}
            <Panel defaultSize={20} minSize={15} maxSize={30} id="sidebar-panel">
              <Sidebar
                onScanTrigger={handleScan}
                loading={isScanLoading}
                error={scanError}
                scanResult={scanResult}
                directory={directory}
                setDirectory={setDirectory}
                globalNodes={globalData.nodes}
                discoveredSources={globalData.discovered_sources}
                focusedNodeId={focusedNodeId}
                setFocusedNodeId={(id) => { setFocusedNodeId(id); if (id) setExpandedNodes(p => new Set(p).add(id)); }}
                onSimulate={handleSimulate}
                sandboxData={sandboxData}
              />
            </Panel>

            <Separator className="resize-handle-horizontal" />

            {/* Panel 2: Center Panel (Graph Canvas & Time-Travel) */}
            <Panel defaultSize={50} minSize={35} id="center-panel">
              <div className="center-panel">
                {/* Vuln Alert Banner */}
                {vulnAlert && (
                  <div style={{
                    padding: '10px 24px', flexShrink: 0,
                    background: vulnAlert.type === 'danger' ? 'rgba(239,68,68,0.12)' : vulnAlert.type === 'safe' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                    borderBottom: `2px solid ${vulnAlert.type === 'danger' ? '#ef4444' : vulnAlert.type === 'safe' ? '#10b981' : '#f59e0b'}`,
                    color: vulnAlert.type === 'danger' ? '#fca5a5' : vulnAlert.type === 'safe' ? '#6ee7b7' : '#fcd34d',
                    fontSize: '13px', fontWeight: '600',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span>{vulnAlert.message}</span>
                    {hasSimulation && (
                      <span style={{ fontSize: '12px', color: 'inherit', opacity: 0.7 }}>
                        Usa los botones ⏮ ⏭ para explorar la ruta paso a paso
                      </span>
                    )}
                    <button onClick={() => setVulnAlert(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>✕</button>
                  </div>
                )}

                <div className="graph-container" style={{ position: 'relative', height: '100%' }}>
                  {isScanLoading ? (
                    <div style={{
                      flex: 1, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      background: '#0f111a', color: '#f3f4f6', gap: '20px', height: '100%',
                      position: 'relative', zIndex: 10
                    }}>
                      <div style={{
                        width: '48px', height: '48px',
                        border: '4px solid rgba(99, 102, 241, 0.1)',
                        borderTop: '4px solid #6366f1',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                        boxShadow: '0 0 15px rgba(99, 102, 241, 0.2)'
                      }} />
                      <style dangerouslySetInnerHTML={{__html: `
                        @keyframes spin {
                          0% { transform: rotate(0deg); }
                          100% { transform: rotate(360deg); }
                        }
                      `}} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '15px', fontWeight: '600', color: '#e2e8f0', letterSpacing: '0.5px' }}>
                          Escaneando Proyecto
                        </span>
                        <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>
                          {directory}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {layoutMode === 'sequence' ? (
                        <SequenceDiagram 
                          nodes={visibleNodes} 
                          edges={visibleEdges} 
                        />
                      ) : (
                        <GraphCanvas
                          nodes={visibleNodes}
                          edges={visibleEdges}
                          layoutMode={layoutMode}
                          highlightedNodeId={highlightedNodeId}
                          simulatedDataFlow={globalData.dataflow}
                          onSandboxTest={handleSandboxTest}
                          onNodeSelect={(fp, nodeId) => { setSelectedFilepath(fp); setHighlightLine(null); setHighlightedNodeId(nodeId); }}
                          onPaneClick={() => setHighlightedNodeId(null)}
                          onExpandNode={(id) => setExpandedNodes(p => new Set(p).add(id))}
                          onCollapseNode={(id) => setExpandedNodes(p => { const s = new Set(p); s.delete(id); return s; })}
                          onToggleFile={(id) => setCollapsedFiles(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; })}
                          globalNodes={globalData.nodes}
                          globalEdges={globalData.edges}
                          expandedNodes={expandedNodes}
                          collapsedFiles={collapsedFiles}
                          onAiExplain={handleAiExplain}
                          onDataFlowInspect={handleDataFlowInspect}
                        />
                      )}
                      <GraphLegend />

                      {/* Time-Travel Bar */}
                      {hasSimulation && (
                        <div style={{
                          position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
                          background: 'rgba(17,24,39,0.96)', backdropFilter: 'blur(10px)',
                          padding: '10px 28px', borderRadius: '40px',
                          border: `1px solid ${isFinalDanger ? '#ef4444' : '#374151'}`,
                          display: 'flex', gap: '16px', alignItems: 'center',
                          boxShadow: isFinalDanger ? '0 0 30px rgba(239,68,68,0.4), 0 8px 20px rgba(0,0,0,0.5)' : '0 8px 20px rgba(0,0,0,0.5)',
                          zIndex: 10,
                        }}>
                          <button onClick={handlePrevStep} disabled={currentStepIndex <= -1}
                            style={{ background: 'transparent', border: 'none', color: currentStepIndex <= -1 ? '#374151' : '#9ca3af', cursor: currentStepIndex <= -1 ? 'not-allowed' : 'pointer', display: 'flex' }}>
                            <SkipBack size={20} />
                          </button>

                          <div style={{ textAlign: 'center', minWidth: '140px' }}>
                            <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px' }}>
                              {isFinalDanger ? '🚨 SINK ALCANZADO' : currentStepIndex < 0 ? '⏱ Pulsa ▶ para avanzar' : '⏱ TIME-TRAVEL'}
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: isFinalDanger ? '#ef4444' : '#f9fafb' }}>
                              {currentStepIndex < 0 ? `${tracePath.length} pasos disponibles` : `Paso ${currentStepIndex + 1} de ${tracePath.length}`}
                            </div>
                          </div>

                          <button onClick={handleNextStep} disabled={currentStepIndex >= tracePath.length - 1}
                            style={{ background: 'transparent', border: 'none', color: currentStepIndex >= tracePath.length - 1 ? '#374151' : '#9ca3af', cursor: currentStepIndex >= tracePath.length - 1 ? 'not-allowed' : 'pointer', display: 'flex' }}>
                            <SkipForward size={20} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Panel>

            <Separator className="resize-handle-horizontal" />

            {/* Panel 3: Right Panel (Split vertically: Monaco top, Tabs bottom) */}
            <Panel defaultSize={30} minSize={20} maxSize={50} id="right-panel">
              <div className="right-panel">
                <Group direction="vertical">
                  {/* Top half: Monaco Code Editor */}
                  <Panel defaultSize={55} minSize={20} id="code-viewer-panel">
                    <div className="inspector-top-half" style={{ height: '100%' }}>
                      {selectedFilepath ? (
                        <CodeViewer 
                          filepath={selectedFilepath} 
                          highlightLine={highlightLine} 
                          onSaveCode={handleSaveCode} 
                        />
                      ) : (
                        <div className="empty-code-viewer">
                          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
                          <p style={{ fontSize: '13px', color: '#6b7280' }}>
                            Selecciona un archivo o función para ver su código fuente
                          </p>
                        </div>
                      )}
                    </div>
                  </Panel>

                  <Separator className="resize-handle-vertical" />

                  {/* Bottom half: Tabs */}
                  <Panel defaultSize={45} minSize={20} id="inspector-tabs-panel">
                    <div className="inspector-bottom-half" style={{ height: '100%' }}>
                      <div style={{ display: 'flex', background: '#0a0c14', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
                        {[
                          { id: 'dataflow',    label: '🔍 Flujo de Datos', color: '#60a5fa' },
                          { id: 'connections', label: '🔗 Conexiones',     color: '#a78bfa' },
                        ].map(tab => (
                          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            padding: '10px 20px', background: activeTab === tab.id ? '#1a1d27' : 'transparent',
                            color: tab.color, border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
                            cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'all 0.2s'
                          }}>{tab.label}</button>
                        ))}
                        {activeTab === 'connections' && (
                          <span style={{ marginLeft: '12px', alignSelf: 'center', fontSize: '12px', color: '#6b7280' }}>
                            Matriz/Árbol de relaciones
                          </span>
                        )}
                        {activeTab === 'dataflow' && (
                          <span style={{ marginLeft: '12px', alignSelf: 'center', fontSize: '12px', color: '#4b5563' }}>
                            {useGlobalFlow && simulatedDataFlow
                              ? 'Rastro Global de Simulación'
                              : (dataFlowNodeId?.includes('::') ? `Rastreando: ${dataFlowNodeId.split('::')[1]}()` : 'Haz clic derecho en una función → 🔍 Rastrear Flujo')
                            }
                          </span>
                        )}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                        {activeTab === 'connections' && (
                          <ConnectionExplorer
                            nodes={globalData.nodes}
                            edges={globalData.edges}
                            onSelectNode={handleSelectNode}
                            onSelectFile={(fileId) => { setSelectedFilepath(fileId); }}
                            onAiExplain={handleAiExplain}
                            onDataFlowInspect={handleDataFlowInspect}
                            onSandboxTest={handleSandboxTest}
                          />
                        )}
                        {activeTab === 'dataflow' && (
                          <DataFlowInspector
                            nodeId={dataFlowNodeId}
                            directory={directory}
                            simulatedSteps={simulatedDataFlow}
                            useGlobalFlow={useGlobalFlow}
                            setUseGlobalFlow={setUseGlobalFlow}
                            preloadedData={sandboxData}
                            onNavigate={(target) => {
                              const parts = target.split('::');
                              const fp = parts[0];
                              setSelectedFilepath(fp);
                              const n = globalData.nodes.find(x => x.id === target);
                              if (n) setHighlightLine(n.line_number || null);
                            }}
                            onSelectLine={(line) => {
                              if (line) setHighlightLine(line);
                            }}
                            onSelectFileAndLine={handleSelectFileAndLine}
                          />
                        )}
                      </div>
                    </div>
                  </Panel>
                </Group>
              </div>
            </Panel>
          </Group>
        )}
      </div>

      {/* Floating HUD AI Assistant Panel */}
      {showAiHud && (
        <Rnd
          default={{
            x: window.innerWidth - 460,
            y: 80,
            width: 420,
            height: 520,
          }}
          minWidth={320}
          minHeight={300}
          bounds="window"
          dragHandleClassName="hud-drag-handle"
          style={{
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(15, 17, 26, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.5)',
            overflow: 'hidden'
          }}
        >
          {/* HUD Header */}
          <div 
            className="hud-drag-handle" 
            style={{
              padding: '12px 16px',
              background: 'rgba(99, 102, 241, 0.15)',
              borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'move',
              userSelect: 'none',
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🪄</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#818cf8', letterSpacing: '0.5px' }}>
                Asistente de IA (CodeXHound)
              </span>
            </div>
            <button 
              onClick={() => setShowAiHud(false)} 
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'background 0.2s, color 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; }}
            >
              ✕
            </button>
          </div>

          {/* HUD Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', color: '#cbd5e1' }}>
            {isAiLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: '#9ca3af' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  border: '3px solid rgba(99, 102, 241, 0.1)',
                  borderTop: '3px solid #6366f1',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{ fontSize: '13px' }}>Analizando lógica con IA...</span>
              </div>
            ) : aiExplanation ? (
              formatAiExplanation(aiExplanation, (line) => setHighlightLine(line))
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: '8px', color: '#6b7280', padding: '0 20px' }}>
                <div style={{ fontSize: '40px' }}>🤖</div>
                <span style={{ fontSize: '13px' }}>
                  Haz clic derecho en cualquier nodo de función y selecciona **"🪄 Explicar Lógica (IA)"** para recibir un reporte completo en tiempo real.
                </span>
              </div>
            )}
          </div>
        </Rnd>
      )}

      {sandboxNodeId && (
        <SandboxModal
          nodeId={sandboxNodeId}
          directory={directory}
          onClose={() => setSandboxNodeId(null)}
          onSimulate={handleSandboxSimulate}
        />
      )}
    </div>
  );
}

export default App;
