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

/** Message permalink for the kayakpolobellingham group. */
export function messageUrl(msgNum: number): string {
  return `https://groups.io/g/kayakpolobellingham/message/${msgNum}`;
}

/** Fetch all messages from the group, paginating through the full history. Oldest-first. */
export async function fetchAllMessages(
  apiKey: string,
  groupId: number,
  onPage?: (page: number, total: number) => void,
): Promise<GroupsIoMessage[]> {
  const all: GroupsIoMessage[] = [];
  let pageToken: number | undefined;
  let page = 0;

  while (true) {
    const url = new URL(`${API_BASE}/getmessages`);
    url.searchParams.set("group_id", String(groupId));
    url.searchParams.set("limit", "100");
    url.searchParams.set("sort_field", "created");
    url.searchParams.set("sort_dir", "asc");
    if (pageToken !== undefined) {
      url.searchParams.set("page_token", String(pageToken));
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`groups.io API error: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as MessagesResponse;
    const data = json.data ?? [];
    all.push(...data);
    page++;
    onPage?.(page, json.total_count);

    if (!json.has_more || data.length === 0) break;
    pageToken = json.next_page_token;
  }

  return all;
}

/** Fetch a single message by msg_num. Scans recent messages, then pages backward if needed. */
export async function fetchMessageByNum(
  apiKey: string,
  groupId: number,
  msgNum: number,
): Promise<GroupsIoMessage | null> {
  // First try: scan latest 100 messages (covers most recent lookups)
  const url = new URL(`${API_BASE}/getmessages`);
  url.searchParams.set("group_id", String(groupId));
  url.searchParams.set("limit", "100");
  url.searchParams.set("sort_field", "created");
  url.searchParams.set("sort_dir", "desc");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`groups.io API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as MessagesResponse;
  const found = json.data?.find((m) => m.msg_num === msgNum);
  if (found) return found;

  // Second try: page backward up to 2 more pages to find older messages
  if (json.has_more) {
    let pageToken = json.next_page_token;
    for (let page = 0; page < 2 && pageToken; page++) {
      const pageUrl = new URL(`${API_BASE}/getmessages`);
      pageUrl.searchParams.set("group_id", String(groupId));
      pageUrl.searchParams.set("limit", "100");
      pageUrl.searchParams.set("sort_field", "created");
      pageUrl.searchParams.set("sort_dir", "desc");
      pageUrl.searchParams.set("page_token", String(pageToken));

      const pageRes = await fetch(pageUrl.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!pageRes.ok) break;

      const pageJson = (await pageRes.json()) as MessagesResponse;
      const pageFound = pageJson.data?.find((m) => m.msg_num === msgNum);
      if (pageFound) return pageFound;
      if (!pageJson.has_more) break;
      pageToken = pageJson.next_page_token;
    }
  }

  return null;
}

/** Strip HTML tags, convert block elements to newlines, and decode entities. */
export function decodeSnippet(snippet: string): string {
  return snippet
    // Convert block-level tags to newlines before stripping
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|blockquote)>/gi, "\n")
    // Strip remaining HTML tags
    .replace(/<[^>]+>/g, "")
    // Decode HTML entities
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}
