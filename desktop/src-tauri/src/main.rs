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
// Paths (override with env):
//   KALOS_ENGINE_DIR  a kalos-engine checkout with .venv
//                     (default ~/GitHub/kalos-engine, then ~/GitHub/kalos)
//   KALOS_WEB_DIR     a folder with server.js, or a repo with .next/standalone
//                     (default: the web build packed inside the .app by prepare-web.sh)
//   KALOS_NODE        the node binary; KALOS_STATE_DIR  engine state (default ~/.kalos)
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

/// Stops every child: SIGTERM first (the engine finishes or abandons an analysis,
/// committing nothing half-done), then SIGKILL for anything still running after 15 s.
fn kill_all(children: &Children) {
    let mut list = children.0.lock().unwrap();
    for c in list.iter() {
        // SAFETY: libc::kill with a pid we spawned and still own (not yet reaped).
        unsafe { libc::kill(c.id() as libc::pid_t, libc::SIGTERM) };
    }
    let end = Instant::now() + Duration::from_secs(15);
    for c in list.iter_mut() {
        while Instant::now() < end && matches!(c.try_wait(), Ok(None)) {
            std::thread::sleep(Duration::from_millis(100));
        }
        if matches!(c.try_wait(), Ok(None)) {
            let _ = c.kill();
        }
        let _ = c.wait();
    }
    list.clear();
}

enum Health {
    Ready,
    NotYet,
    /// The engine answered but cannot serve (503 body text) or refused our secret.
    Refused(String),
}

/// One `GET /api/health` with the engine secret. An engine without that route (404)
/// counts as ready once it answers at all.
fn engine_health(port: u16, secret: &str) -> Health {
    use std::io::{Read, Write};
    let addr = format!("127.0.0.1:{port}").parse().unwrap();
    let Ok(mut s) = TcpStream::connect_timeout(&addr, Duration::from_millis(300)) else { return Health::NotYet };
    let _ = s.set_read_timeout(Some(Duration::from_secs(5)));
    let req = format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {secret}\r\nConnection: close\r\n\r\n");
    if s.write_all(req.as_bytes()).is_err() {
        return Health::NotYet;
    }
    let mut buf = Vec::new();
    let _ = s.take(64 * 1024).read_to_end(&mut buf);
    let text = String::from_utf8_lossy(&buf);
    let status = text.split_whitespace().nth(1).unwrap_or("");
    match status {
        "200" | "404" => Health::Ready,
        "401" | "403" => Health::Refused("the engine refused the app's launch secret".into()),
        "503" => {
            let body = text.split("\r\n\r\n").nth(1).unwrap_or("");
            let msg = serde_json::from_str::<serde_json::Value>(body)
                .ok()
                .and_then(|v| v["error"].as_str().map(String::from))
                .unwrap_or_else(|| "the engine cannot open its data".into());
            Health::Refused(msg)
        }
        _ => Health::NotYet,
    }
}

/// The engine's own one-line reason when it refuses to start ("kalos engine: ..."), if any.
fn engine_refusal_line() -> Option<String> {
    let text = std::fs::read_to_string(home().join("Library/Logs/Kalos/engine-err.log")).ok()?;
    text.lines().rev().find(|l| l.starts_with("kalos engine: ")).map(|l| l.trim_start_matches("kalos engine: ").to_string())
}

/// Wait until the engine answers health, exits, or the time runs out.
fn wait_for_engine(children: &Children, port: u16, secret: &str, secs: u64) -> Result<(), String> {
    let end = Instant::now() + Duration::from_secs(secs);
    while Instant::now() < end {
        match engine_health(port, secret) {
            Health::Ready => return Ok(()),
            Health::Refused(msg) => return Err(msg),
            Health::NotYet => {}
        }
        let exited = children.0.lock().unwrap().first_mut().map(|c| matches!(c.try_wait(), Ok(Some(_)))).unwrap_or(false);
        if exited {
            return Err(engine_refusal_line().unwrap_or_else(|| "the engine stopped while starting; see ~/Library/Logs/Kalos/engine-err.log".into()));
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err("the engine did not start in time; see ~/Library/Logs/Kalos/engine-err.log".into())
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

fn engine_dir() -> PathBuf {
    if let Ok(d) = std::env::var("KALOS_ENGINE_DIR") {
        return PathBuf::from(d);
    }
    let candidates = [home().join("GitHub/kalos-engine"), home().join("GitHub/kalos")];
    candidates.iter().find(|d| d.join(".venv/bin/python").exists()).cloned().unwrap_or_else(|| candidates[0].clone())
}

/// The folder holding the web server's server.js.
fn web_server_dir(resources: Option<PathBuf>) -> Result<PathBuf, String> {
    if let Ok(d) = std::env::var("KALOS_WEB_DIR") {
        let d = PathBuf::from(d);
        let nested = d.join(".next/standalone");
        return Ok(if nested.join("server.js").exists() { nested } else { d });
    }
    resources
        .map(|r| r.join("resources/web"))
        .filter(|d| d.join("server.js").exists())
        .ok_or_else(|| "this build has no web app inside; run desktop/prepare-web.sh before building".into())
}

/// First page: the campaign Overview (`/`). KALOS_START_PATH opens another page
/// (e.g. `/campaign/plan`); only plain path characters are accepted.
fn start_path() -> String {
    std::env::var("KALOS_START_PATH")
        .ok()
        .filter(|p| p.starts_with('/') && !p.starts_with("//") && p.len() < 100 && p.chars().all(|c| c.is_ascii_alphanumeric() || "/-_".contains(c)))
        .unwrap_or_else(|| "/".into())
}

/// Starts both processes. Each child is registered the moment it exists, so quitting
/// (or a failure) at any point still stops everything that was started.
fn start(children: &Children, resources: Option<PathBuf>) -> Result<(u16, String), String> {
    let engine_dir = engine_dir();
    let standalone = web_server_dir(resources)?;
    let node = find_node();
    let state = std::env::var("KALOS_STATE_DIR").unwrap_or_else(|_| home().join(".kalos").to_string_lossy().into());
    let token = launch_token()?;
    let engine_secret = launch_token()?;

    let (engine_port, web_port) = (free_port(), free_port());

    let python = engine_dir.join(".venv/bin/python");
    let engine = Command::new(&python)
        .args(["-m", "kalos.portal"])
        .current_dir(&engine_dir)
        .env("KALOS_DESKTOP", "1")
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

    // Wait for the engine too, so the first page (the campaign Overview) and the
    // sidebar's engine status read a running engine instead of a refused connection.
    wait_for_engine(children, engine_port, &engine_secret, 180)?;
    if !wait_for(web_port, 40) {
        return Err("the app server did not start; see ~/Library/Logs/Kalos/web-err.log".into());
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
                match start(&children, handle.path().resource_dir().ok()) {
                    Ok((port, token)) => {
                        // Opens on the campaign Overview (/). The secret travels once, in the first
                        // address; the server turns it into a cookie and drops it.
                        let _ = win.navigate(format!("http://127.0.0.1:{port}{}?k={token}", start_path()).parse().unwrap());
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
    fn start_path_defaults_to_overview_and_refuses_junk() {
        std::env::remove_var("KALOS_START_PATH");
        assert_eq!(start_path(), "/");
        for (input, want) in [("/campaign/plan", "/campaign/plan"), ("//evil.example", "/"), ("/x?k=1", "/"), ("http://x", "/")] {
            std::env::set_var("KALOS_START_PATH", input);
            assert_eq!(start_path(), want, "{input}");
        }
        std::env::remove_var("KALOS_START_PATH");
    }

    #[test]
    fn launch_tokens_are_fresh_and_long() {
        let (a, b) = (launch_token().unwrap(), launch_token().unwrap());
        assert_eq!(a.len(), 48);
        assert_ne!(a, b);
    }
}
