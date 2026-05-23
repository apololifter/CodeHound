import { useMemo } from 'react';

/**
 * Derives visible nodes and edges from global graph state.
 * 
 * Modes:
 * 1. Time-Travel (currentStepIndex >= 0): Shows only nodes/edges up to that step
 * 2. Focused Tracing (focusedNodeId set): Shows subtree from that node
 * 3. Default: Shows file nodes + expanded function nodes
 */
export function useGraphDerivation(
  globalNodes,
  globalEdges,
  focusedNodeId,
  expandedNodes,
  collapsedFiles,
  simulatedEdges = {},
  inactiveNodes = [],
  tracePath = [],
  currentStepIndex = -1,
  selectedFilepath = null,
  layoutMode = 'hierarchical'
) {
  return useMemo(() => {
    if (!globalNodes || globalNodes.length === 0) return { visibleNodes: [], visibleEdges: [] };

    const nodeById = new Map(globalNodes.map(n => [n.id, n]));
    let visibleNodeIds = new Set();
    let visibleEdgeIds = new Set();

    const getProxyId = (nodeId) => {
      if (visibleNodeIds.has(nodeId)) return nodeId;
      const node = nodeById.get(nodeId);
      if (node && node.parent && visibleNodeIds.has(node.parent)) {
        return node.parent;
      }
      return nodeId;
    };

    // ─── Mode 1: Time-Travel ─────────────────────────────────────────────────
    if (currentStepIndex >= 0 && tracePath.length > 0) {
      for (let i = 0; i <= currentStepIndex; i++) {
        const item = tracePath[i];
        if (item.type === 'node') {
          visibleNodeIds.add(item.id);
          // Also show parent file
          const n = nodeById.get(item.id);
          if (n?.parent) visibleNodeIds.add(n.parent);
        } else if (item.type === 'edge') {
          const edge = globalEdges.find(e => e.id === item.id);
          if (edge) {
            visibleEdgeIds.add(item.id);
            visibleNodeIds.add(edge.source);
            visibleNodeIds.add(edge.target);
            const src = nodeById.get(edge.source);
            const tgt = nodeById.get(edge.target);
            if (src?.parent) visibleNodeIds.add(src.parent);
            if (tgt?.parent) visibleNodeIds.add(tgt.parent);
          }
        }
      }
    }
    // ─── Mode 1.5: Attack Path (Simulation finished, isolate path) ───────────
    else if (layoutMode === 'attack_path' && tracePath.length > 0) {
      for (const item of tracePath) {
        if (item.type === 'node') {
          visibleNodeIds.add(item.id);
        } else if (item.type === 'edge') {
          const edge = globalEdges.find(e => e.id === item.id);
          if (edge) {
            visibleEdgeIds.add(item.id);
            visibleNodeIds.add(edge.source);
            visibleNodeIds.add(edge.target);
          }
        }
      }
    }
    // ─── Mode 2: Focused Tracing ─────────────────────────────────────────────
    else if (focusedNodeId) {
      // BFS from focused node following edges
      const queue = [focusedNodeId];
      visibleNodeIds.add(focusedNodeId);
      const focusedNode = nodeById.get(focusedNodeId);
      if (focusedNode?.parent) visibleNodeIds.add(focusedNode.parent);

      const processed = new Set();
      while (queue.length > 0) {
        const current = queue.shift();
        if (processed.has(current)) continue;
        processed.add(current);

        for (const edge of globalEdges) {
          if (edge.source === current) {
            visibleEdgeIds.add(edge.id);
            visibleNodeIds.add(edge.target);
            const tgt = nodeById.get(edge.target);
            if (tgt?.parent) visibleNodeIds.add(tgt.parent);
            if (!processed.has(edge.target)) queue.push(edge.target);
          }
          if (edge.target === current) {
            visibleNodeIds.add(edge.source);
            const src = nodeById.get(edge.source);
            if (src?.parent) visibleNodeIds.add(src.parent);
          }
        }
      }
      // Show all edges between visible nodes
      for (const edge of globalEdges) {
        const proxySrc = getProxyId(edge.source);
        const proxyTgt = getProxyId(edge.target);
        if (visibleNodeIds.has(proxySrc) && visibleNodeIds.has(proxyTgt)) {
          visibleEdgeIds.add(edge.id);
        }
      }
    }
    // ─── Mode 3: Default View with Selected File Connections ─────────────────
    else {
      for (const n of globalNodes) {
        if (n.type === 'file') {
          visibleNodeIds.add(n.id);
        } else if (n.parent && n.parent === selectedFilepath) {
          // Functions of the selected file are always visible
          visibleNodeIds.add(n.id);
        } else if (n.parent && !collapsedFiles.has(n.parent)) {
          // Other expanded files' functions are visible
          visibleNodeIds.add(n.id);
        }
      }

      // Add functions from other files that are connected to the selected file's functions
      if (selectedFilepath) {
        const selectedFuncIds = new Set(
          globalNodes.filter(n => n.parent === selectedFilepath).map(n => n.id)
        );

        for (const edge of globalEdges) {
          const isSourceSelected = selectedFuncIds.has(edge.source);
          const isTargetSelected = selectedFuncIds.has(edge.target);

          if (isSourceSelected || isTargetSelected) {
            const otherId = isSourceSelected ? edge.target : edge.source;
            const otherNode = nodeById.get(otherId);
            if (otherNode && otherNode.type === 'function') {
              if (!otherNode.parent || !collapsedFiles.has(otherNode.parent)) {
                visibleNodeIds.add(otherId);
              }
            }
            visibleEdgeIds.add(edge.id);
          }
        }
      }

      for (const edge of globalEdges) {
        const proxySrc = getProxyId(edge.source);
        const proxyTgt = getProxyId(edge.target);
        if (visibleNodeIds.has(proxySrc) && visibleNodeIds.has(proxyTgt)) {
          visibleEdgeIds.add(edge.id);
        }
      }
    }

    // ─── Build active item for highlighting ──────────────────────────────────
    const currentActiveItem = currentStepIndex >= 0 && tracePath.length > 0
      ? tracePath[currentStepIndex]
      : null;
    const currentActiveId = currentActiveItem?.id ?? null;

    const isFinalStep = currentStepIndex === tracePath.length - 1 && tracePath.length > 0;
    const hasVulnerability = Object.values(simulatedEdges).includes('tainted');

    // ─── Map edges ───────────────────────────────────────────────────────────
    // Edge bundling: deduplicate edges between same node pair
    const edgeMap = new Map();

    for (const e of globalEdges) {
      if (!visibleEdgeIds.has(e.id)) continue;

      // Resolve collapsed file proxy
      const srcNode = nodeById.get(e.source);
      const tgtNode = nodeById.get(e.target);
      if (!srcNode || !tgtNode) continue;

      const sourceId = getProxyId(e.source);
      const targetId = getProxyId(e.target);

      if (sourceId === targetId) continue;
      if (!visibleNodeIds.has(sourceId) || !visibleNodeIds.has(targetId)) continue;

      // Bundle key: same pair → one edge
      const bundleKey = `${sourceId}→${targetId}`;

      if (!edgeMap.has(bundleKey)) {
        const isTainted = simulatedEdges[e.id] === 'tainted';
        const isSafe = simulatedEdges[e.id] === 'safe';
        const isActive = e.id === currentActiveId;
        const isApiCall = e.type === 'api_call';
        const isHybrid = e.type === 'hybrid_call';

        // Build style
        let stroke = '#6366f1';
        let strokeWidth = 2;
        let strokeDasharray = undefined;
        let filter = undefined;
        let animated = false;

        if (isHybrid) { stroke = '#f59e0b'; strokeWidth = 2.5; strokeDasharray = '6,3'; animated = true; }
        if (isApiCall) { stroke = '#a855f7'; strokeWidth = 2.5; strokeDasharray = '6,3'; animated = true; }
        if (isSafe) { stroke = '#10b981'; strokeWidth = isActive ? 5 : 3; filter = 'drop-shadow(0 0 6px #10b981)'; animated = true; }
        if (isTainted) { stroke = '#ef4444'; strokeWidth = isActive ? 6 : 3.5; filter = 'drop-shadow(0 0 10px #ef4444)'; animated = true; }
        if (isActive && !isTainted && !isSafe) { stroke = '#60a5fa'; strokeWidth = 4; filter = 'drop-shadow(0 0 6px #60a5fa)'; animated = true; }

        const isSimulated = isTainted || isSafe || isActive;

        if (selectedFilepath && !isSimulated) {
          const srcInSelected = srcNode.id === selectedFilepath || srcNode.parent === selectedFilepath;
          const tgtInSelected = tgtNode.id === selectedFilepath || tgtNode.parent === selectedFilepath;

          if (!srcInSelected && !tgtInSelected) {
            stroke = '#374151'; // Shaded external-only edge
            strokeWidth = 1;
            animated = false;
            filter = undefined;
            strokeDasharray = undefined;
          } else if (!srcInSelected || !tgtInSelected) {
            stroke = '#4b5563'; // Shaded cross-border edge
            strokeWidth = 1.5;
            strokeDasharray = '4,4';
            animated = false;
            filter = undefined;
          }
        }

        edgeMap.set(bundleKey, {
          id: bundleKey,
          source: sourceId,
          target: targetId,
          label: e.label,
          type: 'smoothstep',    // Always SmoothStep for clean routing
          animated,
          style: { stroke, strokeWidth, strokeDasharray, filter },
          // Store original edge id for trace_path matching
          _originalId: e.id,
        });
      }
    }

    // ─── Map nodes ───────────────────────────────────────────────────────────
    const finalNodes = [];
    for (const n of globalNodes) {
      if (!visibleNodeIds.has(n.id)) continue;

      const isActive = n.id === currentActiveId;
      const isInactive = inactiveNodes.includes(n.id);

      let style = { ...(n.style || {}) };
      if (isInactive) style.opacity = 0.25;

      // Shading for external/indirect nodes
      if (selectedFilepath && !isActive) {
        const isSelfFile = n.id === selectedFilepath;
        const isChildOfSelected = n.parent === selectedFilepath;
        if (!isSelfFile && !isChildOfSelected) {
          style.opacity = 0.45;
          style.filter = 'grayscale(70%)';
          style.border = '1px dashed rgba(156, 163, 175, 0.4)';
        }
      }

      if (isActive) {
        style.boxShadow = isFinalStep && hasVulnerability
          ? '0 0 20px 8px rgba(239, 68, 68, 0.9)'
          : '0 0 15px 5px rgba(96, 165, 250, 0.7)';
        style.transform = 'scale(1.08)';
        style.zIndex = 100;
        if (isFinalStep && hasVulnerability) {
          style.animation = 'pulse-danger 1s ease-in-out infinite';
          style.border = '2px solid #ef4444';
        }
      }

      finalNodes.push({ ...n, style });
    }

    return {
      visibleNodes: finalNodes,
      visibleEdges: Array.from(edgeMap.values()),
    };
  }, [globalNodes, globalEdges, focusedNodeId, collapsedFiles,
      simulatedEdges, inactiveNodes, tracePath, currentStepIndex, layoutMode, selectedFilepath]);
}
