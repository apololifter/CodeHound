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
from analyzer.dataflow_analyzer import analyze_function_dataflow

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

    all_nodes, all_edges, function_registry, _ = _run_scan(root_dir)
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
@app.post("/api/simulate/fuzzing")  # alias legacy: ya no lanza payloads de ataque
def dast_micro_sandbox_endpoint(req: SandboxRequest):
    """
    Micro-sandbox ejecutable aislado: corre la función con el payload del usuario
    y devuelve cómo muta el dato línea a línea (memory trace), sin tocar el código en disco.
    """
    root_dir = _validate_directory(req.directory)

    all_nodes, all_edges, function_registry, _ = _run_scan(root_dir)
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
        "mutation_timeline": dynamic.get("mutation_timeline", []),
        "execution_summary": dynamic.get("execution_summary", {}),
    }

@app.post("/api/analyze/dataflow")
def dataflow_endpoint(req: DataFlowRequest):
    """
    Analiza el flujo de datos línea a línea dentro de una función específica.
    Clasifica cada instrucción: CAPTURE, TRANSFORM, SANITIZE, SINK, CALL, RETURN.
    """
    root_dir = _validate_directory(req.directory)

    all_nodes, all_edges, function_registry, discovered_sources = _run_scan(root_dir)
    result = analyze_function_dataflow(req.node_id, function_registry)
    return result

def _run_scan(root_dir: str):
    """Shared scan logic: returns (all_nodes, all_edges)."""
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
    from analyzer.dataflow_analyzer import SOURCE_PATTERNS, _find_function_node
    
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

    return all_nodes, all_edges, function_registry, discovered_sources


@app.post("/api/scan")
def scan(req: ScanRequest):
    root_dir = _validate_directory(req.directory)

    logger.info(f"Scanning directory: {root_dir}")
    all_nodes, all_edges, _, discovered_sources = _run_scan(root_dir)
    logger.info(f"Scan complete: {len(all_nodes)} nodes, {len(all_edges)} edges, {len(discovered_sources)} sources found.")
    return {"nodes": all_nodes, "edges": all_edges, "discovered_sources": discovered_sources}


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

    explanation = explain_code_logic(snippet, "unknown")
    return {"explanation": explanation}



@app.post("/api/simulate/taint")
def simulate_endpoint(req: SimulateRequest):
    root_dir = _validate_directory(req.directory)

    all_nodes, all_edges, function_registry, _ = _run_scan(root_dir)
    result = simulate_taint_flow(req.source_id, req.payload, all_nodes, all_edges, function_registry)
    
    if result.get("status") == "success" and result.get("paths"):
        paths = result.get("paths", [])
        from analyzer.dataflow_analyzer import compute_interprocedural_dataflow
        inter_steps = compute_interprocedural_dataflow(paths, all_edges, function_registry, req.payload)
        result["interprocedural_dataflow"] = inter_steps

    return result


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
