use crate::content::Portfolio;

#[derive(Clone, PartialEq, Debug)]
pub enum Kind {
    Directory,
    File,
    Executable,
}

#[derive(Clone)]
pub struct Node {
    pub path: String,
    pub kind: Kind,
    pub hidden: bool,
    pub text: String,
    pub description: String,
}

pub fn nodes(content: &Portfolio) -> Vec<Node> {
    let mut nodes = vec![
        node("/", Kind::Directory, false, "", "home sweet home"),
        node(
            "/about",
            Kind::Directory,
            false,
            "",
            "the person behind the prompt",
        ),
        node("/projects", Kind::Directory, false, "", "things I've built"),
        node("/experience", Kind::Directory, false, "", "where I've been"),
        node(
            "/contact",
            Kind::Directory,
            false,
            "",
            "start a conversation",
        ),
        node(
            "/README.txt",
            Kind::File,
            false,
            "Welcome to my little corner of the internet.\n\nExplore with ls and cd. Read a file with cat.\nTry: cd about, then cat bio.txt\n\nSome things only appear when you look a little closer.",
            "a good place to start",
        ),
        node(
            "/about/bio.txt",
            Kind::File,
            false,
            &format!(
                "{}\n{} @ {}\n\n{}\n\n{}",
                content.name, content.role, content.company, content.bio, content.location
            ),
            "a little about me",
        ),
        node(
            "/about/skills.txt",
            Kind::File,
            false,
            &content.skills.join("\n"),
            "tools & tendencies",
        ),
        node(
            "/experience/current.txt",
            Kind::File,
            false,
            &content.experience,
            "my current chapter",
        ),
        node(
            "/contact/github.txt",
            Kind::File,
            false,
            &content.github,
            "code & conversations",
        ),
        node(
            "/hiddenbin",
            Kind::Executable,
            true,
            "",
            "an unexpected encore",
        ),
        node(
            "/.note",
            Kind::File,
            true,
            "You found the quiet part.\nThere's an executable here, too. Try ./hiddenbin\n\nNot every keyboard is for writing code.",
            "a note in the margins",
        ),
    ];
    for project in &content.projects {
        nodes.push(node(
            &format!("/projects/{}", project.slug),
            Kind::Directory,
            false,
            "",
            &project.status,
        ));
        nodes.push(node(
            &format!("/projects/{}/README.txt", project.slug),
            Kind::File,
            false,
            &format!(
                "{}\n{}\n\n{}\n\nStack: {}\n{}",
                project.name, project.status, project.description, project.stack, project.url
            ),
            "project notes",
        ));
    }
    nodes
}

fn node(path: &str, kind: Kind, hidden: bool, text: &str, description: &str) -> Node {
    Node {
        path: path.into(),
        kind,
        hidden,
        text: text.into(),
        description: description.into(),
    }
}

pub fn resolve(cwd: &str, input: &str) -> String {
    let full = if input.starts_with('/') || input.starts_with('~') {
        input.trim_start_matches('~').to_string()
    } else {
        format!("{cwd}/{input}")
    };
    let mut parts = Vec::new();
    for part in full.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    format!("/{}", parts.join("/"))
}

pub fn display_path(path: &str) -> String {
    if path == "/" {
        "~".into()
    } else {
        format!("~{path}")
    }
}

pub fn children<'a>(nodes: &'a [Node], path: &str, hidden: bool) -> Vec<&'a Node> {
    nodes
        .iter()
        .filter(|node| {
            node.path != "/"
                && node
                    .path
                    .rsplit_once('/')
                    .map(|(parent, _)| if parent.is_empty() { "/" } else { parent })
                    == Some(path)
                && (hidden || !node.hidden)
        })
        .collect()
}
