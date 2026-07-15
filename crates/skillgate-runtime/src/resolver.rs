use std::path::PathBuf;
use std::process::Command;

use crate::{AgentHarness, Result, RuntimeError};

pub trait CliResolver: Send + Sync {
    fn resolve(&self, harness: AgentHarness) -> Result<PathBuf>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SystemCliResolver;

impl CliResolver for SystemCliResolver {
    fn resolve(&self, harness: AgentHarness) -> Result<PathBuf> {
        let binary = harness.executable_name();
        let output = lookup(binary)?;
        parse_lookup_output(binary, &output)
    }
}

#[cfg(windows)]
fn lookup(binary: &str) -> Result<Vec<u8>> {
    let output = Command::new("where.exe")
        .arg(format!("{binary}.exe"))
        .output()
        .map_err(|error| RuntimeError::CliLookup {
            binary: binary.to_string(),
            message: error.to_string(),
        })?;
    if !output.status.success() {
        return Err(RuntimeError::CliNotFound {
            binary: binary.to_string(),
        });
    }
    Ok(output.stdout)
}

#[cfg(not(windows))]
fn lookup(binary: &str) -> Result<Vec<u8>> {
    let shell = std::env::var_os("SHELL").unwrap_or_else(|| "/bin/sh".into());
    let shell_name = std::path::Path::new(&shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("sh");
    // `binary` is selected from AgentHarness, never renderer input.
    let script = match shell_name {
        "zsh" => format!("whence -p {binary}"),
        "bash" | "sh" => format!("type -P {binary}"),
        _ => format!("command -v {binary}"),
    };
    let output = Command::new(shell)
        .args(["-i", "-l", "-c", &script])
        .output()
        .map_err(|error| RuntimeError::CliLookup {
            binary: binary.to_string(),
            message: error.to_string(),
        })?;
    if !output.status.success() {
        return Err(RuntimeError::CliNotFound {
            binary: binary.to_string(),
        });
    }
    Ok(output.stdout)
}

fn parse_lookup_output(binary: &str, output: &[u8]) -> Result<PathBuf> {
    let path = String::from_utf8_lossy(output)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| RuntimeError::CliNotFound {
            binary: binary.to_string(),
        })?;
    if !path.is_absolute() || !path.is_file() {
        return Err(RuntimeError::InvalidExecutable(path));
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn parser_uses_first_nonempty_result() {
        let temp = tempdir().unwrap();
        let executable = temp
            .path()
            .join(if cfg!(windows) { "agent.exe" } else { "agent" });
        fs::write(&executable, "test").unwrap();
        let output = format!("\n{}\nignored\n", executable.display());
        assert_eq!(
            parse_lookup_output("agent", output.as_bytes()).unwrap(),
            executable
        );
    }

    #[test]
    fn parser_rejects_empty_and_relative_results() {
        assert!(matches!(
            parse_lookup_output("agent", b"\n"),
            Err(RuntimeError::CliNotFound { .. })
        ));
        assert!(matches!(
            parse_lookup_output("agent", b"agent"),
            Err(RuntimeError::InvalidExecutable(_))
        ));
    }
}
