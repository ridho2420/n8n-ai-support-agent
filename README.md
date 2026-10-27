# AI Customer Support Agent for Email and Chat (n8n)

Answers customer emails and chat messages for a small online store, using the store's help documents and order data. Anything the bot shouldn't decide on its own (complaints, refunds, order changes, skin reactions, questions the documents don't cover) goes to a person as an Airtable ticket with a Slack alert, and the customer still gets an honest reply right away. Every prompt change is re-tested on 23 fixed test cases.

> **Demo project.** Built for a fictional skincare store, *Saltgrove Skin*, and tested with fictional customers and orders. No real customer data was used.

**Demo video (3 min):** [watch it on LinkedIn](https://lnkd.in/p/gS6QV-T3)

![Support agent workflow in n8n](images/workflow-canvas.jpg)

## The problem

A small online store gets the same questions every day: where is my order, is this product vegan, how do I use it. Answering each one by hand takes hours. A bot that answers everything is worse: it makes up policies, promises refunds it can't give, and gives medical advice.

So the bot has two jobs. Answer what the store's documents and order data cover. Pass everything else to a person quickly, and never leave a customer without a reply.

## What it does

The main workflow (Workflow B) handles one message from start to finish:

| Stage | What happens |
|---|---|
| 1. Intake | A chat message or an email arrives (Gmail is checked every minute). Code reads the sender, removes quoted replies, skips the store's own emails and no-reply senders, and finds the order number with a fixed pattern |
| 2. Triage | Gemini sorts the message: category, urgency, complaint topic, sensitive or not. **Code then decides the route**: spam, answer, or pass to a person |
| 3. Answer | An AI agent searches the help documents (RAG on Supabase) and looks up orders. An order is only shown when the order number **and** the email match. It remembers the last 10 messages of the conversation |
| 4. Plan the ticket | Code reads the agent's handoff marker, removes it from the reply, and decides: new ticket, update the conversation's ticket, or nothing |
| 5. Ticket and alert | One conversation = one Airtable ticket. Slack `#support-escalations` gets an alert, urgent ones marked URGENT. Follow-up messages update the same ticket quietly |
| 6. Log and reply | Every message is logged to Supabase. The reply goes back to the chat, or into the same Gmail thread with a footer that says it was written by AI |

Two smaller workflows support it:

- **Workflow C, Daily Report:** every day at 5 pm Pacific, one Slack message for the owner: tickets still waiting, messages in the last 24 hours and what happened to them, the top complaints, and questions the help documents couldn't answer.
- **Error Alerts:** if any workflow crashes, `#automation-errors` gets the workflow, the node and the error.

```mermaid
flowchart LR
  E["Email (Gmail)"] --> R["Code: clean the message"]
  C["Chat"] --> R
  R --> T["Gemini: triage"]
  T --> D{"Code: route"}
  D -->|"spam"| LOG
  D -->|"a person is handling this thread"| Q["Bot stays quiet, Slack note"]
  D -->|"answer, or needs a person"| AG["AI agent: help docs + order lookup"]
  AG --> H{"Code: passed to a person?"}
  H -->|"yes"| TK["Airtable ticket + Slack alert"]
  H -->|"no"| LOG["Log to Supabase"]
  TK --> LOG
  LOG --> RP["Reply in chat or in the same email thread"]
```

### Design choices

- **AI sorts, code decides.** Triage only fills in fields. Who handles the message is decided by code with fixed rules, so the routing is predictable and easy to explain.
- **No answer means "I'll pass it on", not "no".** If the help documents don't mention something (a rewards program, for example), the bot doesn't say the store doesn't have one. It passes the question to the team. It only says "no" when a document says so, like "we don't have a physical store".
- **Handing off doesn't end the conversation.** The customer gets a holding reply with the next steps from the documents (for a damaged item: send a photo and the packing slip) and when the team will reply. They can keep asking other questions.
- **The bot steps aside when a person replies.** Every bot email gets the Gmail label *AI reply*. If the thread contains a sent email without that label, a person from the team has replied, so the bot stays quiet and tells the team in Slack.
- **Rules that must never be skipped live in code, not in the prompt.** The AI disclosure footer, the fixed reply to spam in chat, and (since prompt v4) the reminder to ask for an email address in chat are written by code.
- **No silent failures.** If the AI fails on an email, nothing is sent and Slack tells the team to reply by hand. If a step like Airtable or the log fails, the run continues and Slack reports it.

## What it looks like

An order question by email. The order number and the sender's address match, so the bot answers in the same thread:

![Email reply with order status](images/email-order-reply.jpg)

A complaint. The bot doesn't promise a replacement. It passes the message to the team and asks for what the team will need:

![Holding reply to a complaint](images/email-complaint-reply.jpg)

What the team sees in Slack: a new ticket from chat, the customer's email added later, a new ticket from email, and a note when the customer writes again in a thread a person is handling (sender addresses blurred in this screenshot):

![Slack alerts for tickets](images/slack-tickets.jpg)

In chat, an order is only shown when the order number and the email match. The second question uses another customer's order number, so nothing is revealed:

<img src="images/chat-order-lookup.jpg" width="400" alt="Chat: order lookup">

A question the help documents don't cover goes to the team, and the bot asks for an email address so the team can reply:

<img src="images/chat-not-in-docs.jpg" width="400" alt="Chat: question not in the help docs">

The owner's daily report. Code does all the counting. AI only names the topics of unanswered questions, so the same question in different words lands in one group:

![Daily report in Slack](images/daily-report.jpg)

## Testing the agent

A chat demo can look good while the agent still fails in ways nobody sees. So the agent is tested on **23 fixed test cases** every time the prompt changes ([`evals/test-cases.json`](evals/test-cases.json)): order questions, a wrong email for an order, questions the docs don't cover, breastfeeding, a skin reaction, an address change, refunds, a chargeback threat, a request for a person, Spanish, spam, a prompt injection, and a two-message memory test.

The **Eval Runner** workflow sends each case through the real agent (Workflow B in eval mode: no ticket, Slack, email or log), then:

- **Code decides pass or fail** in four groups: routing (route, reason, category, urgency, topic), facts that must appear, things the reply must never say (made-up "no", promised refunds, "I'm a human", asking for an email it already has), and format (length, no markdown).
- **An AI judge only flags** claims the documents don't support, for a person to read. It never changes the score.
- Results go to n8n data tables, and a summary goes to Slack `#eval-runs`.

| Agent version | What changed | Passed |
|---|---|---|
| Before fixes | — | 19/23, 20/23 (2 runs) |
| Prompt v2 | Routines follow the documents, holding replies explain the policy, chat handoffs ask for an email | **18/23** |
| Prompt v3 | Handoff marker always on the last line, usage limits kept in routines, one language per reply | 21/23 |
| v4 (current) | Triage: a damaged item is a complaint unless a refund is asked for. Code adds the "ask for an email" reminder when it passes a chat without an email to the team | **23/23, 22/23** (2 runs) |

All runs are scored with the same criteria (version 3), October 20–21, 2026.

![Eval run summaries in Slack](images/eval-runs.jpg)

What the tests caught:

- **A fix that made things worse.** Prompt v2 asked the agent to *end* its reply by asking for an email. In two cases the agent then dropped the handoff marker. The reply said "I've passed your request to our team", but no ticket was created, so the customer would wait for a reply that never comes. The score dropped to 18/23 and the change never reached a customer.
- **A test that was wrong.** One check only accepted "1 to 3 *times* a week". The agent wrote "1 to 3 *evenings* a week", which is correct. Failed cases are read before they count as failures, the check was fixed, the criteria version went up, and all earlier runs were re-scored with the new version.
- **A prompt rule the model kept skipping.** Asking for an email in chat was in the prompt from the start, but it was still missed in some runs. In v4, when code passes a chat message without an email to the team, the Route code also writes the reminder into the agent's brief. No email request was missed in either v4 run.

The AI judge is not useful yet: 1 of 13 flags was right in the first run, 2 of 5 in the second, 0 of 5 in the v4 runs. It keeps flagging tracking dates that come from the order lookup, probably because it sees only the test's reference text, not the order data. For now, only the code checks count. Details, every failure, and known limits: [`evals/README.md`](evals/README.md).

## Test results

Measured on n8n 2.35.7 with free plans, October 2026.

| Test | Result |
|---|---|
| Help documents | 6 files → 23 searchable chunks. Uploading a file again replaces its old chunks |
| Order question by email | Answered in the same Gmail thread in 21 seconds (recorded demo run) |
| Email speed | Spam 7 seconds (the agent is never called). Answered or passed-on emails 11–43 seconds |
| Tickets from chat | 3 conversations, 6 messages → 3 tickets, 4 Slack alerts (1 URGENT), 0 duplicate tickets |
| Email channel | 4 test emails + 2 retests → 6 runs, all succeeded. 5 replies, all in the original thread. Spam: no reply, no ticket |
| A person takes over a thread | Customer writes again → the bot sends nothing, the ticket is updated, Slack gets one note. About 12 seconds |
| AI fails on an email | No email sent, Slack tells the team the customer has no reply, the message is logged as an error |
| A workflow crashes | 3 test crashes → 3 alerts in `#automation-errors`, each 1–2 seconds after the failure |
| Daily report | 41 messages in 24 hours → 1 Slack report. Topic labels: 1 Gemini call, 709 tokens. The scheduled run started on the minute |
| AI usage | A simple question: about 4,000 tokens. A skincare routine: 7,468 tokens, 3 agent calls, about 11 seconds |
| One eval run (23 cases) | About 100 Gemini calls. 9–11 minutes when Gemini is fast, 46 minutes when it's slow |
| Cost | $0 on free tiers |

## Tech stack

- **n8n** 2.35.7, self-hosted
- **Google Gemini** `gemini-3.5-flash-lite` for triage (temperature 0), the agent (0.3) and the eval judge (0). `gemini-embedding-001` for the help documents
- **Supabase**: Postgres with pgvector for the help documents, the demo orders, the message log and the chat memory
- **Airtable** for tickets
- **Slack** bot with only the `chat:write` scope
- **Gmail** as the support inbox (trigger, reply in thread, labels)
- **n8n Data tables** for the test cases and eval results

## How I built this

I built this with Claude (Anthropic) as my pair programmer. Claude wrote most of the workflow logic, the Code nodes, the prompts, the 23 test cases and this README, and applied changes in n8n through the n8n MCP server. I made the product decisions: the bot keeps the conversation going after it passes something to a person, one conversation means one ticket, photos sent later alert the team, and a prompt-injection test passes as long as the bot makes nothing up. I set up Gmail, Supabase, Airtable, Slack and Google Cloud from scratch, connected everything in n8n, tested it in chat and by email, and played both the customer and the support person in the demo. Every failed eval case was read before deciding whether the agent or the test was wrong.

## How to run it

### 1. Accounts and keys

- **Supabase.** Create a project and run [`database/supabase-setup.sql`](database/supabase-setup.sql) in the SQL Editor. It creates the help document table with the search function, the 15 demo orders, and the message log, with row level security on.
- **Airtable.** Create a base with a table named `Tickets`. Field names and select options must match exactly, lowercase included:

  | Field | Type | Options |
  |---|---|---|
  | Ticket | Autonumber | |
  | Status | Single select | `Open` (default), `In progress`, `Resolved` |
  | Urgency | Single select | `urgent`, `normal` |
  | Category | Single select | `question`, `order_change`, `complaint`, `refund_request`, `other` |
  | Topic | Single select | `shipping_delay`, `missing_package`, `damaged_or_wrong_item`, `skin_reaction`, `product_not_suitable`, `billing_or_subscription`, `duties_or_fees`, `service`, `other`, `none` |
  | Escalation reason | Single select | `urgent`, `sensitive_topic`, `order_change`, `refund_request`, `complaint`, `asked_for_human`, `not_in_docs` |
  | Channel | Single select | `chat`, `email` |
  | Customer name, Order number, Session ID, Other open tickets | Single line text | |
  | Customer email | Email | |
  | Summary, Customer message, AI reply sent | Long text | |
  | Created | Created time | |
  | Resolved at | Date | filled in by the team |

  Create a personal access token for that base with `data.records:read`, `data.records:write` and `schema.bases:read`.
- **Slack.** Create an app with the bot scope `chat:write`, install it, and invite it to four channels: `#support-escalations`, `#automation-errors`, `#daily-report` and `#eval-runs`. Copy each channel ID.
- **Google.** Use a Gmail account as the support inbox. In Google Cloud, enable the Gmail API and create an OAuth client for n8n. In Gmail, create a label named `AI reply`.
- **Gemini.** Get an API key from Google AI Studio.

### 2. Import and connect

1. In n8n, import the six files in [`workflows/`](workflows) (**Workflows → Import from File**). Start with `error-alerts.json`.
2. Create the credentials and select them in every node that shows a credential warning: Google Gemini (PaLM) API, Supabase API, Postgres, Airtable Personal Access Token, Slack API and Gmail OAuth2. For Postgres, use Supabase's **Session pooler** connection details (port 5432, SSL on).
3. In the settings of Workflows A, B and C, set **Error workflow** to *Saltgrove – Error Alerts*.
4. Replace the placeholders:

| Placeholder | Where | Value |
|---|---|---|
| `YOUR_AIRTABLE_BASE_ID`, `YOUR_TICKETS_TABLE_ID` | B: Find Other Open Tickets, Create Ticket, Update Ticket, Compose Slack, Collect Alerts · C: Read Open Tickets, Build Report | From the table's URL: `airtable.com/app…/tbl…` |
| `YOUR_SUPPORT_ESCALATIONS_CHANNEL_ID` | B: Slack: #support-escalations, Collect Alerts, Check Reply | Slack channel ID |
| `YOUR_AUTOMATION_ERRORS_CHANNEL_ID` | B: Collect Alerts, Check Reply · Error Alerts: Slack node | Slack channel ID |
| `YOUR_DAILY_REPORT_CHANNEL_ID` | C: Slack: #daily-report | Slack channel ID |
| `YOUR_EVAL_RUNS_CHANNEL_ID` | Eval Runner: Slack: #eval-runs | Slack channel ID |
| `YOUR_AI_REPLY_LABEL_ID` | B: Label AI Reply, Human Took Over?, Check Reply | The ID of the `AI reply` label (`Label_…`). A Gmail node with *Label → Get Many* lists it |
| `support@example.com` | B: Read Email (`SUPPORT_ADDRESS`) | Your support inbox address |
| `YOUR_SUPPORT_AGENT_WORKFLOW_ID` | Eval Runner: Run Support Agent | Pick *Saltgrove – Support Agent* from the list |
| `YOUR_EVAL_CASES_TABLE_ID`, `YOUR_EVAL_RESULTS_TABLE_ID`, `YOUR_EVAL_RUNS_TABLE_ID` | Eval Runner: Read Cases · Read Run Results, Save Result · Read Previous Runs, Save Run | Pick the data tables you create in section 5 |

Customer Care hours (Monday to Friday, 9 am to 5 pm Pacific) are set in the **Normalize** node, the agent's system message and the email footer. Change all three for another store.

### 3. Load the help documents

Open Workflow A, click **Execute workflow**, and upload the six files from [`help-docs/`](help-docs) in the form. The confirmation page shows how many chunks were stored (23 for these files).

### 4. Try it

- **Chat:** open Workflow B and use the chat panel. Try "Where is my order SG-10232? My email is liam.brooks@example.com", then "Do you have a rewards program?".
- **Email:** in `database/supabase-setup.sql` and in the **Demo Data** workflow, replace `jordan.ellis@example.com` with an address you can send from, and run Demo Data. Activate Workflow B, then email the support inbox: "Where is my order? SG-10241".
- **Daily report:** Demo Data also adds a made-up day of 32 messages. Run Workflow C by hand to see the report.

### 5. Run the evals

1. Create three n8n data tables. Create `p2_eval_cases_v3` with **Import CSV** from [`evals/test-cases.csv`](evals/test-cases.csv). Create `eval_results` and `eval_runs` with the columns listed in [`evals/README.md`](evals/README.md).
2. In the Eval Runner, write what changed in `NOTE` inside **Start Run**, then click **Execute workflow**. To test a few cases first, list their IDs in `ONLY`.
3. The check logic can be tested without n8n: `node evals/eval-check.test.js` checks it against 63 example replies (good and bad).

### 6. Go live

Activate Workflows B and C. To put the chat on a website, make the Chat Trigger public and embed n8n's chat widget. Your n8n instance must be reachable from the internet (a VPS, n8n Cloud, or a tunnel).

## Known limits and what I'd improve next

- **An honest opening when the docs have no answer.** For "Do you have a rewards program?", the bot passes the question on correctly, but doesn't first say it has no information about that. Next: one prompt rule and a check on that test case.
- **Skincare routines are the one case that's still shaky.** One v4 run left out how often to use the toner, and another put the moisturizer only in the evening routine (the check didn't catch that yet). Next: code returns the routine from a table and AI only picks the skin type. Answers that must always be the same are safer when they're not generated.
- **The AI judge needs the order data.** Send it the `lookup_order` result so it stops flagging correct tracking dates.
- **Holdout cases.** The same 23 cases were used to fix the prompt and to score it, so the fixes may fit the test too closely. All fixes were written as general rules, but 3–5 new cases used only for scoring would be a better guard.
- **Temperature 0 is not enough for stable triage.** One sentence added to the triage prompt changed the label of an unrelated test case.
- Public holidays aren't handled in the Customer Care hours yet.
- An email address given in chat isn't verified.
- The agent sees attachment file names, not their content. The files stay in Gmail for the team.
- If a customer comes back to the same chat after the ticket is resolved, the message is added to the old ticket.
- Gemini's free tier allows 15 requests per minute and 500 per day. The Eval Runner waits 15 seconds between cases.
- While a Google OAuth app is in *Testing* status, the Gmail login expires every 7 days. Reconnect the credential, or publish the OAuth app.

## Files

```
workflows/workflow-a-load-help-docs.json   Workflow A: upload help docs into Supabase (form)
workflows/workflow-b-support-agent.json    Workflow B: the support agent (chat + email)
workflows/workflow-c-daily-report.json     Workflow C: daily report in Slack
workflows/error-alerts.json                Slack alert when a workflow crashes
workflows/eval-runner.json                 Runs the 23 test cases and scores them
workflows/demo-data.json                   Resets the demo orders and a demo day of messages
database/supabase-setup.sql                Tables, search function and demo orders
help-docs/                                 The store's 6 help documents
evals/test-cases.json                      The 23 test cases with their checks
evals/test-cases.csv                       The same cases, for an n8n data table
evals/eval-check.js                        The code checks (same as the Check node)
evals/eval-check.test.js                   Tests for the checks: 63 example replies
evals/README.md                            Eval design, every run, and known limits
images/                                    Screenshots
```

No credentials are included. IDs of my own accounts are replaced with placeholders.

## About

Built by **Ridho Subkhan**, AI automation with n8n. [LinkedIn](https://www.linkedin.com/in/ridho-subkhan/) · [GitHub](https://github.com/ridho2420)
