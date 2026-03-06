/**
 * groups.io REST API client.
 * Fetches messages from the kayakpolobellingham group using the v1 API.
 */

const API_BASE = "https://groups.io/api/v1";

export interface GroupsIoMessage {
  id: number;
  msg_num: number;
  topic_id: number;
  subject: string;
  name: string;
  snippet: string;
  body: string;
  created: string;
  is_reply: boolean;
}

interface MessagesResponse {
  object: string;
  total_count: number;
  has_more: boolean;
  next_page_token: number;
  data: GroupsIoMessage[];
}

/** Fetch recent messages from the group, sorted newest-first. */
export async function fetchRecentMessages(
  apiKey: string,
  groupId: number,
  limit = 50,
): Promise<GroupsIoMessage[]> {
  const url = new URL(`${API_BASE}/getmessages`);
  url.searchParams.set("group_id", String(groupId));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort_field", "created");
  url.searchParams.set("sort_dir", "desc");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`groups.io API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as MessagesResponse;
  return json.data ?? [];
}

/** Decode common HTML entities in snippet text. */
export function decodeSnippet(snippet: string): string {
  return snippet
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\u00a0/g, " ");
}
