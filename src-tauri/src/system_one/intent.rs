use std::collections::HashMap;
use super::types::TaskIntentVerdict;

/// Classifies user prompt intent using System One calibrated categorical distributions.
pub fn classify_user_task(prompt: &str) -> TaskIntentVerdict {
    let raw = prompt.trim();
    let lower = raw.to_lowercase();

    let mut scores = HashMap::new();
    scores.insert("planning".to_string(), 1.0);
    scores.insert("code".to_string(), 1.0);
    scores.insert("os_control".to_string(), 1.0);
    scores.insert("private_notes".to_string(), 1.0);
    scores.insert("search_retrieval".to_string(), 1.0);
    scores.insert("conversational".to_string(), 1.0);

    // 1. Planning cues (Multi-step agent workflows & architecture)
    let plan_keywords = ["plan", "architect", "step-by-step", "roadmap", "design", "break down", "outline", "strategy", "workflow", "phases", "milestones", "decomposition"];
    for kw in plan_keywords {
        if lower.contains(kw) {
            *scores.get_mut("planning").unwrap() += 3.0;
        }
    }

    // 2. Code cues (Programming, syntax, debugging, refactoring)
    let code_keywords = ["function", "const ", "impl ", "fn ", "def ", "class ", "bug", "error", "refactor", "compile", "cargo", "typescript", "rust", "react", "component", "import ", "macro", "algorithm", "unit test"];
    for kw in code_keywords {
        if lower.contains(kw) {
            *scores.get_mut("code").unwrap() += 3.5;
        }
    }

    // 3. OS Control cues (Local desktop automation, Spotify, YouTube, Volume, App Launch)
    let os_keywords = [
        "volume", "brightness", "spotify", "play music", "pause music", "next song", "track",
        "mute", "unmute", "launch ", "open app", "close app", "screenshot", "screen inspector",
        "click ", "scroll ", "battery status", "system status", "youtube", "open ", "play ",
        "song", "video", "browser", "netflix", "music"
    ];
    for kw in os_keywords {
        if lower.contains(kw) {
            *scores.get_mut("os_control").unwrap() += 3.5;
        }
    }

    // 4. Private Notes & Sensitive Personal Memory
    let note_keywords = ["private note", "save note", "note down", "diary", "journal", "my secret", "remember this note", "personal note", "my credential", "my password"];
    for kw in note_keywords {
        if lower.contains(kw) {
            *scores.get_mut("private_notes").unwrap() += 3.8;
        }
    }

    // 5. Search / Retrieval cues (Memory, saved documents, local files)
    let search_keywords = ["find", "search", "where is", "look up", "memory", "saved", "recall", "locate", "grep", "history"];
    for kw in search_keywords {
        if lower.contains(kw) {
            *scores.get_mut("search_retrieval").unwrap() += 2.8;
        }
    }

    // 6. Conversational cues (Greetings, chit-chat, simple Q&A)
    let chat_keywords = ["hello", "hi", "how are you", "who are you", "thanks", "thank you", "explain to me", "tell me about", "what do you think", "weather", "tell me a joke"];
    for kw in chat_keywords {
        if lower.contains(kw) {
            *scores.get_mut("conversational").unwrap() += 2.2;
        }
    }

    let total: f64 = scores.values().sum();
    let mut probabilities = HashMap::new();
    let mut best_intent = "conversational".to_string();
    let mut highest_prob = -1.0;

    for (k, v) in scores {
        let prob = (v / total * 1000.0).round() / 1000.0;
        if prob > highest_prob {
            highest_prob = prob;
            best_intent = k.clone();
        }
        probabilities.insert(k, prob);
    }

    let confidence = (highest_prob.max(0.0).min(1.0) * 100.0).round() / 100.0;

    // Recommended route & provider based on intent characteristics
    let (recommended_route, suggested_provider, suggested_system_prompt) = match best_intent.as_str() {
        "planning" => (
            "cloud_boost".to_string(),
            "claude".to_string(),
            Some("Focus on high-level architecture, phased milestones, and dependency sequencing.".to_string()),
        ),
        "code" => (
            "cloud_boost".to_string(),
            "claude".to_string(),
            Some("Provide precise, idiomatic, fully-typed production code with zero placeholders.".to_string()),
        ),
        "os_control" => (
            "local_first".to_string(),
            "ollama".to_string(),
            Some("Execute desktop operating system tools immediately with zero external data exposure. Take direct action using host tools without asking confirmation or conversational filler.".to_string()),
        ),
        "private_notes" => (
            "local_first".to_string(),
            "ollama".to_string(),
            Some("Store and recall private personal notes strictly locally on disk with zero cloud transmission.".to_string()),
        ),
        "search_retrieval" => (
            "local_first".to_string(),
            "ollama".to_string(),
            Some("Perform targeted vector and keyword memory searches with exact citation of sources.".to_string()),
        ),
        _ => (
            "local_first".to_string(),
            "ollama".to_string(),
            Some("Maintain clear, concise, direct desktop assistance without fluff.".to_string()),
        ),
    };

    TaskIntentVerdict {
        prompt: raw.to_string(),
        primary_intent: best_intent,
        recommended_route,
        suggested_provider,
        probabilities,
        confidence,
        suggested_system_prompt,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_code_intent_classification() {
        let res = classify_user_task("Write a rust function to parse JSON with serde");
        assert_eq!(res.primary_intent, "code");
        assert_eq!(res.recommended_route, "cloud_boost");
        assert!(res.confidence > 0.25);
    }

    #[test]
    fn test_search_intent_classification() {
        let res = classify_user_task("Search my memory for where I saved the project repo link");
        assert_eq!(res.primary_intent, "search_retrieval");
        assert_eq!(res.recommended_route, "local_first");
    }

    #[test]
    fn test_planning_intent_classification() {
        let res = classify_user_task("Design a phased step-by-step roadmap for our desktop app");
        assert_eq!(res.primary_intent, "planning");
        assert_eq!(res.recommended_route, "cloud_boost");
    }

    #[test]
    fn test_os_control_intent_classification() {
        let res = classify_user_task("Set volume to 50% and play music on Spotify");
        assert_eq!(res.primary_intent, "os_control");
        assert_eq!(res.recommended_route, "local_first");
        assert_eq!(res.suggested_provider, "ollama");
    }

    #[test]
    fn test_os_control_youtube_song() {
        let res = classify_user_task("open YouTube and play Perfect song");
        assert_eq!(res.primary_intent, "os_control");
        assert_eq!(res.recommended_route, "local_first");
    }

    #[test]
    fn test_private_notes_intent_classification() {
        let res = classify_user_task("Save note in my diary: private note about meeting notes");
        assert_eq!(res.primary_intent, "private_notes");
        assert_eq!(res.recommended_route, "local_first");
        assert_eq!(res.suggested_provider, "ollama");
    }
}
