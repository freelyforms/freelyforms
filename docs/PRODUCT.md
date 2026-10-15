# Product Definition

## Problem
Traditional form builders usually own the response database. Users either accept platform limits, pay for higher submission/storage tiers, or export data into tools they already use.

Google users already have a capable data environment:

- Sheets for structured data;
- Drive for files;
- Docs for document generation;
- Gmail for mail workflows;
- Apps Script / Workspace integrations;
- Looker Studio and third-party automation tools.

The product should make that infrastructure pleasant to use without forcing users to build forms and workflows manually.

## Core promise

1. Build a professional form visually.
2. Publish it instantly.
3. Responses go to the owner's Google Sheet.
4. Files go to the owner's Google Drive.
5. The owner can leave at any time with their data intact.

## Target users

Initial broad segments:

- freelancers and consultants;
- small businesses;
- agencies;
- schools, clubs and non-profits;
- operations teams;
- event organisers;
- developers who want a form endpoint without maintaining a response DB;
- Google Workspace-heavy organisations.

## Core use cases

- contact and lead forms;
- quote requests;
- customer intake;
- registrations;
- surveys and feedback;
- job applications;
- onboarding forms;
- internal requests;
- approvals;
- order/request forms;
- checklists and inspections;
- document generation inputs.

## Differentiators

### 1. User-owned response storage
Responses are stored in the owner's Google account rather than in a proprietary submission database.

### 2. Free-forever core
No artificial limits on the number of normal forms or responses. Abuse/rate limits remain necessary.

### 3. Open source
The code should be inspectable and self-hostable.

### 4. No data hostage
Export form definition as JSON. Response data already belongs to the user.

### 5. Google-native workflows
Sheets, Drive, Docs, Gmail and Workspace become building blocks rather than export destinations.

### 6. BYO infrastructure for expensive optional features
Examples:

- AI: user's OpenAI/Anthropic/Gemini/OpenRouter key;
- payments: user's Stripe account;
- outbound email: Gmail/SMTP/provider connection.

## Product modes

### Classic form
Traditional multi-field page layout.

### Conversational form
One-question-at-a-time flow using the same schema.

## Long-term platform direction

```text
Forms
  -> Sheets / Drive
  -> Documents
  -> Approvals
  -> Workflows
  -> Integrations
  -> Agents / MCP
```

The long-term product is not merely a form builder. It is a user-owned workflow layer for Google Workspace.
