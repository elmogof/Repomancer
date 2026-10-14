# Git Manager

A local web app to manage all your Git repositories in one place, with built-in GitLab and GitHub integration. Clone, commit, branch, merge, resolve conflicts and review merge requests and pull requests from a single dashboard. It runs entirely on your own computer.

- **Frontend:** React 18, Material UI 6 and Vite
- **Backend:** Node.js and Express, running the real `git` on your machine
- **Integrations:** GitLab (any instance, several at once) and GitHub (github.com or Enterprise)

> The app's interface is in Spanish.

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Running the app](#running-the-app)
- [Signing in and accounts](#signing-in-and-accounts)
- [Configuration](#configuration)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Security and privacy](#security-and-privacy)
- [Project structure](#project-structure)
- [npm scripts](#npm-scripts)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

### Repository list

- Add existing repositories by picking a folder: it is scanned at any depth, nested repositories included, and empty repositories are skipped. You can also clone by URL or from your GitLab projects.
- See the state of every repository at a glance:
  - current branch;
  - uncommitted changes;
  - commits to push (↑) and to pull (↓);
  - unpublished branches;
  - last commit date and author.
- Search by name, path, branch, label, or last commit author and message:
  - multi-word and accent-insensitive;
  - matching text is highlighted;
  - the search survives navigation and page reloads.
- Status filters (with changes, behind, ahead, unpublished), plus **favorites** (always shown first) and colored **labels** to group repositories by client, project or team.
- Sort by name or by last commit date. The sort order and filters are remembered.
- Bulk actions on selected repositories: fetch, pull, favorite, labels, and remove from the list (files on disk are never deleted).
- Quick actions per repository:
  - pull, push and fetch;
  - open the folder, VS Code or a terminal;
  - open the web page;
  - copy the path.

### Repository detail

| Tab | What you can do |
|---|---|
| **Cambios** (changes) | Stage or unstage files and **individual lines**. View diffs, discard changes, and commit (or commit and push, or amend). Commit messages can be generated from the diff following Conventional Commits. |
| **Historial** (history) | Branch graph and commit list with filters (message, author, file, date range, all branches) and the diff of each commit. From a commit you can revert, cherry-pick, undo the last commit, tag, or compare. |
| **Ramas** (branches) | Search local and remote branches and check out any of them. Create a branch from **any base**, optionally switching to it and publishing it. Merge (with `--no-ff` if you want), compare, **publish** unpublished branches, and **delete** local branches, with a confirmation and force option when unmerged; the current branch can't be deleted. Bulk-clean merged or gone branches. |
| **Comparar** (compare) | Compare two branches, tags or commits: the commits in between and the full diff. |
| **Archivos** (files) | History of a single file and line-by-line **blame**. |
| **Stash** | Save changes, view each stash's diff, then apply, pop or drop it. |
| **Tags** | Create lightweight or annotated tags, push them and delete them. |

Also in the repository detail:

- **Sync:**
  - **Fetch**.
  - **Pull** with merge or rebase, and optional autostash.
  - **Push**. A branch with no upstream is published with `-u origin`, and a header button publishes the current branch.
- **Conflict resolver:** for merges, rebases, cherry-picks and reverts.
  - Pick ours, theirs or both for each block, or edit the result by hand.
  - Continue or abort the operation.
- **Merge request / pull request button:** adapts to the remote, offering a GitLab MR, a GitHub PR, or a link for other hosts.

### GitLab

- Browse and search the projects of any connected GitLab instance and clone them in one click.
- List merge requests: all visible, created by me, assigned to me, filtered by state or project.
- Open a merge request to read its description, changes and comments, then **comment, approve, close or merge** it (with squash and source-branch deletion).
- Create merge requests from the current branch.
- Several GitLab instances at once, each with its own token, with an instance selector on the GitLab screens.

### GitHub

- Pull requests you're involved in, authored, or asked to review, across all connected GitHub accounts.
- Create pull requests from the current branch, and see the open PR for the branch you're on.
- Supports github.com and GitHub Enterprise.

### Productivity

- **Global search:** `Ctrl+K` jumps to any repository.
- **Command palette:** `Ctrl+Shift+P`, `F1` or `?` gives every action with its shortcut. See [Keyboard shortcuts](#keyboard-shortcuts).
- **Auto-fetch** runs in the background on all repositories (every 10 minutes by default; configurable or can be turned off) so the ↓ counts stay current.
- The **operation log** records every Git operation (fetch, pull, push, commit, merge, branch deletion and so on) with its result and output.
- Light and dark themes, a collapsible sidebar, a mobile-friendly layout, smooth screen transitions and loading placeholders.

## Requirements

- **Node.js 20 or later**
- **Git 2.31 or later.** On Windows, install [Git for Windows](https://git-scm.com/download/win).
- A modern browser (Chrome, Edge or Firefox)
- Windows, macOS or Linux. The [start with Windows](#start-with-windows) option is Windows-only.

## Installation

```bash
git clone https://github.com/elmogof/Git-Manager-Local-Remote.git git-manager
cd git-manager
npm install
```

`npm install` installs the server and client together (npm workspaces).

## Running the app

### Development (hot reload)

```bash
npm run dev
```

Open <http://localhost:5173>. Vite serves the client and forwards `/api` to the server on port 4000. The server restarts on its own when you change its code.

### Production (single process)

```bash
npm start
```

This builds the client and serves everything from <http://localhost:4000>.

### Start with Windows

To have the app always available at <http://localhost:4000> without opening a terminal:

```bash
npm run startup:install
```

This command:

- builds the client;
- creates a Task Scheduler task named **Git Manager**, which starts the server with no window every time you sign in to Windows;
- adds a **Git Manager** shortcut to the Start menu.

The server runs as your user, so "Open terminal", "Open in VS Code" and your Git credentials keep working. That is why it is a sign-in task and not a Windows service.

| Command | What it does |
|---|---|
| `npm run startup:status` | Shows whether the task exists and whether the app responds |
| `npm run startup:stop` / `npm run startup:start` | Stops or starts the server |
| `npm run startup:restart` | Rebuilds the client and restarts. Run it after pulling or changing code. |
| `npm run startup:uninstall` | Removes the task and the shortcut |

Both the task and `npm run dev` use port 4000. Run `npm run startup:stop` before developing and `npm run startup:start` afterwards. The server output goes to `server.log` in your config folder.

## Signing in and accounts

On the login screen, choose **GitLab** or **GitHub**. You can connect the other one later from the avatar menu or from **Cuentas** (accounts). If you sign in only with GitHub, the GitLab screens ask you to connect GitLab.

### GitLab account (username and password, Microsoft…)

This uses GitLab's OAuth 2 with PKCE. The app sends you to your GitLab sign-in page, where you sign in with your username and password or with Microsoft or another provider your GitLab offers. **The app never sees your password.** The token renews itself when it expires.

You register the app once:

1. In GitLab, open **Preferences → Applications** (`https://<your-gitlab>/-/user_settings/applications`) and click *Add new application*.
2. **Name:** `Git Manager local`
3. **Redirect URI:** `http://localhost:4000/api/auth/oauth/callback`. If you use another port, change it to match.
4. **Confidential:** unchecked. PKCE is used, so no secret is needed.
5. **Scopes:** `api`, `read_user`, `read_repository`, `write_repository`
6. Save, then paste the **Application ID** on the login screen.

If your user can't create applications, a GitLab administrator can create one for the whole instance (*Admin → Applications*) with the same values.

### GitLab personal access token

1. Go to **Preferences → Access tokens** (`https://<your-gitlab>/-/user_settings/personal_access_tokens`).
2. Create a token with the scopes `api`, `read_repository` and `write_repository`, and give it an expiration date.
3. Paste it in the **Token personal** tab.

### GitHub account (username and password)

This uses GitHub's **device flow**, so there is no password, secret or callback URL in the app:

1. Click **Iniciar sesión con GitHub**. The app shows a code, copies it, and opens `github.com/login/device`.
2. Sign in to GitHub as usual (including 2FA), enter the code and authorize.
3. The app finishes signing you in on its own.

You register the app once:

1. Open **Settings → Developer settings → OAuth Apps → New OAuth App** (<https://github.com/settings/applications/new>).
2. **Application name:** `Git Manager local`. **Homepage URL** and **Authorization callback URL** can both be `http://localhost:4000`. They aren't used, but GitHub requires them.
3. Click **Register application**, then check **Enable Device Flow** and save.
4. Paste the **Client ID** on the login screen. The client secret is not needed.

### GitHub personal access token

Create a token (classic) at **Settings → Developer settings → Personal access tokens** with the scopes `repo`, `read:user` and `read:org`, then paste it in the **Token personal** tab of the GitHub section.

### Extra accounts

In **Cuentas** you can add more GitLab instances and GitHub accounts, each with its own personal access token. The app uses the account that matches each remote's host for fetch, pull and push, and for merge requests and pull requests.

**Cerrar sesión** (sign out) disconnects the GitLab and GitHub accounts you signed in with. Accounts added from **Cuentas** stay until you remove them there.

## Configuration

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Server port. The OAuth redirect URI changes with it (`http://localhost:<PORT>/api/auth/oauth/callback`). |
| `GIT_MANAGER_HOME` | `~/.git-manager` | Folder for the configuration, operation log and server log |
| `CLIENT_URL` | `http://localhost:5173` in development, `http://localhost:<PORT>` in production | Where the GitLab OAuth callback sends you back |

For example, with PowerShell:

```powershell
$env:PORT = 5000; npm start
```

### Files

All of these live in `GIT_MANAGER_HOME` (`C:\Users\<you>\.git-manager` on Windows), outside the project. They are never committed.

| File | Contents |
|---|---|
| `config.json` | Sessions and tokens, your repository list with favorites and labels, extra accounts, OAuth app IDs, and auto-fetch settings |
| `oplog.json` | The operation log (most recent entries) |
| `server.log` | Server output when started by the Windows task. It rotates at 1 MB to `server.old.log`. |

The sort order, filters, pull options and theme are stored in your browser.

### Auto-fetch

Click the cloud icon in the top bar to turn auto-fetch on or off and choose the interval. It runs on the server, so it keeps going while the browser tab is closed, as long as the server is running.

## Keyboard shortcuts

Shortcuts without `Ctrl` or `Alt` only work when you're not typing in a field. `?` opens the full list in the command palette.

| Where | Keys | Action |
|---|---|---|
| Anywhere | `Ctrl+K` | Search repositories |
| Anywhere | `Ctrl+Shift+P`, `F1`, `?` | Command palette |
| Anywhere | `Alt+1` … `Alt+6` | Go to a section |
| Anywhere | `Alt+T` / `Alt+M` | Toggle the theme / the sidebar |
| Repository list | `/` | Search in the list |
| Repository list | `a` / `n` / `r` | Add repositories / clone / refresh |
| Repository detail | `1` … `7` | Switch tab |
| Repository detail | `f` / `p` / `Shift+P` | Fetch / pull / push |
| Repository detail | `c` / `a` / `s` / `t` | Write the commit message / stage all / stash / new tag |
| Repository detail | `r` / `Backspace` | Refresh / back to the list |

## Security and privacy

- **Local only.** The server listens on `127.0.0.1`, so nobody on your network can connect to it.
- **Tokens stay on your machine.** They are stored in `config.json` with permissions for your user only, and never sent to the browser.
- **Tokens never land in your repos.** For hosts with a connected account, the token is passed to Git as an HTTP header through environment variables. It is never written to `.git/config` or into remote URLs. Other remotes use your usual Git credentials (SSH, Git Credential Manager…).
- **Protection against other websites.** Every API call requires a custom header, so other web pages open in your browser can't send commands to the server.
- **Passwords are never seen.** GitLab and GitHub sign-in happen on their own sites (OAuth with PKCE and the device flow).
- **Nothing is deleted from disk.** Removing a repository from the list only removes it from Git Manager.

## Project structure

```
git-manager/
├── package.json             # workspaces and top-level scripts
├── scripts/startup/         # Windows sign-in task (startup.ps1, launch.mjs)
├── server/                  # Node + Express API
│   └── src/
│       ├── index.js         # server, CSRF check, static files
│       ├── config.js        # local config in ~/.git-manager
│       ├── git.js           # runs git and injects credentials
│       ├── gitlab.js        # GitLab API, OAuth 2 + PKCE, multiple instances
│       ├── github.js        # GitHub API client
│       ├── githubAuth.js    # GitHub sign-in (device flow and token)
│       ├── accounts.js      # extra GitLab and GitHub accounts
│       ├── autofetch.js     # background fetch scheduler
│       ├── oplog.js         # operation log
│       ├── commitmsg.js     # commit message suggestions
│       ├── scan.js          # finds repositories inside a folder
│       ├── open.js          # opens folder, VS Code or terminal
│       └── routes/          # auth, repos, gitlab, github, accounts, fs, auto-fetch, oplog
└── client/                  # React + Vite + Material UI
    └── src/
        ├── App.jsx          # layout, navigation, routes
        ├── theme.js         # light and dark themes
        ├── pages/           # Login, Repos, RepoDetail, History, Branches, Compare, FileHistory,
        │                    # Stashes, Tags, Projects, MergeRequests, PullRequests, OpLog, Accounts
        └── components/      # DiffView, ConflictResolver, CommitBox, dialogs, command palette…
```

## npm scripts

| Script | Description |
|---|---|
| `npm run dev` | Server and client in development mode (port 5173) |
| `npm run build` | Builds the client into `client/dist` |
| `npm start` | Builds and runs the production server (port 4000) |
| `npm run startup:install` | Installs the Windows sign-in task and the Start menu shortcut |
| `npm run startup:start` / `npm run startup:stop` / `npm run startup:restart` / `npm run startup:status` / `npm run startup:uninstall` | Manage the sign-in task |

## Troubleshooting

| Problem | Solution |
|---|---|
| `EADDRINUSE` / port 4000 already in use | The sign-in task or another `npm run dev` is running. Run `npm run startup:stop`, or use another `PORT`. |
| GitLab says *"The redirect URI included is not valid"* | The redirect URI in the GitLab application must match `http://localhost:<PORT>/api/auth/oauth/callback` exactly. |
| GitHub: *"Enable Device Flow"* error | Open your OAuth App in GitHub, check **Enable Device Flow**, and save. |
| Push or pull asks for credentials or fails | Connect an account for that host in **Cuentas**, or set up SSH or Git Credential Manager for it. |
| `git` not found | Install Git and make sure `git --version` works in a new terminal. |
| Changes don't show on port 4000 | The sign-in task serves the built client. Run `npm run startup:restart`. |

## Contributing

1. Create a branch from `main`.
2. Run `npm run dev` and test against **throwaway repositories**, not real ones.
3. Write commit messages in English, in the imperative mood ("Add…", "Fix…"), with a short body when the change needs context.
4. Open a pull request.

## License

[MIT](LICENSE) © 2026 Máximo Javier Aráuz Vigil. You can use, copy, modify and share this software freely, as long as the license notice is kept.
