# Git Manager

Aplicación web **local** para gestionar repositorios Git y tu instancia de GitLab (`https://gitlab.sysco.cr`).
Stack: React + Material UI (frontend) y Node + Express (backend que ejecuta `git` en tu equipo).

## Qué hace

- **Repositorios locales**: añadir carpetas existentes, clonar por URL o desde la lista de proyectos de GitLab, ver estado (rama, cambios, commits por subir/bajar).
- **Cambios**: ver el diff de cada archivo, añadir/quitar del stage, descartar cambios, escribir el mensaje y hacer **commit** (o *commit y push*, o *amend*).
- **Remoto**: fetch, pull y push (la primera vez publica la rama con `-u origin`).
- **Ramas**: crear, cambiar (checkout, también desde ramas remotas) y fusionar en la rama actual (con aviso de conflictos y botón para abortar).
- **Historial**: lista de commits con el diff de cada uno.
- **GitLab**: buscar proyectos, listar merge requests (todos, creados por mí, asignados a mí), **crear MR** desde la rama actual, revisar sus cambios, comentar, aprobar, cerrar y fusionar.

## Requisitos

- Node.js 20 o superior
- Git 2.31 o superior (en Windows, Git for Windows)

## Instalación y uso

```bash
npm install

# Modo desarrollo (recarga en caliente): abre http://localhost:5173
npm run dev

# Modo "app": compila y sirve todo en http://localhost:4000
npm start
```

El servidor solo escucha en `127.0.0.1`, así que nadie de tu red puede conectarse.

## Inicio de sesión

### Opción 1: Personal Access Token (recomendada para empezar)

1. En GitLab ve a **Preferencias → Access tokens** (`https://gitlab.sysco.cr/-/user_settings/personal_access_tokens`).
2. Crea un token con los scopes `api`, `read_repository` y `write_repository` y ponle fecha de expiración.
3. Pégalo en la pestaña **Token personal** de la app.

### Opción 2: Microsoft (vía OAuth de GitLab)

El botón "Microsoft" de la página de GitLab es GitLab delegando el inicio de sesión en Microsoft. Por eso la app usa el **OAuth2 de GitLab** (authorization code + PKCE): la app te lleva a GitLab, tú pulsas *Microsoft* con tu cuenta de empresa, y GitLab devuelve un token a la app. **La app nunca ve tu contraseña de Microsoft.**

Registro único (lo haces tú con tu cuenta):

1. Abre **Preferencias → Applications** (`https://gitlab.sysco.cr/-/user_settings/applications`) y pulsa *Add new application*.
2. **Name**: `Git Manager local`
3. **Redirect URI**: `http://localhost:4000/api/auth/oauth/callback`
4. **Confidential**: desmarcado (la app usa PKCE, no necesita secreto).
5. **Scopes**: `api`, `read_user`, `read_repository`, `write_repository`.
6. Guarda y copia el **Application ID** en la pestaña **Microsoft (OAuth)** de la app.

Si tu usuario no puede crear aplicaciones, un administrador puede crearla a nivel de instancia (*Admin → Applications*) con los mismos datos. El token OAuth se renueva solo cuando expira.

Si cambias el puerto (`PORT=5000 npm start`), la Redirect URI cambia a `http://localhost:5000/api/auth/oauth/callback`.

## Seguridad y dónde se guardan los datos

- El token y la lista de repos se guardan en `~/.git-manager/config.json` (en Windows `C:\Users\<tú>\.git-manager\config.json`), **fuera** de este proyecto y con permisos solo para tu usuario. Nunca se suben a git.
- Para clonar/pull/push contra `gitlab.sysco.cr`, el token se pasa a git como cabecera HTTP mediante variables de entorno: **no** se escribe en `.git/config` ni en la URL del remoto. Otros remotos usan tus credenciales habituales de git (SSH, Credential Manager…).
- Quitar un repo de la lista **no** borra archivos del disco.
- Las peticiones a la API exigen una cabecera propia, así que otras páginas web abiertas en tu navegador no pueden darle órdenes al servidor.
- Puedes cambiar la carpeta de configuración con la variable `GIT_MANAGER_HOME`.

## Estructura

```
git-manager/
├── server/            # API Node + Express
│   └── src/
│       ├── index.js       # servidor, seguridad, estáticos
│       ├── config.js      # configuración local (~/.git-manager)
│       ├── git.js         # ejecución de git e inyección del token
│       ├── gitlab.js      # API de GitLab y OAuth2 + PKCE
│       └── routes/        # auth, gitlab, repos
└── client/            # React + Vite + Material UI
    └── src/
        ├── pages/         # Login, Repos, RepoDetail, History, Branches, Projects, MergeRequests…
        └── components/    # DiffView, CloneDialog, CreateMRDialog, Notify
```

## Obtener el código

```bash
git clone https://github.com/elmogof/Git-Manager-Local-Remote.git git-manager
cd git-manager && npm install && npm run dev
```
