use serde::Serialize;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::State;

/// What Google (or any OAuth server) appended to our loopback redirect.
#[derive(Serialize, Debug, PartialEq, Default)]
pub struct OAuthReply {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[derive(Default)]
struct Loopback(Mutex<Option<TcpListener>>);

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < b.len() => {
                let hex = std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok());
                match hex {
                    Some(v) => { out.push(v); i += 2; }
                    None => out.push(b'%'),
                }
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Parses the request line of "GET /?code=..&state=.. HTTP/1.1". Returns None for anything that is not a plain GET.
pub fn parse_request_line(line: &str) -> Option<OAuthReply> {
    let mut parts = line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    let target = parts.next()?;
    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut reply = OAuthReply::default();
    for pair in query.split('&').filter(|p| !p.is_empty()) {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let v = percent_decode(v);
        match k {
            "code" => reply.code = Some(v),
            "state" => reply.state = Some(v),
            "error" => reply.error = Some(v),
            _ => {}
        }
    }
    Some(reply)
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.flush();
}

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>StarNote</title><body style=\"font-family:system-ui;background:#2b2b2b;color:#eee;display:grid;place-items:center;height:100vh;margin:0\"><div><h2>Done here</h2><p>You can close this tab and return to rea-starnote: it finishes the sign-in and shows the result there.</p></div>";

/// Waits for ONE real redirect on `listener` (ignores favicon/other requests and foreign Host headers).
pub fn wait_for_reply(listener: TcpListener, timeout: Duration) -> Result<OAuthReply, String> {
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + timeout;
    loop {
        if Instant::now() >= deadline {
            return Err("timed out waiting for the browser sign-in".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).unwrap_or(0);
                let text = String::from_utf8_lossy(&buf[..n]).into_owned();
                let first = text.lines().next().unwrap_or("");
                // Only accept requests addressed to our own loopback address (blocks DNS-rebinding tricks).
                let host_ok = text
                    .lines()
                    .find_map(|l| l.strip_prefix("Host:").or_else(|| l.strip_prefix("host:")))
                    .map(|h| h.trim() == format!("127.0.0.1:{port}") || h.trim() == format!("localhost:{port}"))
                    .unwrap_or(true);
                match parse_request_line(first) {
                    Some(r) if host_ok && (r.code.is_some() || r.error.is_some()) => {
                        respond(&mut stream, "200 OK", DONE_PAGE);
                        return Ok(r);
                    }
                    _ => respond(&mut stream, "404 Not Found", "not found"),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(40)),
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Binds a loopback port for the OAuth redirect and returns it. Call before building the sign-in URL.
#[tauri::command]
fn loopback_start(state: State<Loopback>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    *state.0.lock().map_err(|e| e.to_string())? = Some(listener);
    Ok(port)
}

/// Waits (up to `timeout_secs`) for the browser to come back to the port from `loopback_start`.
#[tauri::command]
async fn loopback_wait(state: State<'_, Loopback>, timeout_secs: u64) -> Result<OAuthReply, String> {
    let listener = state.0.lock().map_err(|e| e.to_string())?.take().ok_or("loopback_start was not called")?;
    tauri::async_runtime::spawn_blocking(move || wait_for_reply(listener, Duration::from_secs(timeout_secs.clamp(5, 600))))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Loopback::default())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![loopback_start, loopback_wait])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpStream;

    fn send(port: u16, req: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(req.as_bytes()).unwrap();
        let mut out = String::new();
        let _ = s.read_to_string(&mut out);
        out
    }

    #[test]
    fn parses_code_and_state_with_escapes() {
        let r = parse_request_line("GET /?code=4%2F0AbC-d_e&state=a+b%20c&scope=x HTTP/1.1").unwrap();
        assert_eq!(r.code.as_deref(), Some("4/0AbC-d_e"));
        assert_eq!(r.state.as_deref(), Some("a b c"));
        assert_eq!(r.error, None);
    }

    #[test]
    fn parses_an_error_reply() {
        let r = parse_request_line("GET /?error=access_denied&state=s1 HTTP/1.1").unwrap();
        assert_eq!((r.error.as_deref(), r.code), (Some("access_denied"), None));
    }

    #[test]
    fn rejects_non_get_and_garbage() {
        assert!(parse_request_line("POST /?code=x HTTP/1.1").is_none());
        assert!(parse_request_line("").is_none());
        assert_eq!(parse_request_line("GET / HTTP/1.1").unwrap(), OAuthReply::default());
    }

    #[test]
    fn percent_decode_handles_truncated_and_invalid_escapes() {
        assert_eq!(percent_decode("a%2"), "a%2");
        assert_eq!(percent_decode("%zz"), "%zz");
        assert_eq!(percent_decode("%e2%9c%93"), "✓");
    }

    #[test]
    fn receives_the_real_redirect_over_a_socket_and_answers_the_browser() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let h = std::thread::spawn(move || wait_for_reply(l, Duration::from_secs(5)));
        let page = send(port, &format!("GET /?code=CODE123&state=ST HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"));
        assert!(page.starts_with("HTTP/1.1 200 OK") && page.contains("You can close this tab"));
        let r = h.join().unwrap().unwrap();
        assert_eq!((r.code.as_deref(), r.state.as_deref()), (Some("CODE123"), Some("ST")));
    }

    #[test]
    fn ignores_favicon_and_foreign_host_then_accepts_the_real_one() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let h = std::thread::spawn(move || wait_for_reply(l, Duration::from_secs(5)));
        assert!(send(port, &format!("GET /favicon.ico HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n")).starts_with("HTTP/1.1 404"));
        assert!(send(port, "GET /?code=EVIL&state=x HTTP/1.1\r\nHost: evil.example:80\r\n\r\n").starts_with("HTTP/1.1 404"), "a foreign Host header is refused");
        send(port, &format!("GET /?code=GOOD&state=ok HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n"));
        assert_eq!(h.join().unwrap().unwrap().code.as_deref(), Some("GOOD"));
    }

    #[test]
    fn times_out_when_nobody_comes_back() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let err = wait_for_reply(l, Duration::from_millis(250)).unwrap_err();
        assert!(err.contains("timed out"));
    }
}
