use std::future::Future;
use std::sync::Arc;
use std::sync::RwLock;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tokio::sync::watch;

pub struct CacheCell<V, E> {
    name: &'static str,
    /// Stores the last successful value and its timestamp, used for SWR classification.
    entry: RwLock<Option<(V, Instant)>>,
    is_refreshing: AtomicBool,
    /// Carries the result of the last refresh attempt:
    /// - `None`: no refresh has completed yet
    /// - `Some(Ok(v))`: last refresh succeeded
    /// - `Some(Err(e))`: last refresh failed (entry is unchanged, stale value still served)
    refresh_tx: watch::Sender<Option<Result<V, E>>>,
    fresh_duration: Duration,
    stale_duration: Duration,
}

impl<V, E> CacheCell<V, E>
where
    V: Clone + Send + Sync + 'static,
    E: Clone + Send + Sync + 'static,
{
    pub fn new(name: &'static str, fresh_duration: Duration, stale_duration: Duration) -> Self {
        let (refresh_tx, _) = watch::channel(None);
        Self {
            name,
            entry: RwLock::new(None),
            is_refreshing: AtomicBool::new(false),
            refresh_tx,
            fresh_duration,
            stale_duration,
        }
    }

    /// Returns the cached value according to stale-while-revalidate semantics:
    /// - **Fresh** (age < `fresh_duration`): returns immediately.
    /// - **Stale** (age < `stale_duration`): returns immediately and revalidates in the background.
    /// - **Invalid** (no value or age ≥ `stale_duration`): blocks until a revalidation completes.
    ///
    /// `fetch` is called at most once per concurrent refresh — coalescing is automatic.
    pub async fn get<F, Fut>(self: Arc<Self>, fetch: F) -> Result<V, E>
    where
        F: FnOnce() -> Fut + Send + 'static,
        Fut: Future<Output = Result<V, E>> + Send + 'static,
    {
        // Subscribe BEFORE checking state so we don't miss a refresh notification
        // that fires between the state check and the await.
        let mut rx = self.refresh_tx.subscribe();

        match self.classify() {
            State::Fresh(value) => {
                tracing::debug!(cache = self.name, "fresh");
                return Ok(value);
            }
            State::Stale(value) => {
                tracing::debug!(cache = self.name, "stale, revalidating in background");
                Self::maybe_spawn_refresh(self, fetch);
                return Ok(value);
            }
            State::Invalid => {
                tracing::debug!(cache = self.name, "invalid, waiting for revalidation");
            }
        }

        // Invalid: ensure a refresh is running and block until it completes.
        Self::maybe_spawn_refresh(self.clone(), fetch);
        let _ = rx.changed().await;

        match rx.borrow().as_ref() {
            Some(Ok(value)) => Ok(value.clone()),
            Some(Err(e)) => Err(e.clone()),
            None => unreachable!("changed() fired but refresh result is still None"),
        }
    }

    fn classify(&self) -> State<V> {
        let entry = self.entry.read().unwrap();
        match &*entry {
            Some((value, fetched_at)) => {
                let age = fetched_at.elapsed();
                if age < self.fresh_duration {
                    State::Fresh(value.clone())
                } else if age < self.stale_duration {
                    State::Stale(value.clone())
                } else {
                    State::Invalid
                }
            }
            None => State::Invalid,
        }
    }

    fn maybe_spawn_refresh<F, Fut>(cell: Arc<Self>, fetch: F)
    where
        F: FnOnce() -> Fut + Send + 'static,
        Fut: Future<Output = Result<V, E>> + Send + 'static,
    {
        if cell
            .is_refreshing
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
            .is_ok()
        {
            tokio::spawn(async move { cell.do_refresh(fetch).await });
        }
    }

    #[tracing::instrument(skip_all, fields(cache = self.name))]
    async fn do_refresh<F, Fut>(&self, fetch: F)
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<V, E>>,
    {
        let t = Instant::now();
        match fetch().await {
            Ok(value) => {
                *self.entry.write().unwrap() = Some((value.clone(), Instant::now()));
                tracing::info!(
                    elapsed_ms = t.elapsed().as_millis(),
                    "revalidation succeeded"
                );
                self.refresh_tx.send_replace(Some(Ok(value)));
            }
            Err(e) => {
                tracing::warn!(elapsed_ms = t.elapsed().as_millis(), "revalidation failed");
                self.refresh_tx.send_replace(Some(Err(e)));
            }
        }
        self.is_refreshing.store(false, Ordering::Release);
    }
}

enum State<V> {
    Fresh(V),
    Stale(V),
    Invalid,
}
