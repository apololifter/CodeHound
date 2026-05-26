import os
import json

_SINKS = {}

def get_sinks(language: str = None) -> set:
    global _SINKS
    if not _SINKS:
        filepath = os.path.join(os.path.dirname(__file__), "sinks.json")
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                _SINKS = json.load(f)
        except Exception as e:
            # Fallback a un set por defecto si no existe el archivo
            _SINKS = {
                "python": ["execute", "eval", "exec", "system", "popen", "query", "render_template_string", "subprocess", "shell", "write", "open"],
                "javascript": ["eval", "exec", "setTimeout", "setInterval", "require", "query"],
                "php": ["eval", "exec", "system", "passthru", "shell_exec", "query"]
            }
            
    if language and language in _SINKS:
        return set(_SINKS[language])
        
    # Si no se provee lenguaje, devolver un set global unificado
    all_sinks = set()
    for sinks_list in _SINKS.values():
        all_sinks.update(sinks_list)
    return all_sinks
