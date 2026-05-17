import { Inngest } from "inngest";
import { EventSeverity } from "@/lib/sla";

type Events = {
  "sla/check": {
    data: {};
  };
  "retry/queue": {
    data: {};
  };
  "automation/failed": {
    data: {
      lead_id: string;
      workflow_name: string;
      error_message: string;
      payload: any;
      endpoint_url: string;
      retry_count: number;
      orchestration_id: string;
    };
  };
};

// Create a client to send and receive events
export const inngest = new Inngest({ id: "lead-automation" });
