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
import '@xyflow/react/dist/style.css';
import { CustomNode } from './CustomNode';
import dagre from 'dagre';
import * as d3 from 'd3-force';

const nodeTypes = { custom: CustomNode };

const NODE_WIDTH = 200;
const NODE_HEIGHT = 72;

function getLayoutedElements(nodes, edges, mode) {
  if (nodes.length === 0) return { nodes, edges };

  if (mode === 'radial') {
    const files = nodes.filter(n => n.data?.type === 'file');
    const funcs = nodes.filter(n => n.data?.type === 'function');
    
    const parents = files.length > 0 ? files : nodes;
    const R_main = Math.max(400, parents.length * 100);
    const center = { x: R_main + 200, y: R_main + 200 };

    parents.forEach((p, i) => {
      const angle = (i / parents.length) * 2 * Math.PI;
      p.targetPosition = 'left';
      p.sourcePosition = 'right';
      p.position = {
        x: center.x + R_main * Math.cos(angle) - NODE_WIDTH / 2,
        y: center.y + R_main * Math.sin(angle) - NODE_HEIGHT / 2
      };

      const children = funcs.filter(c => c.data?.parent === p.id);
      if (children.length > 0) {
        const R_child = Math.max(160, children.length * 40);
        children.forEach((c, j) => {
          const childAngle = (j / children.length) * 2 * Math.PI;
          c.targetPosition = 'left';
          c.sourcePosition = 'right';
          c.position = {
            x: (p.position.x + NODE_WIDTH/2) + R_child * Math.cos(childAngle) - NODE_WIDTH / 2,
            y: (p.position.y + NODE_HEIGHT/2) + R_child * Math.sin(childAngle) - NODE_HEIGHT / 2
          };
        });
      }
    });

    // Unparented functions
    funcs.filter(c => !parents.find(p => p.id === c.data?.parent)).forEach((c, i) => {
       c.position = { x: center.x, y: center.y + i * 100 };
    });

    return { nodes: [...parents, ...funcs], edges };

  } else if (mode === 'attack_path') {
    const g = new dagre.graphlib.Graph({ compound: true });
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 });

    nodes.forEach(n => {
      if (n.data?.type === 'file') {
        const hasVisibleChildren = nodes.some(c => c.data?.parent === n.id && c.id !== n.id);
        if (hasVisibleChildren) {
          g.setNode(n.id, { minWidth: 240, minHeight: 140, paddingTop: 60, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 });
        } else {
          g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
        }
      } else {
        g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
      }
    });

    nodes.forEach(n => {
      if (n.data?.type === 'function' && n.data?.parent) {
        if (nodes.some(p => p.id === n.data.parent)) {
          g.setParent(n.id, n.data.parent);
        }
      }
    });

    edges.forEach(e => {
      if (g.hasNode(e.source) && g.hasNode(e.target)) {
        g.setEdge(e.source, e.target);
      }
    });

    dagre.layout(g);

    const layoutedNodes = nodes.map(n => {
      const pos = g.node(n.id);
      if (!pos) return n;

      const hasParent = n.data?.type === 'function' && n.data?.parent && nodes.some(p => p.id === n.data.parent);
      if (hasParent) {
        const parentPos = g.node(n.data.parent);
        const parentLeft = parentPos.x - parentPos.width / 2;
        const parentTop = parentPos.y - parentPos.height / 2;
        const childLeft = pos.x - pos.width / 2;
        const childTop = pos.y - pos.height / 2;
        return {
          ...n,
          parentId: n.data.parent,
          extent: 'parent',
          targetPosition: 'left',
          sourcePosition: 'right',
          position: {
            x: childLeft - parentLeft,
            y: childTop - parentTop
          }
        };
      } else {
        return {
          ...n,
          parentId: undefined,
          extent: undefined,
          targetPosition: 'left',
          sourcePosition: 'right',
          position: {
            x: pos.x - pos.width / 2,
            y: pos.y - pos.height / 2
          },
          style: {
            ...n.style,
            width: pos.width,
            height: pos.height
          }
        };
      }
    });

    return { nodes: layoutedNodes, edges };
  } else if (mode === 'force') {
    const simulationNodes = nodes.map(n => ({ ...n, x: Math.random() * 800, y: Math.random() * 800 }));
    const simulationEdges = edges.map(e => ({ ...e, source: e.source, target: e.target }));

    const simulation = d3.forceSimulation(simulationNodes)
      .force('link', d3.forceLink(simulationEdges).id(d => d.id).distance(250).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-2000).distanceMax(1000))
      .force('center', d3.forceCenter(0, 0))
      .force('collide', d3.forceCollide().radius(NODE_WIDTH * 0.6).iterations(3))
      .stop();

    for (let i = 0; i < 300; ++i) simulation.tick();

    return {
      nodes: simulationNodes.map(n => {
        const originalNode = nodes.find(orig => orig.id === n.id) || n;
        return {
          ...originalNode,
          targetPosition: 'top',
          sourcePosition: 'bottom',
          position: { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 }
        };
      }),
      edges
    };
  }

  // Default Hierarchical (dagre)
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 40, marginy: 40 });

  nodes.forEach(n => {
    if (n.data?.type === 'file') {
      const hasVisibleChildren = nodes.some(c => c.data?.parent === n.id && c.id !== n.id);
      if (hasVisibleChildren) {
        g.setNode(n.id, { minWidth: 240, minHeight: 140, paddingTop: 60, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 });
      } else {
        g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
      }
    } else {
      g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
  });

  nodes.forEach(n => {
    if (n.data?.type === 'function' && n.data?.parent) {
      if (nodes.some(p => p.id === n.data.parent)) {
        g.setParent(n.id, n.data.parent);
      }
    }
  });

  edges.forEach(e => {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map(n => {
    const pos = g.node(n.id);
    if (!pos) return n;

    const hasParent = n.data?.type === 'function' && n.data?.parent && nodes.some(p => p.id === n.data.parent);
    if (hasParent) {
      const parentPos = g.node(n.data.parent);
      const parentLeft = parentPos.x - parentPos.width / 2;
      const parentTop = parentPos.y - parentPos.height / 2;
      const childLeft = pos.x - pos.width / 2;
      const childTop = pos.y - pos.height / 2;
      return {
        ...n,
        parentId: n.data.parent,
        extent: 'parent',
        targetPosition: 'top',
        sourcePosition: 'bottom',
        position: {
          x: childLeft - parentLeft,
          y: childTop - parentTop
        }
      };
    } else {
      return {
        ...n,
        parentId: undefined,
        extent: undefined,
        targetPosition: 'top',
        sourcePosition: 'bottom',
        position: {
          x: pos.x - pos.width / 2,
          y: pos.y - pos.height / 2
        },
        style: {
          ...n.style,
          width: pos.width,
          height: pos.height
        }
      };
    }
  });

  return { nodes: layoutedNodes, edges };
}

export function GraphCanvas({ 
  nodes: rawNodes, 
  edges: rawEdges, 
  layoutMode = 'hierarchical', 
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
  onSandboxTest
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [menu, setMenu] = useState(null);
  const [edgeTooltip, setEdgeTooltip] = useState(null);
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
      const nodeOpacity = highlightedNodeId ? (isConnectedToHighlighted ? 1 : 0.2) : 1;

      return {
        id: n.id,
        type: 'custom',
        data: {
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
      
      const edgeStyle = highlightedNodeId 
        ? (isDirectConnection ? { stroke: '#ef4444', strokeWidth: 3, opacity: 1 } : { ...e.style, opacity: 0.15 })
        : e.style || {};

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        data: e.data,
        type: 'smoothstep',
        animated: isDirectConnection ? true : (e.animated ?? false),
        style: { ...edgeStyle, transition: 'opacity 0.3s ease, stroke 0.3s ease, stroke-width 0.3s ease' },
      };
    });

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rfNodes, rfEdges, layoutMode);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [rawNodes, rawEdges, layoutMode, highlightedNodeId, globalNodes, globalEdges, expandedNodes, collapsedFiles,
      onExpandNode, onCollapseNode, onToggleFile, setNodes, setEdges]);

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

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeClick={onEdgeClick}
        onPaneClick={(e) => {
          setMenu(null);
          setEdgeTooltip(null);
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
    </div>
  );
}
