#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Metadata {
    pub name: String,
    pub description: String,
    pub creator: Option<String>,
}

pub(crate) fn parse_markdown(content: &str, fallback_name: &str) -> Metadata {
    let frontmatter = frontmatter_lines(content);
    let name = scalar(frontmatter, "name").unwrap_or_else(|| fallback_name.to_string());
    let description = scalar(frontmatter, "description")
        .or_else(|| first_body_paragraph(content))
        .unwrap_or_default();
    let creator = ["author", "createdBy", "created_by", "created-by", "creator"]
        .iter()
        .find_map(|key| scalar(frontmatter, key));

    Metadata {
        name,
        description: collapse(&description, 500),
        creator,
    }
}

fn frontmatter_lines(content: &str) -> Option<&str> {
    let trimmed = content.trim_start_matches('\u{feff}').trim_start();
    let rest = trimmed.strip_prefix("---")?;
    let close = rest.find("\n---")?;
    Some(&rest[..close])
}

fn scalar(frontmatter: Option<&str>, wanted: &str) -> Option<String> {
    let lines: Vec<&str> = frontmatter?.lines().collect();
    for (index, line) in lines.iter().enumerate() {
        let Some((key, raw)) = line.split_once(':') else {
            continue;
        };
        if key.trim() != wanted {
            continue;
        }
        let raw = raw.trim();
        if raw == ">" || raw == "|" {
            let mut parts = Vec::new();
            for continuation in lines.iter().skip(index + 1) {
                if !continuation.starts_with([' ', '\t']) {
                    break;
                }
                let continuation = continuation.trim();
                if !continuation.is_empty() {
                    parts.push(continuation);
                }
            }
            return Some(parts.join(" "));
        }
        let value = raw.trim_matches(['"', '\'']).trim();
        return (!value.is_empty()).then(|| value.to_string());
    }
    None
}

fn first_body_paragraph(content: &str) -> Option<String> {
    let trimmed = content.trim_start_matches('\u{feff}').trim_start();
    let body = if let Some(rest) = trimmed.strip_prefix("---") {
        rest.find("\n---")
            .map(|close| &rest[close + 4..])
            .unwrap_or(trimmed)
    } else {
        trimmed
    };
    let mut parts = Vec::new();
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() {
            if !parts.is_empty() {
                break;
            }
        } else if !line.starts_with('#') {
            parts.push(line);
        }
    }
    (!parts.is_empty()).then(|| parts.join(" "))
}

fn collapse(value: &str, max_chars: usize) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max_chars)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_quoted_and_folded_frontmatter() {
        let parsed = parse_markdown(
            "---\nname: 'Release helper'\ndescription: >\n  Ships safely\n  with checks\ncreated_by: Ada\n---\n# Title",
            "fallback",
        );
        assert_eq!(parsed.name, "Release helper");
        assert_eq!(parsed.description, "Ships safely with checks");
        assert_eq!(parsed.creator.as_deref(), Some("Ada"));
    }

    #[test]
    fn falls_back_to_first_paragraph() {
        let parsed = parse_markdown(
            "# Context\n\nUseful project instructions.\nSecond line.\n\nMore.",
            "Project",
        );
        assert_eq!(parsed.name, "Project");
        assert_eq!(
            parsed.description,
            "Useful project instructions. Second line."
        );
    }
}
