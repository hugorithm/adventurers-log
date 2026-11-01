use serde::Deserialize;

#[derive(Clone, Deserialize)]
pub struct Portfolio {
    pub name: String,
    pub role: String,
    pub company: String,
    pub github: String,
    pub bio: String,
    pub location: String,
    pub skills: Vec<String>,
    pub experience: String,
    pub projects: Vec<Project>,
}

#[derive(Clone, Deserialize)]
pub struct Project {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub stack: String,
    pub status: String,
    pub url: String,
}

impl Portfolio {
    pub fn load(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let content: Self = toml::from_str(&std::fs::read_to_string(path)?)?;
        let mut slugs = std::collections::HashSet::new();
        for project in &content.projects {
            if project.slug.is_empty()
                || !project
                    .slug
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                || !slugs.insert(&project.slug)
            {
                return Err(
                    "Project slugs must be unique and contain only letters, digits, or hyphens"
                        .into(),
                );
            }
            if !project.url.is_empty() && !project.url.starts_with("https://") {
                return Err("Project URLs must use https://".into());
            }
        }
        if !content.github.starts_with("https://") {
            return Err("GitHub URL must use https://".into());
        }
        Ok(content)
    }
}
