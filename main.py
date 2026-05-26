import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from analyzer.scanner import scan_directory, build_filename_map
from analyzer.parser import parse_file
from analyzer.hybrid_detector import get_strategy
from analyzer.ai_agent import explain_code_logic
from analyzer.taint_engine import simulate_taint_flow
from analyzer.dataflow_analyzer import analyze_function_dataflow, compute_interprocedural_dataflow, _build_summary, _find_function_node, SOURCE_PATTERNS
from analyzer.sandbox_runner import execute_with_dast, run_dast_micro_sandbox, run_fuzzer
from analyzer.sinks_db import get_sinks

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Static Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScanRequest(BaseModel):
    directory: str

class FileRequest(BaseModel):
    filepath: str

class ExplainRequest(BaseModel):
    node_id: str

class SimulateRequest(BaseModel):
    source_id: str
    payload: str
    directory: str

class DataFlowRequest(BaseModel):
    node_id: str
    directory: str

class SandboxRequest(BaseModel):
    node_id: str
    directory: str
    target_param: str
    payload: str

class SaveRequest(BaseModel):
    filepath: str
    content: str

class FrameExplainRequest(BaseModel):
    line: int
    code: str
    vars: dict
    tainted_vars: list
    event: str
    payload: str
    func_name: str
    vuln_type: str = ""

class FuzzerRequest(BaseModel):
    node_id: str
    directory: str
    target_param: str

class SinkExplainRequest(BaseModel):
    code: str
    sink_name: str
    func_name: str

def _validate_directory(req_directory: str) -> str:
    root_dir = os.path.abspath(req_directory)
    if not os.path.isdir(root_dir):
        raise HTTPException(status_code=400, detail="Directorio no existe.")
    
    forbidden_paths = [
        os.path.abspath("C:\\Windows"),
        os.path.abspath("C:\\Program Files"),
        os.path.abspath("/etc"),
        os.path.abspath("/bin"),
        os.path.abspath("/usr"),
        os.path.abspath("/var")
    ]
    for fp in forbidden_paths:
        if root_dir.startswith(fp) or root_dir == os.path.abspath("C:\\") or root_dir == os.path.abspath("/"):
            raise HTTPException(status_code=403, detail="Escaneo de directorios del sistema bloqueado por seguridad.")
            
    return root_dir

@app.post("/api/simulate/sandbox")
def sandbox_endpoint(req: SandboxRequest):
    root_dir = _validate_directory(req.directory)

    all_nodes, all_edges, function_registry, _, _ = _run_scan(root_dir)
    res = analyze_function_dataflow(req.node_id, function_registry, req.target_param)
    if "error" in res:
        return res
        
    from analyzer.dataflow_analyzer import compute_interprocedural_dataflow, _build_summary
    from analyzer.sandbox_runner import execute_with_dast
    
    paths = [{"nodes": [req.node_id], "edges": []}]
    inter_steps = compute_interprocedural_dataflow(paths, all_edges, function_registry, req.payload, req.target_param)
    
    # Dynamic Execution (Python only)
    dynamic_data = None
    if res.get("language") == "python":
        func_name = res.get("func_name", req.node_id.split("::")[-1] if "::" in req.node_id else req.node_id)
        filepath = res.get("filepath")
        if filepath and func_name and func_name != "[Ámbito Global]":
            dynamic_data = execute_with_dast(filepath, func_name, req.target_param, req.payload)
    
    summary = _build_summary(inter_steps)
    return {
        "status": "success",
        "dataflow": {
            "func_name": res.get("func_name", req.node_id.split("::")[-1] if "::" in req.node_id else req.node_id),
            "filepath": res.get("filepath", ""),
            "start_line": res.get("start_line", 0),
            "end_line": res.get("end_line", 0),
            "summary": summary,
            "steps": inter_steps,
            "dynamic_execution": dynamic_data
        }
    }

@app.post("/api/simulate/dast")
def dast_micro_sandbox_endpoint(req: SandboxRequest):
    """
    Micro-sandbox ejecutable aislado: corre la función con el payload del usuario
    y devuelve frames estructurados para el DebuggerPanel + mutation_timeline legacy.
    """
    root_dir = _validate_directory(req.directory)

    all_nodes, all_edges, function_registry, _, _ = _run_scan(root_dir)
    res = analyze_function_dataflow(req.node_id, function_registry, req.target_param)
    if "error" in res:
        return {"status": "error", "error": res["error"]}

    if res.get("language") != "python":
        return {
            "status": "error",
            "error": "El micro-sandbox dinámico solo está disponible para funciones Python.",
        }

    from analyzer.sandbox_runner import run_dast_micro_sandbox

    func_name = res.get("func_name", req.node_id.split("::")[-1] if "::" in req.node_id else req.node_id)
    filepath = res.get("filepath")

    if not filepath or not func_name or func_name == "[Ámbito Global]":
        return {"status": "error", "error": "No se pudo determinar el archivo de la función objetivo."}

    params = res.get("parameters") or []
    if req.target_param and params and req.target_param not in params:
        return {"status": "error", "error": f'Parámetro "{req.target_param}" no existe en la función.'}

    dynamic = run_dast_micro_sandbox(filepath, func_name, req.target_param, req.payload or "")

    return {
        "status": "success",
        "func_name": func_name,
        "filepath": filepath,
        "start_line": res.get("start_line", 0),
        "end_line": res.get("end_line", 0),
        "dynamic_execution": dynamic,
        "frames": dynamic.get("frames", []),
        "mutation_timeline": dynamic.get("mutation_timeline", []),
        "execution_summary": dynamic.get("execution_summary", {}),
    }


@app.post("/api/simulate/fuzzing")
def fuzzer_endpoint(req: FuzzerRequest):
    """
    Fuzzer multi-payload: ejecuta 12 payloads de ataque sobre la función objetivo.
    Cada resultado incluye frames estructurados para el DebuggerPanel.
    """
    root_dir = _validate_directory(req.directory)

    all_nodes, all_edges, function_registry, _, _ = _run_scan(root_dir)
    res = analyze_function_dataflow(req.node_id, function_registry, req.target_param)
    if "error" in res:
        return {"status": "error", "error": res["error"]}

    if res.get("language") != "python":
        return {
            "status": "error",
            "error": "El fuzzer dinámico solo está disponible para funciones Python.",
        }

    from analyzer.sandbox_runner import run_fuzzer

    func_name = res.get("func_name", req.node_id.split("::")[-1] if "::" in req.node_id else req.node_id)
    filepath = res.get("filepath")

    if not filepath or not func_name or func_name == "[Ámbito Global]":
        return {"status": "error", "error": "No se pudo determinar el archivo de la función objetivo."}

    results = run_fuzzer(filepath, func_name, req.target_param)
    return {
        "status": "success",
        "func_name": func_name,
        "filepath": filepath,
        "start_line": res.get("start_line", 0),
        "end_line": res.get("end_line", 0),
        "fuzzer_results": results,
    }


@app.post("/api/ai/explain_sink")
def explain_sink_endpoint(req: SinkExplainRequest):
    """
    IA explica por qué una función específica (sink) es peligrosa en el contexto dado.
    """
    groq_key = os.getenv("GROQ_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not groq_key and not gemini_key and not openai_key:
        return {
            "explanation": "Error: No se encontró ninguna API key configurada (GROQ_API_KEY, GEMINI_API_KEY o OPENAI_API_KEY).",
            "severity": "info",
        }

    prompt = f"""Eres un experto en ciberseguridad analizando código fuente. Responde en español de forma concisa.

Estás analizando la función `{req.func_name}` que contiene el uso de la función peligrosa (sink): `{req.sink_name}`.

Código de la función:
```
{req.code}
```

Responde con exactamente tres secciones cortas:
1. **¿Por qué este sink es peligroso?**: Explica qué hace `{req.sink_name}` y por qué se considera un riesgo de seguridad.
2. **Posible explotación**: Explica cómo un atacante podría abusar de esto si los inputs no están sanitizados.
3. **Recomendación de seguridad**: Cómo mitigar el riesgo o qué función segura usar como alternativa.
"""

    # Intentar con Groq
    if groq_key and groq_key.startswith("gsk_"):
        try:
            import httpx
            from openai import OpenAI
            client = OpenAI(
                api_key=groq_key, 
                base_url="https://api.groq.com/openai/v1",
                http_client=httpx.Client(timeout=10.0)
            )
            for model_name in ["llama-3.3-70b-versatile", "llama3-70b-8192", "mixtral-8x7b-32768"]:
                try:
                    resp = client.chat.completions.create(
                        model=model_name,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.1,
                        max_tokens=500
                    )
                    text = resp.choices[0].message.content.strip()
                    return {"explanation": text, "severity": "critical"}
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"Groq explain_sink error: {e}")

    # Intentar con OpenAI
    if openai_key and openai_key.startswith("sk-"):
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)
            for model_name in ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"]:
                try:
                    resp = client.chat.completions.create(
                        model=model_name,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.1,
                        max_tokens=500
                    )
                    text = resp.choices[0].message.content.strip()
                    return {"explanation": text, "severity": "critical"}
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"OpenAI explain_sink error: {e}")

    # Fallback a Gemini
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            for model_name in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
                try:
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(prompt, generation_config={"temperature": 0.1})
                    text = response.text.strip()
                    return {"explanation": text, "severity": "critical"}
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"Gemini explain_sink error: {e}")

    return {
        "explanation": "No se pudo obtener explicación de la IA. Intenta de nuevo.",
        "severity": "info",
    }


@app.post("/api/ai/explain_frame")
def explain_frame_endpoint(req: FrameExplainRequest):
    """
    IA explica exactamente qué ocurre en un frame específico del debugger:
    por qué esa línea es relevante, qué hace con el payload y cómo corregirlo.
    """
    groq_key = os.getenv("GROQ_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not groq_key and not gemini_key and not openai_key:
        return {
            "explanation": "Error: No se encontró ninguna API key configurada (GROQ_API_KEY, GEMINI_API_KEY o OPENAI_API_KEY).",
            "severity": "info",
            "fix_suggestion": None,
        }

    vars_str = "\n".join(f"  {k} = {v}" for k, v in (req.vars or {}).items())
    tainted_str = ", ".join(req.tainted_vars) if req.tainted_vars else "ninguna"

    prompt = f"""Eres un experto en ciberseguridad analizando la ejecución dinámica de código. Responde en español de forma concisa.

Estás analizando el frame de ejecución en la línea {req.line} de la función `{req.func_name}`.

Contexto del frame:
- Línea {req.line}: `{req.code}`
- Tipo de evento: {req.event}
- Payload inyectado: `{req.payload}`
- Variables contaminadas (tainted): {tainted_str}
- Estado de variables en este punto:
{vars_str}
{f'- Tipo de vulnerabilidad detectada: {req.vuln_type}' if req.vuln_type else ''}

Responde con exactamente tres secciones:
1. **¿Qué pasa aquí?**: Explica qué hace esta línea específica y por qué es relevante para la vulnerabilidad (2-3 oraciones).
2. **¿Por qué es peligroso?**: Explica el riesgo concreto que representa esta línea en el contexto del payload inyectado (1-2 oraciones).
3. **¿Cómo corregirlo?**: Da una sugerencia de código corregido para esta línea específica (código real, no genérico).

Sé específico al código mostrado, NO des respuestas genéricas."""

    # Intentar con Groq primero (más rápido)
    if groq_key and groq_key.startswith("gsk_"):
        try:
            import httpx
            from openai import OpenAI
            client = OpenAI(
                api_key=groq_key, 
                base_url="https://api.groq.com/openai/v1",
                http_client=httpx.Client(timeout=10.0)
            )
            for model_name in ["llama-3.3-70b-versatile", "llama3-70b-8192", "mixtral-8x7b-32768"]:
                try:
                    resp = client.chat.completions.create(
                        model=model_name,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.1,
                        max_tokens=600,
                    )
                    text = resp.choices[0].message.content
                    severity = "critical" if req.event in ("sink", "propagate") else "warning" if req.event == "mutate" else "info"
                    return {"explanation": text, "severity": severity, "fix_suggestion": None}
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"Groq explain_frame error: {e}")

    # Intentar con OpenAI
    if openai_key and openai_key.startswith("sk-"):
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)
            for model_name in ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"]:
                try:
                    resp = client.chat.completions.create(
                        model=model_name,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.1,
                        max_tokens=600,
                    )
                    text = resp.choices[0].message.content
                    severity = "critical" if req.event in ("sink", "propagate") else "warning" if req.event == "mutate" else "info"
                    return {"explanation": text, "severity": severity, "fix_suggestion": None}
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"OpenAI explain_frame error: {e}")

    # Fallback: Gemini
    if gemini_key:
        try:
            from google import genai
            client = genai.Client(api_key=gemini_key)
            for model_name in ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash"]:
                try:
                    response = client.models.generate_content(model=model_name, contents=prompt)
                    text = response.text
                    severity = "critical" if req.event in ("sink", "propagate") else "warning" if req.event == "mutate" else "info"
                    return {"explanation": text, "severity": severity, "fix_suggestion": None}
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"Gemini explain_frame error: {e}")

    return {
        "explanation": "No se pudo obtener explicación de la IA. Intenta de nuevo.",
        "severity": "info",
        "fix_suggestion": None,
    }

@app.post("/api/analyze/dataflow")
def dataflow_endpoint(req: DataFlowRequest):
    """
    Analiza el flujo de datos línea a línea dentro de una función específica.
    Clasifica cada instrucción: CAPTURE, TRANSFORM, SANITIZE, SINK, CALL, RETURN.
    """
    root_dir = _validate_directory(req.directory)

    all_nodes, all_edges, function_registry, discovered_sources, discovered_sinks = _run_scan(root_dir)
    result = analyze_function_dataflow(req.node_id, function_registry)
    return result

from functools import lru_cache
import time

@lru_cache(maxsize=10)
def _run_scan_cached(root_dir: str, cache_buster: int):
    """Shared scan logic: returns (all_nodes, all_edges, function_registry, discovered_sources, discovered_sinks)."""
    files_to_parse = scan_directory(root_dir)
    filename_map = build_filename_map(files_to_parse)

    all_nodes = []
    all_edges = []
    function_registry = {}
    parsed_files = []

    # Pass 1: Extract Nodes and build Function Registry
    for filepath, language in files_to_parse.items():
        try:
            tree = parse_file(filepath, language)
            with open(filepath, "rb") as f:
                source_code = f.read()

            parsed_files.append((filepath, language, tree, source_code))

            basename = os.path.basename(filepath)
            all_nodes.append({
                "id": filepath,
                "type": "file",
                "language": language,
                "label": basename,
                "line_number": 1
            })

            strategy = get_strategy(language)
            nodes = strategy.extract_nodes(tree, filepath, source_code, function_registry)
            all_nodes.extend(nodes)
        except Exception as e:
            logger.exception(f"Error parsing {filepath}: {e}")

    # Pass 2: Extract Edges — assign stable IDs
    edge_counter = 0
    for filepath, language, tree, source_code in parsed_files:
        try:
            strategy = get_strategy(language)
            edges = strategy.extract_edges(tree, filepath, source_code, filename_map, function_registry)
            for edge in edges:
                edge["id"] = f"e-{edge_counter}"
                edge_counter += 1
            all_edges.extend(edges)
        except Exception as e:
            logger.exception(f"Error extracting edges from {filepath}: {e}")

    # Pass 3: Source Auto-Discovery
    import re
    
    discovered_sources = []
    for filepath, language, tree, source_code in parsed_files:
        try:
            # Only check function nodes for this file
            file_funcs = [n for n in all_nodes if n["type"] == "function" and n["parent"] == filepath]
            for func in file_funcs:
                func_name = func["label"]
                func_node = _find_function_node(tree.root_node, func_name, source_code)
                if func_node:
                    start_byte = func_node.start_byte
                    end_byte = func_node.end_byte
                    func_body = source_code[start_byte:end_byte].decode('utf-8', errors='ignore')
                    
                    found_patterns = []
                    for pattern, desc in SOURCE_PATTERNS:
                        if re.search(pattern, func_body, re.IGNORECASE):
                            found_patterns.append(desc)
                    
                    if found_patterns:
                        discovered_sources.append({
                            "node_id": func["id"],
                            "label": func_name,
                            "filepath": filepath,
                            "patterns": list(set(found_patterns))
                        })
        except Exception as e:
            logger.exception(f"Error during auto-discovery in {filepath}: {e}")

    # Pass 4: Sink Auto-Discovery
    discovered_sinks = []
    sink_regexes = {}
    for lang in ["python", "javascript", "php"]:
        lang_sinks = get_sinks(lang)
        escaped_sinks = [re.escape(s) for s in sorted(lang_sinks, key=len, reverse=True)]
        if escaped_sinks:
            sink_regexes[lang] = re.compile(r'\b(?:' + '|'.join(escaped_sinks) + r')\s*\(')
        
    for filepath, language, tree, source_code in parsed_files:
        try:
            regex = sink_regexes.get(language)
            if not regex: continue
            
            file_funcs = [n for n in all_nodes if n["type"] == "function" and n["parent"] == filepath]
            for func in file_funcs:
                func_name = func["label"]
                func_node = _find_function_node(tree.root_node, func_name, source_code)
                if func_node:
                    start_byte = func_node.start_byte
                    end_byte = func_node.end_byte
                    func_body = source_code[start_byte:end_byte].decode('utf-8', errors='ignore')
                    
                    found_sinks = list(set(regex.findall(func_body)))
                    if found_sinks:
                        discovered_sinks.append({
                            "node_id": func["id"],
                            "label": func_name,
                            "filepath": filepath,
                            "sinks": found_sinks,
                            "code": func_body
                        })
        except Exception as e:
            logger.exception(f"Error during sink auto-discovery in {filepath}: {e}")

    return all_nodes, all_edges, function_registry, discovered_sources, discovered_sinks

def _run_scan(root_dir: str):
    # Cache buster de 60 segundos o hash rápido del dir para no cachear infinitamente
    cache_buster = int(time.time() / 60)
    return _run_scan_cached(root_dir, cache_buster)


@app.post("/api/scan")
def scan(req: ScanRequest):
    root_dir = _validate_directory(req.directory)

    logger.info(f"Scanning directory: {root_dir}")
    all_nodes, all_edges, _, discovered_sources, discovered_sinks = _run_scan(root_dir)
    logger.info(f"Scan complete: {len(all_nodes)} nodes, {len(all_edges)} edges, {len(discovered_sources)} sources, {len(discovered_sinks)} sinks found.")
    return {"nodes": all_nodes, "edges": all_edges, "discovered_sources": discovered_sources, "discovered_sinks": discovered_sinks}


@app.post("/api/read_file")
def read_file(req: FileRequest):
    filepath = req.filepath
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/save_file")
def save_file(req: SaveRequest):
    filepath = req.filepath
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(req.content)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/explain")
def explain_endpoint(req: ExplainRequest):
    filepath = req.node_id.split("::")[0]
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="File not found")

    if "::" in req.node_id:
        func_name = req.node_id.split("::")[1]
        ext = filepath.rsplit('.', 1)[-1].lower() if '.' in filepath else 'txt'
        language = {'py': 'python', 'php': 'php', 'js': 'javascript'}.get(ext, 'python')
        try:
            tree = parse_file(filepath, language)
            with open(filepath, 'rb') as f:
                source_bytes = f.read()
            from analyzer.dataflow_analyzer import _find_function_node
            func_node = _find_function_node(tree.root_node, func_name, source_bytes)
            if func_node:
                start_line = func_node.start_point[0]
                end_line = func_node.end_point[0]
                lines = source_bytes.split(b'\n')
                commented_lines = []
                for idx in range(start_line, end_line + 1):
                    line_text = lines[idx].decode('utf-8', errors='ignore')
                    commented_lines.append(f"Línea {idx + 1}: {line_text}")
                snippet = "\n".join(commented_lines)
            else:
                with open(filepath, "r", encoding="utf-8") as f:
                    snippet = f.read()
        except Exception as e:
            logger.exception(f"Error extracting function code for AI: {e}")
            with open(filepath, "r", encoding="utf-8") as f:
                snippet = f.read()
    else:
        with open(filepath, "r", encoding="utf-8") as f:
            snippet = f.read()

    ext = filepath.rsplit('.', 1)[-1].lower() if '.' in filepath else 'txt'
    detected_language = {'py': 'python', 'php': 'php', 'js': 'javascript'}.get(ext, 'unknown')
    explanation = explain_code_logic(snippet, detected_language)
    return {"explanation": explanation}



@app.post("/api/simulate/taint")
def simulate_endpoint(req: SimulateRequest):
    root_dir = _validate_directory(req.directory)

    all_nodes, all_edges, function_registry, _, _ = _run_scan(root_dir)
    result = simulate_taint_flow(req.source_id, req.payload, all_nodes, all_edges, function_registry)
    
    if result.get("status") == "success" and result.get("paths"):
        paths = result.get("paths")
        inter_steps = compute_interprocedural_dataflow(paths, all_edges, function_registry, req.payload, None)
        result["interprocedural_dataflow"] = inter_steps

    return result


@app.get("/api/browse")
def browse_endpoint():
    import sys
    import subprocess
    try:
        # Spawning tkinter file dialog in a separate python process is 100% thread-safe
        cmd = [
            sys.executable,
            "-c",
            "import tkinter as tk; from tkinter import filedialog; root=tk.Tk(); root.withdraw(); root.attributes('-topmost', True); d=filedialog.askdirectory(title='Seleccionar Carpeta de Proyecto'); print(d)"
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        selected_dir = result.stdout.strip()
        if selected_dir:
            selected_dir = os.path.normpath(selected_dir).replace("\\", "/")
            return {"directory": selected_dir}
        return {"directory": ""}
    except Exception as e:
        logger.exception("Error in browse subprocess")
        raise HTTPException(status_code=500, detail=f"Error al abrir el explorador de archivos: {str(e)}")


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
