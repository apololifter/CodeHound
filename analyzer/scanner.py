import os
from typing import Dict, List, Tuple
from collections import defaultdict

SUPPORTED_EXTENSIONS = {
    ".py": "python",
    ".php": "php",
    ".js": "javascript"
}

SKIP_DIR_NAMES = {
    "node_modules", ".git", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", "coverage", ".pytest_cache",
}

def scan_directory(root_dir: str) -> Dict[str, str]:
    """
    Returns a dictionary mapping absolute file paths to their language.
    """
    files_to_parse = {}
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES]
        for filename in filenames:
            ext = os.path.splitext(filename)[1].lower()
            if ext in SUPPORTED_EXTENSIONS:
                full_path = os.path.abspath(os.path.join(dirpath, filename))
                files_to_parse[full_path] = SUPPORTED_EXTENSIONS[ext]
                
    return files_to_parse

def build_filename_map(files_to_parse: Dict[str, str]) -> Dict[str, List[str]]:
    """
    Maps base filenames (e.g., 'script.php') to a list of their absolute paths.
    Useful for hybrid detection heuristics when multiple files share the same name.
    """
    filename_map = defaultdict(list)
    for filepath in files_to_parse.keys():
        basename = os.path.basename(filepath)
        filename_map[basename].append(filepath)
    return dict(filename_map)
