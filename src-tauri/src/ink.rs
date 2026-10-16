//! Handwriting recognition with Windows' own ink recognizer (Windows.UI.Input.Inking): offline, nothing to download, in the
//! languages whose handwriting feature Windows has installed. Lines of ink come in as point lists; one text (or None) per line
//! goes back. Elsewhere the command answers "unavailable" and the app finds typed text only.

/// What was read, and by which recognizer (`matched` is false when the asked language is not installed and Windows' default read it).
#[derive(serde::Serialize)]
pub struct InkRead {
    texts: Vec<Option<String>>,
    used: String,
    matched: bool,
}

/// Lines of ink (each a list of strokes, each a list of [x, y]) and a language tag ("ko", "en").
#[tauri::command]
pub async fn ink_recognize(lines: Vec<Vec<Vec<[f32; 2]>>>, lang: String) -> Result<InkRead, String> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || win::recognize(&lines, &lang)).await.map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (lines, lang);
        Err("unavailable: no handwriting recognizer on this platform".into())
    }
}

/// Which recognizer names stand for a language (Windows names them in the system's language, e.g. "Microsoft 한글 필기 인식기").
#[cfg_attr(not(any(windows, test)), allow(dead_code))]
fn name_hints(lang: &str) -> &'static [&'static str] {
    match lang {
        "ko" => &["한글", "한국어", "Korean"],
        "en" => &["English", "영어"],
        "ja" => &["日本語", "Japanese", "일본어"],
        "zh" => &["中文", "Chinese", "중국어"],
        _ => &[],
    }
}

#[cfg(windows)]
mod win {
    use windows_collections::IIterable;
    use windows::Foundation::Point;
    use windows::UI::Input::Inking::{InkRecognitionTarget, InkRecognizer, InkRecognizerContainer, InkStrokeBuilder, InkStrokeContainer};
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    fn msg(e: windows::core::Error) -> String { e.message().to_string() }

    pub fn recognize(lines: &[Vec<Vec<[f32; 2]>>], lang: &str) -> Result<super::InkRead, String> {
        unsafe { let _ = RoInitialize(RO_INIT_MULTITHREADED); } // this worker thread may not be set up for WinRT yet; "already" is fine
        let container = InkRecognizerContainer::new().map_err(msg)?;
        let all = container.GetRecognizers().map_err(msg)?;
        let named: Vec<(InkRecognizer, String)> = (0..all.Size().map_err(msg)?)
            .filter_map(|i| all.GetAt(i).ok())
            .filter_map(|r| r.Name().ok().map(|n| (r, n.to_string())))
            .collect();
        if named.is_empty() {
            return Err("unavailable: Windows has no handwriting recognizer installed (Settings > Time & language > Language > your language > Language options > Handwriting)".into());
        }
        // the language asked for when it is installed, else whatever Windows has (its default)
        let wanted = named.iter().find(|(_, n)| super::name_hints(lang).iter().any(|h| n.contains(h)));
        if let Some((r, _)) = wanted {
            container.SetDefaultRecognizer(r).map_err(msg)?;
        }
        let used = match wanted { Some((_, n)) => n.clone(), None => container.GetRecognizers().ok().and_then(|_| named.first().map(|(_, n)| n.clone())).unwrap_or_default() };
        let builder = InkStrokeBuilder::new().map_err(msg)?;
        let mut out = Vec::with_capacity(lines.len());
        for line in lines {
            let strokes = InkStrokeContainer::new().map_err(msg)?;
            let mut any = false;
            for s in line.iter().filter(|s| !s.is_empty()) {
                // page units are ~7 per mm; ink is drawn in device-independent pixels (~3.8 per mm)
                let pts: Vec<Point> = s.iter().map(|p| Point { X: p[0] * 0.55, Y: p[1] * 0.55 }).collect();
                let iter: IIterable<Point> = pts.into();
                strokes.AddStroke(&builder.CreateStroke(&iter).map_err(msg)?).map_err(msg)?;
                any = true;
            }
            if !any { out.push(None); continue; }
            let results = container.RecognizeAsync(&strokes, InkRecognitionTarget::All).map_err(msg)?.join().map_err(msg)?; // blocking wait: this runs on a worker thread
            let mut text = String::new();
            for i in 0..results.Size().map_err(msg)? {
                let cands = results.GetAt(i).map_err(msg)?.GetTextCandidates().map_err(msg)?;
                if cands.Size().map_err(msg)? > 0 {
                    if !text.is_empty() { text.push(' '); }
                    text.push_str(&cands.GetAt(0).map_err(msg)?.to_string());
                }
            }
            out.push(if text.is_empty() { None } else { Some(text) });
        }
        Ok(super::InkRead { texts: out, used, matched: wanted.is_some() })
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn language_names_match_how_windows_names_its_recognizers() {
        assert!(super::name_hints("ko").iter().any(|h| "Microsoft 한글 필기 인식기".contains(h)));
        assert!(super::name_hints("en").iter().any(|h| "Microsoft English (US) Handwriting Recognizer".contains(h)));
        assert!(super::name_hints("xx").is_empty());
    }
}
