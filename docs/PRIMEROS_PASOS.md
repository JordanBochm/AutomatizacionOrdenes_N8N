# Guía de Inicio: Proyecto de Automatización de Órdenes

¡Bienvenido al nuevo espacio de trabajo aislado! Aquí podrás desarrollar, probar y automatizar el flujo completo con **n8n** y **AWS** sin tocar ni alterar tus archivos originales de producción.

---

## 1. Estructura de este proyecto

* **`src/`**: Contiene los scripts de procesamiento en Python.
  * `generar_guias.py`: Limpia los datos de ServiceNow, aplica reglas de Estafeta y genera el Excel para Techship.
  * `asignar_tracking.py`: Lee el PDF de etiquetas y llena los números de tracking en el reporte de cierre.
* **`data/`**:
  * `samples/`: Copias de prueba de tus archivos reales para experimentar sin miedo.
  * `input/`: Carpeta donde caerán los reportes entrantes.
  * `output/`: Carpeta donde se generarán los resultados.
* **`n8n/workflows/`**: Guardará los flujos visuales de n8n exportados.
* **`docs/`**: Documentación técnica y explicaciones paso a paso.

---

## 2. Hoja de Ruta para Aprender Automatización

### Nivel 1: Automatización Local (En tu PC)
1. Modificar los scripts en `src/` para que tomen automáticamente los archivos de `data/input/` y guarden en `data/output/`.
2. Probar que corran sin dar errores usando `data/samples/`.

### Nivel 2: Tu Primer Flujo en n8n
1. Instalar n8n (o usar la cuenta gratuita de prueba en la nube).
2. Crear un flujo simple:
   * **Trigger**: Detectar un nuevo archivo en carpeta o recibir un correo.
   * **Nodo Execute Command**: Llamar a `python src/generar_guias.py`.
   * **Nodo Notificación**: Enviar un mensaje de éxito.

### Nivel 3: Llevarlo a AWS
1. Subir los archivos a **Amazon S3** (almacenamiento en la nube).
2. Ejecutar los scripts con **AWS Lambda** (cómputo serverless sin servidores físicos).
3. Conectar n8n para que vigile S3 y dispare las Lambdas automáticamente.
