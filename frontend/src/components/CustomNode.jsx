import { Handle, Position } from '@xyflow/react';
import { PlusCircle, MinusCircle, Folder, FolderOpen } from 'lucide-react';

export function CustomNode({ data, selected }) {
  const langClass = data.language ? `node-${data.language}` : 'node-default';
  
  return (
    <div className={`custom-node ${langClass} ${selected ? 'selected' : ''}`} onClick={() => data.filepath && console.log(data.filepath)}>
      <Handle type="target" position={Position.Top} />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', justifyContent: 'center' }}>
         {data.type === 'file' && (
            <button 
                onClick={(e) => { e.stopPropagation(); data.onToggleFile(); }}
                style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              {data.isCollapsedFile ? <Folder size={14} /> : <FolderOpen size={14} />}
            </button>
         )}
         <div className="node-title" style={{ margin: 0 }}>
           {data.label}
           {data.type === 'file' && data.functionCount !== undefined && ` (${data.functionCount} func)`}
         </div>
      </div>

      <div className="node-type">
        {data.type}
        {data.type === 'function' && data.parentFile && (
          <span style={{ fontSize: '10px', color: '#818cf8', textTransform: 'none', marginLeft: '4px' }}>
            en {data.parentFile}
          </span>
        )}
      </div>
      
      {data.type !== 'file' && data.hasChildren && (
         <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'center' }}>
           {!data.isExpanded ? (
             <button 
                 onClick={(e) => { e.stopPropagation(); data.onExpand(); }}
                 style={{ background: '#3b82f6', border: 'none', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: '2px', display: 'flex' }}
                 title="Expand Node"
             >
               <PlusCircle size={14} />
             </button>
           ) : (
             <button 
                 onClick={(e) => { e.stopPropagation(); data.onCollapse(); }}
                 style={{ background: '#ef4444', border: 'none', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: '2px', display: 'flex' }}
                 title="Collapse Node"
             >
               <MinusCircle size={14} />
             </button>
           )}
         </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
