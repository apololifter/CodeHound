import tree_sitter
import tree_sitter_python
import tree_sitter_php
import tree_sitter_javascript

_parsers_cache = {}

def get_parser(language_name: str) -> tree_sitter.Parser:
    if language_name in _parsers_cache:
        return _parsers_cache[language_name]

    parser = tree_sitter.Parser()
    
    if language_name == "python":
        lang = tree_sitter.Language(tree_sitter_python.language())
    elif language_name == "php":
        # Check if language_php is available (often the case for the php bindings)
        if hasattr(tree_sitter_php, "language_php"):
            lang = tree_sitter.Language(tree_sitter_php.language_php())
        else:
            lang = tree_sitter.Language(tree_sitter_php.language())
    elif language_name == "javascript":
        lang = tree_sitter.Language(tree_sitter_javascript.language())
    else:
        raise ValueError(f"Unsupported language: {language_name}")
        
    parser.language = lang
    _parsers_cache[language_name] = parser
    return parser

def parse_file(filepath: str, language_name: str) -> tree_sitter.Tree:
    with open(filepath, "rb") as f:
        content_bytes = f.read()
    
    # Try decoding to ensure we handle any strange encoding gracefully (e.g. UTF-16, etc.)
    try:
        source_code = content_bytes.decode('utf-8')
    except UnicodeDecodeError:
        try:
            source_code = content_bytes.decode('utf-16')
        except UnicodeDecodeError:
            source_code = content_bytes.decode('utf-8', errors='ignore')
            
    parser = get_parser(language_name)
    tree = parser.parse(source_code.encode('utf-8'))
    return tree
