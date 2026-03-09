use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

const PORT: u16 = 9001;

#[test]
fn test_bundles_sdk() {
    let lambda = start_lambda();

    let response = reqwest::blocking::get(&lambda.base_url).unwrap();

    assert_eq!(response.status(), 200);
    let body = response.bytes().unwrap();
    let body = std::str::from_utf8(&body).unwrap();
    // Should be JS with no TypeScript type annotations
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
    let base_url = format!("http://localhost:{}/", PORT);

    let mut child = Command::new("cargo")
        .args(["lambda", "watch", "--invoke-port", &PORT.to_string()])
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

    {
        // Wait for `lambda watch` to become ready
        let deadline = Instant::now() + Duration::from_secs(60);
        loop {
            if reqwest::blocking::get(&base_url).is_ok() {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "cargo lambda watch did not become ready in time"
            );
            thread::sleep(Duration::from_millis(200));
        }
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
