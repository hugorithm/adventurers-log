use hugo_portfolio::{content::Portfolio, web};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let content_path =
        std::env::var("PORTFOLIO_CONTENT").unwrap_or_else(|_| "content/portfolio.toml".into());
    Portfolio::load(&content_path)?;
    let address = std::env::var("PORTFOLIO_BIND").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let listener = tokio::net::TcpListener::bind(&address).await?;
    println!("Hugo's terminal is listening at http://{address}");
    axum::serve(listener, web::router(content_path)).await?;
    Ok(())
}
