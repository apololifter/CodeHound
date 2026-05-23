import sys
import importlib.util
import os
import traceback
import inspect
import builtins
import types
import ast
import time

class _ImportStub(type):
    """Stand-in for missing classes/functions during sandbox import."""

    def __new__(mcls, name: str = 'Stub', bases=(object,), dct=None):
        return super().__new__(mcls, name, bases, dct or {})

    def __init__(self, name: str = 'Stub', bases=(object,), dct=None):
        self._name = name

    def __call__(self, *args, **kwargs):
        return self

    def __instancecheck__(self, instance):
        if isinstance(instance, type):
            return issubclass(instance, self)
        try:
            return issubclass(type(instance), self)
        except Exception:
            return False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False

    def __getattr__(self, item):
        if item.startswith('__') and item not in ('__name__', '__dict__'):
            raise AttributeError(item)
        return _ImportStub(f'{self._name}.{item}')

    def __getitem__(self, item):
        return _ImportStub(f'{self._name}[{repr(item)}]')

    def __len__(self):
        return 0

    def __iter__(self):
        return iter([])

    def __bool__(self):
        return True

    def __repr__(self):
        return f'<sandbox-stub {self._name}>'


class _StubModule(types.ModuleType):
    def __iter__(self):
        return iter(())

    def __call__(self, *args, **kwargs):
        return _ImportStub(self.__name__)

    def __getattr__(self, name):
        if name.startswith('__') and name not in ('__path__', '__package__', '__spec__'):
            raise AttributeError(name)
        child_name = f'{self.__name__}.{name}' if self.__name__ else name
        if child_name in sys.modules and isinstance(sys.modules[child_name], _StubModule):
            return sys.modules[child_name]
        if '.' in child_name and name.isidentifier() and name[0].islower():
            return _ensure_stub_module(child_name)
        obj = _ImportStub(child_name)
        setattr(self, name, obj)
        return obj

    def __getitem__(self, item):
        return _ImportStub(f'{self.__name__}[{repr(item)}]')

    def __len__(self):
        return 0


def _ensure_stub_module(name: str) -> types.ModuleType:
    if name in sys.modules and isinstance(sys.modules[name], _StubModule):
        return sys.modules[name]
    parts = name.split('.')
    mod = None
    for i in range(len(parts)):
        full = '.'.join(parts[: i + 1])
        if full not in sys.modules or not isinstance(sys.modules.get(full), _StubModule):
            parent = '.'.join(parts[:i]) if i else None
            m = _StubModule(full)
            m.__file__ = '<sandbox-stub>'
            m.__package__ = parent or ''
            sys.modules[full] = m
            if parent and parent in sys.modules:
                setattr(sys.modules[parent], parts[i], m)
        mod = sys.modules[full]
    return mod


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
    root = name.split('.')[0]
    if root.startswith('_'):
        return True
    if root in sys.builtin_module_names:
        return True
    if hasattr(sys, "stdlib_module_names") and root in sys.stdlib_module_names:
        return True
    return root in _STDLIB_ROOTS


def _is_local_module(name: str, basedir: str) -> bool:
    if not basedir:
        return False
    root = name.split('.')[0]
    path_py = os.path.normpath(os.path.join(basedir, root + ".py"))
    path_dir = os.path.normpath(os.path.join(basedir, root))
    if os.path.isfile(path_py):
        return True
    if os.path.isdir(path_dir) and os.path.isfile(os.path.join(path_dir, "__init__.py")):
        return True
    return False


def _install_import_stubs(basedir: str = None):
    """Allow loading target files without installing their third-party deps."""
    real_import = builtins.__import__

    def stub_import(name, globals=None, locals=None, fromlist=(), level=0):
        # Normalize parameters to prevent TypeError from import machinery
        norm_fromlist = fromlist if fromlist is not None else ()
        norm_globals = globals if globals is not None else {}
        norm_locals = locals if locals is not None else {}

        # 0. Try importing local modules first
        if basedir and _is_local_module(name, basedir):
            try:
                return real_import(name, norm_globals, norm_locals, norm_fromlist, level)
            except Exception as e:
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
                            setattr(mod, attr, _ImportStub(attr))
                return mod
            except ModuleNotFoundError:
                pass

        mod = _ensure_stub_module(name)
        if norm_fromlist:
            for attr in norm_fromlist:
                if not hasattr(mod, attr):
                    setattr(mod, attr, _ImportStub(f'{name}.{attr}'))
        return mod

    builtins.__import__ = stub_import
    return real_import


def _restore_import(real_import):
    builtins.__import__ = real_import


def _find_function_ast(tree: ast.AST, func_name: str):
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == func_name:
            return node
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == func_name:
            return node
    return None


def _load_isolated_function(filepath: str, func_name: str, target_module_name: str):
    """Load only imports + target function, skipping module-level side effects (e.g. Flask app)."""
    with open(filepath, 'rb') as f:
        source_bytes = f.read()
    tree = ast.parse(source_bytes, filename=filepath)
    func_node = _find_function_ast(tree, func_name)
    if not func_node:
        raise ValueError(f"Función {func_name} no encontrada en {filepath}.")

    namespace = {
        '__builtins__': __builtins__,
        '__name__': target_module_name,
        '__file__': filepath,
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
                exec(compile(import_mod, filepath, 'exec'), namespace)
        fn_mod = ast.Module([func_node], type_ignores=[])
        exec(compile(fn_mod, filepath, 'exec'), namespace)
    finally:
        _restore_import(real_import)
        if added_to_path:
            try:
                sys.path.remove(basedir)
            except Exception:
                pass
    return namespace[func_name]


class SecurityMock:
    def __init__(self, name, intercepted_list):
        self.name = name
        self.intercepted_list = intercepted_list

    def __call__(self, *args, **kwargs):
        call_details = {
            "module": self.name,
            "args": [str(a) for a in args],
            "kwargs": {k: str(v) for k, v in kwargs.items()}
        }
        self.intercepted_list.append(call_details)
        return self # Return self to allow method chaining e.g. connect().cursor().execute()

    def __getattr__(self, item):
        if item in ("__class__", "__name__", "__bases__"):
            raise AttributeError()
        return SecurityMock(f"{self.name}.{item}", self.intercepted_list)

    def __getitem__(self, item):
        return SecurityMock(f"{self.name}[{repr(item)}]", self.intercepted_list)

    def __len__(self):
        return 0

    def __iter__(self):
        return iter([])

    def __bool__(self):
        return True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

def execute_with_dast(filepath: str, func_name: str, target_param: str, payload: str):
    intercepted = []
    coverage = set()
    memory_trace = {} # line_number -> memory snapshot
    target_module_name = "sandbox_module_" + os.path.splitext(os.path.basename(filepath))[0]

    def trace_calls(frame, event, arg):
        if event == 'line':
            # Only trace within our target module
            if frame.f_globals.get("__name__") == target_module_name:
                lineno = frame.f_lineno
                locals_snap = {}
                for k, v in frame.f_locals.items():
                    if not k.startswith('__') and not str(type(v)).startswith("<class 'module'>"):
                        try:
                            # Shorten long strings for UI performance
                            val_str = str(v)
                            if len(val_str) > 100:
                                  val_str = val_str[:100] + "..."
                            locals_snap[k] = val_str
                        except Exception:
                            locals_snap[k] = "<unserializable>"
                
                coverage.add(lineno)
                memory_trace[str(lineno)] = locals_snap
                
            # Limit checks to prevent infinite loops and hangs
            nonlocal step_count
            step_count += 1
            if step_count > 10000:
                raise RuntimeError("Límite de 10000 instrucciones excedido (Posible bucle infinito).")
            if time.time() - start_time > 5.0:
                raise RuntimeError("Tiempo de ejecución excedido (5 segundos).")
                
        return trace_calls

    orig_sqlite3_connect = None
    orig_shutil_rmtree = None
    orig_sys_exit = None
    orig_open = None
    orig_io_open = None
    all_param_names = []
    try:
        # 1. Setup Mocking
        import sqlite3
        import requests
        import subprocess
        import shutil
        import time
        import builtins
        import io
        
        start_time = time.time()
        step_count = 0
        
        orig_sqlite3_connect = sqlite3.connect
        orig_requests_get = getattr(requests, 'get', None)
        orig_requests_post = getattr(requests, 'post', None)
        orig_subprocess_run = getattr(subprocess, 'run', None)
        orig_subprocess_Popen = getattr(subprocess, 'Popen', None)
        orig_os_system = getattr(os, 'system', None)
        orig_os_remove = getattr(os, 'remove', None)
        orig_os_unlink = getattr(os, 'unlink', None)
        orig_os_rmdir = getattr(os, 'rmdir', None)
        orig_os_removedirs = getattr(os, 'removedirs', None)
        orig_os_rename = getattr(os, 'rename', None)
        orig_os_replace = getattr(os, 'replace', None)
        orig_shutil_rmtree = getattr(shutil, 'rmtree', None)
        orig_shutil_move = getattr(shutil, 'move', None)
        orig_sys_exit = sys.exit
        orig_open = builtins.open
        orig_io_open = io.open

        def secure_open(file, mode='r', *args, **kwargs):
            mode_str = str(mode).lower()
            if any(c in mode_str for c in ('w', 'a', 'x', '+')):
                call_details = {
                    "module": "builtins.open",
                    "args": [str(file), mode_str],
                    "kwargs": {k: str(v) for k, v in kwargs.items()}
                }
                intercepted.append(call_details)
                return SecurityMock("file_write", intercepted)
            return orig_open(file, mode, *args, **kwargs)
        
        sqlite3.connect = SecurityMock("sqlite3.connect", intercepted)
        if hasattr(requests, 'get'): requests.get = SecurityMock("requests.get", intercepted)
        if hasattr(requests, 'post'): requests.post = SecurityMock("requests.post", intercepted)
        if hasattr(subprocess, 'run'): subprocess.run = SecurityMock("subprocess.run", intercepted)
        if hasattr(subprocess, 'Popen'): subprocess.Popen = SecurityMock("subprocess.Popen", intercepted)
        if hasattr(os, 'system'): os.system = SecurityMock("os.system", intercepted)
        if hasattr(os, 'remove'): os.remove = SecurityMock("os.remove", intercepted)
        if hasattr(os, 'unlink'): os.unlink = SecurityMock("os.unlink", intercepted)
        if hasattr(os, 'rmdir'): os.rmdir = SecurityMock("os.rmdir", intercepted)
        if hasattr(os, 'removedirs'): os.removedirs = SecurityMock("os.removedirs", intercepted)
        if hasattr(os, 'rename'): os.rename = SecurityMock("os.rename", intercepted)
        if hasattr(os, 'replace'): os.replace = SecurityMock("os.replace", intercepted)
        if hasattr(shutil, 'rmtree'): shutil.rmtree = SecurityMock("shutil.rmtree", intercepted)
        if hasattr(shutil, 'move'): shutil.move = SecurityMock("shutil.move", intercepted)
        sys.exit = SecurityMock("sys.exit", intercepted)
        builtins.open = secure_open
        io.open = secure_open

        # 2. Load isolated function (imports only, no Flask/app bootstrap)
        basedir = os.path.dirname(filepath)
        if basedir not in sys.path:
            sys.path.insert(0, basedir)

        func = _load_isolated_function(filepath, func_name, target_module_name)

        sig = inspect.signature(func)
        all_param_names = list(sig.parameters.keys())
        kwargs = {}
        for param_name in sig.parameters:
            if param_name == target_param:
                # Si el payload parece un JSON o array, podríamos convertirlo, pero lo pasamos como string
                kwargs[param_name] = payload
            else:
                param = sig.parameters[param_name]
                kwargs[param_name] = param.default if param.default is not inspect.Parameter.empty else None

        # 3. Execute with Tracing
        exec_real_import = _install_import_stubs(basedir)
        sys.settrace(trace_calls)
        try:
            result = func(**kwargs)
            res_str = str(result)
            res_type = type(result).__name__
            success = True
            error = None
        except Exception as e:
            res_str = None
            res_type = None
            success = False
            error = f"{type(e).__name__}: {str(e)}"
        finally:
            sys.settrace(None)
            _restore_import(exec_real_import)

    except Exception as e:
        success = False
        res_str = None
        res_type = None
        error = f"Sandbox Setup Error: {type(e).__name__}: {str(e)}"
    finally:
        # Restore mocks
        import sqlite3
        import requests
        import subprocess
        import shutil
        import builtins
        import io
        if orig_sqlite3_connect: sqlite3.connect = orig_sqlite3_connect
        if orig_requests_get: requests.get = orig_requests_get
        if orig_requests_post: requests.post = orig_requests_post
        if orig_subprocess_run: subprocess.run = orig_subprocess_run
        if orig_subprocess_Popen: subprocess.Popen = orig_subprocess_Popen
        if orig_os_system: os.system = orig_os_system
        if orig_os_remove: os.remove = orig_os_remove
        if orig_os_unlink: os.unlink = orig_os_unlink
        if orig_os_rmdir: os.rmdir = orig_os_rmdir
        if orig_os_removedirs: os.removedirs = orig_os_removedirs
        if orig_os_rename: os.rename = orig_os_rename
        if orig_os_replace: os.replace = orig_os_replace
        if orig_shutil_rmtree: shutil.rmtree = orig_shutil_rmtree
        if orig_shutil_move: shutil.move = orig_shutil_move
        if orig_sys_exit: sys.exit = orig_sys_exit
        if orig_open: builtins.open = orig_open
        if orig_io_open: io.open = orig_io_open
        
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
        "coverage": list(coverage),
        "memory_trace": memory_trace,
        "parameters": all_param_names,
    }


def _read_source_line(filepath: str, line_number: int) -> str:
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        if 1 <= line_number <= len(lines):
            return lines[line_number - 1].rstrip()
    except Exception:
        pass
    return ''


def build_mutation_timeline(
    memory_trace: dict,
    target_param: str,
    initial_payload: str,
    filepath: str = None,
    all_params: list = None,
) -> tuple:
    """
    Traza línea a línea la ejecución aislada de UNA función.
    Incluye mutaciones del parámetro, valores derivados (ej. hostname desde url)
    y pasos donde el input se evalúa sin cambiar su valor.
    """
    if not memory_trace:
        return [], {"param_mutated": False, "derived_variables": [], "lines_executed": 0}

    all_params = set(all_params or [])
    timeline = []
    prev_locals = {}
    prev_target = initial_payload
    param_mutated = False
    derived_vars = set()

    for line_str in sorted(memory_trace.keys(), key=lambda x: int(x)):
        line_no = int(line_str)
        locals_snap = memory_trace.get(line_str) or {}
        events = []
        new_keys = set(locals_snap.keys()) - set(prev_locals.keys())

        for var_name in sorted(new_keys):
            val = locals_snap[var_name]
            if var_name == target_param:
                events.append({
                    "kind": "input",
                    "variable": var_name,
                    "value": val,
                    "message": f"Entrada '{var_name}' activa en la función",
                })
            elif var_name in all_params:
                events.append({
                    "kind": "context",
                    "variable": var_name,
                    "value": val,
                    "message": f"Otro parámetro '{var_name}' (contexto)",
                })
            else:
                derived_vars.add(var_name)
                events.append({
                    "kind": "derive",
                    "variable": var_name,
                    "value": val,
                    "message": f"Valor evaluado '{var_name}' derivado del flujo del input",
                })

        for var_name, val in locals_snap.items():
            if var_name not in prev_locals:
                continue
            if prev_locals[var_name] == val:
                continue
            if var_name == target_param:
                param_mutated = True
                events.append({
                    "kind": "mutate",
                    "variable": var_name,
                    "before": prev_locals[var_name],
                    "after": val,
                    "message": f"El input '{var_name}' mutó",
                })
                prev_target = val
            else:
                events.append({
                    "kind": "update",
                    "variable": var_name,
                    "before": prev_locals[var_name],
                    "after": val,
                    "message": f"Variable '{var_name}' cambió tras evaluar el input",
                })

        if target_param in locals_snap and not any(e["kind"] == "mutate" for e in events):
            events.append({
                "kind": "evaluate",
                "variable": target_param,
                "value": locals_snap[target_param],
                "message": (
                    f"'{target_param}' se usa en esta línea sin mutar "
                    f"(sigue siendo: {locals_snap[target_param]})"
                ),
            })

        kinds = {e["kind"] for e in events}
        if "mutate" in kinds:
            step_kind = "mutate"
        elif "derive" in kinds:
            step_kind = "derive"
        elif "update" in kinds:
            step_kind = "update"
        else:
            step_kind = "evaluate"

        timeline.append({
            "line_number": line_no,
            "raw_code": _read_source_line(filepath, line_no) if filepath else "",
            "locals": locals_snap,
            "target_value": locals_snap.get(target_param),
            "events": events,
            "step_kind": step_kind,
            "highlight": step_kind in ("mutate", "derive", "update"),
        })
        prev_locals = dict(locals_snap)

    summary = {
        "param_mutated": param_mutated,
        "derived_variables": sorted(derived_vars),
        "lines_executed": len(timeline),
        "input_unchanged_note": (
            None if param_mutated else
            f"El parámetro '{target_param}' no cambió su valor; el sandbox ejecutó la función "
            "y muestra cómo se evaluó el dato en cada línea (valores derivados, retorno, etc.)."
        ),
    }
    return timeline, summary


def run_dast_micro_sandbox(filepath: str, func_name: str, target_param: str, payload: str) -> dict:
    """Ejecuta la función en un micro-sandbox aislado y devuelve traza de mutación del input."""
    out = execute_with_dast(filepath, func_name, target_param, payload)
    timeline, summary = build_mutation_timeline(
        out.get("memory_trace") or {},
        target_param,
        payload,
        filepath=filepath,
        all_params=out.get("parameters") or [],
    )
    out["mutation_timeline"] = timeline
    out["execution_summary"] = summary
    out["target_param"] = target_param
    out["initial_payload"] = payload
    return out


def run_fuzzer(filepath: str, func_name: str, target_param: str):
    payloads = [
        "' OR 1=1 --",
        "\" OR \"1\"=\"1",
        "admin' --",
        "<script>alert(1)</script>",
        "\"><svg/onload=alert(1)>",
        "../../../../etc/passwd",
        "http://localhost:0",
        "$(whoami)",
        "`whoami`",
        "1; DROP TABLE users",
        "{{7*7}}"
    ]
    
    results = []
    for p in payloads:
        out = execute_with_dast(filepath, func_name, target_param, p)
        results.append({
            "payload": p,
            "success": out["success"],
            "result": out["result"],
            "error": out["error"],
            "intercepted": out["intercepted"]
        })
        
    return results
