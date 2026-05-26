import { Handle, Position } from '@xyflow/react';
import { 
  FolderOpen, AlertTriangle, Globe, FileCode2, Sparkles
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function CustomNode({ data, selected }) {
  const isFile = data.type === 'file';

  if (isFile) {
    let langColor = '#9ca3af';
    if (data.language === 'python') langColor = '#60a5fa'; // blue
    if (data.language === 'javascript') langColor = '#facc15'; // yellow
    if (data.language === 'php') langColor = '#a855f7'; // purple

    return (
      <div 
        className={`custom-node-file ${selected ? 'selected' : ''}`}
        style={{
          width: '100%',
          height: '100%',
          background: 'rgba(15, 17, 26, 0.8)',
          border: `1px solid ${selected ? '#818cf8' : '#374151'}`,
          borderRadius: '12px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          cursor: 'default'
        }}
      >
        <div style={{
          padding: '12px 16px',
          background: 'rgba(31, 41, 55, 0.6)',
          borderBottom: '1px solid #374151',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <button 
              onClick={(e) => { e.stopPropagation(); data.onToggleFile && data.onToggleFile(); }}
              style={{ background: 'transparent', border: 'none', color: langColor, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
              title={data.isCollapsedFile ? "Expandir Archivo" : "Colapsar Archivo"}
          >
            {data.isCollapsedFile ? <FileCode2 size={18} /> : <FolderOpen size={18} />}
          </button>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#f3f4f6', fontFamily: 'monospace' }}>
            {data.label}
          </span>
          {data.functionCount !== undefined && (
            <span style={{ color: '#6b7280', fontSize: '11px', marginLeft: 'auto', fontWeight: '600' }}>
              ({data.functionCount} func)
            </span>
          )}
        </div>
        
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </div>
    );
  }

  // FUNCTION NODE (Child of File)
  const isSource = data.isSource;
  const isSink = data.isSink;
  
  return (
    <div style={{
      width: '100%',
      position: 'relative',
      paddingLeft: '14px',
      fontFamily: 'monospace',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#6366f1', border: 'none', width: '6px', height: '6px', left: '-6px' }} />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '45px' }}>
        <span style={{ color: '#4b5563', userSelect: 'none' }}>├──</span>
        <span style={{ color: isSink ? '#ef4444' : (isSource ? '#10b981' : '#a855f7'), display: 'flex', alignItems: 'center', fontStyle: 'italic', fontWeight: 'bold' }}>
           ƒ
        </span>
        <span style={{ 
          color: isSink ? '#fca5a5' : (isSource ? '#6ee7b7' : '#e2e8f0'),
          fontWeight: '600',
          fontSize: '13px',
          cursor: 'pointer',
          transition: 'color 0.2s',
        }} onClick={() => data.filepath && console.log("Node clicked:", data.filepath)}>
          {data.label}()
        </span>

        {isSink && (
          <span style={{
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginLeft: 'auto',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}>
            <AlertTriangle size={10} /> Sinks
          </span>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); data.onAiExplain && data.onAiExplain(data.id); }}
          style={{
            background: 'transparent', border: 'none', color: '#6b7280',
            cursor: 'pointer', padding: '4px', marginLeft: isSink ? '4px' : 'auto',
            display: 'flex', alignItems: 'center', transition: 'color 0.2s'
          }}
          title="Explicar Lógica con IA"
          onMouseEnter={(e) => e.currentTarget.style.color = '#a855f7'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
        >
          <Sparkles size={14} />
        </button>
      </div>

      {data.aiExplanation && (
        <div style={{
          marginTop: '4px',
          marginLeft: '28px',
          marginRight: '12px',
          padding: '12px',
          background: 'rgba(168, 85, 247, 0.08)',
          borderLeft: '2px solid #a855f7',
          borderRadius: '0 8px 8px 0',
          fontSize: '12px',
          color: '#cbd5e1',
          fontFamily: 'sans-serif',
          height: '110px',
          overflowY: 'auto',
          boxShadow: 'inset 0 0 20px rgba(168, 85, 247, 0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#a855f7', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <Sparkles size={12} /> Explicación IA
          </div>
          <div className="prose prose-invert prose-sm max-w-none prose-p:leading-snug prose-a:text-purple-400 prose-strong:text-purple-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {data.aiExplanation}
            </ReactMarkdown>
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: '#6366f1', border: 'none', width: '6px', height: '6px', right: '-6px' }} />
    </div>
  );
}
