import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def explain_code_logic(code_snippet: str, language: str) -> str:
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key and groq_key.startswith("gsk_"):
        try:
            from openai import OpenAI
            client = OpenAI(api_key=groq_key, base_url="https://api.groq.com/openai/v1")
            prompt = f"""Eres un experto en ciberseguridad y análisis estático de código. Responde en español.
Analiza la siguiente función línea por línea y proporciona:
1. **Qué hace** esta función de forma general y resumida.
2. **Explicación Paso a Paso Línea por Línea**: Analiza **CADA una** de las líneas de código de forma secuencial, sin saltarte ninguna línea relevante. Usa este formato:
   - `Línea X: <código>` -> <explicación de lo que hace exactamente esta instrucción, si propaga inputs, si sanitiza o si llama a otra función>.
3. **Riesgos de seguridad** detectados (SQL Injection, XSS, RCE, fugas de datos, etc.).
4. **Inputs no sanitizados** o funciones peligrosas que interactúen con el dato.
5. **Recomendación** de parche (código corregido) si hay vulnerabilidad.

Código:
```
{code_snippet}
```
"""
            for model_name in ["llama-3.3-70b-versatile", "llama-3.3-70b-specdec", "llama3-70b-8192", "mixtral-8x7b-32768"]:
                try:
                    response = client.chat.completions.create(
                        model=model_name,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.1
                    )
                    return response.choices[0].message.content
                except Exception:
                    continue
            return "No se pudo conectar a ningún modelo de Groq."
        except Exception as e:
            return f"Error contactando a Groq: {str(e)}"

    openai_key = os.getenv("OPENAI_API_KEY")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "Error: GEMINI_API_KEY u OPENAI_API_KEY no configurada en el archivo .env."

    try:
        client = genai.Client(api_key=api_key)

        prompt = f"""Eres un experto en ciberseguridad y análisis estático de código. Responde en español.
Analiza la siguiente función línea por línea y proporciona:
1. **Qué hace** esta función de forma general y resumida.
2. **Explicación Paso a Paso Línea por Línea**: Analiza **CADA una** de las líneas de código de forma secuencial, sin saltarte ninguna línea relevante. Usa este formato:
   - `Línea X: <código>` -> <explicación de lo que hace exactamente esta instrucción, si propaga inputs, si sanitiza o si llama a otra función>.
3. **Riesgos de seguridad** detectados (SQL Injection, XSS, RCE, fugas de datos, etc.).
4. **Inputs no sanitizados** o funciones peligrosas que interactúen con el dato.
5. **Recomendación** de parche (código corregido) si hay vulnerabilidad.

Código:
```
{code_snippet}
```
"""
        for model_name in [
            'gemini-2.0-flash-lite',
            'gemini-2.0-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.5-flash',
            'gemini-flash-latest',
        ]:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                return response.text
            except Exception:
                continue

        return "Todos los modelos de IA están con alta demanda. Intenta de nuevo en unos segundos."

    except Exception as e:
        return f"Error contactando a la IA: {str(e)}"

