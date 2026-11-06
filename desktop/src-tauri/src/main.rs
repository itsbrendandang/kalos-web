// Kalos desktop: a native window around two local processes.
//
//   engine  python -m kalos.portal   127.0.0.1:<free port>   state in ~/.kalos
//   web     next standalone server   127.0.0.1:<free port>   KALOS_LOCAL_MODE=1
//
// Nothing listens beyond loopback, there is no sign-in (one user, one device),
// and both processes are stopped when the window closes. Two secrets are made
// per launch: one the web server asks of the window (KALOS_LOCAL_TOKEN), and one
// the engine asks of the web server (KALOS_AUTH_TOKENS on the engine holds only
// its SHA-256; the web server gets the plain value as KALOS_ENGINE_TOKEN). A page
// or program that finds the engine port without the secret gets 401. The splash page shows
// while they start, then the window navigates to the web server.
//
// Paths (override with env): KALOS_ENGINE_DIR (a kalos checkout with .venv),
// KALOS_WEB_DIR (a `next build` output with .next/standalone), KALOS_NODE.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};

struct Children(Mutex<Vec<Child>>);

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}

fn wait_for(port: u16, secs: u64) -> bool {
    let end = Instant::now() + Duration::from_secs(secs);
    while Instant::now() < end {
        if TcpStream::connect_timeout(&format!("127.0.0.1:{port}").parse().unwrap(), Duration::from_millis(300)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
}

/// A fresh secret for this launch (48 hex characters from the system's random source).
fn launch_token() -> Result<String, String> {
    use std::io::Read;
    let mut buf = [0u8; 24];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .map_err(|e| format!("could not make a launch secret: {e}"))?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
}

/// Engine tenant for the desktop app. The engine reserves `default` for open mode
/// and refuses it on a token, so the desktop app's records live under `local`.
const ENGINE_TENANT: &str = "local";

/// The engine's KALOS_AUTH_TOKENS value for this launch: one record holding the
/// SHA-256 of the secret (never the secret), read and write, no admin (the same
/// rights open mode gave). See kalos-engine docs/HARDENING.md.
fn engine_auth_config(secret: &str) -> String {
    use sha2::{Digest, Sha256};
    let hash: String = Sha256::digest(secret.as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
    serde_json::json!([{
        "token_sha256": hash,
        "subject": "desktop-app",
        "tenant": ENGINE_TENANT,
        "scopes": ["read", "write"],
    }])
    .to_string()
}

fn kill_all(children: &Children) {
    for c in children.0.lock().unwrap().iter_mut() {
        let _ = c.kill();
        let _ = c.wait();
    }
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").expect("HOME"))
}

/// A Finder-launched app has a bare PATH, so look where Node usually lives, then ask a login shell.
fn find_node() -> String {
    if let Ok(n) = std::env::var("KALOS_NODE") {
        return n;
    }
    for c in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        if std::path::Path::new(c).exists() {
            return c.into();
        }
    }
    Command::new("/bin/zsh")
        .args(["-lc", "command -v node"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "node".into())
}

/// Process output goes to ~/Library/Logs/Kalos/<name>.log so a failed start can be diagnosed.
fn log_file(name: &str) -> Stdio {
    let dir = home().join("Library/Logs/Kalos");
    let _ = std::fs::create_dir_all(&dir);
    std::fs::File::create(dir.join(format!("{name}.log"))).map(Stdio::from).unwrap_or_else(|_| Stdio::null())
}

/// Starts both processes. Each child is registered the moment it exists, so quitting
/// (or a failure) at any point still stops everything that was started.
fn start(children: &Children) -> Result<(u16, String), String> {
    let engine_dir = std::env::var("KALOS_ENGINE_DIR").map(PathBuf::from).unwrap_or_else(|_| home().join("GitHub/kalos"));
    let web_dir = std::env::var("KALOS_WEB_DIR").map(PathBuf::from).unwrap_or_else(|_| home().join("GitHub/kalos-web"));
    let node = find_node();
    let state = std::env::var("KALOS_STATE_DIR").unwrap_or_else(|_| home().join(".kalos").to_string_lossy().into());
    let token = launch_token()?;
    let engine_secret = launch_token()?;

    let (engine_port, web_port) = (free_port(), free_port());

    let python = engine_dir.join(".venv/bin/python");
    let engine = Command::new(&python)
        .args(["-m", "kalos.portal"])
        .current_dir(&engine_dir)
        .env("KALOS_HOST", "127.0.0.1")
        .env("KALOS_PORT", engine_port.to_string())
        .env("KALOS_STATE_DIR", &state)
        .env("KALOS_AUTH_TOKENS", engine_auth_config(&engine_secret))
        // Only the app's own origin may read engine answers from a browser.
        .env("KALOS_CORS_ORIGINS", format!("http://127.0.0.1:{web_port}"))
        .env_remove("KALOS_AUTH_TOKENS_FILE")
        .env_remove("KALOS_ALLOW_OPEN_ACCESS")
        .stdout(log_file("engine"))
        .stderr(log_file("engine-err"))
        .spawn()
        .map_err(|e| format!("could not start the engine ({}): {e}", python.display()))?;
    children.0.lock().unwrap().push(engine);

    let standalone = web_dir.join(".next/standalone");
    let server = Command::new(&node)
        .arg(standalone.join("server.js"))
        .current_dir(&standalone)
        .env("NODE_ENV", "production")
        .env("HOSTNAME", "127.0.0.1")
        .env("PORT", web_port.to_string())
        .env("KALOS_LOCAL_MODE", "1")
        .env("KALOS_LOCAL_TOKEN", &token)
        .env("KALOS_STATE_DIR", &state)
        .env("KALOS_ENGINE_URL", format!("http://127.0.0.1:{engine_port}"))
        .env("KALOS_ENGINE_TOKEN", &engine_secret)
        .stdout(log_file("web"))
        .stderr(log_file("web-err"))
        .spawn()
        .map_err(|e| format!("could not start the app server: {e}"))?;
    children.0.lock().unwrap().push(server);

    if !wait_for(web_port, 40) {
        return Err("the app server did not start".into());
    }
    Ok((web_port, token))
}

fn main() {
    let app = tauri::Builder::default()
        .manage(Children(Mutex::new(Vec::new())))
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let win = handle.get_webview_window("main").unwrap();
                let children = handle.state::<Children>();
                match start(&children) {
                    Ok((port, token)) => {
                        // The secret travels once, in the first address; the server turns it into a cookie and drops it.
                        let _ = win.navigate(format!("http://127.0.0.1:{port}/?k={token}").parse().unwrap());
                    }
                    Err(msg) => {
                        kill_all(&children);
                        let text = serde_json::to_string(&msg).unwrap_or_else(|_| "\"could not start\"".into());
                        let _ = win.eval(&format!("document.querySelector('.w div:last-child').textContent = {text}"));
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Kalos");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            kill_all(&handle.state::<Children>());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_config_holds_the_hash_not_the_secret() {
        let secret = "0123456789abcdef0123456789abcdef0123456789abcdef";
        let cfg = engine_auth_config(secret);
        assert!(!cfg.contains(secret));
        let v: serde_json::Value = serde_json::from_str(&cfg).unwrap();
        let rec = &v[0];
        // sha256 of the secret above, computed with `printf %s <secret> | shasum -a 256`
        assert_eq!(rec["token_sha256"], "34c26e154bab5ff544f29f8747a691d0fedd3b8a51655f27d0f585b1b2753970");
        assert_eq!(rec["tenant"], "local");
        assert_eq!(rec["scopes"], serde_json::json!(["read", "write"]));
        assert_eq!(v.as_array().unwrap().len(), 1);
    }

    #[test]
    fn launch_tokens_are_fresh_and_long() {
        let (a, b) = (launch_token().unwrap(), launch_token().unwrap());
        assert_eq!(a.len(), 48);
        assert_ne!(a, b);
    }
}
