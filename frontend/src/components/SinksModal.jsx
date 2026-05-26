import React, { useState, useEffect } from 'react';
import { AlertCircle, X, ShieldAlert, ChevronRight, Activity, Loader } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Rnd } from 'react-rnd';

const SinksModal = ({ isOpen, onClose, discoveredSinks, onGoToSink }) => {
  const [selectedSink, setSelectedSink] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleExplain = async (sinkInfo, sinkName) => {
    setLoading(true);
    setExplanation(null);
    setSelectedSink({ ...sinkInfo, specificSink: sinkName });

    try {
      const resp = await fetch('http://127.0.0.1:8000/api/ai/explain_sink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          func_name: sinkInfo.label,
          sink_name: sinkName,
          code: sinkInfo.code || "Código no disponible"
        }),
      });
      const data = await resp.json();
      setExplanation(data.explanation);
    } catch (err) {
      setExplanation("Error al conectar con la IA para la explicación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Rnd
      default={{
        x: window.innerWidth / 2 - 400,
        y: 100,
        width: 800,
        height: 500,
      }}
      minWidth={600}
      minHeight={400}
      bounds="window"
      dragHandleClassName="sinks-drag-handle"
      style={{ zIndex: 50 }}
      className="bg-[#1e1e1e] border border-orange-500/30 rounded-xl flex flex-col shadow-2xl overflow-hidden"
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%' }}>
        {/* Header */}
        <div className="sinks-drag-handle flex items-center justify-between p-4 border-b border-white/10 bg-orange-500/10 cursor-move">
        <div className="flex items-center gap-2 text-orange-400">
          <ShieldAlert size={20} />
          <h2 className="font-semibold text-lg">Sinks Peligrosos Detectados ({discoveredSinks.length})</h2>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-md transition-colors text-gray-400 cursor-pointer">
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          
          {/* Left Panel: List of Sinks */}
          <div className="w-1/2 border-r border-white/10 overflow-y-auto p-4 space-y-4">
            <p className="text-sm text-gray-400 mb-2">
              Se han detectado llamadas a funciones potencialmente vulnerables en el código escaneado.
            </p>
            
            {discoveredSinks.map((info, idx) => (
              <div key={idx} className="bg-[#252526] border border-white/5 rounded-lg p-3 hover:border-orange-500/30 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-medium text-white flex items-center gap-2">
                      <Activity size={14} className="text-orange-400" />
                      {info.label}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 truncate" title={info.filepath}>
                      {info.filepath.split(/[\\/]/).pop()}
                    </p>
                  </div>
                </div>
                
                <div className="mt-3 space-y-2">
                  {info.sinks.map((sink, sIdx) => (
                    <div key={sIdx} className="flex items-center justify-between bg-orange-500/5 rounded p-2">
                      <code className="text-xs text-orange-300 font-mono">{sink}()</code>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => onGoToSink && onGoToSink(info.node_id, info.line_number)}
                          className="text-xs bg-gray-500/20 hover:bg-gray-500/40 text-gray-200 px-2 py-1 rounded transition-colors flex items-center gap-1"
                        >
                          Ir al Código
                        </button>
                        <button 
                          onClick={() => handleExplain(info, sink)}
                          className="text-xs bg-orange-500/20 hover:bg-orange-500/40 text-orange-200 px-2 py-1 rounded transition-colors flex items-center gap-1"
                        >
                          Explicar <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {discoveredSinks.length === 0 && (
              <div className="text-center text-gray-500 mt-10">
                <ShieldAlert size={32} className="mx-auto mb-2 opacity-50" />
                <p>No se detectaron sinks en este proyecto.</p>
              </div>
            )}
          </div>

          {/* Right Panel: AI Explanation */}
          <div className="w-1/2 bg-[#1a1a1a] p-6 overflow-y-auto">
            {!selectedSink && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center">
                <AlertCircle size={48} className="mb-4 opacity-20" />
                <p>Selecciona un Sink de la lista para<br/>que la IA explique sus riesgos.</p>
              </div>
            )}

            {loading && (
              <div className="h-full flex flex-col items-center justify-center text-orange-400">
                <Loader size={32} className="animate-spin mb-4" />
                <p className="text-sm animate-pulse">Analizando contexto de seguridad...</p>
              </div>
            )}

            {!loading && explanation && selectedSink && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-sm font-mono border border-orange-500/20">
                      {selectedSink.specificSink}()
                    </span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    en {selectedSink.label} ({selectedSink.filepath.split(/[\\/]/).pop()})
                  </p>
                </div>

                <div className="prose prose-invert prose-sm max-w-none text-gray-300 space-y-4 prose-a:text-orange-400 prose-strong:text-orange-400 prose-code:text-orange-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {explanation}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </Rnd>
  );
};

export default SinksModal;
