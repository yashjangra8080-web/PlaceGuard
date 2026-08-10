# PlaceGuard coding rules

- Keep eligibility, authorization, deadlines, and shortlist mutations in trusted database RPCs; the frontend is presentation only.
- Never trust a browser-provided role, timestamp, eligibility result, or authorization decision.
- Keep `audit_commits` append-only and tamper-evident. Do not describe it as immutable or as a blockchain.
- Do not add direct client INSERT/UPDATE/DELETE policies for audit data, approvals, or final shortlists.
- Any new privileged workflow must validate the actor from `auth.uid()`, use server time, record an audit event, and create an anomaly when blocked or suspicious.
- Never expose service-role, OpenAI, or other private keys through `VITE_` variables or client bundles.
- Run `npm run lint`, `npm test`, and `npm run build` after substantive changes. Review `git diff --check` before commits.
