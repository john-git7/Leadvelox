graph TD
    A[User] -->|Interacts with| B(Next.js Frontend);

    subgraph Next.js Application
        B -->|Submits Forms / UI Interactions| C[Server Actions app/actions];
        B -->|Fetches Data| D[Next.js API Routes app/api];
        C -->|Authentication & Data Operations| E[Supabase Client/Server lib/supabase];
        C -->|Triggers Background Jobs| F[Inngest Client inngest/client.ts];
    end

    subgraph Backend Services
        E -->|Manages DB, Auth, Storage| G(Supabase Backend);
        F -->|Sends Events to| H(Inngest Platform);
        D -->|Handles Webhooks / Cron Calls| I[Inngest Functions inngest/functions.ts];
        D -->|Scheduled Tasks| J[Cron Endpoints app/api/cron];
        D -->|Orchestration Callbacks| K[Orchestration Endpoints app/api/orchestration];
        G -->|Database Operations| H;
        H -->|Processes Events / Runs Background Jobs| G;
        H -->|Interacts with External APIs| L(External Services CRM, Marketing Automation);
        J -->|Queries / Updates Data| G;
        K -->|Updates Workflow State| G;
    end

    subgraph Data Stores
        G --> M(Supabase Database);
    end

    L --> H;

    style A fill:#f9f,stroke:#333,stroke-width:2px
    style G fill:#bbf,stroke:#333,stroke-width:2px
    style H fill:#bbf,stroke:#333,stroke-width:2px
    style M fill:#ccf,stroke:#333,stroke-width:2px