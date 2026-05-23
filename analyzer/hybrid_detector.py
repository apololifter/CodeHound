import tree_sitter
from typing import List, Dict, Any, Optional, Tuple, Set
import os
import re

class LanguageStrategy:
    def extract_nodes(self, tree: tree_sitter.Tree, filepath: str, source_code: bytes, function_registry: Dict[str, List[str]]) -> List[Dict]:
        raise NotImplementedError()
        
    def extract_edges(self, tree: tree_sitter.Tree, filepath: str, source_code: bytes, filename_map: Dict[str, List[str]], function_registry: Dict[str, List[str]]) -> List[Dict]:
        raise NotImplementedError()

    def _find_strings(self, node, source_code: bytes) -> Set[str]:
        strings = set()
        cursor = node.walk()
        def traverse_strings(cursor):
            n = cursor.node
            if n.type in ("string", "string_content", "string_literal", "encapsed_string"):
                text = source_code[n.start_byte:n.end_byte].decode('utf-8')
                if len(text) >= 2 and text[0] in ("'", '"', '`') and text[-1] == text[0]:
                    text = text[1:-1]
                strings.add(text)
            if cursor.goto_first_child():
                traverse_strings(cursor)
                while cursor.goto_next_sibling():
                    traverse_strings(cursor)
                cursor.goto_parent()
        traverse_strings(cursor)
        return strings

    def _get_line_code(self, source_code: bytes, line_number: int) -> str:
        try:
            lines = source_code.split(b'\n')
            if 1 <= line_number <= len(lines):
                return lines[line_number - 1].decode('utf-8', errors='ignore').strip()
        except Exception:
            pass
        return ""

    def _check_hybrid_calls(self, current_scope: str, strings: Set[str], filename_map: Dict[str, List[str]], call_name: str, line_number: int, source_code: bytes = b"") -> List[Dict]:
        edges = []
        for s in strings:
            for basename, target_filepaths in filename_map.items():
                pattern = r'(^|\s|["\'])' + re.escape(basename) + r'($|\s|["\'])'
                if re.search(pattern, s):
                    for target_filepath in target_filepaths:
                        edges.append({
                            "source": current_scope,
                            "target": target_filepath,
                            "type": "hybrid_call",
                            "label": call_name,
                            "line_number": line_number,
                            "line_code": self._get_line_code(source_code, line_number)
                        })
        return edges

    def _resolve_standard_call(self, current_scope: str, call_name: str, filepath: str, function_registry: Dict[str, List[str]], line_number: int, source_code: bytes = b"") -> Optional[Dict]:
        if call_name.startswith("/") and call_name in function_registry:
            candidates = function_registry[call_name]
            if candidates:
                return {
                    "source": current_scope,
                    "target": candidates[0],
                    "type": "api_call",
                    "label": f"FETCH {call_name}",
                    "line_number": line_number,
                    "line_code": self._get_line_code(source_code, line_number)
                }

        if call_name not in function_registry:
            return None
        
        candidates = function_registry[call_name]
        if not candidates:
            return None
            
        target_id = candidates[0]
        for cand in candidates:
            if cand.startswith(filepath):
                target_id = cand
                break
                
        return {
            "source": current_scope,
            "target": target_id,
            "type": "standard_call",
            "label": "calls",
            "line_number": line_number,
            "line_code": self._get_line_code(source_code, line_number)
        }

class PythonStrategy(LanguageStrategy):
    def extract_nodes(self, tree: tree_sitter.Tree, filepath: str, source_code: bytes, function_registry: Dict[str, List[str]]) -> List[Dict]:
        nodes = []
        nodes.append({
            "id": f"Global::{filepath}",
            "type": "module",
            "language": "python",
            "label": "[Ámbito Global]",
            "parent": filepath,
            "line_number": 1
        })
        cursor = tree.walk()
        def traverse(cursor):
            node = cursor.node
            
            if node.type == "decorated_definition":
                decorators = [c for c in node.children if c.type == "decorator"]
                for decorator in decorators:
                    dec_text = source_code[decorator.start_byte:decorator.end_byte].decode('utf-8')
                    match = re.search(r"['\"](/[^'\"]+)['\"]", dec_text)
                    if match:
                        route_path = match.group(1)
                        func_node = next((c for c in node.children if c.type == "function_definition"), None)
                        if func_node:
                            name_node = func_node.child_by_field_name("name")
                            if name_node:
                                func_name = source_code[name_node.start_byte:name_node.end_byte].decode('utf-8')
                                func_id = f"{filepath}::{func_name}"
                                if route_path not in function_registry:
                                    function_registry[route_path] = []
                                if func_id not in function_registry[route_path]:
                                    function_registry[route_path].append(func_id)

            if node.type == "function_definition":
                name_node = node.child_by_field_name("name")
                if name_node:
                    func_name = source_code[name_node.start_byte:name_node.end_byte].decode('utf-8')
                    func_id = f"{filepath}::{func_name}"
                    nodes.append({
                        "id": func_id,
                        "type": "function",
                        "language": "python",
                        "label": func_name,
                        "parent": filepath,
                        "line_number": node.start_point[0] + 1
                    })
                    if func_name not in function_registry:
                        function_registry[func_name] = []
                    function_registry[func_name].append(func_id)
                    
            if cursor.goto_first_child():
                traverse(cursor)
                while cursor.goto_next_sibling():
                    traverse(cursor)
                cursor.goto_parent()
        traverse(cursor)
        return nodes

    def extract_edges(self, tree: tree_sitter.Tree, filepath: str, source_code: bytes, filename_map: Dict[str, List[str]], function_registry: Dict[str, List[str]]) -> List[Dict]:
        edges = []
        cursor = tree.walk()
        scope_stack = [f"Global::{filepath}"] 
        
        def traverse(cursor, current_stack):
            node = cursor.node
            is_scope = False
            
            if node.type == "import_from_statement":
                module_node = node.child_by_field_name("module_name")
                if module_node:
                    mod_name = source_code[module_node.start_byte:module_node.end_byte].decode('utf-8')
                    target_basename = mod_name.split('.')[-1] + ".py"
                    if target_basename in filename_map:
                        for tgt_path in filename_map[target_basename]:
                            edges.append({
                                "source": f"Global::{tgt_path}",
                                "target": f"Global::{filepath}",
                                "type": "DATA_DEPENDENCY",
                                "label": f"import from {target_basename}",
                                "line_number": node.start_point[0] + 1,
                                "line_code": self._get_line_code(source_code, node.start_point[0] + 1)
                            })
                            
            if node.type == "function_definition":
                name_node = node.child_by_field_name("name")
                if name_node:
                    func_name = source_code[name_node.start_byte:name_node.end_byte].decode('utf-8')
                    func_id = f"{filepath}::{func_name}"
                    current_stack.append(func_id)
                    is_scope = True
            
            elif node.type == "call":
                func_node = node.child_by_field_name("function")
                if func_node:
                    call_name_full = source_code[func_node.start_byte:func_node.end_byte].decode('utf-8')
                    call_name = call_name_full.split(".")[-1]
                    line_number = node.start_point[0] + 1
                    
                    current_scope = current_stack[-1]
                    
                    if call_name_full in ("subprocess.run", "subprocess.call", "subprocess.Popen", "os.system"):
                        args_node = node.child_by_field_name("arguments")
                        if args_node:
                            strings = self._find_strings(args_node, source_code)
                            edges.extend(self._check_hybrid_calls(current_scope, strings, filename_map, call_name_full, line_number, source_code))
                    else:
                        edge = self._resolve_standard_call(current_scope, call_name, filepath, function_registry, line_number, source_code)
                        if edge:
                            edges.append(edge)
            
            if cursor.goto_first_child():
                traverse(cursor, current_stack)
                while cursor.goto_next_sibling():
                    traverse(cursor, current_stack)
                cursor.goto_parent()
                
            if is_scope:
                current_stack.pop()

        traverse(cursor, scope_stack)
        return edges

class PHPStrategy(LanguageStrategy):
    def extract_nodes(self, tree: tree_sitter.Tree, filepath: str, source_code: bytes, function_registry: Dict[str, List[str]]) -> List[Dict]:
        nodes = []
        nodes.append({
            "id": f"Global::{filepath}",
            "type": "module",
            "language": "php",
            "label": "[Ámbito Global]",
            "parent": filepath,
            "line_number": 1
        })
        cursor = tree.walk()
        def traverse(cursor):
            node = cursor.node
            if node.type in ("function_definition", "method_declaration"):
                name_node = node.child_by_field_name("name")
                if name_node:
                    func_name = source_code[name_node.start_byte:name_node.end_byte].decode('utf-8')
                    func_id = f"{filepath}::{func_name}"
                    nodes.append({
                        "id": func_id,
                        "type": "function",
                        "language": "php",
                        "label": func_name,
                        "parent": filepath,
                        "line_number": node.start_point[0] + 1
                    })
                    if func_name not in function_registry:
                        function_registry[func_name] = []
                    function_registry[func_name].append(func_id)
                    
            if cursor.goto_first_child():
                traverse(cursor)
                while cursor.goto_next_sibling():
                    traverse(cursor)
                cursor.goto_parent()
        traverse(cursor)
        return nodes

    def extract_edges(self, tree: tree_sitter.Tree, filepath: str, source_code: bytes, filename_map: Dict[str, List[str]], function_registry: Dict[str, List[str]]) -> List[Dict]:
        edges = []
        cursor = tree.walk()
        scope_stack = [f"Global::{filepath}"]
        
        def traverse(cursor, current_stack):
            node = cursor.node
            is_scope = False
            
            if node.type in ("include_expression", "require_expression", "include_once_expression", "require_once_expression"):
                strings = self._find_strings(node, source_code)
                for s in strings:
                    target_basename = s.split('/')[-1]
                    if target_basename in filename_map:
                        for tgt_path in filename_map[target_basename]:
                            edges.append({
                                "source": f"Global::{tgt_path}",
                                "target": f"Global::{filepath}",
                                "type": "DATA_DEPENDENCY",
                                "label": f"include {target_basename}",
                                "line_number": node.start_point[0] + 1,
                                "line_code": self._get_line_code(source_code, node.start_point[0] + 1)
                            })
            
            if node.type in ("function_definition", "method_declaration"):
                name_node = node.child_by_field_name("name")
                if name_node:
                    func_name = source_code[name_node.start_byte:name_node.end_byte].decode('utf-8')
                    func_id = f"{filepath}::{func_name}"
                    current_stack.append(func_id)
                    is_scope = True
            
            elif node.type == "function_call_expression":
                func_node = node.child_by_field_name("function")
                if func_node:
                    call_name_full = source_code[func_node.start_byte:func_node.end_byte].decode('utf-8')
                    call_name = call_name_full.split("->")[-1].split("::")[-1]
                    current_scope = current_stack[-1]
                    line_number = node.start_point[0] + 1
                    
                    if call_name_full in ("exec", "shell_exec", "system", "passthru"):
                        args_node = node.child_by_field_name("arguments")
                        if args_node:
                            strings = self._find_strings(args_node, source_code)
                            edges.extend(self._check_hybrid_calls(current_scope, strings, filename_map, call_name_full, line_number, source_code))
                    else:
                        edge = self._resolve_standard_call(current_scope, call_name, filepath, function_registry, line_number, source_code)
                        if edge:
                            edges.append(edge)
            
            if cursor.goto_first_child():
                traverse(cursor, current_stack)
                while cursor.goto_next_sibling():
                    traverse(cursor, current_stack)
                cursor.goto_parent()
                
            if is_scope:
                current_stack.pop()

        traverse(cursor, scope_stack)
        return edges

class JavascriptStrategy(LanguageStrategy):
    def extract_nodes(self, tree: tree_sitter.Tree, filepath: str, source_code: bytes, function_registry: Dict[str, List[str]]) -> List[Dict]:
        nodes = []
        nodes.append({
            "id": f"Global::{filepath}",
            "type": "module",
            "language": "javascript",
            "label": "[Ámbito Global]",
            "parent": filepath,
            "line_number": 1
        })
        cursor = tree.walk()
        def traverse(cursor):
            node = cursor.node
            if node.type in ("function_declaration", "method_definition", "arrow_function"):
                name_node = node.child_by_field_name("name")
                func_name = "anonymous"
                if name_node:
                    func_name = source_code[name_node.start_byte:name_node.end_byte].decode('utf-8')
                elif node.parent and node.parent.type == "variable_declarator":
                    name_node = node.parent.child_by_field_name("name")
                    if name_node:
                        func_name = source_code[name_node.start_byte:name_node.end_byte].decode('utf-8')

                if func_name != "anonymous":
                    func_id = f"{filepath}::{func_name}"
                    nodes.append({
                        "id": func_id,
                        "type": "function",
                        "language": "javascript",
                        "label": func_name,
                        "parent": filepath,
                        "line_number": node.start_point[0] + 1
                    })
                    if func_name not in function_registry:
                        function_registry[func_name] = []
                    function_registry[func_name].append(func_id)
                    
            if cursor.goto_first_child():
                traverse(cursor)
                while cursor.goto_next_sibling():
                    traverse(cursor)
                cursor.goto_parent()
        traverse(cursor)
        return nodes

    def extract_edges(self, tree: tree_sitter.Tree, filepath: str, source_code: bytes, filename_map: Dict[str, List[str]], function_registry: Dict[str, List[str]]) -> List[Dict]:
        edges = []
        cursor = tree.walk()
        scope_stack = [f"Global::{filepath}"]
        
        def traverse(cursor, current_stack):
            node = cursor.node
            is_scope = False
            
            if node.type in ("import_statement", "lexical_declaration", "variable_declaration"):
                strings = self._find_strings(node, source_code)
                for s in strings:
                    if s.startswith("./") or s.startswith("../") or "/" in s:
                        target_basename = s.split('/')[-1]
                        if not target_basename.endswith(".js"): target_basename += ".js"
                        if target_basename in filename_map:
                            for tgt_path in filename_map[target_basename]:
                                edges.append({
                                    "source": f"Global::{tgt_path}",
                                    "target": f"Global::{filepath}",
                                    "type": "DATA_DEPENDENCY",
                                    "label": f"import {target_basename}",
                                    "line_number": node.start_point[0] + 1,
                                    "line_code": self._get_line_code(source_code, node.start_point[0] + 1)
                                })
                                
            if node.type in ("function_declaration", "method_definition", "arrow_function"):
                name_node = node.child_by_field_name("name")
                func_name = "anonymous"
                if name_node:
                    func_name = source_code[name_node.start_byte:name_node.end_byte].decode('utf-8')
                elif node.parent and node.parent.type == "variable_declarator":
                    name_node = node.parent.child_by_field_name("name")
                    if name_node:
                        func_name = source_code[name_node.start_byte:name_node.end_byte].decode('utf-8')

                if func_name != "anonymous":
                    func_id = f"{filepath}::{func_name}"
                    current_stack.append(func_id)
                    is_scope = True
            
            elif node.type == "call_expression":
                func_node = node.child_by_field_name("function")
                if func_node:
                    call_name_full = source_code[func_node.start_byte:func_node.end_byte].decode('utf-8')
                    call_name = call_name_full.split(".")[-1]
                    current_scope = current_stack[-1]
                    line_number = node.start_point[0] + 1
                    
                    if call_name_full in ("exec", "execSync", "spawn", "spawnSync"):
                        args_node = node.child_by_field_name("arguments")
                        if args_node:
                            strings = self._find_strings(args_node, source_code)
                            edges.extend(self._check_hybrid_calls(current_scope, strings, filename_map, call_name_full, line_number, source_code))
                    elif call_name_full in ("fetch", "axios", "axios.get", "axios.post", "$.get", "$.post", "$.ajax"):
                        args_node = node.child_by_field_name("arguments")
                        if args_node:
                            strings = self._find_strings(args_node, source_code)
                            for s in strings:
                                if s.startswith("/"):
                                    edge = self._resolve_standard_call(current_scope, s, filepath, function_registry, line_number, source_code)
                                    if edge: edges.append(edge)
                    else:
                        edge = self._resolve_standard_call(current_scope, call_name, filepath, function_registry, line_number, source_code)
                        if edge:
                            edges.append(edge)
            
            if cursor.goto_first_child():
                traverse(cursor, current_stack)
                while cursor.goto_next_sibling():
                    traverse(cursor, current_stack)
                cursor.goto_parent()
                
            if is_scope:
                current_stack.pop()

        traverse(cursor, scope_stack)
        return edges

class DefaultStrategy(LanguageStrategy):
    def extract_nodes(self, tree, filepath, source_code, function_registry): return []
    def extract_edges(self, tree, filepath, source_code, filename_map, function_registry): return []

_strategies = {
    "python": PythonStrategy(),
    "php": PHPStrategy(),
    "javascript": JavascriptStrategy()
}

def get_strategy(language: str) -> LanguageStrategy:
    return _strategies.get(language, DefaultStrategy())
