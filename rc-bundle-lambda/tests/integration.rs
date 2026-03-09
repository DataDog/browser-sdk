use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

#[test]
fn test_bundles_sdk() {
    let lambda = start_lambda();

    let url = format!(
        "{}?site=datadoghq.com&remoteConfigurationId=test-rc-id",
        lambda.base_url
    );
    let response = reqwest::blocking::get(&url).unwrap();

    assert_eq!(response.status(), 500);
    let body = response.bytes().unwrap();
    let body = std::str::from_utf8(&body).unwrap();
    assert_eq!(body, "failed to fetch remote config");
}

#[test]
fn test_bundles_sdk_with_remote_config() {
    let lambda = start_lambda();

    let url = format!(
        "{}?site=datad0g.com&remoteConfigurationId=ab46a2ae-e10f-4487-8e9a-b2f43234902e",
        lambda.base_url
    );
    let response = reqwest::blocking::get(&url).unwrap();

    assert_eq!(response.status(), 200);
    let body = response.bytes().unwrap();
    let body = std::str::from_utf8(&body).unwrap();
    assert!(!body.is_empty());
    assert!(!body.contains(": string"));
    assert!(!body.contains(": number"));
    assert!(!body.contains("interface "));
}

fn forward_lines(
    reader: impl std::io::Read + Send + 'static,
    killing: Arc<AtomicBool>,
    print: impl Fn(&str) + Send + 'static,
) {
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().flatten() {
            if killing.load(Ordering::Relaxed) {
                break;
            }
            print(&line);
        }
    });
}

fn start_lambda() -> LambdaProcess {
    let port = {
        let listener = TcpListener::bind("127.0.0.1:0").expect("failed to bind to a free port");
        listener.local_addr().unwrap().port()
    };
    let base_url = format!("http://localhost:{}/", port);

    let mut child = Command::new("cargo")
        .args(["lambda", "watch", "--invoke-port", &port.to_string()])
        .env_clear()
        .env("SDK_CACHE_PATH", "target/sdk-cache.tar.gz")
        .env("PATH", std::env::var("PATH").unwrap_or_default())
        .env("HOME", std::env::var("HOME").unwrap_or_default())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("failed to start cargo lambda watch (is cargo-lambda installed?)");

    let killing = Arc::new(AtomicBool::new(false));

    forward_lines(child.stdout.take().unwrap(), killing.clone(), |line| {
        println!("{line}");
    });
    forward_lines(child.stderr.take().unwrap(), killing.clone(), |line| {
        eprintln!("{line}");
    });

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
        .unwrap();

    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        if let Ok(Some(status)) = child.try_wait() {
            panic!(
                "cargo lambda watch exited early with {status} (port {port} may already be in use)"
            );
        }
        if client.get(&base_url).send().is_ok() {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "cargo lambda watch did not become ready in time"
        );
        thread::sleep(Duration::from_millis(200));
    }

    LambdaProcess {
        child,
        base_url,
        killing,
    }
}

struct LambdaProcess {
    base_url: String,
    child: Child,
    killing: Arc<AtomicBool>,
}

impl Drop for LambdaProcess {
    fn drop(&mut self) {
        self.killing.store(true, Ordering::Relaxed);
        let _ = self.child.kill();
    }
}
