# Metodología Obligatoria: GitFlow Estricto

Esta regla es de cumplimiento **estricto y permanente** en todas las interacciones, tareas y requerimientos del repositorio.

## 1. Principio Fundamental
- **NUNCA** desarrollar, modificar archivos ni comitear directamente sobre las ramas `main` ni `develop`.
- Toda modificación de código debe originarse y realizarse en una rama dedicada.

## 2. Ramas Permanentes
- **`main`**: Producción estable. Solo recibe merges de `develop` (vía releases) o de ramas `hotfix/*`.
- **`develop`**: Rama integradora de desarrollo. Todo nuevo desarrollo parte de aquí.

## 3. Ciclo Obligatorio de Trabajo por Tarea
1. **Inicio de cualquier requerimiento:**
   - Asegurarse de estar sobre la rama `develop` actualizada.
   - Crear una rama específica con nomenclatura estándar:
     - Nuevas características, módulos o pantallas: `feature/<nombre-descriptivo>` (ej. `feature/modulo-transporte`).
     - Mejoras o refactorizaciones: `feature/<nombre-descriptivo>`.
     - Corrección urgente sobre producción: `hotfix/<nombre-descriptivo>` (partiendo de `main`).
2. **Desarrollo y pruebas:**
   - Todo el trabajo, edición de archivos y pruebas se realiza dentro de la rama `feature/*`.
3. **Cierre de tarea:**
   - Cuando la tarea esté validada o el usuario pida guardar/mergear:
     a) Realizar el commit correspondiente en la rama `feature/*`.
     b) Cambiar a `develop`.
     c) Hacer `merge` de la rama `feature/*` hacia `develop`.
     d) Si el usuario solicita pase a producción, fusionar `develop` hacia `main`.
     e) En caso de `hotfix/*`, fusionar a `main` y a `develop`.

## 4. Comandos de Git en Windows/OneDrive
- Debido a bloqueos de `index.lock` en entornos Windows con OneDrive, los comandos de escritura de Git (`git add`, `git commit`, `git checkout -b`, `git merge`) deben ejecutarse con `BypassSandbox: true`.
