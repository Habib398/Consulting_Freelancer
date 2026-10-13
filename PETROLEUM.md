# Petroleum: qué es, cómo funciona y qué puede hacer hoy

> Estado al 2026-10-12, después de reunir Consulting y Petroleum en una sola app
> y de cargar los datos de demostración (`scripts/seed_petroleum_demo.py`).

## 1. La idea en una frase

Petroleum **no es otra aplicación**: es la misma app Flask y la misma base de datos
que Consulting, vista con otro "brand". Lo que cambia según el brand activo es:

- **La apariencia**: colores dorado/oscuro, logo y textos de Petroleum.
- **Los datos**: casi todas las tablas tienen una columna `brand`, y las consultas filtran por el brand activo.
- **Algunos menús y módulos**: ciertas pantallas muestran otro contenido y algunos módulos se apagan en petroleum.

## 2. Cómo decide la app en qué brand estás

```
Login
  └─ /api/me  →  allowed_brands del usuario  (ej. "consulting,petroleum")
        ├─ admin, o 2+ brands  →  /select-system  (elige tarjeta Consulting o Petroleum)
        └─ 1 brand             →  se fija ese brand y entra directo a /hub
                                          │
                     POST /api/set-brand  →  session["brand"] = "petroleum"
```

- El brand vive en la **sesión** (`session["brand"]`). Para cambiarlo: botón **"Cambiar sistema"** del menú admin, que lleva a `/select-system`.
- `services/brand.py` contiene la lógica: `get_brand()`, `set_brand()`, `parse_allowed_brands()` y `user_allows_brand()`.
- `app.py` inyecta en todos los templates `brand` y `brand_settings`. Los templates usan `{% if brand=='petroleum' %}` para cambiar textos y colores.
- Para dar acceso a un usuario: en **Usuarios** (`/admin/users`), campo **Sistemas**: Ambos / Solo Consulting / Solo Petroleum.

> Ojo: las URLs `/petroleum/...` **no cambian el brand**. Solo redirigen a otras
> pantallas. Si estás en Consulting y abres `/petroleum`, sigues en Consulting.

## 3. Qué ve cada rol en Petroleum

### Admin
Después de elegir Petroleum llega a `/hub`, un menú radial. Ese menú es **el mismo en ambos brands**: solo cambian los colores.
Desde ahí, **Centro módulos** (`/admin/menu`) sí tiene una versión propia de Petroleum:

| Tarjeta / botón | A dónde va realmente | Qué muestra |
|---|---|---|
| Agenda | `/mod/activities` → Calendario operativo | Actividades programadas por estación y su estatus |
| Control de vigencias | `/petroleum/normativas-control` → `/admin/document-center` | Centro documental (ver sección 5) |
| Normativas por estación | `/petroleum/normativas` → `/admin/inbox` | Inbox de entregas y pagos |
| Estaciones | `/admin/stations` | Alta y estatus de estaciones petroleum |
| Centro documental | `/admin/document-center` | Documentos SASISOPA/SGM (ver sección 5) |
| Herramientas | Mi panel, Calendario, Evidencias, Reportes, Ejecutivo, Auditoría, Backups, Configuración, etc. | Igual que en Consulting, con los datos de petroleum |

### Jefe de estación / Operador
Usan el mismo hub y el mismo menú de staff (`/staff/menu`) que en Consulting. Ven sus actividades, avance, notificaciones, dashboard y pagos (solo el jefe), con los datos de **sus estaciones petroleum**.

> Importante: el alcance de un jefe u operador depende de su `station_id` y de
> sus accesos delegados. Un usuario cuya estación es de Consulting verá poco o nada en
> Petroleum. Por eso la demo usa `jefe_petroleum` y `op_petroleum`.

## 4. Qué funciona hoy (probado con los datos demo)

| Función | Dónde | Datos demo |
|---|---|---|
| Estaciones | `/admin/stations`, `/api/stations` | 4 estaciones (P-001 a P-004) con perfil legal |
| Actividades y calendario | `/mod/operational-calendar`, `/mod/activities` | 6 actividades, 264 eventos en 2026 |
| Entregas y revisión | `/admin/inbox` | 183 entregas (aprobadas, revisadas, pendientes, rechazadas) |
| Actividades vencidas | Inbox y avance por estación | Huecos sin entrega en fechas pasadas |
| Pagos / mensualidad | `/mod/payments`, inbox | 40 pagos |
| Vencimientos normativos | `/admin/document-deadlines`, `/mod/document-renewals-calendar` | 24 normativas + 24 expedientes, con estado vencido, por vencer o vigente |
| Semáforo por estación | Dashboard / ejecutivo (`/api/admin/semaphore`) | Calculado con pagos, vencimientos y cumplimiento |
| Reporte ejecutivo | `/admin/executive` | Métricas y ranking de estaciones |
| Reporte de cumplimiento de actividades | `/mod/reports` | Por mes, semana y estación |
| Chat | `/mod/chat` | 1 sala interna + 4 por estación |
| Notificaciones | `/mod/notifications` | Avisos de ejemplo |
| Centro de ayuda | `/mod/help-center` | Artículos propios de petroleum |

**Usuarios demo:** `jefe_petroleum` y `op_petroleum`, contraseña `PetroDemo2026!`. Además, `admin` puede elegir Petroleum.

## 5. Qué NO funciona o está a medias

Muchas de estas cosas son restos de la separación anterior. El código tenía la versión petroleum, pero se dejó fijo en consulting o se redirigió.

| Problema | Detalle | Dónde |
|---|---|---|
| **SASISOPA / SGM muestran datos de Consulting** | El módulo documental tiene el brand fijo: `_brand()` devuelve `"consulting"`. En petroleum, el admin ve los documentos de Consulting. Los jefes y operadores con acceso solo a Petroleum reciben **403**. | `modules/compliance/documental_docs.py:34` |
| **Organigrama falla la primera vez** | Al abrirlo en petroleum intenta crear el organigrama base y truena: `DEFAULT_PETROLEUM_NODES` no existe. Queda un organigrama vacío. Además, la página de edición usa `brand='consulting'` fijo. | `modules/admin/orgchart.py:248`, `:907`, `:1050` |
| **"Control de vigencias" no lleva a vigencias** | `/petroleum/normativas-control` y `/petroleum/expedientes` redirigen al Centro documental, que no muestra normativas. Las pantallas propias (`templates/admin/expedientes.html` y las APIs `/api/normativas`, `/api/expedientes/*`) existen pero no tienen ruta que las muestre. Hoy las normativas solo se ven en **Vencimientos** y en el **Calendario de renovaciones**. | `modules/compliance/tramites_normativas.py:701`, `:946` |
| **`/petroleum/cumplimiento` da 404** | Redirige a `/mod/compliance`, que no existe. | `modules/petroleum/petroleum.py` |
| **Módulos apagados en petroleum** | Alertas, Mantenimiento y Pipas responden 404 a propósito cuando el brand es petroleum. | `modules/operations/alerts.py`, `maintenance.py`, `pipas.py` |
| **Conteos mezclados** | "Estaciones activas" en el hub y el mapa suman estaciones de **ambos** brands. | `/api/admin/hub-metrics`, `/api/map/stations` |
| **Hub radial sin versión petroleum** | Muestra SASISOPA y SGM igual que en Consulting; esos enlaces llevan al problema de la primera fila. | `modules/core/pages.py:873-911` |
| **Tablas petroleum sin uso** | `petroleum_station_control`, `petroleum_owner_catalog`, `petroleum_doc_types`, `agenda_activities` / `agenda_calendar_events` / `agenda_submissions` y `petroleum_norm_files` existen en la BD, pero ningún módulo actual las usa. Las actividades de petroleum se guardan en `activities`, igual que en Consulting. | `db.py` |
| **Semáforo todo en rojo** | Con los datos demo, las 4 estaciones salen en rojo porque todas tienen vencimientos próximos. Se puede ajustar el seed si se quiere un semáforo más variado. | `scripts/seed_petroleum_demo.py` |

## 6. Dónde está cada cosa en el código

| Archivo | Para qué |
|---|---|
| `services/brand.py` | Brands válidos, leer/fijar brand, permisos por usuario |
| `services/branding.py` | Colores, nombres y logos por defecto de cada brand (la tabla `branding_settings` tiene prioridad) |
| `app.py` | Validación del brand en cada request e inyección de `brand` en templates |
| `modules/core/pages.py` | `/hub`, `/select-system`, `/api/set-brand` |
| `modules/petroleum/petroleum.py` | Alias `/petroleum`, `/petroleum/normativas`, `/petroleum/cumplimiento` |
| `modules/compliance/tramites_normativas.py` | Normativas, expedientes y vencimientos (la parte más "petroleum" del sistema) |
| `templates/admin_menu.html` | Menú admin con su versión petroleum |
| `templates/select_system.html` | Pantalla para elegir sistema |
| `scripts/seed_petroleum_demo.py` | Datos demo (`--undo` para quitarlos) |

## 7. Datos de demostración

- Cargar: `python scripts/seed_petroleum_demo.py`. Antes de escribir hace un respaldo en `backups/`.
- Quitar: `python scripts/seed_petroleum_demo.py --undo`. Borra solo lo que sembró el script, más los vencimientos y avisos que la app generó a partir de esos datos.

## 8. Siguientes pasos sugeridos (en orden de impacto para una demo)

1. Volver a conectar las pantallas de **Normativas** y **Expedientes**, para que "Control de vigencias" muestre de verdad las vigencias.
2. Quitar el brand fijo en SASISOPA/SGM (`documental_docs.py`) o esconder esos accesos en petroleum.
3. Arreglar el **organigrama** de petroleum (`DEFAULT_PETROLEUM_NODES`).
4. Dar al hub radial su versión petroleum y corregir `/petroleum/cumplimiento`.
5. Filtrar por brand los conteos del hub y del mapa.
6. Decidir si las tablas `petroleum_*` / `agenda_*` se usan o se eliminan.
