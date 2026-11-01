# Portfolio Conventions

- Keep Rust command behavior in `src/shell.rs` and virtual paths in `src/filesystem.rs`.
- Visitor commands must never execute OS commands or read arbitrary server files.
- Use Askama's HTML escaping; do not render user command text as trusted HTML.
- Keep personal content in `content/portfolio.toml`; preserve live content loading.
- Use htmx fragments rather than adding a client-side application framework.
- Keep CSS, terminal interactions, and the hidden game in separate files.
- Vendor browser dependencies with explicit versions and retain their licenses.
- Preserve keyboard access, touch controls, reduced-motion support, and the CRT toggle.
- Check short desktop windows and narrow phones; the connection instruction must remain visible.
- Run `cargo fmt --check`, `cargo test --locked`, and `cargo clippy --locked --all-targets -- -D warnings`.
- Syntax-check both browser scripts with `node --check` after editing them.