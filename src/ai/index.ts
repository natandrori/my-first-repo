import { ClaudeProvider } from "./claude.js";
import type { LLMProvider } from "../types.js";

let _provider: LLMProvider | null = null;

export function getProvider(): LLMProvider {
  if (!_provider) {
    _provider = new ClaudeProvider();
  }
  return _provider;
}
