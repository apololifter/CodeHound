import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  themeVariables: {
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: "14px",
    actorBkg: "#1f2937",
    actorBorder: "#6366f1",
    actorTextColor: "#f3f4f6",
    signalColor: "#a5b4fc",
    signalTextColor: "#9ca3af",
    noteBkg: "#0f111a",
    noteBorder: "#374151",
    noteTextColor: "#d1d5db"
  },
  sequence: {
    showSequenceNumbers: true,
  }
});

export function SequenceDiagram({ nodes, edges }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!nodes || nodes.length === 0 || !containerRef.current) return;

    let mermaidText = 'sequenceDiagram\n';

    const participants = new Set();
    const participantMap = new Map();
    const sequenceEdges = [];

    // Filter valid edges
    edges.forEach(e => {
      const srcNode = nodes.find(n => n.id === e.source);
      const tgtNode = nodes.find(n => n.id === e.target);
      
      if (srcNode && tgtNode) {
        // Create valid mermaid identifiers
        const srcId = srcNode.id.replace(/[^a-zA-Z0-9]/g, '');
        const tgtId = tgtNode.id.replace(/[^a-zA-Z0-9]/g, '');
        
        participantMap.set(srcId, srcNode.label);
        participantMap.set(tgtId, tgtNode.label);
        
        participants.add(srcId);
        participants.add(tgtId);
        
        let edgeType = '->>';
        if (e.animated || e.type === 'hybrid_call') edgeType = '-->>';
        
        sequenceEdges.push(`${srcId}${edgeType}${tgtId}: ${e.label || 'calls'}`);
      }
    });

    participants.forEach(p => {
      mermaidText += `  participant ${p} as ${participantMap.get(p)}\n`;
    });

    sequenceEdges.forEach(se => {
      mermaidText += `  ${se}\n`;
    });

    if (sequenceEdges.length === 0) {
      mermaidText += `  Note over System: No hay interacciones visibles.\n`;
    }

    const renderDiagram = async () => {
      try {
        const { svg } = await mermaid.render('mermaid-sequence-' + Math.floor(Math.random() * 100000), mermaidText);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        console.error("Mermaid error:", err);
      }
    };

    renderDiagram();
  }, [nodes, edges]);

  return (
    <div 
      style={{ 
        width: '100%', height: '100%', overflow: 'auto', 
        padding: '20px', background: '#0f111a', color: '#e2e8f0',
        display: 'flex', justifyContent: 'center'
      }}
    >
      <div ref={containerRef} style={{ width: 'fit-content' }} />
    </div>
  );
}
