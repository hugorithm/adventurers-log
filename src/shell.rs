use crate::{
    content::Portfolio,
    filesystem::{self, Kind, Node},
};

pub const HOSTNAME: &str = "adventurers-log";
pub const USERNAME: &str = "visitor";

pub fn ssh_target() -> String {
    format!("{USERNAME}@{HOSTNAME}")
}

pub fn ssh_command() -> String {
    format!("ssh {}", ssh_target())
}

pub enum Output {
    Text(String),
    FileView { path: String, text: String },
    Listing(Vec<Node>),
    Profile,
    Projects,
    Game,
    Clear,
    Enter,
    Exit,
}

pub struct Response {
    pub cwd: String,
    pub output: Output,
    pub error: bool,
}

pub fn execute(content: &Portfolio, cwd: &str, command: &str, entered: bool) -> Response {
    let nodes = filesystem::nodes(content);
    let cwd = filesystem::resolve("/", cwd);
    let cwd = if nodes
        .iter()
        .any(|node| node.path == cwd && node.kind == Kind::Directory)
    {
        cwd
    } else {
        "/".into()
    };
    let mut response = Response {
        cwd,
        output: Output::Text(String::new()),
        error: false,
    };
    if command.len() > 512 {
        return fail(response, "Command too long (maximum 512 bytes).");
    }
    let words = match shell_words::split(command) {
        Ok(words) => words,
        Err(_) => return fail(response, "Unclosed quote. Close it and try again."),
    };
    if words.is_empty() {
        return response;
    }
    if !entered {
        return if words == ["ssh", ssh_target().as_str()] {
            response.cwd = "/".into();
            response.output = Output::Enter;
            response
        } else {
            fail(
                response,
                &format!("Connection closed. Enter {} to connect.", ssh_command()),
            )
        };
    }
    let arguments = &words[1..];
    match words[0].as_str() {
        "ls" | "la" => {
            let mut hidden = words[0] == "la";
            let mut target = None;
            for argument in arguments {
                if argument == "-a" || argument == "-la" || argument == "-al" { hidden = true; }
                else if argument == "-l" {}
                else if argument.starts_with('-') { return fail(response, "Supported flags: -a, -l, -la."); }
                else if target.replace(argument.as_str()).is_some() { return fail(response, "Usage: ls [-a] [directory]"); }
            }
            let path = filesystem::resolve(&response.cwd, target.unwrap_or("."));
            let Some(node) = nodes.iter().find(|node| node.path == path) else { return fail(response, "No such file or directory."); };
            response.output = Output::Listing(if node.kind == Kind::Directory {
                filesystem::children(&nodes, &path, hidden).into_iter().cloned().collect()
            } else { vec![node.clone()] });
        }
        "cd" => {
            if arguments.len() > 1 { return fail(response, "Usage: cd [directory]"); }
            let path = filesystem::resolve(&response.cwd, arguments.first().map(String::as_str).unwrap_or("~"));
            match nodes.iter().find(|node| node.path == path) {
                Some(node) if node.kind == Kind::Directory => response.cwd = path,
                Some(_) => return fail(response, "Not a directory."),
                None => return fail(response, "No such directory."),
            }
        }
        "cat" | "vim" | "vi" => {
            if arguments.len() != 1 { return fail(response, &format!("Usage: {} <file>", words[0])); }
            let path = filesystem::resolve(&response.cwd, &arguments[0]);
            response.output = match nodes.iter().find(|node| node.path == path) {
                Some(node) if node.kind == Kind::File => {
                    if words[0] == "cat" { Output::Text(node.text.clone()) }
                    else { Output::FileView { path, text: node.text.clone() } }
                }
                Some(_) => return fail(response, "Not a readable file."),
                None => return fail(response, "No such file."),
            };
        }
        "pwd" | "whoami" | "about" | "projects" | "contact" | "help" | "clear" | "exit" if !arguments.is_empty() => return fail(response, "This command takes no arguments."),
        "pwd" => response.output = Output::Text(filesystem::display_path(&response.cwd)),
        "whoami" | "about" => response.output = Output::Profile,
        "projects" => response.output = Output::Projects,
        "contact" => response.output = Output::Text(format!("Find me on GitHub:\n{}", content.github)),
        "help" => response.output = Output::Text("ls [path]       list a directory\nla / ls -a      include hidden entries\ncd [path]       change directory (cd returns home)\ncat <file>      read a file\nvim <file>      open a read-only Vim viewer\npwd             show current directory\nwhoami / about  meet Hugo\nprojects        browse selected work\ncontact         find me online\nclear           clear the terminal\nexit            close the connection\nhelp            this command reference".into()),
        "clear" => response.output = Output::Clear,
        "exit" => { response.cwd = "/".into(); response.output = Output::Exit; }
        executable if executable.starts_with("./") => {
            let path = filesystem::resolve(&response.cwd, executable);
            if path == "/hiddenbin" && arguments.is_empty() { response.output = Output::Game; }
            else { return fail(response, "No executable found. Try looking closer at the home directory."); }
        }
        _ => return fail(response, &format!("{}: command not found. Try help.", words[0])),
    }
    response
}

pub fn complete(content: &Portfolio, cwd: &str, command: &str, entered: bool) -> Vec<String> {
    if command.len() > 512 {
        return vec![];
    }
    if !entered {
        return if ssh_command().starts_with(&command.to_ascii_lowercase()) {
            vec![ssh_command()]
        } else {
            vec![]
        };
    }
    let Ok(mut words) = shell_words::split(command) else {
        return vec![];
    };
    if command.ends_with(char::is_whitespace) || words.is_empty() {
        words.push(String::new());
    }
    if words.len() > 1 {
        words[0] = words[0].to_ascii_lowercase();
    }
    let prefix = words.last().unwrap();
    let executable = words.len() == 1 && prefix.starts_with("./");
    if words.len() == 1 && !executable {
        return [
            "ls", "la", "cd", "cat", "vim", "vi", "pwd", "whoami", "about", "projects", "contact",
            "help", "clear", "exit",
        ]
        .into_iter()
        .filter(|verb| verb.starts_with(&prefix.to_ascii_lowercase()))
        .map(String::from)
        .collect();
    }
    let verb = words[0].as_str();
    if !executable && !["ls", "la", "cd", "cat", "vim", "vi"].contains(&verb) {
        return vec![];
    }
    let preceding = if executable {
        &[][..]
    } else {
        &words[1..words.len() - 1]
    };
    if preceding.iter().any(|argument| {
        !["ls", "la"].contains(&verb) || !["-a", "-l", "-la", "-al"].contains(&argument.as_str())
    }) {
        return vec![];
    }
    if prefix.starts_with('-') {
        return vec![];
    }
    let (parent, leaf) = prefix.rsplit_once('/').unwrap_or(("", prefix));
    let path_prefix = &prefix[..prefix.len() - leaf.len()];
    let parent_path = filesystem::resolve(
        cwd,
        if parent.is_empty() {
            if prefix.starts_with('/') { "/" } else { "." }
        } else {
            parent
        },
    );
    let hidden = executable
        || leaf.starts_with('.')
        || verb == "la"
        || preceding
            .iter()
            .any(|argument| ["-a", "-la", "-al"].contains(&argument.as_str()));
    let nodes = filesystem::nodes(content);
    let canonical_parent = nodes
        .iter()
        .find(|node| node.path.eq_ignore_ascii_case(&parent_path))
        .map(|node| node.path.as_str())
        .unwrap_or(&parent_path);
    let command_prefix = words[..words.len() - 1]
        .iter()
        .map(|word| shell_words::quote(word))
        .collect::<Vec<_>>()
        .join(" ");
    filesystem::children(&nodes, canonical_parent, hidden)
        .into_iter()
        .filter(|node| {
            node.path
                .rsplit('/')
                .next()
                .unwrap_or("")
                .to_ascii_lowercase()
                .starts_with(&leaf.to_ascii_lowercase())
                && (verb != "cd" || node.kind == Kind::Directory)
                && (!executable || node.kind == Kind::Executable)
        })
        .map(|node| {
            let name = node.path.rsplit('/').next().unwrap_or("");
            let path = format!(
                "{}{}",
                if canonical_parent != parent_path {
                    node.path.clone()
                } else {
                    format!("{path_prefix}{name}")
                },
                if node.kind == Kind::Directory {
                    "/"
                } else {
                    ""
                }
            );
            format!(
                "{}{path}",
                if command_prefix.is_empty() {
                    String::new()
                } else {
                    format!("{command_prefix} ")
                }
            )
        })
        .collect()
}

fn fail(mut response: Response, message: &str) -> Response {
    response.error = true;
    response.output = Output::Text(message.into());
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn content() -> Portfolio {
        toml::from_str(include_str!("../content/portfolio.toml")).unwrap()
    }

    #[test]
    fn vim_opens_only_virtual_readable_files() {
        for command in ["vim bio.txt", "vi bio.txt"] {
            let response = execute(&content(), "/about", command, true);
            assert_eq!(response.cwd, "/about");
            assert!(
                matches!(response.output, Output::FileView { path, text } if path == "/about/bio.txt" && text.contains("piano"))
            );
        }
        for command in ["vim", "vim about", "vim /etc/passwd", "vim hiddenbin"] {
            assert!(execute(&content(), "/", command, true).error, "{command}");
        }
        assert!(execute(&content(), "/about", "vim bio.txt", false).error);
        assert_eq!(
            complete(&content(), "/about", "vim BI", true),
            ["vim bio.txt"]
        );
    }

    #[test]
    fn file_completion_handles_paths_flags_and_hidden_files() {
        let portfolio = content();
        for (cwd, command, expected) in [
            ("/about", "cat bi", "cat bio.txt"),
            ("/", "cat /about/sk", "cat /about/skills.txt"),
            ("/about", "cat ../REA", "cat ../README.txt"),
            ("/about", "cat ~/REA", "cat ~/README.txt"),
            ("/", "ls -a .n", "ls -a .note"),
            ("/", "cat .n", "cat .note"),
            ("/", "cd abo", "cd about/"),
            ("/", "./hid", "./hiddenbin"),
            ("/", "cat read", "cat README.txt"),
            ("/about", "CAT BI", "cat bio.txt"),
            ("/", "cat /ABOUT/SK", "cat /about/skills.txt"),
        ] {
            assert_eq!(
                complete(&portfolio, cwd, command, true),
                [expected],
                "{command}"
            );
        }
        assert!(complete(&portfolio, "/", "cd REA", true).is_empty());
        assert!(complete(&portfolio, "/", "cat h", true).is_empty());
        assert_eq!(complete(&portfolio, "/", "ss", false), [ssh_command()]);
        assert_eq!(complete(&portfolio, "/", "SS", false), [ssh_command()]);
        assert_eq!(
            complete(&portfolio, "/", "SSH VISITOR@AD", false),
            [ssh_command()]
        );
        assert_eq!(complete(&portfolio, "/", "WHO", true), ["whoami"]);
        assert!(complete(&portfolio, "/", "cat", false).is_empty());
        assert!(complete(&portfolio, "/", "ls ", true).len() > 1);
    }

    #[test]
    fn disconnect_and_reconnect_start_at_home() {
        let response = execute(&content(), "/about", "exit", true);
        assert!(matches!(response.output, Output::Exit));
        assert_eq!(response.cwd, "/");
        assert!(execute(&content(), "/", "ls", false).error);
        assert_eq!(
            execute(&content(), "/about", &ssh_command(), false).cwd,
            "/"
        );
    }

    #[test]
    fn hidden_binary_is_only_in_hidden_listing() {
        for command in ["ls", "la", "ls -a"] {
            let response = execute(&content(), "/", command, true);
            let Output::Listing(entries) = response.output else {
                panic!("Expected listing");
            };
            assert_eq!(
                entries.iter().any(|entry| entry.path == "/hiddenbin"),
                command != "ls"
            );
        }
        assert!(matches!(
            execute(&content(), "/", "./hiddenbin", true).output,
            Output::Game
        ));
        assert!(execute(&content(), "/about", "./hiddenbin", true).error);
    }

    #[test]
    fn navigation_and_file_reading() {
        assert_eq!(execute(&content(), "/", "cd about", true).cwd, "/about");
        assert_eq!(execute(&content(), "/about", "cd ..", true).cwd, "/");
        assert_eq!(execute(&content(), "/about", "cd", true).cwd, "/");
        assert!(
            matches!(execute(&content(), "/about", "cat bio.txt", true).output, Output::Text(text) if text.contains("piano"))
        );
        assert!(execute(&content(), "/", "cd README.txt", true).error);
        assert_eq!(
            filesystem::resolve("/", "../../../../etc/passwd"),
            "/etc/passwd"
        );
        assert!(execute(&content(), "/", "cat /etc/passwd", true).error);
    }

    #[test]
    fn connection_and_untrusted_input() {
        assert!(execute(&content(), "/", "ls", false).error);
        assert!(matches!(
            execute(&content(), "/", &ssh_command(), false).output,
            Output::Enter
        ));
        assert!(execute(&content(), "/", "ssh visitor@wrong-host", false).error);
        assert!(execute(&content(), "/", "ssh admin@adventurers-log", false).error);
        assert!(execute(&content(), "/", "cat 'oops", true).error);
        assert!(execute(&content(), "/", "ls; whoami", true).error);
        assert!(execute(&content(), "/", "ls -z", true).error);
        assert!(execute(&content(), "/", &"x".repeat(513), true).error);
    }
}
