/**
 * Email sending via Groups.io API.
 * Uses the groups.io sendmessage endpoint to post directly to the group.
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
    const formData = new URLSearchParams();
    formData.set("group_id", String(GROUP_ID));
    formData.set("subject", subject);
    formData.set("body", body);

    const res = await fetch(`${API_BASE}/sendmessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.error(
        { event: "groupsio_send_error", status: res.status, response: text },
        "groups.io sendmessage failed",
      );
      throw new Error(`groups.io sendmessage failed: ${res.status} ${text}`);
    }

    logger.info({ event: "groupsio_send_ok", subject }, "message sent to groups.io");
  };
}
