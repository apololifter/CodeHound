"""
sandbox_runner.py — Micro-sandbox aislado con capacidad de debugger interactivo.

Mejoras v2:
  A. _FluentMock: absorbe cualquier operación Python sin excepciones
  B. _DebugInstrumenter: AST rewriting que inyecta __trace__ tras cada asignación
  C. Frames estructurados: lista ordenada con taint propagation por frame
  D. run_fuzzer ahora devuelve frames por payload (compatible con DebuggerPanel)
"""

import sys
import importlib.util
import os
import traceback
import inspect
import builtins
import types
import ast
import time
import copy


# ──────────────────────────────────────────────────────────────
# A. FluentMock — absorbe cualquier operación sin errores
# ──────────────────────────────────────────────────────────────

class _FluentMock:
    """
    Objeto que responde a cualquier acceso, llamada, indexación o comparación
    sin lanzar excepciones. Útil para módulos / clases faltantes.
    """
    def __init__(self, name: str = "mock"):
        object.__setattr__(self, "_fm_name", name)

    # Accesos y llamadas
    def __getattr__(self, k):
        if k.startswith("_fm_"):
            raise AttributeError(k)
        return _FluentMock(f"{object.__getattribute__(self, '_fm_name')}.{k}")

    def __setattr__(self, k, v):
        if k.startswith("_fm_"):
            object.__setattr__(self, k, v)

    def __call__(self, *a, **kw):
        return _FluentMock(f"{object.__getattribute__(self, '_fm_name')}()")

    # Contenedores
    def __getitem__(self, k):   return _FluentMock(f"{object.__getattribute__(self, '_fm_name')}[{k!r}]")
    def __setitem__(self, k, v): pass
    def __delitem__(self, k):   pass
    def __contains__(self, k):  return False
    def __iter__(self):         return iter([])
    def __len__(self):          return 0

    # Context manager
    def __enter__(self):        return self
    def __exit__(self, *a):     return False

    # Booleanos / comparaciones
    def __bool__(self):         return True
    def __eq__(self, o):        return False
    def __ne__(self, o):        return True
    def __lt__(self, o):        return False
    def __le__(self, o):        return False
    def __gt__(self, o):        return False
    def __ge__(self, o):        return False

    # Aritmética — devuelve el otro operando para que concatenaciones funcionen
    def __add__(self, o):       return o
    def __radd__(self, o):      return o
    def __mul__(self, o):       return self
    def __rmul__(self, o):      return self

    # Numérico
    def __int__(self):          return 0
    def __float__(self):        return 0.0
    def __index__(self):        return 0

    # Hash / repr
    def __hash__(self):         return 0
    def __str__(self):
        return f"[mock:{object.__getattribute__(self, '_fm_name')}]"
    def __repr__(self):
        return f"<FluentMock {object.__getattribute__(self, '_fm_name')}>"


class _StubModule(types.ModuleType):
    """Módulo stub que devuelve FluentMock para cualquier atributo."""

    def __iter__(self):
        return iter(())

    def __call__(self, *args, **kwargs):
        return _FluentMock(self.__name__)

    def __getattr__(self, name):
        if name.startswith("__") and name not in ("__path__", "__package__", "__spec__"):
            raise AttributeError(name)
        child_name = f"{self.__name__}.{name}" if self.__name__ else name
        if child_name in sys.modules and isinstance(sys.modules[child_name], _StubModule):
            return sys.modules[child_name]
        obj = _FluentMock(child_name)
        object.__setattr__(self, name, obj)
        return obj

    def __getitem__(self, item):
        return _FluentMock(f"{self.__name__}[{item!r}]")

    def __len__(self):
        return 0


def _ensure_stub_module(name: str) -> types.ModuleType:
    if name in sys.modules and isinstance(sys.modules[name], _StubModule):
        return sys.modules[name]
    parts = name.split(".")
    mod = None
    for i in range(len(parts)):
        full = ".".join(parts[: i + 1])
        if full not in sys.modules or not isinstance(sys.modules.get(full), _StubModule):
            parent = ".".join(parts[:i]) if i else None
            m = _StubModule(full)
            m.__file__ = "<sandbox-stub>"
            m.__package__ = parent or ""
            sys.modules[full] = m
            if parent and parent in sys.modules:
                try:
                    setattr(sys.modules[parent], parts[i], m)
                except Exception:
                    pass
        mod = sys.modules[full]
    return mod


# ──────────────────────────────────────────────────────────────
# Import stub machinery (unchanged logic, updated to use _FluentMock)
# ──────────────────────────────────────────────────────────────

_STDLIB_ROOTS = frozenset({
    'abc', 'aifc', 'argparse', 'array', 'ast', 'asyncio', 'atexit', 'base64', 'bdb',
    'binascii', 'bisect', 'builtins', 'bz2', 'calendar', 'cgi', 'cgitb', 'chunk',
    'cmath', 'cmd', 'code', 'codecs', 'codeop', 'collections', 'colorsys', 'compileall',
    'concurrent', 'configparser', 'contextlib', 'contextvars', 'copy', 'copyreg', 'cProfile',
    'crypt', 'csv', 'ctypes', 'curses', 'dataclasses', 'datetime', 'dbm', 'decimal', 'difflib',
    'dis', 'distutils', 'doctest', 'email', 'encodings', 'enum', 'errno', 'faulthandler',
    'fcntl', 'filecmp', 'fileinput', 'fnmatch', 'fractions', 'ftplib', 'functools', 'gc',
    'getopt', 'getpass', 'gettext', 'glob', 'graphlib', 'grp', 'gzip', 'hashlib', 'heapq',
    'hmac', 'html', 'http', 'idlelib', 'imaplib', 'imghdr', 'imp', 'importlib', 'inspect',
    'io', 'ipaddress', 'itertools', 'json', 'keyword', 'lib2to3', 'linecache', 'locale',
    'logging', 'lzma', 'mailbox', 'mailcap', 'marshal', 'math', 'mimetypes', 'mmap',
    'modulefinder', 'multiprocessing', 'netrc', 'nis', 'nntplib', 'numbers', 'operator',
    'optparse', 'os', 'ossaudiodev', 'pathlib', 'pdb', 'pickle', 'pickletools', 'pipes',
    'pkgutil', 'platform', 'plistlib', 'poplib', 'posix', 'posixpath', 'pprint', 'profile',
    'pstats', 'pty', 'pwd', 'py_compile', 'pyclbr', 'pydoc', 'queue', 'quopri', 'random',
    're', 'readline', 'reprlib', 'resource', 'rlcompleter', 'runpy', 'sched', 'secrets',
    'select', 'selectors', 'shelve', 'shlex', 'shutil', 'signal', 'site', 'smtplib', 'sndhdr',
    'socket', 'socketserver', 'sqlite3', 'sre_compile', 'sre_constants', 'sre_parse', 'ssl',
    'stat', 'statistics', 'string', 'stringprep', 'struct', 'subprocess', 'sunau', 'symtable',
    'sys', 'sysconfig', 'syslog', 'tabnanny', 'tarfile', 'telnetlib', 'tempfile', 'termios',
    'test', 'textwrap', 'threading', 'time', 'timeit', 'tkinter', 'token', 'tokenize', 'trace',
    'traceback', 'tracemalloc', 'tty', 'turtle', 'turtledemo', 'types', 'typing', 'unicodedata',
    'unittest', 'urllib', 'uu', 'uuid', 'venv', 'warnings', 'wave', 'weakref', 'webbrowser',
    'winreg', 'winsound', 'wsgiref', 'xdrlib', 'xml', 'xmlrpc', 'zipapp', 'zipfile', 'zipimport',
    'zlib', '_thread',
})


def _is_stdlib(name: str) -> bool:
    root = name.split(".")[0]
    if root.startswith("_"):
        return True
    if root in sys.builtin_module_names:
        return True
    if hasattr(sys, "stdlib_module_names") and root in sys.stdlib_module_names:
        return True
    return root in _STDLIB_ROOTS


def _is_local_module(name: str, basedir: str) -> bool:
    if not basedir:
        return False
    root = name.split(".")[0]
    path_py = os.path.normpath(os.path.join(basedir, root + ".py"))
    path_dir = os.path.normpath(os.path.join(basedir, root))
    if os.path.isfile(path_py):
        return True
    if os.path.isdir(path_dir) and os.path.isfile(os.path.join(path_dir, "__init__.py")):
        return True
    return False


def _install_import_stubs(basedir: str = None):
    real_import = builtins.__import__

    def stub_import(name, globals=None, locals=None, fromlist=(), level=0):
        norm_fromlist = fromlist if fromlist is not None else ()
        norm_globals = globals if globals is not None else {}
        norm_locals = locals if locals is not None else {}

        if basedir and _is_local_module(name, basedir):
            try:
                return real_import(name, norm_globals, norm_locals, norm_fromlist, level)
            except Exception:
                pass

        if level != 0:
            try:
                return real_import(name, norm_globals, norm_locals, norm_fromlist, level)
            except ModuleNotFoundError:
                pass

        if _is_stdlib(name):
            try:
                mod = real_import(name, norm_globals, norm_locals, norm_fromlist, level)
                if norm_fromlist:
                    for attr in norm_fromlist:
                        if not hasattr(mod, attr):
                            setattr(mod, attr, _FluentMock(attr))
                return mod
            except ModuleNotFoundError:
                pass

        mod = _ensure_stub_module(name)
        if norm_fromlist:
            for attr in norm_fromlist:
                if not hasattr(mod, attr):
                    setattr(mod, attr, _FluentMock(f"{name}.{attr}"))
        return mod

    builtins.__import__ = stub_import
    return real_import


def _restore_import(real_import):
    builtins.__import__ = real_import


# ──────────────────────────────────────────────────────────────
# B. _DebugInstrumenter — AST Rewriting
# ──────────────────────────────────────────────────────────────

class _DebugInstrumenter(ast.NodeTransformer):
    """
    Inyecta `__trace__(lineno, vars())` inmediatamente después de cada
    statement de asignación, de modo que se captura el estado exacto
    de las variables en ese punto de ejecución.
    """

    def _make_trace_call(self, lineno: int) -> ast.Expr:
        node = ast.Expr(
            value=ast.Call(
                func=ast.Name(id="__trace__", ctx=ast.Load()),
                args=[
                    ast.Constant(value=lineno),
                    ast.Call(
                        func=ast.Name(id="vars", ctx=ast.Load()),
                        args=[],
                        keywords=[],
                    ),
                ],
                keywords=[],
            )
        )
        node.lineno = lineno
        node.col_offset = 0
        node.end_lineno = lineno
        node.end_col_offset = 0
        ast.fix_missing_locations(node)
        return node

    def _wrap_body(self, body: list) -> list:
        new_body = []
        for stmt in body:
            new_body.append(stmt)
            lineno = getattr(stmt, "lineno", None)
            if lineno and isinstance(stmt, (
                ast.Assign, ast.AugAssign, ast.AnnAssign,
                ast.Return, ast.Expr,
            )):
                new_body.append(self._make_trace_call(lineno))
        return new_body

    def visit_FunctionDef(self, node):
        self.generic_visit(node)
        node.body = self._wrap_body(node.body)
        return node

    def visit_AsyncFunctionDef(self, node):
        self.generic_visit(node)
        node.body = self._wrap_body(node.body)
        return node

    def visit_For(self, node):
        self.generic_visit(node)
        # Inject trace at top of for-body to capture loop variable
        if node.body:
            lineno = node.lineno
            node.body.insert(0, self._make_trace_call(lineno))
        return node

    def visit_With(self, node):
        self.generic_visit(node)
        if node.body:
            lineno = node.lineno
            node.body.insert(0, self._make_trace_call(lineno))
        return node

    def visit_If(self, node):
        self.generic_visit(node)
        return node


def _instrument_source(source: str, filename: str) -> str:
    """Parsea el código fuente, lo instrumenta y devuelve el código compilado."""
    try:
        tree = ast.parse(source, filename=filename)
        instrumenter = _DebugInstrumenter()
        new_tree = instrumenter.visit(tree)
        ast.fix_missing_locations(new_tree)
        return compile(new_tree, filename, "exec")
    except SyntaxError:
        # Si hay error de sintaxis, compila sin instrumentar
        return compile(source, filename, "exec")


# ──────────────────────────────────────────────────────────────
# AST helpers (find function node)
# ──────────────────────────────────────────────────────────────

def _find_function_ast(tree: ast.AST, func_name: str):
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == func_name:
            return node
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == func_name:
            return node
    return None


def _load_isolated_function(filepath: str, func_name: str, target_module_name: str):
    """Carga solo imports + función objetivo, omitiendo efectos de módulo (Flask app, etc.)."""
    with open(filepath, "rb") as f:
        source_bytes = f.read()
    tree = ast.parse(source_bytes, filename=filepath)
    func_node = _find_function_ast(tree, func_name)
    if not func_node:
        raise ValueError(f"Función {func_name} no encontrada en {filepath}.")

    builtins_dict = __builtins__ if isinstance(__builtins__, dict) else __builtins__.__dict__
    safe_builtins = {
        k: v for k, v in builtins_dict.items() 
        if k not in ("eval", "exec", "open", "__import__", "compile", "globals", "locals")
    }
    safe_builtins["__import__"] = builtins.__import__

    namespace = {
        "__builtins__": safe_builtins,
        "__name__": target_module_name,
        "__file__": filepath,
    }
    basedir = os.path.dirname(filepath)
    added_to_path = False
    if basedir not in sys.path:
        sys.path.insert(0, basedir)
        added_to_path = True

    real_import = _install_import_stubs(basedir)
    try:
        for node in tree.body:
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                import_mod = ast.Module([node], type_ignores=[])
                exec(compile(import_mod, filepath, "exec"), namespace)
        instrumenter = _DebugInstrumenter()
        instrumented_node = instrumenter.visit(func_node)
        ast.fix_missing_locations(instrumented_node)
        fn_mod = ast.Module([instrumented_node], type_ignores=[])
        exec(compile(fn_mod, filepath, "exec"), namespace)
    finally:
        _restore_import(real_import)
        if added_to_path:
            try:
                sys.path.remove(basedir)
            except Exception:
                pass
    return namespace[func_name]


# ──────────────────────────────────────────────────────────────
# SecurityMock — intercepta operaciones peligrosas
# ──────────────────────────────────────────────────────────────

class SecurityMock:
    def __init__(self, name, intercepted_list):
        self.name = name
        self.intercepted_list = intercepted_list

    def __call__(self, *args, **kwargs):
        call_details = {
            "module": self.name,
            "args": [str(a) for a in args],
            "kwargs": {k: str(v) for k, v in kwargs.items()},
        }
        self.intercepted_list.append(call_details)
        return self

    def __getattr__(self, item):
        if item in ("__class__", "__name__", "__bases__"):
            raise AttributeError()
        return SecurityMock(f"{self.name}.{item}", self.intercepted_list)

    def __getitem__(self, item):
        return SecurityMock(f"{self.name}[{item!r}]", self.intercepted_list)

    def __len__(self):   return 0
    def __iter__(self):  return iter([])
    def __bool__(self):  return True
    def __enter__(self): return self
    def __exit__(self, *a): pass


# ──────────────────────────────────────────────────────────────
# C. Taint propagation helpers
# ──────────────────────────────────────────────────────────────

def _is_tainted(value, payload: str) -> bool:
    """Determina si un valor contiene (o deriva de) el payload."""
    if not payload:
        return False
    try:
        val_str = str(value)
        if len(payload) < 4:
            return payload == val_str
            
        # Busca al menos 4 chars del payload en el valor
        needle = payload[:min(len(payload), 12)].strip()
        if needle and needle in val_str:
            return True
        # También detecta si el mock contiene el payload en su nombre
        if "mock:" in val_str.lower() and len(payload) > 3:
            return False
    except Exception:
        pass
    return False


def _safe_str(value, max_len: int = 200) -> str:
    try:
        s = str(value)
        if len(s) > max_len:
            return s[:max_len] + "…"
        return s
    except Exception:
        return "<unserializable>"


def _build_frames(
    raw_frames: list,
    payload: str,
    target_param: str,
    filepath: str = None,
) -> list:
    """
    Convierte la lista cruda de snapshots {line, vars} en frames estructurados
    con taint propagation, eventos y metadata para el DebuggerPanel.
    """
    source_lines = {}
    if filepath:
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                for i, line in enumerate(f, 1):
                    source_lines[i] = line.rstrip()
        except Exception:
            pass

    frames = []
    prev_tainted: set = set()
    prev_vars: dict = {}

    for idx, snap in enumerate(raw_frames):
        lineno = snap.get("line", 0)
        vars_snap = snap.get("vars", {})

        # Filtra internos (__trace__, __builtins__, módulos, etc.)
        clean_vars = {}
        for k, v in vars_snap.items():
            if k.startswith("__") or k == "__trace__":
                continue
            try:
                if str(type(v)).startswith("<class 'module'>"):
                    continue
            except Exception:
                pass
            clean_vars[k] = _safe_str(v)

        # Taint propagation
        tainted_now: set = set()
        for k, v_str in clean_vars.items():
            original_val = vars_snap.get(k)
            if k == target_param or _is_tainted(original_val, payload):
                tainted_now.add(k)
            # Propagación derivada: si alguna var anterior taintada está en el valor
            for prev_k in prev_tainted:
                prev_v = prev_vars.get(prev_k, "")
                if prev_v and len(str(prev_v)) > 3 and str(prev_v)[:8] in v_str:
                    tainted_now.add(k)
                    break

        new_tainted = tainted_now - prev_tainted
        still_tainted = tainted_now & prev_tainted

        # Detectar evento
        changed_vars = {k for k in clean_vars if clean_vars.get(k) != prev_vars.get(k)}

        if tainted_now & changed_vars:
            if new_tainted:
                event = "propagate"
            else:
                event = "mutate"
        elif tainted_now:
            event = "evaluate"
        elif changed_vars:
            event = "derive"
        else:
            event = "observe"

        # Detectar sink: si hay una var taintada y el código menciona palabras clave peligrosas
        code_line = source_lines.get(lineno, "")
        
        from analyzer.sinks_db import get_sinks
        SINK_KEYWORDS = get_sinks("python")
        
        # Ignoramos mayúsculas/minúsculas para la búsqueda básica
        is_sink = any(sk.lower() in code_line.lower() for sk in SINK_KEYWORDS) and bool(tainted_now)
        if is_sink:
            event = "sink"

        frames.append({
            "frame_id": idx,
            "line": lineno,
            "code": code_line,
            "vars": clean_vars,
            "tainted_vars": sorted(tainted_now),
            "prev_tainted": sorted(prev_tainted),
            "new_tainted": sorted(new_tainted),
            "event": event,
            "highlight": event in ("propagate", "mutate", "sink", "derive"),
            "is_sink": is_sink,
        })

        prev_tainted = tainted_now
        prev_vars = clean_vars

    return frames


# ──────────────────────────────────────────────────────────────
# execute_with_dast — motor principal
# ──────────────────────────────────────────────────────────────

def execute_with_dast(filepath: str, func_name: str, target_param: str, payload: str):
    intercepted = []
    coverage = set()
    raw_frames: list = []          # lista cruda de snapshots por línea
    target_module_name = "sandbox_module_" + os.path.splitext(os.path.basename(filepath))[0]

    # ── Trace function (timeout + coverage) ──────────────────
    step_count = 0
    start_time = time.time()

    def trace_calls(frame, event, arg):
        nonlocal step_count
        if event == "line":
            step_count += 1
            if step_count > 10_000:
                raise RuntimeError("Límite de 10 000 instrucciones excedido (posible bucle infinito).")
            if time.time() - start_time > 5.0:
                raise RuntimeError("Tiempo de ejecución excedido (5 segundos).")
            if frame.f_globals.get("__name__") == target_module_name:
                coverage.add(frame.f_lineno)
        return trace_calls

    # ── __trace__ callback (inyectado por AST) ───────────────
    def _trace_callback(lineno: int, frame_vars: dict):
        if not frame_vars:
            return
        snap = {"line": lineno, "vars": {}}
        for k, v in frame_vars.items():
            if k.startswith("__") or k == "_trace_callback":
                continue
            snap["vars"][k] = v
        raw_frames.append(snap)

    # ── Mocking de operaciones peligrosas ────────────────────
    orig = {}
    all_param_names = []
    try:
        import sqlite3, shutil, io

        orig["sqlite3.connect"] = sqlite3.connect
        orig["os.system"] = getattr(os, "system", None)
        orig["os.remove"] = getattr(os, "remove", None)
        orig["os.unlink"] = getattr(os, "unlink", None)
        orig["os.rmdir"] = getattr(os, "rmdir", None)
        orig["os.removedirs"] = getattr(os, "removedirs", None)
        orig["os.rename"] = getattr(os, "rename", None)
        orig["os.replace"] = getattr(os, "replace", None)
        orig["shutil.rmtree"] = getattr(shutil, "rmtree", None)
        orig["shutil.move"] = getattr(shutil, "move", None)
        orig["sys.exit"] = sys.exit
        orig["builtins.open"] = builtins.open
        orig["io.open"] = io.open

        def secure_open(file, mode="r", *args, **kwargs):
            mode_str = str(mode).lower()
            if any(c in mode_str for c in ("w", "a", "x", "+")):
                intercepted.append({"module": "builtins.open", "args": [str(file), mode_str], "kwargs": {}})
                return SecurityMock("file_write", intercepted)
            return orig["builtins.open"](file, mode, *args, **kwargs)

        sqlite3.connect = SecurityMock("sqlite3.connect", intercepted)
        os.system = SecurityMock("os.system", intercepted)
        os.remove = SecurityMock("os.remove", intercepted)
        os.unlink = SecurityMock("os.unlink", intercepted)
        os.rmdir = SecurityMock("os.rmdir", intercepted)
        os.removedirs = SecurityMock("os.removedirs", intercepted)
        os.rename = SecurityMock("os.rename", intercepted)
        os.replace = SecurityMock("os.replace", intercepted)
        shutil.rmtree = SecurityMock("shutil.rmtree", intercepted)
        shutil.move = SecurityMock("shutil.move", intercepted)
        sys.exit = SecurityMock("sys.exit", intercepted)
        builtins.open = secure_open
        io.open = secure_open

        # ── Cargar función aislada ───────────────────────────
        basedir = os.path.dirname(filepath)
        if basedir not in sys.path:
            sys.path.insert(0, basedir)

        func = _load_isolated_function(filepath, func_name, target_module_name)

        sig = inspect.signature(func)
        all_param_names = list(sig.parameters.keys())
        kwargs = {}
        for pname in sig.parameters:
            if pname == target_param:
                kwargs[pname] = payload
            else:
                param = sig.parameters[pname]
                kwargs[pname] = param.default if param.default is not inspect.Parameter.empty else None

        # ── Preparar namespace instrumentado ─────────────────
        # Inyectar __trace__ en el namespace de la función
        func.__globals__["__trace__"] = _trace_callback

        # ── Ejecutar con tracing ──────────────────────────────
        exec_real_import = _install_import_stubs(basedir)
        sys.settrace(trace_calls)
        try:
            result = func(**kwargs)
            res_str = _safe_str(result)
            res_type = type(result).__name__
            success = True
            error = None
        except Exception as e:
            res_str = None
            res_type = None
            success = False
            error = f"{type(e).__name__}: {e}"
        finally:
            sys.settrace(None)
            _restore_import(exec_real_import)

    except Exception as e:
        success = False
        res_str = None
        res_type = None
        error = f"Sandbox Setup Error: {type(e).__name__}: {e}"
    finally:
        # Restaurar mocks
        try:
            import sqlite3, shutil, io
            if orig.get("sqlite3.connect"): sqlite3.connect = orig["sqlite3.connect"]
            if orig.get("os.system"): os.system = orig["os.system"]
            if orig.get("os.remove"): os.remove = orig["os.remove"]
            if orig.get("os.unlink"): os.unlink = orig["os.unlink"]
            if orig.get("os.rmdir"): os.rmdir = orig["os.rmdir"]
            if orig.get("os.removedirs"): os.removedirs = orig["os.removedirs"]
            if orig.get("os.rename"): os.rename = orig["os.rename"]
            if orig.get("os.replace"): os.replace = orig["os.replace"]
            if orig.get("shutil.rmtree"): shutil.rmtree = orig["shutil.rmtree"]
            if orig.get("shutil.move"): shutil.move = orig["shutil.move"]
            if orig.get("sys.exit"): sys.exit = orig["sys.exit"]
            if orig.get("builtins.open"): builtins.open = orig["builtins.open"]
            if orig.get("io.open"): io.open = orig["io.open"]
        except Exception:
            pass

        basedir = os.path.dirname(filepath)
        if basedir in sys.path:
            try:
                sys.path.remove(basedir)
            except Exception:
                pass
        sys.settrace(None)

    return {
        "success": success,
        "result": res_str,
        "type": res_type,
        "error": error,
        "intercepted": intercepted,
        "coverage": sorted(coverage),
        "raw_frames": raw_frames,
        "parameters": all_param_names,
    }


# ──────────────────────────────────────────────────────────────
# Source line reader (helper)
# ──────────────────────────────────────────────────────────────

def _read_source_line(filepath: str, line_number: int) -> str:
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        if 1 <= line_number <= len(lines):
            return lines[line_number - 1].rstrip()
    except Exception:
        pass
    return ""


# ──────────────────────────────────────────────────────────────
# build_mutation_timeline — mantiene retrocompatibilidad
# ──────────────────────────────────────────────────────────────

def build_mutation_timeline(
    memory_trace: dict,
    target_param: str,
    initial_payload: str,
    filepath: str = None,
    all_params: list = None,
) -> tuple:
    """
    Retrocompatible: convierte el dict memory_trace (legacy) en timeline.
    Internamente convierte al formato de raw_frames y llama a _build_frames.
    """
    if not memory_trace:
        return [], {"param_mutated": False, "derived_variables": [], "lines_executed": 0}

    # Convertir dict {lineno: locals_snap} → raw_frames lista
    raw = []
    for line_str in sorted(memory_trace.keys(), key=lambda x: int(x)):
        raw.append({"line": int(line_str), "vars": memory_trace[line_str]})

    frames = _build_frames(raw, initial_payload, target_param, filepath)

    # Calcular summary
    param_mutated = any(f["event"] == "mutate" for f in frames)
    derived_vars = list({k for f in frames for k in f.get("new_tainted", []) if k != target_param})
    summary = {
        "param_mutated": param_mutated,
        "derived_variables": derived_vars,
        "lines_executed": len(frames),
        "input_unchanged_note": (
            None if param_mutated else
            f"El parámetro '{target_param}' no cambió su valor durante la ejecución."
        ),
    }

    # Convertir frames al formato legacy de timeline para retrocompatibilidad
    timeline = []
    for f in frames:
        timeline.append({
            "line_number": f["line"],
            "raw_code": f["code"],
            "locals": f["vars"],
            "target_value": f["vars"].get(target_param),
            "events": [{"kind": f["event"], "variable": target_param, "value": f["vars"].get(target_param, "")}],
            "step_kind": f["event"],
            "highlight": f["highlight"],
        })

    return timeline, summary


# ──────────────────────────────────────────────────────────────
# run_dast_micro_sandbox — punto de entrada principal
# ──────────────────────────────────────────────────────────────

def run_dast_micro_sandbox(filepath: str, func_name: str, target_param: str, payload: str) -> dict:
    """
    Ejecuta la función en el micro-sandbox y devuelve:
    - frames: lista estructurada para el DebuggerPanel
    - mutation_timeline: formato legacy para retrocompatibilidad
    - execution_summary: estadísticas del run
    """
    out = execute_with_dast(filepath, func_name, target_param, payload)
    raw_frames = out.pop("raw_frames", [])

    # Construir frames estructurados
    frames = _build_frames(raw_frames, payload, target_param, filepath)

    # Calcular execution_summary
    tainted_vars_all = list({k for f in frames for k in f.get("tainted_vars", [])})
    sink_frames = [f for f in frames if f.get("is_sink")]
    param_mutated = any(f["event"] == "mutate" for f in frames)

    execution_summary = {
        "param_mutated": param_mutated,
        "tainted_vars_all": tainted_vars_all,
        "sink_count": len(sink_frames),
        "sink_lines": [f["line"] for f in sink_frames],
        "lines_executed": len(frames),
        "total_frames": len(frames),
        "input_unchanged_note": (
            None if param_mutated else
            f"El parámetro '{target_param}' no mutó durante la ejecución."
        ),
    }

    # Generar mutation_timeline retrocompatible
    timeline, _ = build_mutation_timeline(
        {str(f["line"]): f["vars"] for f in frames} if frames else {},
        target_param,
        payload,
        filepath=filepath,
        all_params=out.get("parameters") or [],
    )

    out.update({
        "frames": frames,
        "mutation_timeline": timeline,
        "execution_summary": execution_summary,
        "target_param": target_param,
        "initial_payload": payload,
    })
    return out


# ──────────────────────────────────────────────────────────────
# run_fuzzer — ahora devuelve frames por payload
# ──────────────────────────────────────────────────────────────

FUZZER_PAYLOADS = [
    {"payload": "' OR 1=1 --",             "category": "SQLi Classic"},
    {"payload": "\" OR \"1\"=\"1",          "category": "SQLi Double Quote"},
    {"payload": "admin' --",                "category": "SQLi Auth Bypass"},
    {"payload": "1; DROP TABLE users",      "category": "SQLi Destructive"},
    {"payload": "1 UNION SELECT null,null,null--", "category": "SQLi UNION"},
    {"payload": "<script>alert(1)</script>","category": "XSS Script"},
    {"payload": "\"><svg/onload=alert(1)>", "category": "XSS SVG"},
    {"payload": "../../../../etc/passwd",   "category": "Path Traversal"},
    {"payload": "http://localhost:0",        "category": "SSRF"},
    {"payload": "$(whoami)",                "category": "RCE Shell"},
    {"payload": "`whoami`",                 "category": "RCE Backtick"},
    {"payload": "{{7*7}}",                  "category": "SSTI"},
]


def run_fuzzer(filepath: str, func_name: str, target_param: str) -> list:
    """
    Ejecuta el micro-sandbox con múltiples payloads de ataque.
    Cada resultado incluye 'frames' para el DebuggerPanel.
    """
    results = []
    for entry in FUZZER_PAYLOADS:
        p = entry["payload"]
        out = run_dast_micro_sandbox(filepath, func_name, target_param, p)
        results.append({
            "payload": p,
            "category": entry["category"],
            "success": out.get("success", False),
            "result": out.get("result"),
            "error": out.get("error"),
            "intercepted": out.get("intercepted", []),
            "frames": out.get("frames", []),
            "execution_summary": out.get("execution_summary", {}),
            "coverage": out.get("coverage", []),
        })
    return results
