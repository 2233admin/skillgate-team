use serde::{Deserialize, Serialize};

use crate::{Result, RuntimeError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentHarness {
    Cursor,
    ClaudeCode,
    Codex,
}

impl AgentHarness {
    pub fn executable_name(self) -> &'static str {
        match self {
            Self::Cursor => "agent",
            Self::ClaudeCode => "claude",
            Self::Codex => "codex",
        }
    }
}

impl std::fmt::Display for AgentHarness {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Cursor => "cursor",
            Self::ClaudeCode => "claude-code",
            Self::Codex => "codex",
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HarnessModel {
    #[serde(rename = "auto")]
    Auto,
    #[serde(rename = "composer-2.5")]
    Composer25,
    #[serde(rename = "opus-4.8")]
    Opus48,
    #[serde(rename = "fable-5")]
    Fable5,
    #[serde(rename = "sonnet-5")]
    Sonnet5,
    #[serde(rename = "gpt-5-5")]
    Gpt55,
    #[serde(rename = "sonnet-4.6")]
    Sonnet46,
    #[serde(rename = "haiku-4.5")]
    Haiku45,
    #[serde(rename = "o3")]
    O3,
    #[serde(rename = "gpt-5-codex")]
    Gpt5Codex,
    #[serde(rename = "codex-mini")]
    CodexMini,
}

impl HarnessModel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Composer25 => "composer-2.5",
            Self::Opus48 => "opus-4.8",
            Self::Fable5 => "fable-5",
            Self::Sonnet5 => "sonnet-5",
            Self::Gpt55 => "gpt-5-5",
            Self::Sonnet46 => "sonnet-4.6",
            Self::Haiku45 => "haiku-4.5",
            Self::O3 => "o3",
            Self::Gpt5Codex => "gpt-5-codex",
            Self::CodexMini => "codex-mini",
        }
    }
}

impl std::fmt::Display for HarnessModel {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HarnessPolicy {
    pub harness: AgentHarness,
    pub models: &'static [HarnessModel],
    pub default_model: HarnessModel,
}

const CURSOR_MODELS: &[HarnessModel] = &[
    HarnessModel::Auto,
    HarnessModel::Composer25,
    HarnessModel::Opus48,
    HarnessModel::Fable5,
    HarnessModel::Sonnet5,
    HarnessModel::Gpt55,
];
const CLAUDE_MODELS: &[HarnessModel] = &[
    HarnessModel::Opus48,
    HarnessModel::Fable5,
    HarnessModel::Sonnet5,
    HarnessModel::Sonnet46,
    HarnessModel::Haiku45,
];
const CODEX_MODELS: &[HarnessModel] = &[
    HarnessModel::O3,
    HarnessModel::Gpt5Codex,
    HarnessModel::CodexMini,
];

impl HarnessPolicy {
    pub fn for_harness(harness: AgentHarness) -> Self {
        match harness {
            AgentHarness::Cursor => Self {
                harness,
                models: CURSOR_MODELS,
                default_model: HarnessModel::Auto,
            },
            AgentHarness::ClaudeCode => Self {
                harness,
                models: CLAUDE_MODELS,
                default_model: HarnessModel::Opus48,
            },
            AgentHarness::Codex => Self {
                harness,
                models: CODEX_MODELS,
                default_model: HarnessModel::O3,
            },
        }
    }

    pub fn validate(&self, model: HarnessModel) -> Result<()> {
        if self.models.contains(&model) {
            Ok(())
        } else {
            Err(RuntimeError::UnsupportedModel {
                harness: self.harness.to_string(),
                model: model.to_string(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_agentdex_model_policy_is_frozen() {
        assert_eq!(
            HarnessPolicy::for_harness(AgentHarness::Cursor).models,
            CURSOR_MODELS
        );
        assert_eq!(
            HarnessPolicy::for_harness(AgentHarness::ClaudeCode).models,
            CLAUDE_MODELS
        );
        assert_eq!(
            HarnessPolicy::for_harness(AgentHarness::Codex).models,
            CODEX_MODELS
        );
        assert_eq!(CURSOR_MODELS[0], HarnessModel::Auto);
        assert_eq!(CLAUDE_MODELS[0], HarnessModel::Opus48);
        assert_eq!(CODEX_MODELS[0], HarnessModel::O3);
    }

    #[test]
    fn rejects_a_model_from_another_harness() {
        let error = HarnessPolicy::for_harness(AgentHarness::Codex)
            .validate(HarnessModel::Auto)
            .unwrap_err();
        assert!(matches!(error, RuntimeError::UnsupportedModel { .. }));
    }
}
