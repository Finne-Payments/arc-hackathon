# AWS deployment — one-time setup (AWS-03)

The deploy pipeline (`.github/workflows/deploy.yml`) auto-deploys to AWS on
every push to `main`. This doc is the one-time bootstrap you do before the first
push: AWS account prep, the IAM deployer user, and the GitHub secrets.

> The CDK app is at `infra/cdk/`. Two stacks: `FinneStack` (backend + web on
> Fargate, ECR, S3, SQS, KMS, ALB) and `FinneModelStack` (GPU EC2 running vLLM).

## 1. Prerequisites

- An AWS account. The synthed account is `042122908120` in `us-east-1`
  (override via `AWS_ACCOUNT_ID` / `AWS_REGION` GitHub secrets).
- The AWS CLI installed locally (`aws --version`).
- `cdk bootstrap` run once in the target account/region (see step 3).

## 2. Create the deployer IAM user (minimal policy)

The GitHub Actions workflow authenticates as an IAM user (access key) with
permissions to: ECR, ECS, CloudFormation, SecretsManager, EC2, IAM, Route53,
S3, SQS, KMS, CloudWatch, VPC. Create it:

```bash
# Create the user
aws iam create-user --user-name finne-deployer

# Attach the minimal managed + inline policy (PowerBuilderAccess is the
# simplest for a hackathon; tighten to a least-privilege inline policy for prod)
aws iam attach-user-policy --user-name finne-deployer \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess  # placeholder

# For a hackathon, the fastest path is PowerUserAccess (no IAM user/group mgmt):
aws iam attach-user-policy --user-name finne-deployer \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess

# Create an access key (these go into GitHub secrets)
aws iam create-access-key --user-name finne-deployer
# → copy AccessKeyId + SecretAccessKey
```

For production, replace `PowerUserAccess` with a least-privilege inline policy
scoped to resources tagged `Project: Finne`.

## 3. CDK bootstrap (one-time per account/region)

CDK needs an S3 bucket + roles in the target account to deploy. Run once:

```bash
cd infra/cdk
npx cdk bootstrap aws://042122908120/us-east-1
# (replace with your account/region if different)
```

If the deployer user is in a *different* account than the target (the synth
warning about `sts:AssumeRole`), bootstrap with `--trust`:

```bash
npx cdk bootstrap aws://TARGET_ACCOUNT/us-east-1 \
  --trust DEPLOYER_ACCOUNT \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

## 4. Create the GitHub secrets

In the repo → **Settings → Secrets and variables → Actions → New repository
secret**, add each of these. The deploy workflow reads them.

### AWS credentials (for ECR/ECS/CDK)
| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | from step 2 |
| `AWS_SECRET_ACCESS_KEY` | from step 2 |
| `AWS_REGION` | `us-east-1` (or your region) |
| `AWS_ACCOUNT_ID` | `042122908120` (or your account) |

### App secrets (written to Secrets Manager `finne/app-secrets` at deploy time)
| Secret | Value |
|---|---|
| `MONGO_URL` | MongoDB Atlas connection string (TLS, least-priv user) |
| `SESSION_SECRET` | random ≥32 chars (`openssl rand -hex 32`) |
| `INTERNAL_TOKEN` | random ≥16 chars (`openssl rand -hex 16`) |
| `CIRCLE_API_KEY` | Circle API key (from Circle Console) |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret |
| `CIRCLE_WALLET_SET_ID` | Circle wallet set id |
| `REGISTRY_OPERATOR_PRIVATE_KEY` | the ONE Finné-held key (hash-anchor only) |

### Optional
| Secret | Value |
|---|---|
| `HF_HUB_TOKEN` | HuggingFace token (only for gated models; open Apache-2.0 weights need none) |

> The `finne/app-secrets` secret in AWS is **created automatically** on the
> first deploy (`create-secret` → falls back to `put-secret-value`). You do not
> need to create it manually.

## 5. First deploy

Push to `main`:

```bash
git push origin main
```

The workflow runs: gates → build/push ECR → sync secrets → `cdk deploy --all` →
force new deployment. Watch the **Actions** tab. On success, the workflow emits
a notice with the ALB URL (also in `GITHUB_STEP_SUMMARY`).

### Manual deploy (from your laptop)

```bash
# Set the env the CDK reads
export AWS_PROFILE=finne
export AWS_ACCOUNT_ID=042122908120
export AWS_REGION=us-east-1

# Build + push images first (CDK references them by tag)
aws ecr get-login-password | docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker build -t $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/finne:backend -f backend/Dockerfile .
docker build -t $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/finne:web -f web/Dockerfile .
docker push --all-tags $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/finne

# Deploy
npm run cdk:deploy
```

## 6. Operational notes

- **Force a redeploy without code change**: `aws ecs update-service --cluster finne --service FinneStack-BackendService --force-new-deployment`.
- **Model runtime (hackathon)**: the agent layer uses **Amazon Bedrock** (`amazon.nova-lite-v1:0`) via the ECS task role — IAM auth, no API key, no GPU instance. The `FinneModelStack` (GPU EC2 vLLM) is **off by default** (`MODEL_DEPLOY` unset / `false`). To bring it back, set `MODEL_DEPLOY=true` and switch the backend env to `MODEL_PROVIDER=openai-compatible` with `MODEL_BASE_URL=http://model.finne.local:8000/v1`.
- **Swap the Bedrock model**: change `MODEL_NAME` in the CDK task env (`infra/cdk/lib/finne-stack.ts`) and redeploy. Foundation models (Nova, Titan) need no console access request; Anthropic/Meta families need model access enabled in the Bedrock console first.
- **Run models-unplugged** (cheapest, agent degrades to templates): set `MODEL_PROVIDER=openai-compatible` + `MODEL_BASE_URL=disabled` in the task env and redeploy.
- **Tear down**: `npm run cdk:destroy` (both stacks; S3 buckets use `autoDeleteObjects`, EBS volumes destroy).

## 7. What the pipeline does NOT do

- **MongoDB Atlas**: `MONGO_URL` is an external Atlas connection string. No DocumentDB construct — you provision Atlas separately.
- **OIDC/Cognito**: `IDP_*` vars are documented but no Cognito construct yet (BE-04). Auth currently uses the JWT session.
- **HTTPS/TLS**: the ALB listens on :80 (HTTP) for the hackathon. Add a certificate + HTTPS listener for production.
