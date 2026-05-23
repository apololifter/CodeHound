import { Handle, Position } from '@xyflow/react';
import { PlusCircle, MinusCircle, Folder, FolderOpen } from 'lucide-react';

export function CustomNode({ data, selected }) {
  const langClass = data.language ? `node-${data.language}` : 'node-default';
  const isParentContainer = data.type === 'file' && !data.isCollapsedFile && data.functionCount > 0;
  
  const showHandles = data.type !== 'file' || data.isCollapsedFile;
  
  return (
    <div 
      className={`custom-node ${langClass} ${selected ? 'selected' : ''} ${isParentContainer ? 'file-container' : ''}`} 
      style={isParentContainer ? { maxWidth: 'none', width: '100%', height: '100%' } : {}}
      onClick={() => data.filepath && console.log(data.filepath)}
    >
      {showHandles && <Handle type="target" position={Position.Top} style={{ background: '#4f46e5' }} />}
      
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        marginBottom: isParentContainer ? '0px' : '8px', 
        justifyContent: isParentContainer ? 'flex-start' : 'center' 
      }}>
         {data.type === 'file' && (
            <button 
                onClick={(e) => { e.stopPropagation(); data.onToggleFile(); }}
                style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex' }}
                title={data.isCollapsedFile ? "Expandir Archivo" : "Colapsar Archivo"}
            >
              {data.isCollapsedFile ? <Folder size={14} /> : <FolderOpen size={14} />}
            </button>
         )}
         <div className="node-title" style={{ margin: 0, fontSize: isParentContainer ? '13px' : '13px', fontWeight: '700' }}>
           {data.label}
           {data.type === 'file' && data.functionCount !== undefined && ` (${data.functionCount} func)`}
         </div>
      </div>

      {!isParentContainer && (
        <div className="node-type">
          {data.type}
          {data.type === 'function' && data.parentFile && (
            <span style={{ fontSize: '10px', color: '#818cf8', textTransform: 'none', marginLeft: '4px' }}>
              en {data.parentFile}
            </span>
          )}
        </div>
      )}
      
      {!isParentContainer && data.type !== 'file' && data.hasChildren && (
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

      {showHandles && <Handle type="source" position={Position.Bottom} style={{ background: '#4f46e5' }} />}
    </div>
  );
}
