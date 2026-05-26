#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import subprocess
import shutil
import platform

def print_header(title):
    print("\n" + "=" * 60)
    print(f" {title.center(58)} ")
    print("=" * 60)

def print_success(message):
    print(f"[+] {message}")

def print_info(message):
    print(f"[*] {message}")

def print_warning(message):
    print(f"[!] {message}")

def print_error(message):
    print(f"[-] {message}")

def check_pnpm():
    print_info("Comprobando si pnpm está instalado...")
    try:
        # Use shell=True for windows command resolution
        result = subprocess.run(["pnpm", "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=True)
        if result.returncode == 0:
            version = result.stdout.strip()
            print_success(f"pnpm detectado (versión {version})")
            return True
    except Exception:
        pass
    
    print_warning("pnpm NO está instalado globalmente en el sistema.")
    print("Para instalar pnpm de forma segura, puedes elegir una de las siguientes opciones:")
    print("  1) Windows (PowerShell): iwr https://get.pnpm.io/install.ps1 -useb | iex")
    print("  2) Linux/macOS: curl -fsSL https://get.pnpm.io/install.sh | sh -")
    print("  Para más detalles visita: https://pnpm.io/installation\n")
    return False

def configure_env():
    print_header("Configuración de Variables de Entorno")
    
    env_path = os.path.join(os.getcwd(), ".env")
    existing_key = ""
    
    # Check if there is an existing .env
    if os.path.exists(env_path):
        print_info("Se encontró un archivo .env existente.")
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("GROQ_API_KEY="):
                        existing_key = line.strip().split("=", 1)[1]
        except Exception:
            pass
            
    if existing_key:
        print_info(f"API Key de Groq actual: {existing_key[:6]}...{existing_key[-4:] if len(existing_key) > 10 else ''}")
        change = input("¿Deseas cambiar la API Key de Groq? (s/N): ").strip().lower()
        if change != 's':
            print_success("Se mantiene la API Key actual.")
            return
            
    api_key = input("Introduce tu API Key de Groq (ej: gsk_...): ").strip()
    
    if not api_key:
        print_warning("No se introdujo ninguna API Key. Se omitirá este paso.")
        if not os.path.exists(env_path):
            # Create an empty .env file if it does not exist
            with open(env_path, "w", encoding="utf-8") as f:
                f.write("GROQ_API_KEY=\n")
        return

    # Update or create the .env file
    lines = []
    updated = False
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("GROQ_API_KEY="):
                        lines.append(f"GROQ_API_KEY={api_key}\n")
                        updated = True
                    else:
                        lines.append(line)
        except Exception as e:
            print_error(f"Error leyendo el archivo .env existente: {e}")
            
    if not updated:
        lines.append(f"GROQ_API_KEY={api_key}\n")
        
    try:
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(lines)
        print_success("Archivo .env configurado y guardado correctamente.")
    except Exception as e:
        print_error(f"No se pudo escribir el archivo .env: {e}")

def setup_python_venv(is_windows):
    print_header("Configuración de Entorno Virtual de Python (venv)")
    
    venv_dir = os.path.join(os.getcwd(), "venv")
    
    if os.path.exists(venv_dir):
        print_warning(f"Se detectó un directorio venv existente en: {venv_dir}")
        print("Si el proyecto fue movido de ubicación, el venv anterior podría no ser funcional.")
        recreate = input("¿Deseas eliminar el venv existente y recrearlo desde cero? (S/n): ").strip().lower()
        if recreate != 'n':
            print_info("Eliminando entorno virtual existente...")
            try:
                # Remove read-only files workaround for Windows shutil.rmtree
                def remove_readonly(func, path, excinfo):
                    os.chmod(path, 0o777)
                    func(path)
                shutil.rmtree(venv_dir, onerror=remove_readonly)
                print_success("Entorno virtual anterior eliminado.")
            except Exception as e:
                print_error(f"Error al eliminar el venv existente: {e}")
                print_warning("Por favor elimina la carpeta 'venv' manualmente e intenta de nuevo.")
                sys.exit(1)
        else:
            print_info("Usando el entorno virtual existente.")
            
    # Create venv if it doesn't exist
    if not os.path.exists(venv_dir):
        print_info("Creando un nuevo entorno virtual de Python...")
        try:
            subprocess.run([sys.executable, "-m", "venv", "venv"], check=True)
            print_success("Entorno virtual (venv) creado exitosamente.")
        except Exception as e:
            print_error(f"Error al crear el entorno virtual: {e}")
            sys.exit(1)
            
    # Determine pip and python executables inside venv
    if is_windows:
        venv_python = os.path.join(venv_dir, "Scripts", "python.exe")
        venv_pip = os.path.join(venv_dir, "Scripts", "pip.exe")
    else:
        venv_python = os.path.join(venv_dir, "bin", "python")
        venv_pip = os.path.join(venv_dir, "bin", "pip")
        
    if not os.path.exists(venv_python):
        print_error("No se encontró el ejecutable de Python en el entorno virtual.")
        sys.exit(1)
        
    print_info("Actualizando pip dentro del venv...")
    try:
        subprocess.run([venv_python, "-m", "pip", "install", "--upgrade", "pip"], check=True)
    except Exception as e:
        print_warning(f"No se pudo actualizar pip: {e}. Continuando con la versión actual...")

    print_info("Instalando dependencias de Python desde requirements.txt...")
    req_path = os.path.join(os.getcwd(), "requirements.txt")
    if not os.path.exists(req_path):
        print_error(f"No se encontró el archivo de dependencias en: {req_path}")
        sys.exit(1)
        
    try:
        subprocess.run([venv_python, "-m", "pip", "install", "-r", req_path], check=True)
        print_success("Todas las dependencias de Python se instalaron correctamente.")
    except Exception as e:
        print_error(f"Error al instalar dependencias de Python: {e}")
        sys.exit(1)

def setup_frontend():
    print_header("Configuración del Frontend (React)")
    
    frontend_dir = os.path.join(os.getcwd(), "frontend")
    if not os.path.isdir(frontend_dir):
        print_error(f"No se encontró el directorio frontend en: {frontend_dir}")
        return
        
    has_pnpm = check_pnpm()
    if not has_pnpm:
        print_warning("Se omite la instalación del frontend debido a la falta de pnpm.")
        print_info("Una vez que instales pnpm, ve a la carpeta 'frontend/' y ejecuta: pnpm install")
        return
        
    print_info("Instalando dependencias de Node usando pnpm...")
    try:
        # Use shell=True to execute command in node environment/windows paths
        subprocess.run(["pnpm", "install"], cwd=frontend_dir, check=True, shell=True)
        print_success("Dependencias del frontend instaladas con éxito.")
    except Exception as e:
        print_error(f"Error durante la ejecución de pnpm install: {e}")

def check_tkinter(is_windows):
    print_header("Comprobando Interfaz Gráfica (Tkinter)")
    print_info("Comprobando si tu instalación de Python tiene soporte de GUI para el explorador de carpetas...")
    try:
        import tkinter
        print_success("Soporte de tkinter detectado correctamente.")
    except ImportError:
        print_warning("No se detectó el módulo 'tkinter' en tu entorno Python global.")
        if is_windows:
            print("  Nota: En Windows, tkinter normalmente viene incluido con el instalador oficial de Python.")
            print("  Si reinstalas Python, asegúrate de dejar marcada la opción 'tcl/tk and IDLE'.")
        else:
            print("  Nota: En sistemas basados en Linux (como Ubuntu o Debian), puedes instalarlo ejecutando:")
            print("  $ sudo apt-get install python3-tk")
        print("  (Aún podrás usar la aplicación escribiendo las rutas a mano si no lo instalas ahora).\n")

def verify_sinks_db():
    """Verify that the sinks database file exists in the analyzer directory."""
    print_header("Verificación de Base de Datos de Sinks")
    sinks_path = os.path.join(os.getcwd(), "analyzer", "sinks.json")
    sinks_db_path = os.path.join(os.getcwd(), "analyzer", "sinks_db.py")
    
    if os.path.exists(sinks_path):
        import json
        try:
            with open(sinks_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            total = sum(len(v) if isinstance(v, list) else 0 for v in data.values())
            print_success(f"Base de datos de sinks encontrada: {total} sinks cargados desde {len(data)} categorías.")
        except Exception as e:
            print_warning(f"Archivo sinks.json encontrado pero no se pudo parsear: {e}")
    else:
        print_warning("No se encontró 'analyzer/sinks.json'. El análisis de sinks puede estar limitado.")
        print_info("Este archivo contiene la base de datos de funciones peligrosas para el detector de sinks.")
    
    if os.path.exists(sinks_db_path):
        print_success("Módulo sinks_db.py detectado correctamente.")
    else:
        print_warning("No se encontró 'analyzer/sinks_db.py'.")

def main():
    print_header("Instalador de CodeXHound")
    print_info("Este script preparará el entorno de backend (Python) y frontend (React) para CodeXHound.")
    print_info("Nuevas características incluidas: Panel de Sinks con scroll, DebuggerPanel integrado y Base de Datos de Sinks.")
    
    # 1. Detect Operating System
    system = platform.system()
    print(f"\nSistema operativo detectado automáticamente: {system}")
    
    os_choice = input("¿Es este tu sistema operativo actual? (S/n): ").strip().lower()
    
    is_windows = True
    if os_choice == 'n':
        print("\nSelecciona tu sistema operativo:")
        print("  1) Windows")
        print("  2) Linux / macOS")
        selection = input("Opción (1 o 2): ").strip()
        if selection == '2':
            is_windows = False
    else:
        is_windows = (system == "Windows")
        
    print_info(f"Instalando configuraciones para: {'Windows' if is_windows else 'Linux/macOS'}")
    
    # 2. Check GUI support
    check_tkinter(is_windows)
    
    # 3. Config .env and API Keys
    configure_env()
    
    # 4. Setup Python Virtual Environment
    setup_python_venv(is_windows)
    
    # 5. Verify sinks database
    verify_sinks_db()
    
    # 6. Setup Frontend
    setup_frontend()
    
    # 7. Finished
    print_header("Instalación Completada")
    print_success("CodeXHound se ha configurado con éxito.")
    print("\nPara iniciar la aplicación:")
    print("1. Iniciar el Backend (Python):")
    if is_windows:
        print("   PS> .\\venv\\Scripts\\python.exe main.py")
    else:
        print("   $ ./venv/bin/python main.py")
    print("\n2. Iniciar el Frontend (React):")
    print("   $ cd frontend")
    print("   $ pnpm run dev")
    print("\nFuncionalidades disponibles:")
    print("  - Grafo interactivo de archivos, funciones y dependencias")
    print("  - Análisis de flujo de datos línea a línea")
    print("  - Simulación de taint interprocedural")
    print("  - Ejecución dinámica en sandbox con fuzzer")
    print("  - Explicaciones con IA (Groq / Gemini / OpenAI)")
    print("  - Panel de Sinks Peligrosos con scroll y explicación de riesgos vía IA")
    print("  - DebuggerPanel con análisis de taint visual")
    print("\n¡Todo listo para escanear y simular taints con seguridad!")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n[-] Instalación cancelada por el usuario.")
        sys.exit(1)
