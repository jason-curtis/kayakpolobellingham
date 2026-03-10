/**
 * Email sending via Groups.io API.
 * Three-step draft workflow: newdraft → updatedraft (set subject/body) → postdraft.
 */
import { logger } from "./logger";

const API_BASE = "https://groups.io/api/v1";
const GROUP_ID = 14099;

async function groupsIoPost(apiKey: string, endpoint: string, params: Record<string, string>): Promise<Response> {
  const form = new URLSearchParams(params);
  return fetch(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
}

async function assertOk(res: Response, endpoint: string): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error(
      { event: `groupsio_${endpoint}_error`, status: res.status, response: text },
      `groups.io ${endpoint} failed`,
    );
    throw new Error(`groups.io ${endpoint} failed: ${res.status} ${text}`);
  }
}

/**
 * Send a message to the groups.io group via API.
 * Requires an API key with posting permissions.
 */
export function createGroupsIoSender(apiKey: string) {
  return async function sendGroupsIoEmail(
    _to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    // Step 1: Create empty draft
    const draftRes = await groupsIoPost(apiKey, "newdraft", {
      group_id: String(GROUP_ID),
      draft_type: "draft_type_post",
    });
    await assertOk(draftRes, "newdraft");
    const draft = (await draftRes.json()) as { id: number };

    // Step 2: Set subject and body (API expects HTML)
    const htmlBody = body.replace(/\n/g, "<br>\n");
    const updateRes = await groupsIoPost(apiKey, "updatedraft", {
      draft_id: String(draft.id),
      subject,
      body: htmlBody,
    });
    await assertOk(updateRes, "updatedraft");

    // Step 3: Publish
    const postRes = await groupsIoPost(apiKey, "postdraft", {
      draft_id: String(draft.id),
    });
    await assertOk(postRes, "postdraft");

    logger.info({ event: "groupsio_send_ok", subject, draftId: draft.id }, "message sent to groups.io");
  };
}
