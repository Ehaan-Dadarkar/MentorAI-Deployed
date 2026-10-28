// Tutor deep links (Frontend M15): Dashboard "Improve", KnowledgeGraph
// "STUDY CONCEPT" / "TUTOR", Quiz "DEPLOY AI TUTOR", and VoiceRecall
// "STUDY WITH AI TUTOR" all navigate to `/tutor?topic=...` or
// `/tutor?topics=...`, but Tutor never read the query string, so the
// topic was silently discarded and the user landed on a blank tutor.
// This module parses those params; Tutor.tsx applies the result by
// setting the store context (which the server sends as `Topic:` in the
// system prompt), prefilling the input with a sendable draft, and
// showing a dismissible topic banner. Nothing is auto-sent: an
// auto-send would spend a credit (or require a key) before the user
// has pressed send, which the credits UX must not do silently.

export const MAX_DEEP_LINK_TOPICS = 5;
export const MAX_DEEP_LINK_TOPIC_CHARS = 200;

function cleanTopics(raw: string[]): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const entry of raw) {
    const topic = entry.trim().slice(0, MAX_DEEP_LINK_TOPIC_CHARS).trim();
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
    if (topics.length >= MAX_DEEP_LINK_TOPICS) break;
  }
  return topics;
}

// `topics` (comma-joined weak concepts from VoiceRecall) takes
// precedence when present; a single `topic` is one entry even if it
// contains a comma (a topic name may legitimately contain one), so it
// is never split. Unknown params (e.g. Quiz's `context=quiz_weakness`)
// are ignored: the topic param already carries that link's intent.
export function parseTutorDeepLinkTopics(
  search: URLSearchParams | string,
): string[] {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const topicsParam = params.get("topics");
  if (topicsParam) {
    const topics = cleanTopics(topicsParam.split(","));
    if (topics.length > 0) return topics;
  }
  const topicParam = params.get("topic");
  if (topicParam) return cleanTopics([topicParam]);
  return [];
}

export function buildTutorDeepLinkPrompt(topics: string[]): string {
  if (topics.length === 1) {
    return `Help me improve my understanding of ${topics[0]}.`;
  }
  return `Help me improve my understanding of: ${topics.join(", ")}.`;
}
