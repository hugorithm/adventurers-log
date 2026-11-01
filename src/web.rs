use crate::{
    content::Portfolio,
    filesystem::{self, Kind},
    shell::{self, Output},
};
use askama::Template;
use axum::{
    Form, Json, Router,
    extract::State,
    http::{HeaderValue, StatusCode},
    response::{Html, IntoResponse},
    routing::{get, post},
};
use serde::Deserialize;
use tower_http::{limit::RequestBodyLimitLayer, services::ServeDir};

#[derive(Clone)]
struct AppState {
    content_path: String,
}

#[derive(Template)]
#[template(path = "index.html")]
struct Index {
    portfolio: Portfolio,
    hostname: &'static str,
    username: &'static str,
    identity: String,
    ssh_command: String,
}

struct Entry {
    name: String,
    description: String,
    command: String,
    kind: &'static str,
}

#[derive(Template)]
#[template(path = "response.html")]
struct Fragment {
    command: String,
    identity: String,
    old_path: String,
    cwd: String,
    path: String,
    entered: bool,
    connected: bool,
    error: bool,
    kind: &'static str,
    text: String,
    file_path: String,
    entries: Vec<Entry>,
    portfolio: Portfolio,
}

#[derive(Deserialize)]
struct Command {
    command: String,
    #[serde(default = "root")]
    cwd: String,
    #[serde(default)]
    entered: bool,
}

fn root() -> String {
    "/".into()
}

type WebError = (StatusCode, &'static str);

pub fn router(content_path: String) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/command", post(command))
        .route("/complete", post(complete))
        .nest_service("/static", ServeDir::new("static"))
        .layer(RequestBodyLimitLayer::new(4096))
        .with_state(AppState { content_path })
}

fn load(state: &AppState) -> Result<Portfolio, WebError> {
    Portfolio::load(&state.content_path).map_err(|error| {
        eprintln!("Portfolio content error: {error}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Portfolio content is temporarily unavailable. Please try again.",
        )
    })
}

fn render(template: &impl Template) -> Result<Html<String>, WebError> {
    template.render().map(Html).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Unable to render the terminal.",
        )
    })
}

async fn index(State(state): State<AppState>) -> Result<Html<String>, WebError> {
    render(&Index {
        portfolio: load(&state)?,
        hostname: shell::HOSTNAME,
        username: shell::USERNAME,
        identity: shell::ssh_target(),
        ssh_command: shell::ssh_command(),
    })
}

async fn command(
    State(state): State<AppState>,
    Form(input): Form<Command>,
) -> Result<impl IntoResponse, WebError> {
    let portfolio = load(&state)?;
    let response = shell::execute(&portfolio, &input.cwd, &input.command, input.entered);
    let mut fragment = Fragment {
        old_path: filesystem::display_path(&filesystem::resolve("/", &input.cwd)),
        path: filesystem::display_path(&response.cwd),
        command: input.command,
        identity: shell::ssh_target(),
        cwd: response.cwd,
        entered: input.entered,
        connected: false,
        error: response.error,
        kind: "text",
        text: String::new(),
        file_path: String::new(),
        entries: vec![],
        portfolio,
    };
    let clear = matches!(response.output, Output::Clear);
    match response.output {
        Output::Text(text) => fragment.text = text,
        Output::FileView { path, text } => {
            fragment.kind = "vim";
            fragment.file_path = filesystem::display_path(&path);
            fragment.text = text;
        }
        Output::Listing(nodes) => {
            fragment.kind = "listing";
            fragment.entries = entries(nodes);
        }
        Output::Profile => fragment.kind = "profile",
        Output::Projects => fragment.kind = "projects",
        Output::Game => fragment.kind = "game",
        Output::Clear => fragment.kind = "clear",
        Output::Exit => {
            fragment.kind = "exit";
            fragment.entered = false;
            fragment.text = format!(
                "logout\nConnection to {} closed.\nEnter {} to reconnect.",
                shell::HOSTNAME,
                shell::ssh_command()
            );
        }
        Output::Enter => {
            fragment.kind = "enter";
            fragment.entered = true;
            fragment.connected = true;
            let nodes = filesystem::nodes(&fragment.portfolio);
            fragment.entries = entries(
                filesystem::children(&nodes, "/", false)
                    .into_iter()
                    .cloned()
                    .collect(),
            );
        }
    }
    let mut rendered = render(&fragment)?.into_response();
    if clear {
        rendered
            .headers_mut()
            .insert("HX-Reswap", HeaderValue::from_static("innerHTML"));
    }
    Ok(rendered)
}

fn entries(nodes: Vec<filesystem::Node>) -> Vec<Entry> {
    nodes
        .into_iter()
        .map(|node| Entry {
            name: format!(
                "{}{}",
                node.path.rsplit('/').next().unwrap_or(""),
                if node.kind == Kind::Directory {
                    "/"
                } else if node.kind == Kind::Executable {
                    "*"
                } else {
                    ""
                }
            ),
            description: node.description,
            command: format!(
                "{} {}",
                if node.kind == Kind::Directory {
                    "cd"
                } else {
                    "cat"
                },
                shell_words::quote(&node.path)
            ),
            kind: if node.kind == Kind::Directory {
                "directory"
            } else if node.kind == Kind::Executable {
                "executable"
            } else {
                "file"
            },
        })
        .collect()
}

async fn complete(
    State(state): State<AppState>,
    Form(input): Form<Command>,
) -> Result<Json<Vec<String>>, WebError> {
    let portfolio = load(&state)?;
    Ok(Json(shell::complete(
        &portfolio,
        &input.cwd,
        &input.command,
        input.entered,
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[tokio::test]
    async fn page_and_htmx_response_are_escaped() {
        let app = router("content/portfolio.toml".into());
        let response = app
            .clone()
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let page = String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        assert!(page.contains("Hugo Silva"));
        assert!(page.contains(&shell::ssh_command()));
        assert!(page.contains("hx-post=\"/command\""));
        assert!(page.find("id=\"command-form\"").unwrap() < page.find("</main>").unwrap());
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/command")
                    .header("content-type", "application/x-www-form-urlencoded")
                    .body(Body::from("command=%3Cscript%3E&entered=true&cwd=%2F"))
                    .unwrap(),
            )
            .await
            .unwrap();
        let html = String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        assert!(!html.contains("<script>"));
        assert!(html.contains("&#60;script&#62;") || html.contains("&lt;script&gt;"));
    }
}
