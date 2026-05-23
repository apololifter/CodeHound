/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

const LANGUAGE_MAP = {
  '.py': 'python',
  '.php': 'php',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
};

function getLanguage(filepath) {
  if (!filepath) return 'plaintext';
  const ext = '.' + filepath.split('.').pop().toLowerCase();
  return LANGUAGE_MAP[ext] || 'plaintext';
}

export function CodeViewer({ filepath, highlightLine, onSaveCode }) {
  const [code, setCode] = useState('// Select a node to view its source code\n');
  const [isLoading, setIsLoading] = useState(false);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

  // Load file when filepath changes
  useEffect(() => {
    if (!filepath) {
      setCode('// Select a node to view its source code\n');
      return;
    }
    setIsLoading(true);
    fetch('http://127.0.0.1:8000/api/read_file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filepath }),
    })
      .then(r => r.json())
      .then(data => setCode(data.content || '// empty file'))
      .catch(err => setCode(`// Error loading file: ${err.message}`))
      .finally(() => setIsLoading(false));
  }, [filepath]);

  // Highlight line when Time-Travel step changes
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    if (!highlightLine) {
      // Clear old decorations
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
      return;
    }

    // Scroll to the line
    editor.revealLineInCenter(highlightLine);

    // Apply decoration (yellow highlight + gutter marker)
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(highlightLine, 1, highlightLine, 1),
        options: {
          isWholeLine: true,
          className: 'myLineHighlight',
          glyphMarginClassName: 'myGlyphMarginClass',
          overviewRuler: { color: '#eab308', position: monaco.editor.OverviewRulerLane.Right },
        },
      },
    ]);
  }, [highlightLine, filepath]);

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Highlight immediately on mount if line is set
    if (highlightLine) {
      editor.revealLineInCenter(highlightLine);
      decorationsRef.current = editor.deltaDecorations([], [
        {
          range: new monaco.Range(highlightLine, 1, highlightLine, 1),
          options: {
            isWholeLine: true,
            className: 'myLineHighlight',
            glyphMarginClassName: 'myGlyphMarginClass',
            overviewRuler: { color: '#eab308', position: monaco.editor.OverviewRulerLane.Right },
          },
        },
      ]);
    }

    // Ctrl+S / Cmd+S → Hot-Reload
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onSaveCode && filepath) {
        onSaveCode(filepath, editor.getValue());
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        className="code-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>
          {filepath ? filepath.split(/[\\/]/).pop() : 'No file selected'}
        </span>
        <span style={{ fontSize: '11px', color: '#374151' }}>
          {filepath && <span style={{ color: '#4b5563' }}>Ctrl+S → Hot-Reload</span>}
        </span>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {isLoading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(15,17,26,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, fontSize: '13px', color: '#6b7280'
          }}>
            Loading...
          </div>
        )}
        <Editor
          height="100%"
          language={getLanguage(filepath)}
          theme="vs-dark"
          value={code}
          onMount={handleEditorMount}
          onChange={(val) => setCode(val)}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            glyphMargin: true,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            fontSize: 13,
            fontFamily: "'Fira Code', 'Cascadia Code', monospace",
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  );
}
