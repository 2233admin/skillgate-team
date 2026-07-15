use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::SystemTime;

#[cfg(not(windows))]
use portable_pty::ChildKiller;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use uuid::Uuid;

use crate::{PreparedLaunch, PreparedLaunchStore, Result, RuntimeError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TerminalSize {
    pub columns: u16,
    pub rows: u16,
}

impl TerminalSize {
    fn validate(self) -> Result<PtySize> {
        if self.columns == 0 || self.rows == 0 {
            return Err(RuntimeError::InvalidTerminalSize {
                columns: self.columns,
                rows: self.rows,
            });
        }
        Ok(PtySize {
            rows: self.rows,
            cols: self.columns,
            pixel_width: 0,
            pixel_height: 0,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TerminalSession {
    pub terminal_id: String,
    pub pid: Option<u32>,
    pub started_at: SystemTime,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminalEventKind {
    Output {
        data: String,
    },
    Exit {
        exit_code: u32,
        signal: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TerminalEvent {
    pub terminal_id: String,
    pub sequence: u64,
    pub kind: TerminalEventKind,
}

pub trait TerminalEventSink: Send + Sync + 'static {
    fn emit(&self, event: TerminalEvent);
}

impl<F> TerminalEventSink for F
where
    F: Fn(TerminalEvent) + Send + Sync + 'static,
{
    fn emit(&self, event: TerminalEvent) {
        self(event);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseOutcome {
    Closed,
    AlreadyClosed,
}

struct SessionControl {
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    #[cfg(not(windows))]
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    pid: Option<u32>,
    closed: AtomicBool,
}

impl std::fmt::Debug for SessionControl {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SessionControl")
            .field("closed", &self.closed.load(Ordering::Acquire))
            .finish_non_exhaustive()
    }
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: Mutex<HashMap<String, Arc<SessionControl>>>,
}

impl std::fmt::Debug for TerminalManager {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("TerminalManager")
            .field(
                "session_count",
                &self
                    .sessions
                    .lock()
                    .expect("terminal map lock poisoned")
                    .len(),
            )
            .finish()
    }
}

impl TerminalManager {
    pub fn create_prepared(
        &self,
        store: &PreparedLaunchStore,
        prepared_launch_id: &str,
        size: TerminalSize,
        sink: Arc<dyn TerminalEventSink>,
    ) -> Result<TerminalSession> {
        let launch = store.consume(prepared_launch_id)?;
        self.create(launch, size, sink)
    }

    pub fn create(
        &self,
        launch: PreparedLaunch,
        size: TerminalSize,
        sink: Arc<dyn TerminalEventSink>,
    ) -> Result<TerminalSession> {
        let size = size.validate()?;
        let pair = native_pty_system()
            .openpty(size)
            .map_err(|error| RuntimeError::Pty(error.to_string()))?;
        let mut command = CommandBuilder::new(&launch.executable);
        command.args(&launch.argv);
        command.cwd(&launch.cwd);
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| RuntimeError::ProcessStart(error.to_string()))?;
        drop(pair.slave);

        let pid = child.process_id();
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| RuntimeError::Pty(error.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| RuntimeError::Pty(error.to_string()))?;
        let control = Arc::new(SessionControl {
            master: Mutex::new(Some(pair.master)),
            writer: Mutex::new(Some(writer)),
            #[cfg(not(windows))]
            killer: Mutex::new(child.clone_killer()),
            pid,
            closed: AtomicBool::new(false),
        });
        let terminal_id = Uuid::new_v4().to_string();
        self.sessions
            .lock()
            .expect("terminal map lock poisoned")
            .insert(terminal_id.clone(), Arc::clone(&control));

        let output_terminal_id = terminal_id.clone();
        let output_sink = Arc::clone(&sink);
        let sequence = Arc::new(AtomicU64::new(0));
        let output_sequence = Arc::clone(&sequence);
        let reader_thread = thread::Builder::new()
            .name(format!("skillgate-pty-read-{terminal_id}"))
            .spawn(move || read_output(reader, &output_terminal_id, &output_sequence, output_sink))
            .map_err(|error| RuntimeError::Pty(error.to_string()))?;

        let wait_terminal_id = terminal_id.clone();
        thread::Builder::new()
            .name(format!("skillgate-pty-wait-{terminal_id}"))
            .spawn(move || {
                let status = child.wait();
                control.closed.store(true, Ordering::Release);
                control
                    .writer
                    .lock()
                    .expect("terminal writer lock poisoned")
                    .take();
                control
                    .master
                    .lock()
                    .expect("terminal master lock poisoned")
                    .take();
                let _ = reader_thread.join();
                let (exit_code, signal) = match status {
                    Ok(status) => (
                        status.exit_code(),
                        status.signal().map(std::string::ToString::to_string),
                    ),
                    Err(_) => (1, None),
                };
                sink.emit(TerminalEvent {
                    terminal_id: wait_terminal_id,
                    sequence: sequence.fetch_add(1, Ordering::AcqRel) + 1,
                    kind: TerminalEventKind::Exit { exit_code, signal },
                });
            })
            .map_err(|error| RuntimeError::Pty(error.to_string()))?;

        Ok(TerminalSession {
            terminal_id,
            pid,
            started_at: SystemTime::now(),
        })
    }

    pub fn write(&self, terminal_id: &str, data: &[u8]) -> Result<()> {
        let session = self.session(terminal_id)?;
        if session.closed.load(Ordering::Acquire) {
            return Err(RuntimeError::TerminalClosed(terminal_id.to_string()));
        }
        let mut writer = session
            .writer
            .lock()
            .expect("terminal writer lock poisoned");
        let writer = writer
            .as_mut()
            .ok_or_else(|| RuntimeError::TerminalClosed(terminal_id.to_string()))?;
        writer
            .write_all(data)
            .and_then(|()| writer.flush())
            .map_err(|error| RuntimeError::Pty(error.to_string()))
    }

    pub fn resize(&self, terminal_id: &str, size: TerminalSize) -> Result<()> {
        let size = size.validate()?;
        let session = self.session(terminal_id)?;
        if session.closed.load(Ordering::Acquire) {
            return Err(RuntimeError::TerminalClosed(terminal_id.to_string()));
        }
        let master = session
            .master
            .lock()
            .expect("terminal master lock poisoned");
        let master = master
            .as_ref()
            .ok_or_else(|| RuntimeError::TerminalClosed(terminal_id.to_string()))?;
        master
            .resize(size)
            .map_err(|error| RuntimeError::Pty(error.to_string()))
    }

    pub fn close(&self, terminal_id: &str) -> Result<CloseOutcome> {
        let session = self.session(terminal_id)?;
        if session.closed.swap(true, Ordering::AcqRel) {
            return Ok(CloseOutcome::AlreadyClosed);
        }
        session
            .writer
            .lock()
            .expect("terminal writer lock poisoned")
            .take();
        kill_owned_process(&session)?;
        Ok(CloseOutcome::Closed)
    }

    fn session(&self, terminal_id: &str) -> Result<Arc<SessionControl>> {
        self.sessions
            .lock()
            .expect("terminal map lock poisoned")
            .get(terminal_id)
            .cloned()
            .ok_or_else(|| RuntimeError::TerminalNotFound(terminal_id.to_string()))
    }
}

#[cfg(not(windows))]
fn kill_owned_process(session: &SessionControl) -> Result<()> {
    session
        .killer
        .lock()
        .expect("terminal killer lock poisoned")
        .kill()
        .map_err(|error| RuntimeError::ProcessCleanup(error.to_string()))
}

#[cfg(windows)]
fn kill_owned_process(session: &SessionControl) -> Result<()> {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    let pid = session
        .pid
        .ok_or_else(|| RuntimeError::ProcessCleanup("PTY did not expose a process id".into()))?;
    let handle: HANDLE = unsafe { OpenProcess(PROCESS_TERMINATE, 0, pid) };
    if handle.is_null() {
        return Err(RuntimeError::ProcessCleanup(
            std::io::Error::last_os_error().to_string(),
        ));
    }
    let terminated = unsafe { TerminateProcess(handle, 1) };
    let error = std::io::Error::last_os_error();
    unsafe { CloseHandle(handle) };
    if terminated == 0 {
        Err(RuntimeError::ProcessCleanup(error.to_string()))
    } else {
        Ok(())
    }
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        let terminal_ids = self
            .sessions
            .get_mut()
            .expect("terminal map lock poisoned")
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        for terminal_id in terminal_ids {
            let _ = self.close(&terminal_id);
        }
    }
}

fn read_output(
    mut reader: Box<dyn Read + Send>,
    terminal_id: &str,
    sequence: &AtomicU64,
    sink: Arc<dyn TerminalEventSink>,
) {
    let mut buffer = [0_u8; 8192];
    while let Ok(read) = reader.read(&mut buffer) {
        if read == 0 {
            break;
        }
        sink.emit(TerminalEvent {
            terminal_id: terminal_id.to_string(),
            sequence: sequence.fetch_add(1, Ordering::AcqRel) + 1,
            kind: TerminalEventKind::Output {
                data: String::from_utf8_lossy(&buffer[..read]).into_owned(),
            },
        });
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Condvar;
    use std::time::{Duration, Instant};

    use super::*;
    use crate::{AgentHarness, HarnessModel};

    #[derive(Debug, Default)]
    struct RecordingSink {
        events: Mutex<Vec<TerminalEvent>>,
        changed: Condvar,
    }

    impl TerminalEventSink for RecordingSink {
        fn emit(&self, event: TerminalEvent) {
            self.events.lock().unwrap().push(event);
            self.changed.notify_all();
        }
    }

    impl RecordingSink {
        fn wait_for_exit(&self, timeout: Duration) -> Vec<TerminalEvent> {
            let deadline = Instant::now() + timeout;
            let mut events = self.events.lock().unwrap();
            while !events
                .iter()
                .any(|event| matches!(event.kind, TerminalEventKind::Exit { .. }))
            {
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    break;
                }
                let (next, _) = self.changed.wait_timeout(events, remaining).unwrap();
                events = next;
            }
            events.clone()
        }
    }

    fn interactive_launch() -> PreparedLaunch {
        #[cfg(windows)]
        let (executable, argv) = (PathBuf::from("cmd.exe"), vec!["/Q".into(), "/D".into()]);
        #[cfg(not(windows))]
        let (executable, argv) = (PathBuf::from("/bin/sh"), Vec::new());
        PreparedLaunch {
            executable,
            argv,
            cwd: std::env::current_dir().unwrap(),
            harness: AgentHarness::Codex,
            model: HarnessModel::O3,
            agent_slug: "test".into(),
            normalized_prompt: None,
        }
    }

    #[test]
    fn pty_echo_resize_and_exit_are_ordered() {
        let manager = TerminalManager::default();
        let sink = Arc::new(RecordingSink::default());
        let session = manager
            .create(
                interactive_launch(),
                TerminalSize {
                    columns: 80,
                    rows: 24,
                },
                sink.clone(),
            )
            .unwrap();
        manager
            .resize(
                &session.terminal_id,
                TerminalSize {
                    columns: 120,
                    rows: 40,
                },
            )
            .unwrap();
        #[cfg(windows)]
        manager
            .write(&session.terminal_id, b"echo skillgate-pty\r\nexit\r\n")
            .unwrap();
        #[cfg(not(windows))]
        manager
            .write(&session.terminal_id, b"printf 'skillgate-pty\\n'\nexit\n")
            .unwrap();

        let events = sink.wait_for_exit(Duration::from_secs(10));
        let combined = events
            .iter()
            .filter_map(|event| match &event.kind {
                TerminalEventKind::Output { data } => Some(data.as_str()),
                TerminalEventKind::Exit { .. } => None,
            })
            .collect::<String>();
        assert!(combined.contains("skillgate-pty"), "events: {events:?}");
        assert!(matches!(
            events.last().map(|event| &event.kind),
            Some(TerminalEventKind::Exit { .. })
        ));
        assert!(events
            .windows(2)
            .all(|pair| pair[1].sequence == pair[0].sequence + 1));
    }

    #[test]
    fn close_is_idempotent_and_emits_final_exit() {
        let manager = TerminalManager::default();
        let sink = Arc::new(RecordingSink::default());
        let session = manager
            .create(
                interactive_launch(),
                TerminalSize {
                    columns: 80,
                    rows: 24,
                },
                sink.clone(),
            )
            .unwrap();
        assert_eq!(
            manager.close(&session.terminal_id).unwrap(),
            CloseOutcome::Closed
        );
        assert_eq!(
            manager.close(&session.terminal_id).unwrap(),
            CloseOutcome::AlreadyClosed
        );
        let events = sink.wait_for_exit(Duration::from_secs(10));
        assert!(matches!(
            events.last().map(|event| &event.kind),
            Some(TerminalEventKind::Exit { .. })
        ));
    }
}
