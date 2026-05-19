mod bundle;
mod cache_cell;
mod remote_config;
mod sdk_codebase;

use bundle::BundleService;
use lambda_http::{Body, Error, Request, RequestExt, Response, run, service_fn};
use remote_config::{ClientToken, RemoteConfigId, RemoteConfigService, Site};
use sdk_codebase::SdkCodebase;
use std::sync::Arc;

#[cfg(debug_assertions)]
fn init_tracing() {
    tracing_subscriber::fmt()
        .with_span_events(tracing_subscriber::fmt::format::FmtSpan::CLOSE)
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
}

#[cfg(not(debug_assertions))]
fn init_tracing() {
    lambda_http::tracing::init_default_subscriber();
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    init_tracing();

    let bundle = Arc::new(BundleService::new(Arc::new(SdkCodebase::new())));
    let rc = Arc::new(RemoteConfigService::new());

    run(service_fn(move |event: Request| {
        let bundle = bundle.clone();
        let rc = rc.clone();
        async move { handler(event, bundle, rc).await }
    }))
    .await
}

async fn handler(
    event: Request,
    bundle: Arc<BundleService>,
    rc: Arc<RemoteConfigService>,
) -> Result<Response<Body>, Error> {
    let params = event.query_string_parameters();
    let site = params.first("site");
    let rc_id = params.first("remoteConfigurationId");
    let client_token = params.first("clientToken");
    let minify = params.first("minify") != Some("false");

    let (Some(site), Some(rc_id), Some(client_token)) = (site, rc_id, client_token) else {
        return Ok(Response::builder().status(400).body(
            "missing required query parameters: site, remoteConfigurationId, clientToken".into(),
        )?);
    };

    let site = match Site::new(site) {
        Ok(site) => site,
        Err(error) => {
            return Ok(Response::builder()
                .status(400)
                .body(format!("{error}").into())?);
        }
    };

    let rc_id = match RemoteConfigId::new(rc_id.to_string()) {
        Ok(id) => id,
        Err(error) => {
            return Ok(Response::builder()
                .status(400)
                .body(format!("{error}").into())?);
        }
    };

    let client_token = match ClientToken::new(client_token.to_string()) {
        Ok(t) => t,
        Err(error) => {
            return Ok(Response::builder()
                .status(400)
                .body(format!("{error}").into())?);
        }
    };

    let rc = match rc.fetch(site, rc_id).await {
        Ok(rc) => rc,
        Err(error) => {
            tracing::error!(%error, "failed to fetch remote config");
            return Ok(Response::builder()
                .status(500)
                .body("failed to fetch remote config".into())?);
        }
    };

    let output = match bundle.build(rc, client_token, site, minify).await {
        Ok(output) => output,
        Err(error) => {
            tracing::error!(%error, "failed to build SDK bundle");
            return Ok(Response::builder()
                .status(500)
                .body("failed to build SDK bundle".into())?);
        }
    };

    Ok(Response::builder()
        .status(200)
        .header("content-type", "text/javascript")
        .body(output.as_str().into())?)
}
