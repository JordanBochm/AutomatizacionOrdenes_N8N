# Flujo de trabajo con GitFlow

Este proyecto usa **GitFlow**: cada tipo de trabajo vive en su propia rama,
así `main` siempre tiene una versión que funciona.

## Las ramas y para qué sirven

| Rama | Para qué | Nace de | Se une a |
|---|---|---|---|
| `main` | Versión estable (la que usas en el día a día). Cada entrega lleva una etiqueta: `v0.1`, `v0.2`, `v1.0` | — | — |
| `develop` | Rama de trabajo: aquí se van juntando las funciones nuevas | `main` | `release/*` |
| `feature/*` | Una función o mejora nueva (ej. flujo de n8n, subir a S3) | `develop` | `develop` |
| `release/*` | Preparar una versión: pruebas finales y ajustes chicos | `develop` | `main` **y** `develop` |
| `hotfix/*` | Arreglo urgente de algo que falla en `main` | `main` | `main` **y** `develop` |

> Regla de oro: **nunca trabajes directo en `main` ni en `develop`**.
> Siempre crea una rama `feature/` o `hotfix/`.

---

## 1. Nueva función (feature)

```powershell
git checkout develop
git pull
git checkout -b feature/flujo-n8n

# ... editas, pruebas ...
git add .
git commit -m "feat: flujo n8n que ejecuta generar_guias"

# Cuando ya funciona, la unes a develop
git checkout develop
git merge --no-ff feature/flujo-n8n
git branch -d feature/flujo-n8n
git push origin develop
```

## 2. Sacar una versión (release)

```powershell
git checkout develop
git checkout -b release/v0.2

# Últimas pruebas: python src/generar_guias.py / python src/asignar_tracking.py
# Si algo falla, lo arreglas aquí mismo y haces commit

git checkout main
git merge --no-ff release/v0.2
git tag -a v0.2 -m "v0.2 - descripción de la versión"

git checkout develop
git merge --no-ff release/v0.2
git branch -d release/v0.2

git push origin main develop --tags
```

## 3. Arreglo urgente (hotfix)

Ejemplo: el script falla con el reporte de hoy y lo necesitas ya.

```powershell
git checkout main
git checkout -b hotfix/cp-vacio

# ... arreglas ...
git commit -am "fix: manejar codigo postal vacio"

git checkout main
git merge --no-ff hotfix/cp-vacio
git tag -a v0.1.1 -m "v0.1.1 - fix CP vacio"

git checkout develop
git merge --no-ff hotfix/cp-vacio
git branch -d hotfix/cp-vacio

git push origin main develop --tags
```

---

## Nombres de commits

| Prefijo | Uso |
|---|---|
| `feat:` | Función nueva |
| `fix:` | Corrección de error |
| `docs:` | Documentación |
| `refactor:` | Reordenar código sin cambiar lo que hace |
| `chore:` | Mantenimiento (dependencias, .gitignore, etc.) |

## Versiones (etiquetas)

`vMAYOR.MENOR.PARCHE`
- **PARCHE** (`v0.1.1`): hotfix.
- **MENOR** (`v0.2`): release con funciones nuevas.
- **MAYOR** (`v1.0`): primera versión completa (ej. corriendo con n8n + AWS).
