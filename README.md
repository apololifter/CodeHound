<div align="center">

![CodeHound Banner](https://github.com/apololifter/CodeXHound/blob/main/codexhound.png)

# CodeXHound 🐾

**Hybrid static & dynamic code analysis tool with AI-powered explanations and interactive call graphs.**

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## ¿Qué es CodeXHound?

CodeXHound es una herramienta de análisis de código que combina análisis estático, dinámico e inteligencia artificial para ayudarte a entender, auditar y encontrar vulnerabilidades en proyectos **Python**, **JavaScript** y **PHP**.

Apunta a un directorio, escanea el proyecto y obtienes:

- Un **grafo interactivo** de archivos, funciones y dependencias.
- **Flujo de datos** línea a línea dentro de cada función.
- **Simulación de taint** para rastrear datos no confiables hasta sus sinks.
- **Ejecución dinámica en sandbox** con fuzzing automático (Python).
- **Explicaciones en lenguaje natural** de cualquier función via IA.

---

## 🚀 Inicio Rápido (Instalación y Uso)

Para que el proyecto funcione de inmediato sin complicaciones, sigue estos pasos:

### 1. Clonar el repositorio
```bash
git clone https://github.com/apololifter/CodeXHound.git
cd CodeXHound
```

### 2. Ejecutar el instalador automático (Recomendado)
Este script creará el entorno virtual de Python, instalará las dependencias necesarias de backend, configurará el frontend utilizando `pnpm` (por motivos de seguridad) y te guiará para ingresar tus API Keys.

```bash
# Ejecutar desde el directorio raíz del proyecto
python instalador.py
```
*(Sigue las instrucciones en pantalla para configurar tu sistema operativo y tu Groq API Key).*

### 3. Iniciar los servidores

Para usar CodeXHound, debes iniciar tanto el servidor Backend como el cliente Frontend:

#### A. Iniciar el Backend (Python - API REST)
```bash
# Windows
.\venv\Scripts\python.exe main.py

# Linux / macOS
./venv/bin/python main.py
```

#### B. Iniciar el Frontend (React - Interfaz Visual)
En una nueva ventana de terminal o consola, accede a la carpeta del frontend y arranca el entorno de desarrollo:
```bash
cd frontend
pnpm run dev
```

Una vez levantados ambos servicios, abre **http://localhost:5173** en tu navegador para comenzar.

---

## Características

### 🔍 Análisis estático
Escanea el árbol de archivos y construye un grafo de nodos (archivos, funciones, clases) y aristas (llamadas, importaciones, dependencias) usando **tree-sitter** como parser. Soporta Python, JavaScript y PHP de forma nativa.

### 🌊 Análisis de flujo de datos
Clasifica cada instrucción dentro de una función en:

| Tipo | Descripción |
|------|-------------|
| `CAPTURE` | El dato externo entra al scope |
| `TRANSFORM` | El dato es procesado o modificado |
| `SANITIZE` | El dato es validado o limpiado |
| `SINK` | El dato llega a una operación sensible |
| `CALL` | Llamada a función externa |
| `RETURN` | El dato sale de la función |

### ☣️ Taint Engine
Simula la propagación de un payload desde una fuente de entrada hasta los sinks del proyecto. Traza el camino interprocedural completo: de función en función, de archivo en archivo.

### 🧪 Sandbox & Fuzzer
Ejecuta dinámicamente funciones Python en un entorno controlado para verificar el comportamiento real frente a inputs maliciosos. El fuzzer genera automáticamente casos de prueba (SQLi, XSS, path traversal, etc.) y reporta cuáles producen comportamientos anómalos.

### 🤖 Explicaciones con IA
Selecciona cualquier función del grafo y obtén una explicación en lenguaje natural generada por IA (OpenAI, Gemini o Groq), con el contexto línea a línea del código.

### 🗺️ Grafo interactivo
Visualización construida con **React Flow (XYFlow)** + **dagre** para layout automático. Navega el proyecto completo como un grafo, filtra por archivo, haz zoom en funciones específicas y explora las conexiones entre módulos.

---

## Stack tecnológico

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — API REST
- [tree-sitter](https://tree-sitter.github.io/tree-sitter/) — parsing de código fuente
- [Uvicorn](https://www.uvicorn.org/) — servidor ASGI
- OpenAI / Google Gemini / Groq — explicaciones con IA

**Frontend**
- [React 19](https://react.dev/) + [Vite 8](https://vite.dev/)
- [@xyflow/react](https://reactflow.dev/) — grafo interactivo
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — visor de código
- [Mermaid](https://mermaid.js.org/) — diagramas de flujo
- [dagre](https://github.com/dagrejs/dagre) — layout de grafos

---

## Requisitos previos

| Herramienta | Versión mínima |
|-------------|---------------|
| Python | 3.10+ |
| Node.js | 18+ |
| pnpm | cualquier versión reciente |

---

## Instalación Detallada

### Opción A — Setup automático (Recomendado)

Ejecuta el script interactivo desde la raíz:

```bash
# Windows
python instalador.py

# Linux / macOS
python3 instalador.py
```

El script detecta tu sistema operativo, limpia y recrea el entorno virtual si es necesario, instala las dependencias de Python y configura el frontend a través de `pnpm install`.

### Opción B — Manual

Si prefieres realizar el proceso manualmente sin usar el script `instalador.py`:

```bash
# 1. Clonar el repositorio
git clone https://github.com/apololifter/CodeXHound.git
cd CodeXHound

# 2. Crear entorno virtual Python
python -m venv venv

# Windows
.\venv\Scripts\activate

# Linux / macOS
source venv/bin/activate

# 3. Instalar dependencias Python
pip install -r requirements.txt

# 4. Instalar dependencias del frontend
cd frontend
pnpm install
```

---

## Configuración

Crea un archivo `.env` en la raíz del proyecto con las claves de IA que vayas a usar:

```env
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...
```

> [!NOTE]
> No es obligatorio tener las tres. Con una sola clave es suficiente para usar las explicaciones con IA.

> [!WARNING]
> Nunca subas el archivo `.env` a GitHub. Ya está incluido en `.gitignore`.

---

## Uso

### Iniciar la herramienta

Ejecuta los servidores backend y frontend en paralelo (como se detalla en el **Inicio Rápido**).

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://127.0.0.1:8000 |
| Docs interactivos | http://127.0.0.1:8000/docs |

### Escanear un proyecto

1. Abre http://localhost:5173 en el navegador.
2. Ingresa la ruta absoluta del directorio a analizar.
3. Haz clic en **Escanear proyecto**.
4. Explora el grafo generado: nodos de archivo (🗂️) y funciones (⚙️).

### Analizar una función

1. Haz clic sobre cualquier nodo de función en el grafo.
2. En el panel derecho aparecerá el código fuente con Monaco Editor.
3. Usa los botones del panel para:
   - **Flujo de datos** — ver el análisis línea a línea.
   - **Simular taint** — rastrear un payload desde esa función.
   - **Sandbox** — ejecutar dinámicamente con un input específico.
   - **Explicar con IA** — obtener una descripción en lenguaje natural.

---

## API REST

Todos los endpoints aceptan y devuelven JSON.

```
POST /api/scan                  Escanear un directorio
POST /api/read_file             Leer el contenido de un archivo
POST /api/save_file             Guardar cambios en un archivo
POST /api/analyze/dataflow      Flujo de datos de una función
POST /api/simulate/taint        Simular propagación de taint
POST /api/simulate/sandbox      Ejecución dinámica con payload
POST /api/simulate/fuzzing      Fuzzing automático de una función
POST /api/ai/explain            Explicación con IA de una función
```

Ejemplo:

```bash
curl -X POST http://127.0.0.1:8000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"directory": "/ruta/al/proyecto"}'
```

---

## Estructura del proyecto

```
CodeXHound/
├── main.py                  # Servidor FastAPI
├── instalador.py            # Instalador y configurador universal interactivo
├── requirements.txt         # Requerimientos del Backend
├── .env                     # Claves de API (no commitear)
├── analyzer/
│   ├── scanner.py           # Descubrimiento de archivos
│   ├── parser.py            # Parsing con tree-sitter
│   ├── hybrid_detector.py   # Selección de estrategia por lenguaje
│   ├── dataflow_analyzer.py # Análisis de flujo de datos
│   ├── taint_engine.py      # Motor de propagación de taint
│   ├── ai_agent.py          # Integración con LLMs
│   └── sandbox_runner.py    # Ejecución dinámica y fuzzer
├── frontend/
│   ├── src/                 # Código React
│   ├── package.json
│   └── vite.config.js
└── test_project/            # Proyecto de ejemplo para probar
```

---

## Lenguajes soportados

| Lenguaje | Escaneo | Grafo | Dataflow | Taint | Sandbox |
|----------|:-------:|:-----:|:--------:|:-----:|:-------:|
| Python | ✅ | ✅ | ✅ | ✅ | ✅ |
| JavaScript | ✅ | ✅ | ✅ | ✅ | ❌ |
| PHP | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## Seguridad

CodeXHound tiene protecciones para evitar que sea usado de forma maliciosa:

- **Directorios del sistema bloqueados** — no se puede escanear `C:\Windows`, `/etc`, `/bin`, `/usr`, etc.
- **Sandbox aislado** — la ejecución dinámica ocurre en un subproceso controlado y protegido con monkeypatching restrictivo para escrituras y borrados del OS.
- **Sin ejecución remota** — el backend solo acepta conexiones locales (`127.0.0.1`).

> [!CAUTION]
> Esta herramienta está diseñada para analizar código propio o de terceros con autorización explícita. No la uses para auditar sistemas sin permiso.

---

## Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Haz un fork del repositorio.
2. Crea una rama para tu feature: `git checkout -b feature/nueva-funcionalidad`.
3. Haz commit de tus cambios: `git commit -m 'feat: agregar soporte para Ruby'`.
4. Abre un Pull Request.

---

## Licencia

Distribuido bajo la licencia MIT. Ver [`LICENSE`](LICENSE) para más detalles.

---

<div align="center">

Hecho con 🐾 por [apololifter](https://github.com/apololifter)

</div>
