/**
 * Email sending via Groups.io API.
 * Uses the two-step draft workflow: newdraft → postdraft.
 */
import { logger } from "./logger";

const API_BASE = "https://groups.io/api/v1";
const GROUP_ID = 14099;

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
    // Step 1: Create a draft
    const draftForm = new URLSearchParams();
    draftForm.set("group_id", String(GROUP_ID));
    draftForm.set("subject", subject);
    draftForm.set("body", body);

    const draftRes = await fetch(`${API_BASE}/newdraft`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: draftForm.toString(),
    });

    if (!draftRes.ok) {
      const text = await draftRes.text().catch(() => "");
      logger.error(
        { event: "groupsio_draft_error", status: draftRes.status, response: text },
        "groups.io newdraft failed",
      );
      throw new Error(`groups.io newdraft failed: ${draftRes.status} ${text}`);
    }

    const draft = (await draftRes.json()) as { id: number };
    logger.info({ event: "groupsio_draft_created", draftId: draft.id, subject }, "draft created");

    // Step 2: Post the draft
    const postForm = new URLSearchParams();
    postForm.set("draft_id", String(draft.id));

    const postRes = await fetch(`${API_BASE}/postdraft`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: postForm.toString(),
    });

    if (!postRes.ok) {
      const text = await postRes.text().catch(() => "");
      logger.error(
        { event: "groupsio_post_error", status: postRes.status, response: text, draftId: draft.id },
        "groups.io postdraft failed",
      );
      throw new Error(`groups.io postdraft failed: ${postRes.status} ${text}`);
    }

    logger.info({ event: "groupsio_send_ok", subject, draftId: draft.id }, "message sent to groups.io");
  };
}
