# Hugo's Terminal

A personal portfolio for Hugo Silva: Rust on the server, htmx in the browser,
and a small, fictional filesystem to explore. No frontend build pipeline,
database, analytics, or real shell execution.

## Run

Install a stable Rust toolchain, then run from the repository root:

```sh
cargo run
```

Open http://127.0.0.1:3000 and enter `ssh hugo`. The same command is available
as the **Run portfolio** VS Code task.

## Make It Yours

Edit [content/portfolio.toml](content/portfolio.toml) to update your name, bio,
role, company, skills, experience, GitHub link, and projects. Content is loaded
on every request, so these changes do not require recompiling or restarting.
Use unique project slugs containing letters, numbers, or hyphens; project links
must use HTTPS. Keep `url = ""` when there is no public link.

The `next-adventure` project and parts of the experience entry are clearly
marked sample content. Replace them before publishing. The terminal portfolio
entry describes this actual project.

For multiline content, TOML supports triple-quoted strings:

```toml
experience = """
Software Engineer @ SWISS International Air Lines Ltd.

Add your dates, contributions, and highlights here.
"""
```

Presentation and the hidden surprise have small, separate homes:

| File | Responsibility |
| --- | --- |
| `src/content.rs` | Load and validate portfolio content |
| `src/filesystem.rs` | Define virtual folders/files and normalize paths |
| `src/shell.rs` | Parse commands and return typed results; no HTML or OS shell |
| `src/web.rs` | Axum routes, completion, and escaped Askama rendering |
| `templates/index.html` | Initial page and command form |
| `templates/response.html` | htmx output fragments |
| `static/style.css` | Design tokens, CRT effect, and responsive layout |
| `static/terminal.js` | History, completion, focus, and htmx lifecycle |
| `static/game.js` | Interactive constellation and piano rhythm game |

Templates are compiled into the Rust binary. Restart `cargo run` after Rust
or template changes. CSS and JavaScript changes only need a browser refresh.
There are no real folders exposed to visitors; `~` is the virtual home/root.
Add virtual files in `filesystem.rs`, not in the operating system's filesystem.

## Commands

`ls`, `la`, `ls -a`, `ls -l`, `cd`, `cat`, `pwd`, `whoami`, `about`, `projects`,
`contact`, `help`, and `clear`. Paths support `~`, `.`, `..`, and `/`.
Quoted arguments are parsed with the `shell-words` library. Pipes,
redirects, and command chaining are intentionally unsupported.

Arrow keys recall command history; Tab completes commands and visible paths.
Completion is case-insensitive and preserves actual filenames. Repeated Tab
cycles through ambiguous matches; Shift+Tab cycles backwards, and matches are
also clickable. Hidden files complete when explicitly prefixed with `.` or
when using `la` / `ls -a`.

Ctrl+C cancels the current line or running request/game without disconnecting;
selected text still copies normally. Ctrl+D on an empty prompt disconnects:
enter `ssh hugo` to start a new session at home. On a nonempty line, Ctrl+D
deletes the character at the cursor, like a shell. `exit` also disconnects.
Ctrl+L clears the terminal. Folder/file rows and quick commands are clickable
for visitors who prefer not to type.

### Hidden Program

At home, `la` or `ls -a` reveals `hiddenbin`. Run `./hiddenbin` to explore an
interactive constellation of Hugo's interests. **Play** starts a short piano
rhythm game: hit D/F/J/K, or tap the piano keys, as notes reach the dashed line.
Sound is opt-in. Scores and the CRT preference stay in the visitor's local
browser storage. Escape or the close button returns focus to the terminal.

The game is intentionally a small original diversion, not a full game engine.
Its melody, interests, colors, and note frequencies are defined in `game.js`.

## Checks

```sh
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
node --check static/terminal.js
node --check static/game.js
```

GitHub Actions runs these checks. Node is only needed for JavaScript syntax
checks, not to run or deploy the website. Browser verification covers entry,
htmx navigation, completion, hidden discovery, canvas rendering/scoring, and
desktop/mobile layouts.

## Deploy

```sh
cargo build --release --locked
PORTFOLIO_BIND=0.0.0.0:3000 ./target/release/hugo-portfolio
```

Run from a directory containing `static/` and `content/`. Deploy those directories
alongside the release binary; templates are already embedded. Use a process
manager/container host and a reverse proxy providing HTTPS. Set
`PORTFOLIO_CONTENT` to override the content file path and `PORTFOLIO_BIND` to
change the address/port. Secrets and personal account credentials are not needed.

## Dependencies

Cargo locks Rust dependencies in `Cargo.lock`. Browser assets and fonts are
vendored in `static/vendor/`, so runtime CDN availability is not required.

- htmx 2.0.8: <https://htmx.org/> (BSD-2-Clause)
- Lucide 0.468.0: <https://lucide.dev/> (ISC/MIT portions)
- IBM Plex Mono and Space Grotesk: <https://fonts.google.com/> (SIL OFL)

Their licenses live next to the assets. To upgrade a vendored library, replace
its asset with an explicit release version, retain its license, and rerun the
checks and browser flows above. Do not edit vendored source by hand.