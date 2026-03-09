mod bundle;
mod sdk_codebase;

use lambda_http::{Body, Error, Request, Response, run, service_fn};
use sdk_codebase::SdkCodebase;
use std::sync::Arc;

const SDK_ENTRY: &str = "packages/rum/src/entries/main.ts";

#[tokio::main]
async fn main() -> Result<(), Error> {
    lambda_http::tracing::init_default_subscriber();

    let sdk = Arc::new(SdkCodebase::new());

    run(service_fn(move |event: Request| {
        let sdk = sdk.clone();
        async move { handler(event, sdk).await }
    }))
    .await
}

async fn handler(_event: Request, sdk: Arc<SdkCodebase>) -> Result<Response<Body>, Error> {
    let files = sdk.files().await?;

    let output =
        tokio::task::spawn_blocking(move || bundle::bundle_sdk(files, SDK_ENTRY)).await??;

    Ok(Response::builder()
        .status(200)
        .header("content-type", "text/javascript")
        .body(output.into())?)
}
