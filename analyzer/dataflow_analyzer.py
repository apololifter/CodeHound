"""
DataFlow Analyzer — rastrea el ciclo de vida de variables dentro de funciones.
Produce una lista de pasos línea a línea que describe cómo un input viaja
a través del código hasta que sale hacia otra función o archivo.
"""
import re
from typing import List, Dict, Optional, Tuple
from analyzer.parser import parse_file

# ─── Heurística: Patrones de origen de datos externos ────────────────────────
SOURCE_PATTERNS = [
    (r'request\.(form|args|get|json|data|files|values)', 'HTTP Request (Flask/Django)'),
    (r'\$_(GET|POST|REQUEST|COOKIE|FILES)',              'HTTP Input (PHP)'),
    (r'req\.(body|params|query|headers)',                'HTTP Request (Node.js)'),
    (r'sys\.argv',                                       'Argumento de línea de comandos'),
    (r'\binput\(',                                       'Entrada de usuario (stdin)'),
    (r'os\.environ',                                     'Variable de entorno'),
    (r'argv\[',                                          'Argumento de línea de comandos'),
]

# ─── Patrones de Sink (destinos peligrosos) ───────────────────────────────────
SINK_PATTERNS = [
    (r'\b(mysql_query|mysqli_query|cursor\.execute|db\.query|\.raw\(|execute\()', 'SQL Execution',    'sql'),
    (r'\b(exec|system|shell_exec|subprocess\.run|subprocess\.call|os\.system)',   'Shell Execution',  'rce'),
    (r'\b(eval|exec\()',                                                           'Code Execution',   'code'),
    (r'\b(innerHTML|document\.write|render_template_string)',                      'XSS Output',       'xss'),
    (r'\b(open\(|write\(|file_put_contents)',                                      'File Write',       'file'),
]

# ─── Patrones de Sanitización ─────────────────────────────────────────────────
SANITIZER_PATTERNS = [
    r'\b(escape|htmlspecialchars|htmlentities|strip_tags|sanitize|filter_var)',
    r'\b(int\(|float\(|intval|floatval|str_replace)',
    r'\b(re\.escape|quote|parameterize|prepare)',
    r'\b(strip|clean|purify|validate|encode)',
]

def _is_source(code: str) -> Optional[str]:
    for pattern, desc in SOURCE_PATTERNS:
        if re.search(pattern, code, re.IGNORECASE):
            return desc
    return None

def _is_sink(code: str) -> Optional[Tuple[str, str]]:
    for pattern, desc, kind in SINK_PATTERNS:
        if re.search(pattern, code, re.IGNORECASE):
            return desc, kind
    return None

def _is_sanitizer(code: str) -> bool:
    for pattern in SANITIZER_PATTERNS:
        if re.search(pattern, code, re.IGNORECASE):
            return True
    return False

def _extract_called_function(code: str) -> Optional[str]:
    """Extrae el nombre de la función llamada en una expresión."""
    m = re.search(r'\b([a-zA-Z_][\w.]*)\s*\(', code)
    return m.group(1) if m else None

def _classify_statement(code_line: str, function_registry: dict) -> dict:
    """
    Clasifica una línea de código en una categoría semántica y produce
    una anotación comprensible para el usuario.
    """
    stripped = code_line.strip()

    # Comentario o vacío
    if not stripped or stripped.startswith('#') or stripped.startswith('//') or stripped.startswith('/*'):
        return None

    result = {
        'code': stripped,
        'type': 'UNKNOWN',
        'icon': '•',
        'color': '#6b7280',
        'annotation': '',
        'risk': 'none',
        'external_call': None,
    }

    source_desc = _is_source(stripped)
    sink_info   = _is_sink(stripped)
    is_san      = _is_sanitizer(stripped)

    # — CAPTURA de input externo
    if source_desc:
        result.update({'type': 'CAPTURE', 'icon': '📥', 'color': '#60a5fa',
                       'annotation': f'Input externo: {source_desc}', 'risk': 'source'})
        return result

    # — SANITIZACIÓN
    if is_san:
        result.update({'type': 'SANITIZE', 'icon': '🛡️', 'color': '#10b981',
                       'annotation': 'Aplicando filtro/sanitización al dato', 'risk': 'safe'})
        return result

    # — SINK peligroso
    if sink_info:
        desc, kind = sink_info
        result.update({'type': 'SINK', 'icon': '🚨', 'color': '#ef4444',
                       'annotation': f'Destino peligroso: {desc}', 'risk': 'danger',
                       'sink_kind': kind})
        return result

    # — Condicional
    if re.match(r'\s*(if|elif|else|while|for|switch|case)\b', stripped):
        result.update({'type': 'CONDITION', 'icon': '🔀', 'color': '#f59e0b',
                       'annotation': 'Bifurcación lógica: el flujo puede cambiar aquí'})
        return result

    # — Return
    if re.match(r'\s*return\b', stripped):
        result.update({'type': 'RETURN', 'icon': '↩️', 'color': '#a78bfa',
                       'annotation': 'Valor devuelto al llamador'})
        return result

    # — Llamada a función externa conocida
    called = _extract_called_function(stripped)
    if called:
        short = called.split('.')[-1]
        if short in function_registry:
            targets = function_registry[short]
            result.update({
                'type': 'EXTERNAL_CALL', 'icon': '🔗', 'color': '#a855f7',
                'annotation': f'Llama a función registrada: {short}()',
                'risk': 'call',
                'external_call': {'name': short, 'targets': targets}
            })
            return result

        # Llamada a función desconocida
        result.update({'type': 'CALL', 'icon': '→', 'color': '#6366f1',
                       'annotation': f'Llama a {called}()'})
        return result

    # — Asignación / transformación
    if re.search(r'\s*[\w\[\]\'\"]+\s*=\s*', stripped):
        result.update({'type': 'ASSIGN', 'icon': '🔄', 'color': '#fcd34d',
                       'annotation': 'Asignación o transformación de variable'})
        return result

    # — Otra instrucción
    result.update({'type': 'STMT', 'icon': '▸', 'color': '#6b7280',
                   'annotation': 'Instrucción de código'})
    return result


def _extract_param_name_from_node(node, source_bytes: bytes, language: str) -> Optional[str]:
    if node.type in ('identifier', 'variable_name'):
        return source_bytes[node.start_byte:node.end_byte].decode('utf-8', errors='ignore')
    
    if node.type == 'default_parameter':
        name_node = node.child_by_field_name('name') or (node.children[0] if node.children else None)
        if name_node:
            return _extract_param_name_from_node(name_node, source_bytes, language)
            
    if node.type == 'typed_parameter':
        name_node = node.child_by_field_name('pattern') or (node.children[0] if node.children else None)
        if name_node:
            return _extract_param_name_from_node(name_node, source_bytes, language)
            
    if node.type in ('list_splat_pattern', 'dictionary_splat_pattern', 'typed_default_parameter'):
        for c in node.children:
            if c.type in ('identifier', 'variable_name'):
                return source_bytes[c.start_byte:c.end_byte].decode('utf-8', errors='ignore')
            name = _extract_param_name_from_node(c, source_bytes, language)
            if name:
                return name

    if node.type == 'assignment_pattern':
        name_node = node.child_by_field_name('left') or (node.children[0] if node.children else None)
        if name_node:
            return _extract_param_name_from_node(name_node, source_bytes, language)

    if node.type in ('simple_parameter', 'variadic_parameter'):
        name_node = node.child_by_field_name('name')
        if name_node:
            return _extract_param_name_from_node(name_node, source_bytes, language)
        for c in node.children:
            if c.type in ('identifier', 'variable_name'):
                return source_bytes[c.start_byte:c.end_byte].decode('utf-8', errors='ignore')

    if node.type in ('parameter',):
        for c in node.children:
            if c.type in ('identifier', 'variable_name'):
                return source_bytes[c.start_byte:c.end_byte].decode('utf-8', errors='ignore')
                
    return None

from typing import Optional

def _get_function_parameters(node, source_bytes: bytes, language: str) -> list:
    params = []
    param_node = None
    if language == 'python':
        param_node = node.child_by_field_name('parameters')
    elif language in ('javascript', 'php'):
        param_node = node.child_by_field_name('parameters') or node.child_by_field_name('formal_parameters')
    
    if not param_node:
        for child in node.children:
            if child.type in ('parameters', 'formal_parameters'):
                param_node = child
                break
                
    if param_node:
        for child in param_node.children:
            if child.type in (',', '(', ')'):
                continue
            
            param_name = _extract_param_name_from_node(child, source_bytes, language)
            if param_name:
                if param_name.startswith('$'):
                    param_name = param_name[1:]
                if param_name not in ('self', 'cls') and param_name not in params:
                    params.append(param_name)
    return params


def analyze_function_dataflow(node_id: str, function_registry: dict, target_param: str = None) -> dict:
    """
    Analiza el flujo de datos dentro de una función específica.
    Realiza un seguimiento dinámico de variables manchadas (tainted) y sanitizadas
    línea a línea para entender exactamente qué ocurre con el input.
    """
    if node_id.startswith('Global::'):
        filepath = node_id.replace('Global::', '')
        func_name = '[Ámbito Global]'
    elif '::' in node_id:
        filepath = node_id.split('::')[0]
        func_name = node_id.split('::')[1]
    else:
        return {'error': 'Selecciona una función o módulo para rastrear.'}

    try:
        with open(filepath, 'rb') as f:
            source_bytes = f.read()
        lines = [line.decode('utf-8', errors='ignore') for line in source_bytes.split(b'\n')]
    except Exception as e:
        return {'error': f'No se pudo leer el archivo: {e}'}

    ext = filepath.rsplit('.', 1)[-1].lower() if '.' in filepath else 'txt'
    language = {'py': 'python', 'php': 'php', 'js': 'javascript'}.get(ext, 'python')

    try:
        tree = parse_file(filepath, language)
    except Exception as e:
        return {'error': f'Error parseando: {e}'}

    ignored_lines = set()
    if func_name == '[Ámbito Global]':
        start_line = 0
        end_line = len(lines) - 1
        parameters = []
        cursor = tree.walk()
        def find_funcs(cursor):
            node = cursor.node
            if node.type in ("function_definition", "method_declaration", "arrow_function", "function_declaration", "class_definition"):
                for l in range(node.start_point[0], node.end_point[0] + 1):
                    ignored_lines.add(l)
            if cursor.goto_first_child():
                find_funcs(cursor)
                while cursor.goto_next_sibling():
                    find_funcs(cursor)
                cursor.goto_parent()
        find_funcs(cursor)
    else:
        func_node = _find_function_node(tree.root_node, func_name, source_bytes)
        if not func_node:
            return {'error': f'Función "{func_name}" no encontrada en el AST.'}

        start_line = func_node.start_point[0]
        end_line   = func_node.end_point[0]
        parameters = _get_function_parameters(func_node, source_bytes, language)
        if not parameters:
            func_src = source_bytes[func_node.start_byte:func_node.end_byte].decode('utf-8', errors='ignore')
            sig_match = re.search(rf'def\s+{re.escape(func_name)}\s*\(([^)]*)\)', func_src, re.DOTALL)
            if sig_match:
                parameters = [
                    p.strip().split(':')[0].split('=')[0].strip().lstrip('$')
                    for p in sig_match.group(1).split(',')
                    if p.strip() and p.strip() not in ('self', 'cls')
                ]

    # Sembrar variables con los parámetros de la función
    if target_param:
        tainted_vars = {target_param} if target_param in parameters else set()
    else:
        tainted_vars = set(parameters)
        
    sanitized_vars = set()

    steps = []

    for i, line in enumerate(lines):
        ln = i + 1
        if i < start_line or i > end_line or i in ignored_lines:
            continue

        stripped = line.strip()
        # Ignorar comentarios o líneas vacías
        if not stripped or stripped.startswith('#') or stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
            continue

        result = {
            'line_number': ln,
            'raw_code': line.rstrip(),
            'type': 'STMT',
            'icon': '▸',
            'color': '#4b5563',
            'annotation': 'Instrucción de código',
            'risk': 'none',
            'external_call': None,
        }

        source_desc = _is_source(stripped)
        sink_info   = _is_sink(stripped)
        is_san      = _is_sanitizer(stripped)

        # Buscar si es una asignación (var = expr)
        assign_match = re.match(r'\s*(?:let|const|var)?\s*(\$?[\w.]+)\s*(=|\+=|-=|\*=)\s*(.*)', stripped)

        if assign_match:
            var_raw = assign_match.group(1)
            # Normalizar nombre quitando el '$' de PHP
            var_name = var_raw[1:] if var_raw.startswith('$') else var_raw
            expr = assign_match.group(3)
            
            # Extraer tokens para ver si usa variables manchadas
            tokens = [t[1:] if t.startswith('$') else t for t in re.findall(r'\b\$?[\w.]+\b', expr)]

            if source_desc:
                tainted_vars.add(var_name)
                if var_name in sanitized_vars:
                    sanitized_vars.remove(var_name)
                result.update({
                    'type': 'CAPTURE', 'icon': '📥', 'color': '#60a5fa',
                    'annotation': f'Input externo capturado en variable "{var_raw}" ({source_desc})',
                    'risk': 'source'
                })
            elif is_san and any(tok in tainted_vars for tok in tokens):
                sanitized_vars.add(var_name)
                if var_name in tainted_vars:
                    tainted_vars.remove(var_name)
                result.update({
                    'type': 'SANITIZE', 'icon': '🛡️', 'color': '#10b981',
                    'annotation': f'Filtro/Sanitización aplicada a variable "{var_raw}"',
                    'risk': 'safe'
                })
            elif any(tok in tainted_vars for tok in tokens):
                tainted_vars.add(var_name)
                if var_name in sanitized_vars:
                    sanitized_vars.remove(var_name)
                # Encontrar cuál variable manchada propagó el taint
                propagated_from = [t for t in tokens if t in tainted_vars]
                result.update({
                    'type': 'ASSIGN', 'icon': '🔄', 'color': '#fcd34d',
                    'annotation': f'Propagación de input: "{var_raw}" recibe dato contaminado de {", ".join(propagated_from)}',
                    'risk': 'none'
                })
            elif any(tok in sanitized_vars for tok in tokens):
                sanitized_vars.add(var_name)
                if var_name in tainted_vars:
                    tainted_vars.remove(var_name)
                propagated_from = [t for t in tokens if t in sanitized_vars]
                result.update({
                    'type': 'ASSIGN', 'icon': '🔄', 'color': '#10b981',
                    'annotation': f'Propagación (segura): "{var_raw}" recibe dato sanitizado de {", ".join(propagated_from)}',
                    'risk': 'safe'
                })
            else:
                # Si se reescribe con algo limpio, se limpia
                if var_name in tainted_vars:
                    tainted_vars.remove(var_name)
                if var_name in sanitized_vars:
                    sanitized_vars.remove(var_name)
                result.update({
                    'type': 'ASSIGN', 'icon': '🔄', 'color': '#4b5563',
                    'annotation': f'Asignación local a "{var_raw}"',
                    'risk': 'none'
                })
        else:
            # No es asignación. Revisar tokens.
            tokens = [t[1:] if t.startswith('$') else t for t in re.findall(r'\b\$?[\w.]+\b', stripped)]
            uses_tainted = [tok for tok in tokens if tok in tainted_vars]
            uses_sanitized = [tok for tok in tokens if tok in sanitized_vars]

            if sink_info:
                desc, kind = sink_info
                if uses_tainted:
                    result.update({
                        'type': 'SINK', 'icon': '🚨', 'color': '#ef4444',
                        'annotation': f'CRÍTICO: Entrada no sanitizada ({", ".join(uses_tainted)}) llega al Sink: {desc}',
                        'risk': 'danger',
                        'sink_kind': kind
                    })
                elif uses_sanitized:
                    result.update({
                        'type': 'SINK', 'icon': '⚠️', 'color': '#f59e0b',
                        'annotation': f'Seguro: Entrada sanitizada ({", ".join(uses_sanitized)}) enviada al Sink: {desc}',
                        'risk': 'mitigated',
                        'sink_kind': kind
                    })
                else:
                    result.update({
                        'type': 'SINK', 'icon': '🚨', 'color': '#ef4444',
                        'annotation': f'Acceso a Sink peligroso: {desc}',
                        'risk': 'none',
                        'sink_kind': kind
                    })
            elif re.match(r'\s*(if|elif|else|while|for|switch|case)\b', stripped):
                if uses_tainted:
                    result.update({
                        'type': 'CONDITION', 'icon': '🔀', 'color': '#f59e0b',
                        'annotation': f'Bifurcación basada en entrada contaminada ({", ".join(uses_tainted)})'
                    })
                else:
                    result.update({
                        'type': 'CONDITION', 'icon': '🔀', 'color': '#f59e0b',
                        'annotation': 'Bifurcación lógica'
                    })
            elif re.match(r'\s*return\b', stripped):
                if uses_tainted:
                    result.update({
                        'type': 'RETURN', 'icon': '↩️', 'color': '#a78bfa',
                        'annotation': f'Retorna dato contaminado ({", ".join(uses_tainted)}) al llamador'
                    })
                else:
                    result.update({
                        'type': 'RETURN', 'icon': '↩️', 'color': '#a78bfa',
                        'annotation': 'Retorna control/dato limpio'
                    })
            else:
                called = _extract_called_function(stripped)
                if called:
                    short = called.split('.')[-1]
                    if short in function_registry:
                        targets = function_registry[short]
                        ann = f'Llama a función externa: {short}()'
                        if uses_tainted:
                            ann += f' pasando dato contaminado ({", ".join(uses_tainted)})'
                        elif uses_sanitized:
                            ann += f' pasando dato sanitizado ({", ".join(uses_sanitized)})'
                        result.update({
                            'type': 'EXTERNAL_CALL', 'icon': '🔗', 'color': '#a855f7',
                            'annotation': ann,
                            'risk': 'call',
                            'external_call': {'name': short, 'targets': targets},
                            'passed_tainted': bool(uses_tainted)
                        })
                    else:
                        ann = f'Llama a {called}()'
                        if uses_tainted:
                            ann += f' pasando dato contaminado ({", ".join(uses_tainted)})'
                        result.update({
                            'type': 'CALL', 'icon': '→', 'color': '#6366f1',
                            'annotation': ann,
                            'passed_tainted': bool(uses_tainted)
                        })
                else:
                    if uses_tainted:
                        result.update({
                            'type': 'STMT', 'icon': '▸', 'color': '#ef4444',
                            'annotation': f'Instrucción lee variable contaminada ({", ".join(uses_tainted)})',
                            'risk': 'warning'
                        })
                    elif uses_sanitized:
                        result.update({
                            'type': 'STMT', 'icon': '▸', 'color': '#10b981',
                            'annotation': f'Instrucción lee variable sanitizada ({", ".join(uses_sanitized)})',
                            'risk': 'safe'
                        })
                    else:
                        result.update({
                            'type': 'STMT', 'icon': '▸', 'color': '#4b5563',
                            'annotation': 'Instrucción de código',
                            'risk': 'none'
                        })

        result['tainted_vars'] = list(tainted_vars)
        result['sanitized_vars'] = list(sanitized_vars)
        steps.append(result)

    return {
        'node_id': node_id,
        'func_name': func_name,
        'filepath': filepath,
        'language': language,
        'parameters': list(parameters),
        'start_line': start_line + 1,
        'end_line': end_line + 1,
        'steps': steps,
        'summary': _build_summary(steps),
    }


def _find_function_node(root, func_name: str, source_bytes: bytes):
    """Busca recursivamente el nodo función con ese nombre en el AST."""
    fn_types = ('function_definition', 'method_declaration', 'function_declaration', 'method_definition', 'arrow_function')

    def walk(node):
        if node.type in fn_types:
            name = None
            name_node = node.child_by_field_name('name')
            if name_node:
                name = source_bytes[name_node.start_byte:name_node.end_byte].decode('utf-8', errors='ignore')
            elif node.type == 'arrow_function' and node.parent and node.parent.type == 'variable_declarator':
                parent_name_node = node.parent.child_by_field_name('name')
                if parent_name_node:
                    name = source_bytes[parent_name_node.start_byte:parent_name_node.end_byte].decode('utf-8', errors='ignore')
            
            if name == func_name:
                return node
        for child in node.children:
            result = walk(child)
            if result:
                return result
        return None

    return walk(root)


def _build_summary(steps: list) -> dict:
    """Genera un resumen del análisis de flujo."""
    has_source  = any(s['type'] == 'CAPTURE' for s in steps)
    has_sink    = any(s['type'] == 'SINK' for s in steps)
    has_san     = any(s['type'] == 'SANITIZE' for s in steps)
    has_ext     = any(s['type'] == 'EXTERNAL_CALL' for s in steps)
    sink_steps  = [s for s in steps if s['type'] == 'SINK']
    risk_level  = 'none'

    if has_source and has_sink and not has_san:
        risk_level = 'critical'
    elif has_source and has_sink and has_san:
        risk_level = 'warning'
    elif has_source and has_ext:
        risk_level = 'info'

    return {
        'has_external_input': has_source,
        'has_dangerous_sink': has_sink,
        'has_sanitization':   has_san,
        'has_external_calls': has_ext,
        'risk_level':         risk_level,
        'sink_count':         len(sink_steps),
    }


def _build_concatenation(expr: str, payload: str, tainted_vars: list) -> str:
    # Para no destruir llamadas a funciones (ej. escape(req.args.get)), 
    # simplemente sustituimos el nombre de la variable manchada por el payload real
    # para que el usuario vea la expresión de código con su inyección incrustada.
    result = expr
    for var in tainted_vars:
        clean_var = var.lstrip('$')
        # Reemplazar la variable (con o sin $) solo si es una palabra completa
        pattern = r'(?<![\w.\'"])\$?' + re.escape(clean_var) + r'(?![\w.\'"])'
        result = re.sub(pattern, payload, result)
    return result

def compute_interprocedural_dataflow(paths: list, all_edges: list, function_registry: dict, initial_payload: str = "", target_param: str = None) -> list:
    """
    Computa el flujo de datos interprocedural respetando las bifurcaciones y propagando el payload.
    """
    if not paths:
        return []

    funcs_to_analyze = set()
    for path in paths:
        for node in path["nodes"]:
            if '::' in node:
                funcs_to_analyze.add(node)
                
    local_analyses = {}
    for func_id in funcs_to_analyze:
        # Pass target_param ONLY if it's the first node in the path (the sandbox target)
        is_source_node = any(func_id == path["nodes"][0] for path in paths)
        res = analyze_function_dataflow(func_id, function_registry, target_param if is_source_node else None)
        if "error" not in res:
            local_analyses[func_id] = res

    # Obtener un orden de descubrimiento para aplanar el árbol en el Visual PDB
    discovery_order = []
    seen = set()
    for path in paths:
        for node in path["nodes"]:
            if '::' in node and node not in seen:
                seen.add(node)
                discovery_order.append(node)

    payload_states = {discovery_order[0]: initial_payload} if discovery_order else {}
    inter_steps = []
    import re
    
    for func_id in discovery_order:
        local_res = local_analyses.get(func_id)
        if not local_res: continue
        
        current_payload = payload_states.get(func_id, initial_payload)
        local_steps = local_res.get("steps", [])
        if not local_steps: continue
        
        start_idx = 0
        if func_id == discovery_order[0]:
            for s_idx, step in enumerate(local_steps):
                if step["type"] == "CAPTURE" or (step.get("tainted_vars") and len(step["tainted_vars"]) > 0):
                    start_idx = s_idx
                    break
                    
        for step in local_steps[start_idx:]:
            code = step["raw_code"]
            step_copy = dict(step)
            step_copy["filepath"] = local_res["filepath"]
            step_copy["func_name"] = local_res["func_name"]
            
            payload_in = current_payload
            
            # Solo aplicamos reglas de mutación si la instrucción está modificando o usando variables manchadas
            is_mutating = step["type"] in ("ASSIGN", "CAPTURE", "SANITIZE")
            
            if is_mutating:
                assign_match = re.match(r'\s*(?:let|const|var)?\s*(\$?[\w.]+)\s*(=|\+=|-=|\*=)\s*(.*)', code)
                if assign_match:
                    lhs_var = assign_match.group(1).lstrip('$')
                    expr = assign_match.group(3)
                    
                    if lhs_var in step.get('tainted_vars', []) or step["type"] == "SANITIZE":
                        # 1. Simulación de Concatenación y f-strings
                        tainted_in_step = step.get('tainted_vars', [])
                        if ('+' in expr or '.' in expr or '{' in expr or '%' in expr):
                            current_payload = _build_concatenation(expr, current_payload, tainted_in_step)
                        
                        if ".replace(" in code or "str_replace(" in code:
                            m = re.search(r'(?:\.replace|str_replace)\(\s*[\'"](.*?)[\'"]\s*,\s*[\'"](.*?)[\'"]', code)
                            if m:
                                old_val, new_val = m.groups()
                                current_payload = current_payload.replace(old_val, new_val)
                        
                        if ".strip(" in code or "trim(" in code:
                            m = re.search(r'(?:\.strip|trim)\(\s*[\'"](.*?)[\'"]\s*\)', code)
                            if m:
                                current_payload = current_payload.strip(m.group(1))
                            elif ".strip()" in code or "trim(" in code:
                                current_payload = current_payload.strip()
                                
                        if "int(" in code or "intval(" in code:
                            try:
                                digits = re.sub(r'\D', '', current_payload)
                                current_payload = digits if digits else "0"
                            except Exception:
                                current_payload = "0"
                                
                        if "escape" in code.lower() or "htmlspecialchars" in code.lower():
                            current_payload = current_payload.replace("<", "&lt;").replace(">", "&gt;").replace("'", "&#39;").replace('"', "&quot;")

            step_copy["payload_in"] = None
            step_copy["payload_out"] = None

            if is_mutating and (step.get('tainted_vars') or step["type"] == "SANITIZE"):
                if payload_in != current_payload or step["type"] == "CAPTURE" or step["type"] == "SANITIZE":
                    step_copy["payload_in"] = payload_in
                    step_copy["payload_out"] = current_payload

            inter_steps.append(step_copy)

            if step_copy["type"] == "EXTERNAL_CALL" and step_copy.get("external_call"):
                for target in step_copy["external_call"].get("targets", []):
                    if target in seen and target not in payload_states:
                        payload_states[target] = current_payload

    return inter_steps
