# n8n Operational Orchestration Setup

This document details the configuration of the **Dynamic Workflow Orchestration Engine** within n8n.

## 1. Webhook Intake Logic

**Webhook Node Configuration:**
- **Method**: `POST`
- **Path**: `leads-orchestration`
- **Response**: `200 OK` (Immediate response to Next.js to avoid blocking).

## 2. Branching by Operational Invariant

The Next.js intake engine passes `decay_status` and `urgency_score`. Use an **If Node** or **Switch Node** in n8n to branch the workflow logic:

### Branch A: HOT Leads (`urgency_score > 80`)
- **Action**: Immediate SMS/Email alert to the priority agent pool.
- **Action**: Instant auto-response email with personalized property link.
- **Action**: Wait 15 minutes -> Check if status is still 'New Lead' -> Escalate to Manager.

### Branch B: COLD/WARM Leads (`urgency_score < 50`)
- **Action**: Send standard inquiry acknowledgment.
- **Action**: Add to 7-day email nurture sequence.

### Branch C: HIGH_RISK Leads (`decay_status = 'HIGH_RISK'`)
- **Action**: Immediate internal Slack/Discord alert for "SLA BREACH".
- **Action**: Re-assign to a different agent.

## 3. Automation Health Feedback Loop

To maintain the **Automation Health Dashboard**, the n8n workflow should ideally send status updates back to the platform if it fails.

**Error Handling Node:**
If any node in n8n fails:
1. Add an **Error Trigger** node.
2. Connect it to an **HTTP Request** node.
3. **Method**: `POST`
4. **URL**: `YOUR_APP_URL/api/webhooks/automation-sync` (Future implementation)
5. **Body**: 
   ```json
   {
     "lead_id": "{{$node[\"Webhook\"].json[\"body\"][\"id\"]}}",
     "workflow_name": "Lead Intake Workflow",
     "status": "Failed",
     "error_message": "{{$error.message}}"
   }
   ```

## 4. Daily Operational Audit (Cron)

**Schedule Trigger**: Every day at 08:00 AM.
**Postgres Node**: 
- **Query**: 
  ```sql
  SELECT * FROM leads 
  WHERE status = 'New Lead' 
  AND created_at < NOW() - INTERVAL '4 hours'
  AND decay_status != 'HIGH_RISK';
  ```
- **Action**: Update these leads to `HIGH_RISK` via a Postgres update node or an HTTP call to a Next.js Server Action to trigger a `SLA Breach` event.

---
*By following this branching strategy, the system ensures that high-value revenue opportunities (HOT leads) are never neglected while maintaining low-cost automation for cold leads.*
