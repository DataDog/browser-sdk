mod bundle;
mod remote_config;
mod sdk_codebase;

use lambda_http::{Body, Error, Request, RequestExt, Response, run, service_fn};
use remote_config::RemoteConfigService;
use sdk_codebase::SdkCodebase;
use std::sync::Arc;

const SDK_ENTRY: &str = "packages/rum/src/entries/main.ts";

#[tokio::main]
async fn main() -> Result<(), Error> {
    lambda_http::tracing::init_default_subscriber();

    let sdk = Arc::new(SdkCodebase::new());
    let rc = Arc::new(RemoteConfigService::new());

    run(service_fn(move |event: Request| {
        let sdk = sdk.clone();
        let rc = rc.clone();
        async move { handler(event, sdk, rc).await }
    }))
    .await
}

async fn handler(
    event: Request,
    sdk: Arc<SdkCodebase>,
    rc: Arc<RemoteConfigService>,
) -> Result<Response<Body>, Error> {
    let params = event.query_string_parameters();
    let site = params.first("site");
    let rc_id = params.first("remoteConfigurationId");

    let (Some(site), Some(rc_id)) = (site, rc_id) else {
        return Ok(Response::builder()
            .status(400)
            .body("missing required query parameters: site, remoteConfigurationId".into())?);
    };

    if let Err(e) = remote_config::build_rc_endpoint(site, rc_id) {
        return Ok(Response::builder().status(400).body(e.into())?);
    }

    let (files, rc) = tokio::join!(sdk.files(), rc.fetch(site, rc_id));

    let files = match files {
        Ok(files) => files,
        Err(error) => {
            tracing::error!(error, "failed to fetch SDK codebase");
            return Ok(Response::builder()
                .status(500)
                .body("failed to fetch SDK codebase".into())?);
        }
    };

    let rc = match rc {
        Ok(rc) => rc,
        Err(error) => {
            tracing::error!(error, "failed to fetch remote config");
            return Ok(Response::builder()
                .status(500)
                .body("failed to fetch remote config".into())?);
        }
    };

    tracing::debug!(rc = %rc, "fetched remote config");

    let output =
        tokio::task::spawn_blocking(move || bundle::bundle_sdk(files, SDK_ENTRY)).await??;

    Ok(Response::builder()
        .status(200)
        .header("content-type", "text/javascript")
        .body(output.into())?)
}
