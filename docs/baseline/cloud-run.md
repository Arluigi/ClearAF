# Cloud Run API and Paubox Auth email

These commands are a manual release runbook, not a record of a production deployment. The API stays synthetic-demo-only under the repository's release policy. Use the BAA-covered Google Cloud project/account; hosting alone does not approve clinical use.

## First deploy and secrets

Install/authenticate the Google Cloud CLI and select an operator with permission to enable APIs, manage Artifact Registry/Cloud Run, create service accounts/secrets and grant secret access. The Cloud Build identity needs build/log/source-staging permissions and Artifact Registry Writer on the `unzit` repository. The deployer needs permission to act as `unzit-api@unzit-prod-514222.iam.gserviceaccount.com`. These are operator/build permissions; the runtime account gets only `roles/secretmanager.secretAccessor`, scoped to each named secret. Do not reuse an existing runtime account with unrelated grants.

1. From the repository root, review `backend/env.example` and `scripts/cloudrun-config.sh`. The manifest lists runtime names only; scripts never load dotenv files. `DIRECT_URL` is schema-tooling-only. Old JWT/AWS/S3 settings are no longer used by runtime Auth/Storage. `PORT` is supplied by Cloud Run; `NODE_ENV=production` and `TRUST_PROXY_HOPS=1` are ordinary container configuration passed with `--set-env-vars`, not secrets. Cloud Run has one Google front end proxy hop; Express uses that hop count to derive consent evidence from `req.ip`. Locally, `TRUST_PROXY_HOPS` defaults to `0`, ignoring forwarded addresses. Set it to a non-negative integer matching the deployed proxy path; the API rejects invalid values at startup. CORS and enrollment settings are provisioned through Secret Manager alongside credentials so configuration stays revision-bound.
   The integrated launch API also requires `BILLING_PROVIDER`, `BILLING_RETURN_ORIGIN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and the pinned `STRIPE_API_VERSION`; these names are included in the runtime manifest. `fake` is restricted to loopback development/test environments. The current other adapter is `stripe_test`, which accepts test keys only; live Stripe billing remains unavailable until a separately reviewed change. Never configure the fake adapter on Cloud Run.
2. After release approval, run `bash scripts/cloudrun-secrets.sh`. It enables Secret Manager and creates missing **empty** secret resources in `unzit-prod-514222`; it neither reads nor stores values. For each printed command, copy the corresponding value into the clipboard and run the command, for example:

   ```sh
   pbpaste | gcloud secrets versions add database-url --project=unzit-prod-514222 --data-file=-
   ```

   Set every manifest name, including CORS/enrollment configuration. Use the full dashboard signing secret (`v1,whsec_...`) for `SEND_EMAIL_HOOK_SECRET`. `PAUBOX_FROM` must use a sender/domain authorized by Paubox, such as `UNZIT <hello@tryunzit.com>`. The Paubox endpoint authenticates with `PAUBOX_API_KEY` alone; no username is needed. Clear the clipboard after entering values. No secret value belongs in shell arguments, source files or logs.
3. Record the current revision before replacing an existing service:

   ```sh
   gcloud run services describe unzit-api --project=unzit-prod-514222 --region=us-east1 --format='value(status.latestReadyRevisionName)'
   gcloud run services describe unzit-api --project=unzit-prod-514222 --region=us-east1 --format='yaml(status.traffic)'
   ```

4. After release approval, run `bash scripts/deploy-cloudrun.sh`. It enables Run, Artifact Registry, Secret Manager and Cloud Build; creates missing `unzit` Docker repository and `unzit-api` runtime account; grants access only to manifest secrets; builds and deploys. Repeated execution reuses resources. Each revision pins enabled numeric secret versions, selected at deploy time. Source upload uses the Docker context allowlist, so dotenv, dependency trees, tests and outputs never reach Cloud Build. Builds run on Cloud Build's Linux builder, rather than the developer Mac's architecture.
5. The script prints the service URL and checks `/health` and `/ready`. Expected: HTTP 200 from both. `/health` proves process liveness; `/ready` checks the database, Supabase Auth and private `patient-photos` bucket without clinical reads. A failed readiness check exits the script but does not automatically roll back traffic; investigate or use the recorded revision below. Verify authenticated synthetic-account flows before changing clients.

Deployment configuration: `us-east1`, service `unzit-api`, minimum 0 / maximum 3 instances per revision, 1 CPU, 512 MiB memory, 60-second request timeout, unauthenticated HTTP ingress with application authentication. Scaling to zero can cause cold starts. No database migration runs during image build or startup.

## Supabase Send Email hook

Before enabling delivery, open **Paubox Email API → Settings** and disable **Open Tracking**, **Click Tracking**, and **Unsubscribe Tracking / Global Unsubscribe Link** for this authentication sender. Paubox can add pixels and rewrite links independently of our templates. Inspect delivered synthetic HTML to confirm no pixel or rewritten verification URL. See [Paubox tracking settings](https://www.paubox.com/blog/click-tracking-added-to-paubox-email-api).

In the Supabase dashboard, open **Authentication → Hooks**, add a **Send Email** hook and choose the HTTPS/HTTP endpoint option. Use `https://<cloud-run-service-host>/api/auth-hooks/send-email`, generate the signing secret and put its full `v1,whsec_...` value into the `send-email-hook-secret` Secret Manager secret using the clipboard command above. Deploy a revision with that version before enabling the hook. Keep the Supabase Email provider enabled (the hook replaces SMTP, not the provider). Enable/save the hook, then verify signup and recovery with synthetic accounts. The hook replaces Supabase's normal Auth email sender; configure Auth's Site URL and allowed Redirect URLs for the intended clients.

The endpoint uses Standard Webhooks signatures over the raw body, rejecting missing, invalid or stale signatures. It sends short UNZIT HTML/text messages through Paubox with a five-second total request deadline, without health information, tracking pixels or token/address/body logging. Signup, recovery, magic link and invitation emails carry Supabase verification links and the configured redirect. Email changes send both confirmations when supplied by Supabase (the current address receives `token_hash_new`, the new address receives `token_hash`). Reauthentication sends the one-time code: Supabase's verification endpoint does not accept a `reauthentication` link type. Enable Supabase secure email change if confirmation at both addresses is required.

Paubox API acceptance is not proof of inbox delivery. Complete a hosted synthetic delivery test, including double-confirm email change and reauthentication, when a deployment is authorized. Review Paubox delivery status through its authorized dashboard; do not add logging of addresses, verification links or email bodies to the API. Hook retries may resend a message, so verify operational behavior during that test.

## Rollback and logs

Route all traffic back to the previously recorded, compatible revision:

```sh
gcloud run services update-traffic unzit-api --project=unzit-prod-514222 --region=us-east1 --to-revisions=PREVIOUS_REVISION=100
```

Then check `/health`, `/ready` and synthetic authorization. Keep the old revision's numeric secret versions enabled for rollback. Traffic rollback restores code and the revision's secret-version selections; it does not undo database or Supabase dashboard configuration changes. If needed, disable the Send Email hook in the dashboard to restore the previously configured sender, after confirming that sender is appropriate for the release.

Inspect operational logs with:

```sh
gcloud run services logs read unzit-api --project=unzit-prod-514222 --region=us-east1 --limit=50
```

Do not include secrets, links, recipient addresses or bodies in incident notes. The email hook deliberately returns generic failure messages rather than provider response bodies.

## Point clients at the service later

After API acceptance, change the Release endpoint in `ClearAF/Config/SupabaseConfig.swift` to `https://<cloud-run-service-host>/api` and ship the reviewed iOS Release build through the existing release process. Debug keeps its local configuration. Set the portal's build-time `NEXT_PUBLIC_API_URL` to the same HTTPS URL including `/api`, then rebuild/redeploy the portal. Add the portal's origin to `FRONTEND_URL` and deploy a new API revision. No client endpoint or current hosted setting is changed by this work.

Open items: map `api.tryunzit.com` and verify TLS/DNS before adopting it in clients or the hook; determine whether Supabase network restrictions require fixed outbound egress. If required, design Cloud NAT with a reserved IP and Cloud Run VPC egress separately. Neither custom-domain mapping nor fixed egress is required for this initial setup.

References: [Cloud Run deploy flags](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy), [Cloud Build submit and source filtering](https://docs.cloud.google.com/sdk/gcloud/reference/builds/submit), [Supabase Send Email hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), [Paubox Email API quickstart](https://docs.paubox.com/email-api/quickstart).

## Local verification (2026-11-09)

`cd backend && npm test && npm run build` passed: 258 tests, including 24 hook tests. Local host Node was 26.10.0; the image uses Node 24.22.2, matching CI's Node 24 major. `DOCKER_CONTEXT=colima-clearaf docker build -t unzit-api backend` succeeded on ARM64. A read-only container with dummy loopback database/Auth settings listened on `$PORT=8080`, returned HTTP 200 / `{"status":"healthy"}` at `/health`, and ran as UID 1000 (`node`). The smoke container was removed. Default `colima start` stalled at SSH; that default VM was stopped, and the already-running `clearaf` daemon was used without changing its existing containers.

Shell syntax and the upload allowlist were checked locally. No deployment/secret-provisioning commands ran; hosted readiness, Linux AMD64 Cloud Build, Supabase hook setup, real inbox delivery, domain mapping and fixed egress remain unverified. The unchanged dependency lockfile produced npm audit notices during image installation/pruning: 8 vulnerabilities (2 moderate, 5 high, 1 critical); dependency remediation is outside this isolated packaging/hook change.

## Public access

The Workspace org enforces domain-restricted sharing, so an `allUsers` invoker binding is rejected. The service is made public with `--no-invoker-iam-check` instead; the API still authenticates every patient/clinician request itself. The image trusts the public Supabase Root 2021 CA (`backend/certs/`) via `NODE_EXTRA_CA_CERTS`, so pg verifies the pooler certificate. Cloud Build runs as the default compute service account with `roles/cloudbuild.builds.builder`.

## Hosted bootstrap

`backend/scripts/hosted-bootstrap.cjs` is the separate operator path for the migrated hosted database. The existing content, settings and waitlist scripts remain local-only. Run from the repository root after `cd backend && npm run build`. These commands do not apply migrations or deploy anything. All 12 active migrations must already be applied; the launch migration supplies the initial active settings row.

Populate credentials only from the environment, for example through Secret Manager in an authenticated operator shell. Disable shell tracing before accessing secrets; do not print the environment or store it in a dotenv file. Use the **session pooler on port 5432**, with database user `postgres.lhaqeeitxiynzcpqbwpb`; transaction pooling on 6543 is refused because clinician serialization needs session affinity. The script supplies `backend/certs/supabase-prod-ca-2021.crt` explicitly and verifies TLS. The Supabase HTTPS host and database username must both match the 20 lowercase letter `--project-ref`. Only Supabase database/session-pooler hosts are accepted; local targets must use the local scripts.

```sh
set +x
export DATABASE_URL="$(gcloud secrets versions access latest --secret database-url --project unzit-prod-514222)"
export SUPABASE_URL="$(gcloud secrets versions access latest --secret supabase-url --project unzit-prod-514222)"
export SUPABASE_SERVICE_ROLE_KEY="$(gcloud secrets versions access latest --secret supabase-service-role-key --project unzit-prod-514222)"
export STRIPE_SECRET_KEY="$(gcloud secrets versions access latest --secret stripe-secret-key --project unzit-prod-514222)"
node backend/scripts/hosted-bootstrap.cjs status --project-ref lhaqeeitxiynzcpqbwpb
```

`STRIPE_SECRET_KEY` is required for settings and must start with `sk_test_`; any supplied live key is refused. Status prints only the active content/settings versions, Stripe price IDs (no amounts or other price details), clinician/allowlist totals and migration count. It never prints addresses, content or credentials. Failures print a generic message with a controlled code; do not add raw provider error logging when investigating.

Set operator variables `CLINICIAN_EMAIL`, `PORTAL_RESET_URL`, `CARE_PRICE_ID`, `ALL_IN_PRICE_ID` and `WAITLIST_CSV` in that shell. `PORTAL_RESET_URL` must be the portal's HTTPS `/reset-password` URL, without credentials, query or fragment, and must be allowed in Supabase Auth Redirect URLs. Configure the Auth email hook before inviting; `--apply` sends an actual invitation. Use distinct active Stripe **test** USD monthly licensed per-unit prices of 3900 and 8900 cents; the script retrieves and validates both through Stripe's API, including during preview.

On an otherwise empty migrated database, run clinician, content, settings, then waitlist. First preview each write command by omitting `--apply`; previews read hosted state but do not invite or write. After the clinician command, set `CLINICIAN_ID` to its printed UUID for the settings command. Content discovers the sole clinician automatically and validates/publishes the explicitly selected committed catalog through the shared publisher. `--catalog-version` is required and must name an existing publication basename in `backend/src/content/catalogs/`. This preserves its **draft/pending-review** state and six inactive draft templates; publication does not constitute clinical approval.

```sh
node backend/scripts/hosted-bootstrap.cjs clinician --project-ref lhaqeeitxiynzcpqbwpb --email "$CLINICIAN_EMAIL" --redirect "$PORTAL_RESET_URL" --apply
node backend/scripts/hosted-bootstrap.cjs content --project-ref lhaqeeitxiynzcpqbwpb --catalog-version 2.0-pending-review --apply
node backend/scripts/hosted-bootstrap.cjs settings --project-ref lhaqeeitxiynzcpqbwpb --care-price "$CARE_PRICE_ID" --all-in-price "$ALL_IN_PRICE_ID" --care-cents 3900 --all-in-cents 8900 --clinician-id "$CLINICIAN_ID" --content-version 2.0-pending-review --apply
node backend/scripts/hosted-bootstrap.cjs waitlist "$WAITLIST_CSV" --project-ref lhaqeeitxiynzcpqbwpb --apply
node backend/scripts/hosted-bootstrap.cjs status --project-ref lhaqeeitxiynzcpqbwpb
```

Clinician first enables that address in the allowlist because the Auth trigger requires it, then invites with the supplied redirect and ensures the fixture-compatible dermatologist/profile rows. The Auth trigger also creates a launch case; the bootstrap leaves it intact. It refuses a different existing clinician, multiple clinicians or mismatched Auth/application IDs. Reruns reuse the existing Auth user without sending another invitation, preserve existing profiles, and repair rows after a partial failure. Allowlisting and invitation precede the application-row transaction, so a failed command may leave either in place; retry the same command. Waitlist imports deduplicate/enable addresses and print counts only. Source paths resolving to dotenv or generated xcconfig files are refused.

Local verification (2026-11-09): `cd backend && npm test && npm run build` passed with synthetic environment configuration and credential-file reads blocked: 505 tests, including 18 hosted-bootstrap tests using injected fakes. The compiled shared content validator also passed an offline check that refused Prisma/dotenv imports. The local-only operator guards were preserved. No hosted bootstrap command was executed.
