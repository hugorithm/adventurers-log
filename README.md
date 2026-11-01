# Hugo Silva's Portfolio

My personal corner of the internet, built as a terminal.

I'm a Software Engineer at SWISS International Air Lines Ltd. Outside of code,
I play piano and hike in nature. I wanted this site to feel like something I'd
actually enjoy exploring: a few folders, a familiar prompt, and a surprise
for anyone who looks a little closer.

This repository contains the website, not a portfolio template.

## Run Locally

With a stable Rust toolchain installed, run from the repository root:

```sh
cargo run
```

Open <http://127.0.0.1:3000> and type `ssh hugo` to enter.
The **Run portfolio** VS Code task runs the same command.

There's no frontend build step, database, or Node requirement to run the site.

## Explore

My bio, projects, experience, and contact details live in a virtual filesystem.
Use `ls` and `cd` to move around, `cat` to read a file, or `vim` to open it in
the read-only Vim viewer. `:q` returns to the shell, and `help` lists the commands.

Tab completion, command history, Ctrl+C, and Ctrl+D keep the experience close
to a terminal. The shell is simulated: nothing a visitor types executes on
the server. There's a hidden arcade game, too. I'll leave finding it to you.

## Under the Hood

The backend is Rust with Axum and Askama. htmx handles command responses,
with small JavaScript modules for terminal interactions, the CodeMirror Vim
viewer, and a Phaser maze game. The styling is deliberately minimal, with
a block cursor and an optional CRT effect.

I keep the content separate from the shell and presentation so updating the
portfolio doesn't mean rewriting the site.

## Maintaining the Site

[content/portfolio.toml](content/portfolio.toml) holds my profile, skills,
experience, links, and projects. It's read on each request, so content changes
don't need a restart. Some project and experience entries are still placeholders
while I finish writing them.

Virtual folders and files are defined in [src/filesystem.rs](src/filesystem.rs).
Command behavior lives in [src/shell.rs](src/shell.rs).

Rust and Askama template changes need a restart of `cargo run`.
CSS and JavaScript changes only need a browser refresh.

## Checks

```sh
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
node --check static/terminal.js
node --check static/vim-viewer.js
node --check static/maze.js
node --check static/maze-view.js
node --test tests/maze.test.cjs
```

GitHub Actions runs these checks. Node is used for JavaScript checks and game
tests only; the website itself runs on Rust.

## Deployment

```sh
cargo build --release --locked
PORTFOLIO_BIND=0.0.0.0:3000 ./target/release/hugo-portfolio
```

The release binary needs the `static/` and `content/` directories alongside it;
templates are compiled in. In production, it sits behind a reverse proxy with
HTTPS. `PORTFOLIO_BIND` sets the listening address, and `PORTFOLIO_CONTENT`
can override the content file path.

## Credits

Built with [htmx](https://htmx.org/), [Lucide](https://lucide.dev/),
[Phaser](https://phaser.io/), and [CodeMirror](https://codemirror.net/5/).
The fonts are IBM Plex Mono and Space Grotesk. These assets are hosted locally;
their licenses are included in `static/vendor/`.