import os
import json
from analyzer.scanner import scan_directory, build_filename_map
from analyzer.parser import parse_file
from analyzer.hybrid_detector import get_strategy

root_dir = os.path.abspath("test_project")
files_to_parse = scan_directory(root_dir)
filename_map = build_filename_map(files_to_parse)

all_nodes = []
all_edges = []
function_registry = {}
parsed_files = []

for filepath, language in files_to_parse.items():
    tree = parse_file(filepath, language)
    with open(filepath, "rb") as f:
        source_code = f.read()
    parsed_files.append((filepath, language, tree, source_code))
    basename = os.path.basename(filepath)
    all_nodes.append({"id": filepath, "type": "file", "language": language, "label": basename})
    strategy = get_strategy(language)
    nodes = strategy.extract_nodes(tree, filepath, source_code, function_registry)
    all_nodes.extend(nodes)

for filepath, language, tree, source_code in parsed_files:
    strategy = get_strategy(language)
    edges = strategy.extract_edges(tree, filepath, source_code, filename_map, function_registry)
    all_edges.extend(edges)

print(json.dumps({"nodes": all_nodes, "edges": all_edges}, indent=2))
