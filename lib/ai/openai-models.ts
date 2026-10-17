import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

/*
 * Modèles OpenAI de l'admin et paramètres de génération adaptés à chacun.
 * Remplaçables sans code par les variables SCRAPING_AI_MODEL et SCRAPING_AI_MODEL_LIGHT.
 */

/** Extractions complètes : pages d'événements, affiches, posts Instagram. */
export const AI_MODEL_FULL = process.env.SCRAPING_AI_MODEL || "gpt-6.1-sol";

/** Tâches légères : compléments d'une page déjà lue, tags, choix de catégorie. */
export const AI_MODEL_LIGHT = process.env.SCRAPING_AI_MODEL_LIGHT || "gpt-6-luna";

type GenerationParams = Pick<
  ChatCompletionCreateParamsNonStreaming,
  "temperature" | "max_completion_tokens" | "reasoning_effort"
>;

/**
 * Paramètres compatibles avec le modèle :
 * - anciens modèles (gpt-4o, gpt-4.1…) : température basse, sans raisonnement ;
 * - modèles qui acceptent `reasoning_effort: "none"` (GPT-6 Luna) : sans raisonnement, température gardée ;
 * - autres modèles à raisonnement (GPT-6.1 Sol, GPT-6 Astra, GPT-5…) : température imposée par le
 *   modèle, raisonnement « low », et marge de jetons car le raisonnement compte dans la limite.
 */
export function generationParams(
  model: string,
  { temperature, maxTokens }: { temperature: number; maxTokens: number },
): GenerationParams {
  if (/^(gpt-4|gpt-3\.5|chatgpt-4o)/i.test(model)) {
    return { temperature, max_completion_tokens: maxTokens };
  }
  if (/luna/i.test(model)) {
    return { reasoning_effort: "none", temperature, max_completion_tokens: maxTokens };
  }
  return { reasoning_effort: "low", max_completion_tokens: maxTokens + 2000 };
}
