import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { GraphCanvas } from './components/GraphCanvas';
import { CodeViewer } from './components/CodeViewer';
import { useGraphDerivation } from './hooks/useGraphDerivation';
import { ConnectionExplorer } from './components/ConnectionExplorer';
import { DataFlowInspector } from './components/DataFlowInspector';

import { SandboxModal } from './components/SandboxModal';
import DebuggerPanel from './components/DebuggerPanel';
import SinksModal from './components/SinksModal';
import { AlertTriangle, Plus, Minus, Maximize2, Minimize2, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';


// formatAiExplanation has been removed in favor of ReactMarkdown

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


  const [isScanLoading, setIsScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanResult, setScanResult] = useState(null);
  
  const [sandboxNodeId, setSandboxNodeId] = useState(null);
  const [sandboxData, setSandboxData] = useState(null);

  const [debuggerDastResult, setDebuggerDastResult] = useState(null);
  const [debuggerFuzzResults, setDebuggerFuzzResults] = useState(null);
  const [debuggerTargetParam, setDebuggerTargetParam] = useState('');
  const [isDebuggerLoading, setIsDebuggerLoading] = useState(false);

  const [selectedFilepath, setSelectedFilepath] = useState(null);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [collapsedFiles, setCollapsedFiles] = useState(new Set());

  const [activeTab, setActiveTab] = useState('connections');

  const [highlightLine, setHighlightLine] = useState(null);
  const [dataFlowNodeId, setDataFlowNodeId] = useState(null); // node being inspected in DataFlow tab


  const [simulatedEdges, setSimulatedEdges] = useState({});
  const [inactiveNodes, setInactiveNodes] = useState([]);
  const [tracePath, setTracePath] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [vulnAlert, setVulnAlert] = useState(null);
  const [simulatedDataFlow, setSimulatedDataFlow] = useState(null);
  const [useGlobalFlow, setUseGlobalFlow] = useState(true);

  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [rightPanelWidth, setRightPanelWidth] = useState(450);
  const [topHeightPercent, setTopHeightPercent] = useState(55);

  const [discoveredSinks, setDiscoveredSinks] = useState([]);
  const [isSinksModalOpen, setIsSinksModalOpen] = useState(false);
  const [showSinksToast, setShowSinksToast] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const isResizingSidebar = useRef(false);
  const isResizingRight = useRef(false);
  const isResizingVertical = useRef(false);

  const resizeSidebar = useCallback((e) => {
    if (!isResizingSidebar.current) return;
    const newWidth = Math.max(200, Math.min(500, e.clientX));
    setSidebarWidth(newWidth);
  }, []);

  const stopResizeSidebar = useCallback(() => {
    isResizingSidebar.current = false;
    document.removeEventListener('mousemove', resizeSidebar);
    document.removeEventListener('mouseup', stopResizeSidebar);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, [resizeSidebar]);

  const startResizeSidebar = useCallback(() => {
    isResizingSidebar.current = true;
    document.addEventListener('mousemove', resizeSidebar);
    document.addEventListener('mouseup', stopResizeSidebar);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [resizeSidebar, stopResizeSidebar]);

  const resizeRight = useCallback((e) => {
    if (!isResizingRight.current) return;
    const newWidth = Math.max(280, Math.min(800, window.innerWidth - e.clientX));
    setRightPanelWidth(newWidth);
  }, []);

  const stopResizeRight = useCallback(() => {
    isResizingRight.current = false;
    document.removeEventListener('mousemove', resizeRight);
    document.removeEventListener('mouseup', stopResizeRight);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, [resizeRight]);

  const startResizeRight = useCallback(() => {
    isResizingRight.current = true;
    document.addEventListener('mousemove', resizeRight);
    document.addEventListener('mouseup', stopResizeRight);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [resizeRight, stopResizeRight]);

  const resizeVertical = useCallback((e) => {
    if (!isResizingVertical.current) return;
    const rightPanelEl = document.getElementById('right-panel-container');
    if (!rightPanelEl) return;
    const rect = rightPanelEl.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const newPercent = Math.max(20, Math.min(80, (relativeY / rect.height) * 100));
    setTopHeightPercent(newPercent);
  }, []);

  const stopResizeVertical = useCallback(() => {
    isResizingVertical.current = false;
    document.removeEventListener('mousemove', resizeVertical);
    document.removeEventListener('mouseup', stopResizeVertical);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, [resizeVertical]);

  const startResizeVertical = useCallback(() => {
    isResizingVertical.current = true;
    document.addEventListener('mousemove', resizeVertical);
    document.addEventListener('mouseup', stopResizeVertical);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [resizeVertical, stopResizeVertical]);

  const handleScanComplete = (data, dir) => {
    // Strip any persisted aiExplanation from previous sessions (B-08)
    const cleanNodes = data.nodes.map(n => ({ ...n, data: undefined, aiExplanation: undefined }));
    const cleanData = { ...data, nodes: cleanNodes };
    setGlobalData(cleanData);
    setDirectory(dir);
    setHasScanned(true);
    const allFiles = new Set(data.nodes.filter(n => n.type === 'file').map(n => n.id));
    setCollapsedFiles(allFiles);
    setFocusedNodeId(null);
    setExpandedNodes(new Set());
    clearSimulation();
    const sinks = data.discovered_sinks || [];
    setDiscoveredSinks(sinks);
    if (sinks.length > 0) {
      setShowSinksToast(true);
      setTimeout(() => setShowSinksToast(false), 8000);
    }
    setActiveTab('connections');
  };

  const handleScan = async (dirPath) => {
    if (!dirPath.trim()) return;
    setIsScanLoading(true);
    setScanError('');
    setScanResult(null);
    setDirectory(dirPath.trim());
    
    // Aggressive state cleanup
    setFocusedNodeId(null);
    setHighlightedNodeId(null);
    setExpandedNodes(new Set());
    setCollapsedFiles(new Set());
    setVulnAlert(null);
    
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
    setHighlightLine(null);
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
        setActiveTab('dataflow');
      } else if (data.status === 'no_path') {
        setVulnAlert({ message: 'ℹ️ El vector seleccionado no llama a ninguna función (Sin rutas).', type: 'warn' });
      } else {
        setVulnAlert({ message: `⚠️ Error del backend: ${JSON.stringify(data)}`, type: 'warn' });
      }
    } catch (e) {
      setVulnAlert({ type: 'warn', message: 'Error de red en la simulación: ' + e.message });
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

  const handleRunDast = async (nodeId, targetParam, payload) => {
    setDebuggerFuzzResults(null);
    setDebuggerDastResult(null);
    setDebuggerTargetParam(targetParam);
    setIsDebuggerLoading(true);
    setActiveTab('debugger');
    
    try {
      const res = await fetch('http://127.0.0.1:8000/api/simulate/dast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nodeId, directory, target_param: targetParam, payload }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setDebuggerDastResult(data.dynamic_execution);
      } else {
        setVulnAlert({ type: 'danger', message: `Error en DAST: ${data.error}` });
      }
    } catch (err) {
      setVulnAlert({ type: 'danger', message: `Error de red en DAST: ${err.message}` });
    } finally {
      setIsDebuggerLoading(false);
    }
  };

  const handleRunFuzzer = async (nodeId, targetParam) => {
    setDebuggerDastResult(null);
    setDebuggerFuzzResults(null);
    setDebuggerTargetParam(targetParam);
    setIsDebuggerLoading(true);
    setActiveTab('debugger');

    try {
      const res = await fetch('http://127.0.0.1:8000/api/simulate/fuzzing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nodeId, directory, target_param: targetParam }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setDebuggerFuzzResults(data.results);
      } else {
        setVulnAlert({ type: 'danger', message: `Error en Fuzzer: ${data.error}` });
      }
    } catch (err) {
      setVulnAlert({ type: 'danger', message: `Error de red en Fuzzer: ${err.message}` });
    } finally {
      setIsDebuggerLoading(false);
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
    setGlobalData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, aiExplanation: 'Analizando con IA...' } } : n)
    }));
    try {
      const res = await fetch('http://127.0.0.1:8000/api/ai/explain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nodeId }),
      });
      const data = await res.json();
      setGlobalData(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, aiExplanation: data.explanation || 'Sin análisis disponible.' } } : n)
      }));
    } catch (err) {
      setGlobalData(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, aiExplanation: `Error: ${err.message}` } } : n)
      }));
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

  // Compute focused graph
  const filteredNodes = useMemo(() => {
    if (!focusMode) return globalData.nodes;
    
    const sourceIds = globalData.discovered_sources?.map(s => s.node_id) || [];
    const sinkIds = discoveredSinks.map(s => s.node_id) || [];
    const criticalNodeIds = new Set([...sourceIds, ...sinkIds]);
    
    return globalData.nodes.filter(n => {
      if (n.type === 'file') {
        return globalData.nodes.some(child => child.parent === n.id && criticalNodeIds.has(child.id));
      }
      return criticalNodeIds.has(n.id);
    });
  }, [globalData.nodes, globalData.discovered_sources, discoveredSinks, focusMode]);

  const filteredEdges = useMemo(() => {
    if (!focusMode) return globalData.edges;
    const validIds = new Set(filteredNodes.map(n => n.id));
    return globalData.edges.filter(e => validIds.has(e.source) && validIds.has(e.target));
  }, [globalData.edges, filteredNodes, focusMode]);

  const { visibleNodes, visibleEdges } = useGraphDerivation(
    filteredNodes, filteredEdges, focusedNodeId, expandedNodes,
    collapsedFiles, simulatedEdges, inactiveNodes, tracePath, currentStepIndex,
    selectedFilepath
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
              onClick={() => setFocusMode(!focusMode)} 
              style={{ 
                background: focusMode ? 'rgba(245, 158, 11, 0.2)' : '#374151', 
                color: focusMode ? '#fbbf24' : '#f9fafb', 
                border: `1px solid ${focusMode ? '#f59e0b' : '#4b5563'}`, 
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
              {focusMode ? '👀 Modo Foco: Activo' : '👁️ Modo Foco: Inactivo'}
            </button>
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
          <>
            {/* Sidebar container */}
            <div 
              id="sidebar-container"
              style={{ 
                width: `${sidebarWidth}px`, 
                flexShrink: 0, 
                minWidth: '200px', 
                maxWidth: '500px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
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
                discoveredSinks={discoveredSinks}
                onOpenSinks={() => setIsSinksModalOpen(true)}
              />
            </div>

            {/* Separator */}
            <div 
              className="resize-handle-horizontal" 
              onMouseDown={startResizeSidebar}
            />

            {/* Center panel (Welcome Screen / Loader) */}
            <div className="center-panel" style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
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
          </>
        ) : (
          <>
            {/* Sidebar container */}
            <div 
              id="sidebar-container"
              style={{ 
                width: `${sidebarWidth}px`, 
                flexShrink: 0, 
                minWidth: '200px', 
                maxWidth: '500px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
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
                discoveredSinks={discoveredSinks}
                onOpenSinks={() => setIsSinksModalOpen(true)}
              />
            </div>

            {/* Separator */}
            <div 
              className="resize-handle-horizontal" 
              onMouseDown={startResizeSidebar}
            />

            {/* Center panel (Graph Canvas & Time-Travel) */}
            <div className="center-panel" style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                    {/* Interactive Breadcrumbs Bar */}
                    {hasSimulation && tracePath.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        right: '120px',
                        background: 'rgba(15, 17, 26, 0.9)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid #1f2937',
                        borderRadius: '30px',
                        padding: '6px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        zIndex: 20,
                        overflowX: 'auto',
                        scrollbarWidth: 'none',
                        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)'
                      }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '6px', flexShrink: 0 }}>
                          Ruta del Exploit:
                        </span>
                        {tracePath
                          .map((item, idx) => ({ ...item, originalIndex: idx }))
                          .filter(item => item.type === 'node')
                          .map((nodeStep, idx, filteredArray) => {
                            const isActive = nodeStep.originalIndex === currentStepIndex;
                            const isSource = idx === 0;
                            const isSink = idx === filteredArray.length - 1;
                            
                            const nameParts = nodeStep.id.split('::');
                            const filename = nameParts[0].split(/[\\/]/).pop();
                            const funcname = nameParts[1] ? `${nameParts[1]}()` : '';
                            
                            let dotColor = '#9ca3af';
                            if (isSource) { dotColor = '#6366f1'; }
                            if (isSink) { dotColor = '#ef4444'; }
                            
                            return (
                              <div key={nodeStep.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <button
                                  onClick={() => {
                                    setCurrentStepIndex(nodeStep.originalIndex);
                                    jumpToItem(nodeStep);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 10px',
                                    background: isActive ? '#6366f1' : '#1f2937',
                                    border: `1px solid ${isActive ? '#818cf8' : '#374151'}`,
                                    color: isActive ? '#ffffff' : '#cbd5e1',
                                    borderRadius: '20px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    transition: 'all 0.15s',
                                    outline: 'none',
                                  }}
                                  className="breadcrumb-item-button"
                                >
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor }} />
                                  <span>{filename}{funcname ? ` ➔ ${funcname}` : ''}</span>
                                  {isSource && <span style={{ fontSize: '9px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.3px', marginLeft: '4px' }}>[Source]</span>}
                                  {isSink && <span style={{ fontSize: '9px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.3px', marginLeft: '4px' }}>[Sink]</span>}
                                </button>
                                {idx < filteredArray.length - 1 && (
                                  <span style={{ color: '#4b5563', fontSize: '12px' }}>➔</span>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}

                      <GraphCanvas
                        nodes={visibleNodes}
                        edges={visibleEdges}
                        highlightedNodeId={highlightedNodeId}
                        simulatedDataFlow={simulatedDataFlow}
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
                        discoveredSources={globalData.discovered_sources}
                        discoveredSinks={discoveredSinks}
                      />
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

            {/* Separator */}
            <div 
              className="resize-handle-horizontal" 
              onMouseDown={startResizeRight}
            />

            {/* Right Panel */}
            <div 
              id="right-panel-container"
              style={{ 
                width: `${rightPanelWidth}px`, 
                flexShrink: 0, 
                minWidth: '280px', 
                maxWidth: '800px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {/* Top half: Monaco Code Editor */}
              <div 
                id="code-viewer-panel"
                style={{ 
                  height: `${topHeightPercent}%`, 
                  minHeight: '10%',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
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
              </div>

              {/* Vertical Separator */}
              <div 
                className="resize-handle-vertical" 
                onMouseDown={startResizeVertical}
              />

              {/* Bottom half: Tabs */}
              <div 
                id="inspector-tabs-panel"
                style={{ 
                  flex: 1, 
                  minHeight: '10%',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
                <div className="inspector-bottom-half" style={{ height: '100%' }}>
                  <div style={{ display: 'flex', background: '#0a0c14', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
                    {[
                      { id: 'dataflow',    label: '🔍 Flujo de Datos', color: '#60a5fa' },
                      { id: 'connections', label: '🔗 Conexiones',     color: '#a78bfa' },
                      { id: 'debugger',    label: '🐛 Debugger',       color: '#f59e0b' },
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
                    {activeTab === 'debugger' && (
                      <div style={{ padding: isDebuggerLoading ? '20px' : '0', height: '100%', overflow: 'hidden' }}>
                        {isDebuggerLoading ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
                            <div style={{ width: '32px', height: '32px', border: '3px solid rgba(245, 158, 11, 0.2)', borderTop: '3px solid #f59e0b', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '12px' }} />
                            Ejecutando Micro-Sandbox...
                          </div>
                        ) : (!debuggerDastResult && !debuggerFuzzResults) ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
                            No hay resultados del debugger. Haz clic derecho en una función de Python y selecciona 🧪 Sandbox.
                          </div>
                        ) : (
                          <DebuggerPanel
                            sandboxResult={debuggerDastResult}
                            fuzzResults={debuggerFuzzResults}
                            targetParam={debuggerTargetParam}
                            directory={directory}
                            onFrameSelect={(frame) => {
                               if (frame && frame.line) {
                                  setHighlightLine(frame.line);
                               }
                            }}
                            style={{ height: '100%', border: 'none', borderRadius: 0 }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {sandboxNodeId && (
        <SandboxModal
          nodeId={sandboxNodeId}
          directory={directory}
          onClose={() => setSandboxNodeId(null)}
          onSimulate={handleSandboxSimulate}
          onRunDast={handleRunDast}
          onRunFuzzer={handleRunFuzzer}
        />
      )}



      {/* Sinks Discovery Toast Notification (Auto-dismissible) */}
      {showSinksToast && discoveredSinks.length > 0 && !isSinksModalOpen && (
        <div 
          className="fixed top-4 right-4 z-40 bg-orange-500/90 hover:bg-orange-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-5 duration-500"
          style={{ cursor: 'default' }}
        >
          <div className="bg-white/20 p-2 rounded-full cursor-pointer" onClick={() => { setShowSinksToast(false); setIsSinksModalOpen(true); }}>
            <AlertTriangle size={20} className="animate-pulse" />
          </div>
          <div className="cursor-pointer" onClick={() => { setShowSinksToast(false); setIsSinksModalOpen(true); }}>
            <p className="font-semibold text-sm">Sinks Peligrosos Detectados</p>
            <p className="text-xs opacity-90">Se encontraron {discoveredSinks.length} posibles vulnerabilidades.</p>
          </div>
          <button 
            onClick={() => setShowSinksToast(false)}
            style={{ marginLeft: '10px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
            title="Descartar"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sinks Modal */}
      <SinksModal 
        isOpen={isSinksModalOpen} 
        onClose={() => setIsSinksModalOpen(false)} 
        discoveredSinks={discoveredSinks}
        onGoToSink={(nodeId, line) => {
          const filepath = nodeId.split('::')[0];
          setSelectedFilepath(filepath);
          setHighlightLine(line);
          setFocusedNodeId(nodeId);
          setHighlightedNodeId(nodeId);
        }}
      />
    </div>
  );
}

export default App;
