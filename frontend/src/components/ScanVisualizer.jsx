import { useState, useEffect, useRef, useMemo } from 'react';
import { Shield, Terminal, Cpu, HardDrive, BarChart2 } from 'lucide-react';

const mockLogsTemplate = (dir) => [
  { text: `[SYSTEM] Inicializando motor de análisis estático Nexus...`, type: 'system' },
  { text: `[SYSTEM] Cargando analizadores AST para Python, PHP y JavaScript...`, type: 'system' },
  { text: `[SCAN] Explorando estructura de directorios en: ${dir}`, type: 'scan' },
  { text: `[AST] Parseando árbol de sintaxis abstracta para archivos detectados...`, type: 'ast' },
  { text: `[AST] Procesando archivos Python (.py) usando AST nativo...`, type: 'ast' },
  { text: `[AST] Procesando archivos PHP (.php) usando parser tree-sitter...`, type: 'ast' },
  { text: `[AST] Procesando archivos JavaScript (.js) usando parser ES-Tree...`, type: 'ast' },
  { text: `[RESOLVER] Extrayendo declaraciones de clases y funciones...`, type: 'resolver' },
  { text: `[RESOLVER] Mapeando llamadas directas e indirectas...`, type: 'resolver' },
  { text: `[RESOLVER] Resolviendo llamadas híbridas inter-lenguaje (Python <-> PHP)...`, type: 'resolver' },
  { text: `[RESOLVER] Detectando llamadas a endpoints REST API...`, type: 'resolver' },
  { text: `[SECURITY] Analizando posibles fuentes de entrada (Taint Sources)...`, type: 'security' },
  { text: `[SECURITY] Identificando destinos sensibles del sistema (Taint Sinks)...`, type: 'security' },
  { text: `[GRAPH] Construyendo matriz de adyacencia del grafo de control de flujo...`, type: 'graph' },
  { text: `[GRAPH] Computando coordenadas y layout jerárquico del lienzo...`, type: 'graph' },
  { text: `[SYSTEM] Renderizando interfaz gráfica interactiva...`, type: 'system' },
  { text: `[SUCCESS] Escaneo completado. Grafo generado con éxito.`, type: 'success' }
];

export function ScanVisualizer({ directory }) {
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  
  // Real-looking simulated stats
  const [cpuUsage, setCpuUsage] = useState(82);
  const [filesCount, setFilesCount] = useState(0);
  const [scanRate, setScanRate] = useState(140);
  const [memoryUsage, setMemoryUsage] = useState(142); // MB

  const terminalRef = useRef(null);
  const logsList = useMemo(() => mockLogsTemplate(directory || 'C:/proyecto'), [directory]);

  // CPU and memory fluctuation
  useEffect(() => {
    const timer = setInterval(() => {
      setCpuUsage(Math.floor(75 + Math.random() * 20));
      setMemoryUsage(prev => Math.floor(prev + (Math.random() * 4 - 2)));
      setScanRate(() => Math.floor(120 + Math.random() * 40));
    }, 800);
    return () => clearInterval(timer);
  }, []);

  // Smooth progress increments
  useEffect(() => {
    const progressTimer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 96) return prev; // Hold at 96% until parent finishes
        const increment = Math.random() * 4;
        return Math.min(prev + increment, 96);
      });
    }, 150);

    return () => clearInterval(progressTimer);
  }, []);

  // Sequential log printing
  useEffect(() => {
    if (currentStepIndex >= logsList.length) return;

    const delay = 150 + Math.random() * 250;
    const logTimer = setTimeout(() => {
      setLogs(prev => [...prev, logsList[currentStepIndex]]);
      setFilesCount(prev => prev + Math.floor(Math.random() * 3 + 1));
      setCurrentStepIndex(currentStepIndex + 1);
    }, delay);

    return () => clearTimeout(logTimer);
  }, [currentStepIndex, logsList]);

  // Autoscroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Color mapping for different log types
  const getLogColor = (type) => {
    switch (type) {
      case 'system': return '#a855f7'; // Purple
      case 'scan': return '#60a5fa'; // Blue
      case 'ast': return '#f59e0b'; // Amber
      case 'resolver': return '#6366f1'; // Indigo
      case 'security': return '#ef4444'; // Red
      case 'graph': return '#06b6d4'; // Cyan
      case 'success': return '#10b981'; // Green
      default: return '#9ca3af';
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: '#090b11',
      color: '#f3f4f6',
      padding: '40px',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      overflowY: 'auto',
      position: 'relative'
    }}>
      {/* Dynamic Keyframe Injection */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes radar-sweep {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.3; }
          50% { transform: scale(1.05); opacity: 0.6; }
          100% { transform: scale(0.95); opacity: 0.3; }
        }
        @keyframes text-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes glow-bar {
          0%, 100% { box-shadow: 0 0 10px rgba(99, 102, 241, 0.4); }
          50% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.7); }
        }
      `}} />

      {/* Background Cyber-Grid overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'linear-gradient(rgba(18, 24, 38, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(18, 24, 38, 0.5) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
        pointerEvents: 'none',
        opacity: 0.6
      }} />

      <div style={{
        width: '100%',
        maxWidth: '850px',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
        zIndex: 2,
        background: 'rgba(15, 18, 28, 0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99, 102, 241, 0.15)',
        borderRadius: '20px',
        padding: '36px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.05)'
      }}>
        
        {/* Top: Header Scanner Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(31, 41, 55, 0.6)', paddingBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'text-blink 1.2s infinite' }} />
              <h2 style={{ fontSize: '20px', fontWeight: '800', tracking: '-0.5px', margin: 0, color: '#f3f4f6' }}>ANALIZADOR EN CURSO</h2>
            </div>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0', fontFamily: 'monospace' }}>
              DIRECTORIO: {directory}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(99, 102, 241, 0.1)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <Shield size={14} color="#818cf8" />
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#818cf8', letterSpacing: '1px', fontFamily: 'monospace' }}>
              NEXUS ENGINE v2.0
            </span>
          </div>
        </div>

        {/* Middle Content Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '28px', alignItems: 'center' }}>
          
          {/* Left Middle Column: Radar Sweep Visualizer */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              border: '2px solid rgba(99, 102, 241, 0.15)',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#090b11',
              boxShadow: 'inset 0 0 25px rgba(99, 102, 241, 0.1)',
            }}>
              {/* Concentric rings */}
              <div style={{ width: '130px', height: '130px', borderRadius: '50%', border: '1px dashed rgba(99, 102, 241, 0.1)', position: 'absolute' }} />
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '1px solid rgba(99, 102, 241, 0.05)', position: 'absolute' }} />
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px dashed rgba(99, 102, 241, 0.2)', position: 'absolute' }} />
              
              {/* Radar Crosshairs */}
              <div style={{ width: '100%', height: '1px', background: 'rgba(99, 102, 241, 0.08)', position: 'absolute' }} />
              <div style={{ height: '100%', width: '1px', background: 'rgba(99, 102, 241, 0.08)', position: 'absolute' }} />

              {/* Pulsing Outer Glow */}
              <div style={{
                position: 'absolute',
                inset: '-4px',
                borderRadius: '50%',
                border: '1.5px solid rgba(16, 185, 129, 0.2)',
                animation: 'pulse-ring 2.5s ease-in-out infinite'
              }} />

              {/* Radar Sweeper Hand */}
              <div style={{
                position: 'absolute',
                width: '50%',
                height: '50%',
                top: 0,
                left: '50%',
                origin: 'bottom left',
                transformOrigin: '0% 100%',
                background: 'linear-gradient(45deg, rgba(99, 102, 241, 0.15) 0%, transparent 80%)',
                borderRight: '1.5px solid rgba(99, 102, 241, 0.5)',
                animation: 'radar-sweep 2.8s linear infinite',
              }} />

              {/* Central Glowing Processor Unit */}
              <div style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 12px 4px rgba(16, 185, 129, 0.6)',
                zIndex: 2
              }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#6b7280', letterSpacing: '1px', fontWeight: 'bold' }}>SCAN RADAR STATUS</span>
              <div style={{ fontSize: '13px', color: '#a855f7', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '3px' }}>
                BUSCANDO VULNERABILIDADES...
              </div>
            </div>
          </div>

          {/* Right Middle Column: Stats Grid & Console */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Real-time stats badges */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              
              {/* Stat 1: CPU */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#0e1117', border: '1px solid #1f2937', padding: '10px 14px', borderRadius: '10px' }}>
                <Cpu size={16} color="#60a5fa" />
                <div>
                  <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>Carga CPU</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f3f4f6', fontFamily: 'monospace' }}>{cpuUsage}%</div>
                </div>
              </div>

              {/* Stat 2: RAM */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#0e1117', border: '1px solid #1f2937', padding: '10px 14px', borderRadius: '10px' }}>
                <HardDrive size={16} color="#a855f7" />
                <div>
                  <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>Memoria RAM</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f3f4f6', fontFamily: 'monospace' }}>{memoryUsage} MB</div>
                </div>
              </div>

              {/* Stat 3: Files Rate */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#0e1117', border: '1px solid #1f2937', padding: '10px 14px', borderRadius: '10px' }}>
                <BarChart2 size={16} color="#34d399" />
                <div>
                  <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>Velocidad</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f3f4f6', fontFamily: 'monospace' }}>{scanRate} KB/s</div>
                </div>
              </div>

              {/* Stat 4: Files Scanned */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#0e1117', border: '1px solid #1f2937', padding: '10px 14px', borderRadius: '10px' }}>
                <Terminal size={16} color="#f59e0b" />
                <div>
                  <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>Archivos Mapeados</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f3f4f6', fontFamily: 'monospace' }}>~ {filesCount}</div>
                </div>
              </div>

            </div>

            {/* Glowing Progress bar */}
            <div style={{ marginTop: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginBottom: '6px', fontFamily: 'monospace' }}>
                <span>PROGRESO DE ANÁLISIS DE CÓDIGO</span>
                <span style={{ fontWeight: 'bold', color: '#10b981' }}>{Math.floor(progress)}%</span>
              </div>
              <div style={{
                width: '100%',
                height: '10px',
                background: '#090b11',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.05)',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #6366f1 0%, #10b981 100%)',
                  borderRadius: '5px',
                  transition: 'width 0.2s cubic-bezier(0.1, 0.8, 0.2, 1)',
                  animation: 'glow-bar 2s infinite'
                }} />
              </div>
            </div>

          </div>
        </div>

        {/* Bottom: Scrolling Cyber Terminal console */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9ca3af', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
            <Terminal size={12} />
            <span>CONSOLA DE EVENTOS NEXUS ENGINE</span>
          </div>
          <div 
            ref={terminalRef}
            style={{
              height: '160px',
              background: '#04060a',
              border: '1.5px solid #1f2937',
              borderRadius: '10px',
              padding: '12px 16px',
              fontFamily: "'Fira Code', 'Cascadia Code', Consolas, Monaco, monospace",
              fontSize: '11.5px',
              lineHeight: '1.7',
              overflowY: 'auto',
              boxShadow: 'inset 0 1px 10px rgba(0,0,0,0.8)',
              scrollbarWidth: 'thin'
            }}
          >
            {logs.map((log, idx) => (
              <div key={idx} style={{
                color: getLogColor(log.type),
                display: 'flex',
                gap: '8px',
                animation: 'text-blink 0.15s ease-out',
                borderBottom: '1px solid rgba(255,255,255,0.02)',
                paddingBottom: '2px',
                marginBottom: '2px'
              }}>
                <span style={{ color: '#4b5563', flexShrink: 0, userSelect: 'none' }}>
                  [{new Date().toLocaleTimeString()}]
                </span>
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {log.text}
                </span>
              </div>
            ))}
            {currentStepIndex < logsList.length && (
              <div style={{ color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ animation: 'text-blink 0.8s infinite' }}>█</span>
                <span style={{ color: '#4b5563', fontSize: '10px', fontStyle: 'italic' }}>esperando evento...</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
