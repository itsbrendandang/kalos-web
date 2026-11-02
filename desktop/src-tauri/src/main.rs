// Kalos desktop: a native window around two local processes.
//
//   engine  python -m kalos.portal   127.0.0.1:<free port>   state in ~/.kalos
//   web     next standalone server   127.0.0.1:<free port>   KALOS_LOCAL_MODE=1
//
// Nothing listens beyond loopback, there is no sign-in (one user, one device),
// and both processes are stopped when the window closes. The splash page shows
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

/// A fresh secret for this launch. The web server only answers requests that carry it (lib/server/local-guard.ts).
fn launch_token() -> Result<String, String> {
    use std::io::Read;
    let mut buf = [0u8; 24];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .map_err(|e| format!("could not make a launch secret: {e}"))?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
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

    let (engine_port, web_port) = (free_port(), free_port());

    let python = engine_dir.join(".venv/bin/python");
    let engine = Command::new(&python)
        .args(["-m", "kalos.portal"])
        .current_dir(&engine_dir)
        .env("KALOS_HOST", "127.0.0.1")
        .env("KALOS_PORT", engine_port.to_string())
        .env("KALOS_STATE_DIR", &state)
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
