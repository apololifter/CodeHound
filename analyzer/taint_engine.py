import re
from typing import List, Dict

# Heurísticas de sanitización
SANITIZERS = {"escape", "sanitize", "clean", "validate", "filter", "strip", "purify",
               "int", "float", "filter_var", "htmlspecialchars", "intval", "str_replace"}

from analyzer.sinks_db import get_sinks

DANGEROUS_SINKS = get_sinks()

def simulate_taint_flow(source_id: str, payload: str,
                        all_nodes: List[Dict], all_edges: List[Dict], function_registry: Dict) -> Dict:
    """
    Traza todas las rutas posibles desde source_id hacia adelante usando BFS,
    filtrando las aristas mediante un análisis dinámico para asegurar que la
    función destino realmente reciba una variable contaminada (Argument Binding).
    """
    adj: Dict[str, List] = {}
    for edge in all_edges:
        src = edge["source"]
        if src not in adj:
            adj[src] = []
        adj[src].append((edge["target"], edge["id"], edge.get("type", "standard_call")))

    paths = []
    
    # Caché de análisis locales para no re-parsear el AST repetidas veces
    analysis_cache = {}
    from analyzer.dataflow_analyzer import analyze_function_dataflow

    # DFS para encontrar TODAS las rutas reales (con Argument Binding)
    def dfs(current_node, current_path_nodes, current_path_edges, visited):
        if current_node not in analysis_cache:
            res = analyze_function_dataflow(current_node, function_registry)
            if "error" not in res:
                analysis_cache[current_node] = res
            else:
                analysis_cache[current_node] = None
                
        local_res = analysis_cache.get(current_node)
        
        # Encontrar a qué funciones realmente les pasamos variables manchadas
        valid_targets = set()
        if local_res:
            for step in local_res.get("steps", []):
                if step["type"] in ("EXTERNAL_CALL", "CALL") and step.get("passed_tainted"):
                    for tgt in step.get("external_call", {}).get("targets", []) if step["type"] == "EXTERNAL_CALL" else []:
                        valid_targets.add(tgt)
                    # Si es un CALL simple y el engine no lo mapeó, intentamos hacer match por heurística básica
                    # pero preferimos los external_calls precisos.

        neighbors = adj.get(current_node, [])
        tainted_neighbors = []
        for nxt, eid, etype in neighbors:
            if nxt in valid_targets or not local_res or etype == "DATA_DEPENDENCY":
                tainted_neighbors.append((nxt, eid))

        if not tainted_neighbors:
            paths.append({"nodes": current_path_nodes, "edges": current_path_edges})
            return
            
        for nxt, eid in tainted_neighbors:
            if nxt not in visited:
                dfs(nxt, current_path_nodes + [nxt], current_path_edges + [eid], visited | {nxt})
            else:
                paths.append({"nodes": current_path_nodes, "edges": current_path_edges})

    dfs(source_id, [source_id], [], set([source_id]))

    if not paths:
        return {"status": "no_path", "simulated_edges": {}, "inactive_nodes": [], "trace_path": [], "paths": []}

    simulated_edges = {}
    global_is_safe = True
    
    for path in paths:
        path_nodes = path["nodes"]
        path_edges = path["edges"]
        
        is_safe = False
        reached_sink = False
        
        for node_id in path_nodes:
            node_info = next((n for n in all_nodes if n["id"] == node_id), None)
            if node_info:
                label = node_info["label"].lower()
                if any(s in label for s in SANITIZERS):
                    is_safe = True
                if any(s in label for s in DANGEROUS_SINKS):
                    reached_sink = True
                    
        # Estado de esta ruta específica
        edge_state = "safe" if is_safe else "tainted"
        if not is_safe and reached_sink:
            global_is_safe = False
            
        for eid in path_edges:
            # Si una arista pertenece a una ruta vulnerable, siempre será roja, 
            # incluso si pertenece a otra ruta segura. El peligro prevalece.
            if eid not in simulated_edges or simulated_edges[eid] == "safe":
                simulated_edges[eid] = edge_state

    # Generamos un trace_path lineal básico usando BFS solo con los nodos/aristas válidos de paths
    valid_adj = {}
    for path in paths:
        path_nodes = path["nodes"]
        path_edges = path["edges"]
        for i in range(len(path_nodes) - 1):
            src = path_nodes[i]
            tgt = path_nodes[i+1]
            if src not in valid_adj:
                valid_adj[src] = []
            if i < len(path_edges):
                valid_adj[src].append((tgt, path_edges[i]))

    trace_path = [{"type": "node", "id": source_id}]
    queue = [source_id]
    visited_trace = set([source_id])
    visited_edges = set()
    while queue:
        curr = queue.pop(0)
        for nxt, eid in valid_adj.get(curr, []):
            if eid not in visited_edges:
                visited_edges.add(eid)
                trace_path.append({"type": "edge", "id": eid})
                trace_path.append({"type": "node", "id": nxt})
                if nxt not in visited_trace:
                    visited_trace.add(nxt)
                    queue.append(nxt)

    return {
        "status": "success",
        "simulated_edges": simulated_edges,
        "inactive_nodes": [],
        "is_safe": global_is_safe,
        "trace_path": trace_path,
        "paths": paths
    }
