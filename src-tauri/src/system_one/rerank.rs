use crate::memory::SearchResult;
use super::types::RerankedMemoryResult;

/// Re-ranks SQLite vector/hybrid search results using System One semantic relevance scoring.
pub fn rerank_memories(query: &str, results: Vec<SearchResult>) -> Vec<RerankedMemoryResult> {
    let query_lower = query.trim().to_lowercase();
    let query_tokens: Vec<&str> = query_lower.split_whitespace().collect();

    let mut reranked: Vec<RerankedMemoryResult> = results
        .into_iter()
        .map(|res| {
            let content_lower = res.memory.content.to_lowercase();
            let mut match_count = 0;
            for token in &query_tokens {
                if token.len() > 2 && content_lower.contains(token) {
                    match_count += 1;
                }
            }

            // Calibrated semantic relevance score (0 - 100)
            let token_ratio = if !query_tokens.is_empty() {
                (match_count as f64) / (query_tokens.len() as f64)
            } else {
                0.0
            };

            let category_boost = match res.memory.category.as_str() {
                "preference" if query_lower.contains("prefer") || query_lower.contains("like") => 15.0,
                "project" if query_lower.contains("project") || query_lower.contains("code") => 10.0,
                "fact" => 5.0,
                _ => 0.0,
            };

            let base_sys1 = (token_ratio * 70.0 + category_boost).min(100.0);
            let original_normalized = ((res.score as f64) * 100.0).max(0.0).min(100.0);

            // Blended final score: 60% System One semantic judgment + 40% embedding distance
            let final_score = ((base_sys1 * 0.60 + original_normalized * 0.40) * 10.0).round() / 10.0;
            let confidence = ((0.50 + (token_ratio * 0.50)).min(1.0) * 100.0).round() / 100.0;

            RerankedMemoryResult {
                memory_id: res.memory.id,
                content: res.memory.content,
                category: res.memory.category,
                original_score: res.score,
                system_one_score: base_sys1,
                final_score,
                confidence,
                rationale: format!(
                    "System One calibrated match ratio {:.0}% + embedding baseline {:.1}",
                    token_ratio * 100.0,
                    original_normalized
                ),
            }
        })
        .collect();

    // Sort descending by final_score
    reranked.sort_by(|a, b| b.final_score.partial_cmp(&a.final_score).unwrap_or(std::cmp::Ordering::Equal));

    reranked
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::Memory;

    #[test]
    fn test_rerank_memories_ordering() {
        let m1 = Memory {
            id: "1".to_string(),
            content: "We use Postgres and Rust for backend development".to_string(),
            category: "project".to_string(),
            embedding: None,
            workspace_id: None,
            created_at: 0,
            updated_at: 0,
        };
        let m2 = Memory {
            id: "2".to_string(),
            content: "I like drinking hot coffee in the morning".to_string(),
            category: "preference".to_string(),
            embedding: None,
            workspace_id: None,
            created_at: 0,
            updated_at: 0,
        };

        let results = vec![
            SearchResult { memory: m2, score: 0.85 },
            SearchResult { memory: m1, score: 0.80 },
        ];

        let reranked = rerank_memories("backend rust development", results);
        assert_eq!(reranked.len(), 2);
        assert_eq!(reranked[0].memory_id, "1"); // m1 should be reranked to first place!
        assert!(reranked[0].final_score > reranked[1].final_score);
    }
}
