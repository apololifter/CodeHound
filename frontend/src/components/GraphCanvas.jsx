import { useCallback, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CustomNode } from './CustomNode';
import dagre from 'dagre';

const nodeTypes = { custom: CustomNode };

const NODE_WIDTH = 200;
const NODE_HEIGHT = 72;

function getLayoutedElements(nodes, edges) {
  if (nodes.length === 0) return { nodes, edges };

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 120, ranksep: 200, marginx: 60, marginy: 60 });

  const fileNodes = nodes.filter(n => n.data?.type === 'file');
  const functionNodes = nodes.filter(n => n.data?.type === 'function');

  // 1. Manually layout children inside their parents
  const fileChildren = {};
  functionNodes.forEach(n => {
    if (n.data?.parent && fileNodes.some(f => f.id === n.data.parent)) {
      if (!fileChildren[n.data.parent]) fileChildren[n.data.parent] = [];
      fileChildren[n.data.parent].push(n);
    }
  });

  // Calculate file sizes based on manual stacking with dynamic heights
  fileNodes.forEach(n => {
    const children = fileChildren[n.id] || [];
    let totalHeight = 50; // Header height
    children.forEach(c => {
      const childHeight = c.data?.aiExplanation ? 160 : 45; // Base height + AI box if exists
      totalHeight += childHeight;
    });
    totalHeight += 10; // Bottom padding
    const height = children.length > 0 ? totalHeight : NODE_HEIGHT;
    g.setNode(n.id, { width: 320, height }); // Fixed width 320px for files, dynamic height
  });

  // ONLY add edges between files or root nodes to Dagre
  edges.forEach(e => {
    const sourceNode = nodes.find(n => n.id === e.source);
    const targetNode = nodes.find(n => n.id === e.target);
    const sourceParent = sourceNode?.data?.parent && g.hasNode(sourceNode.data.parent) ? sourceNode.data.parent : e.source;
    const targetParent = targetNode?.data?.parent && g.hasNode(targetNode.data.parent) ? targetNode.data.parent : e.target;
    
    if (g.hasNode(sourceParent) && g.hasNode(targetParent)) {
      g.setEdge(sourceParent, targetParent);
    }
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map(n => {
    if (n.data?.type === 'file') {
      const pos = g.node(n.id);
      return {
        ...n,
        targetPosition: 'top',
        sourcePosition: 'bottom',
        position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
        style: { ...n.style, width: pos.width, height: pos.height, padding: 0 }
      };
    } else if (n.data?.type === 'function' && n.data?.parent && fileNodes.some(f => f.id === n.data.parent)) {
      const siblings = fileChildren[n.data.parent] || [];
      const index = siblings.findIndex(s => s.id === n.id);
      
      // Calculate dynamic Y position based on previous siblings' heights
      let yPos = 50;
      for (let i = 0; i < index; i++) {
        yPos += siblings[i].data?.aiExplanation ? 160 : 45;
      }

      return {
        ...n,
        parentId: n.data.parent,
        extent: 'parent',
        targetPosition: 'left',
        sourcePosition: 'right',
        position: { x: 20, y: yPos },
        style: { ...n.style, width: 280 } // fit inside 320px width
      };
    } else {
      // Free-floating nodes (if any)
      const pos = g.node(n.id);
      return pos ? {
        ...n,
        position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 }
      } : n;
    }
  });

  return { nodes: layoutedNodes, edges };
}

export function GraphCanvas({ 
  nodes: rawNodes, 
  edges: rawEdges, 
  onAiExplain, 
  onDataFlowInspect,
  onNodeSelect,
  onPaneClick,
  onExpandNode,
  onCollapseNode,
  onToggleFile,
  globalNodes = [],
  globalEdges,
  expandedNodes,
  collapsedFiles,
  highlightedNodeId,
  simulatedDataFlow,
  onSandboxTest,
  discoveredSources = [],
  discoveredSinks = []
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [menu, setMenu] = useState(null);
  const [edgeTooltip, setEdgeTooltip] = useState(null);
  const [nodeTooltip, setNodeTooltip] = useState(null);
  const [tracedFlow, setTracedFlow] = useState(null);
  const menuRef = useRef(null);

  // Build React Flow nodes/edges from prop data
  useEffect(() => {
    if (!rawNodes || rawNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const rfNodes = rawNodes.map(n => {
      const hasOutgoingEdges = globalEdges?.some(e => e.source === n.id) ?? false;
      const isExpanded = expandedNodes?.has(n.id) ?? false;
      const isCollapsedFile = n.type === 'file' ? (collapsedFiles?.has(n.id) ?? false) : false;

      const isSource = discoveredSources.some(s => s.node_id === n.id);
      const isSink = discoveredSinks.some(s => s.node_id === n.id);

      const functionCount = n.type === 'file'
        ? globalNodes.filter(child => child.type === 'function' && child.parent === n.id).length
        : 0;

      const parentFile = n.type === 'function' && n.parent
        ? n.parent.split(/[\\/]/).pop()
        : '';

      let isConnectedToHighlighted = false;
      if (highlightedNodeId) {
        if (n.id === highlightedNodeId) isConnectedToHighlighted = true;
        else {
          isConnectedToHighlighted = rawEdges.some(e => 
            (e.source === highlightedNodeId && e.target === n.id) ||
            (e.target === highlightedNodeId && e.source === n.id)
          );
        }
      }
      
      let isTraced = false;
      if (tracedFlow) {
        isTraced = tracedFlow.nodes.has(n.id) || (n.parent && tracedFlow.nodes.has(n.parent));
      }
      
      const nodeOpacity = tracedFlow ? (isTraced ? 1 : 0.1) : (highlightedNodeId ? (isConnectedToHighlighted ? 1 : 0.2) : 1);

      return {
        id: n.id,
        type: 'custom',
        data: {
          id: n.id,
          label: n.label,
          type: n.type,
          language: n.language,
          filepath: n.parent || n.id,
          parent: n.parent,
          hasChildren: hasOutgoingEdges,
          isExpanded,
          isCollapsedFile,
          functionCount,
          parentFile,
          isSource,
          isSink,
          aiExplanation: n.data?.aiExplanation,
          onAiExplain: () => onAiExplain?.(n.id),
          onExpand: () => onExpandNode?.(n.id),
          onCollapse: () => onCollapseNode?.(n.id),
          onToggleFile: () => onToggleFile?.(n.id),
        },
        position: { x: 0, y: 0 },
        style: { ...n.style, opacity: nodeOpacity, transition: 'opacity 0.3s ease' },
      };
    });

    const rfEdges = rawEdges.map(e => {
      let isDirectConnection = false;
      if (highlightedNodeId) {
        if (e.source === highlightedNodeId || e.target === highlightedNodeId) {
          isDirectConnection = true;
        }
      }
      
      const isTracedEdge = tracedFlow ? tracedFlow.edges.has(e.id) : false;
      
      const edgeStyle = tracedFlow
        ? (isTracedEdge ? { stroke: '#a855f7', strokeWidth: 4, filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.6))', opacity: 1 } : { ...e.style, opacity: 0.05 })
        : highlightedNodeId 
          ? (isDirectConnection ? { stroke: '#ef4444', strokeWidth: 3, opacity: 1 } : { ...e.style, opacity: 0.15 })
          : e.style || {};

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        data: e.data,
        type: 'smoothstep',
        animated: (tracedFlow && isTracedEdge) ? true : (isDirectConnection ? true : (e.animated ?? false)),
        style: { ...edgeStyle, transition: 'opacity 0.3s ease, stroke 0.3s ease, stroke-width 0.3s ease' },
      };
    });

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rfNodes, rfEdges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [rawNodes, rawEdges, highlightedNodeId, tracedFlow, globalNodes, globalEdges, expandedNodes, collapsedFiles,
      discoveredSources, discoveredSinks, onExpandNode, onCollapseNode, onToggleFile, setNodes, setEdges]);

  // Reset local states on new graph
  useEffect(() => {
    setTracedFlow(null);
    setNodeTooltip(null);
    setEdgeTooltip(null);
    setMenu(null);
  }, [rawNodes]);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const onEdgeClick = useCallback((evt, edge) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (!simulatedDataFlow) return;
    
    setMenu(null); // close normal menu
    
    // Find payload state in simulatedDataFlow
    const step = simulatedDataFlow.find(s => s.line_number === edge.data?.line_number);
    if (step) {
       setEdgeTooltip({
          x: evt.clientX,
          y: evt.clientY,
          payloadIn: step.payload_in,
          payloadOut: step.payload_out,
          code: step.raw_code
       });
    } else {
       // fallback, just find the last step of the source function
       const sourceSteps = simulatedDataFlow.filter(s => edge.source.includes(s.func_name));
       if (sourceSteps.length > 0) {
          const last = sourceSteps[sourceSteps.length - 1];
          setEdgeTooltip({
             x: evt.clientX,
             y: evt.clientY,
             payloadIn: last.payload_in,
             payloadOut: last.payload_out,
             code: last.raw_code
          });
       } else {
          setEdgeTooltip({
             x: evt.clientX,
             y: evt.clientY,
             payloadIn: 'N/A',
             payloadOut: 'N/A',
             code: 'No mutation data'
          });
       }
    }
  }, [simulatedDataFlow]);

  const onNodeClick = useCallback((_, node) => {
    if (node.data?.filepath) onNodeSelect?.(node.data.filepath, node.id);
  }, [onNodeSelect]);

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setMenu({ id: node.id, top: event.clientY, left: event.clientX });
  }, []);

  const onNodeMouseEnter = useCallback((event, node) => {
    if (node.data?.type === 'function') {
      setNodeTooltip({ id: node.id, x: event.clientX, y: event.clientY, data: node.data });
    }
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setNodeTooltip(null);
  }, []);

  const handleTraceFlow = useCallback((startNodeId) => {
    const reachableNodes = new Set([startNodeId]);
    const reachableEdges = new Set();
    const queue = [startNodeId];

    while (queue.length > 0) {
      const current = queue.shift();
      const outgoing = globalEdges.filter(e => e.source === current);
      for (const edge of outgoing) {
        reachableEdges.add(edge.id);
        if (!reachableNodes.has(edge.target)) {
          reachableNodes.add(edge.target);
          queue.push(edge.target);
        }
      }
    }

    setTracedFlow({ nodes: reachableNodes, edges: reachableEdges });
    setMenu(null);
  }, [globalEdges]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onEdgeClick={onEdgeClick}
        onPaneClick={(e) => {
          setMenu(null);
          setEdgeTooltip(null);
          setTracedFlow(null);
          onPaneClick?.(e);
        }}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="#1e293b" gap={20} variant={BackgroundVariant.Dots} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            if (n.style?.animation) return '#ef4444';
            if (n.style?.boxShadow?.includes('96, 165')) return '#60a5fa';
            return '#374151';
          }}
          maskColor="rgba(0,0,0,0.5)"
          style={{ background: '#1f2937', border: '1px solid #374151' }}
        />
      </ReactFlow>

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
                🔍 Inspeccionar Flujo (IDE)
              </button>
              <button className="ctx-menu-item" onClick={() => handleTraceFlow(menu.id)}>
                ✨ Rastrear Lógica Visual (Grafo)
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

      {/* Visual PDB Tooltip for Edges */}
      {edgeTooltip && (
        <div
          style={{
            position: 'fixed',
            top: edgeTooltip.y + 15,
            left: edgeTooltip.x + 15,
            background: 'rgba(15, 17, 26, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid #374151',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
            zIndex: 9999,
            padding: '12px',
            minWidth: '260px',
            pointerEvents: 'none'
          }}
        >
          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px' }}>🔬</span> Mutación de Estado (Visual PDB)
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px' }}>Input:</div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#e5e7eb', background: '#1f2937', padding: '4px 8px', borderRadius: '4px' }}>
              {edgeTooltip.payloadIn || '...'}
            </div>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px' }}>Output:</div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#10b981', background: '#1f2937', padding: '4px 8px', borderRadius: '4px' }}>
              {edgeTooltip.payloadOut || '...'}
            </div>
          </div>
          {edgeTooltip.code && (
             <div style={{ fontSize: '10px', color: '#f3f4f6', fontFamily: 'monospace', opacity: 0.6 }}>
               {edgeTooltip.code}
             </div>
          )}
        </div>
      )}

      {nodeTooltip && (
        <div style={{
          position: 'fixed',
          top: nodeTooltip.y + 15,
          left: nodeTooltip.x + 15,
          background: 'rgba(15, 17, 26, 0.95)',
          border: nodeTooltip.data.isSink ? '1px solid #ef4444' : '1px solid #374151',
          borderRadius: '8px',
          padding: '12px',
          zIndex: 1000,
          color: 'white',
          maxWidth: '300px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#f3f4f6' }}>
            ƒ {nodeTooltip.data.label}()
          </div>
          {nodeTooltip.data.isSink && (
            <div style={{ color: '#fca5a5', fontSize: '12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.1)', padding: '6px', borderRadius: '4px' }}>
              <span>🚨</span> Contiene Sinks Peligrosos
            </div>
          )}
          <div style={{ fontSize: '11px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>🪄</span> Explicar con IA (Clic derecho)
          </div>
        </div>
      )}
    </div>
  );
}
