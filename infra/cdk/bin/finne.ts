#!/usr/bin/env node
/* ============================================================================
   Finné CDK app entry point.
   Deploys two stacks to us-east-1:
     1. FinneStack      — VPC, ECS Fargate (backend+web), S3, SQS, KMS, ALB, ECR
     2. FinneModelStack — GPU EC2 running vLLM (the self-hosted model service)
   Uses pre-built ECR images (built + pushed by the deploy workflow / local).
   ========================================================================== */

import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { FinneStack } from "../lib/finne-stack";
import { FinneModelStack } from "../lib/model-stack";

const app = new cdk.App();

// Account + region: env vars (CI) with the synthed values as defaults (local).
const account = process.env.AWS_ACCOUNT_ID ?? "042122908120";
const region = process.env.AWS_REGION ?? "us-east-1";
const env = { account, region };

const ECR_URI = `${account}.dkr.ecr.${region}.amazonaws.com/finne`;

// Pre-built ECR images (CI pushes :backend and :web tags before deploy).
//
// IMAGE_TAG: the immutable per-build tag (the git SHA) that CI also pushes.
// Tagging the task definition by SHA — not the mutable :backend/:web tag — is
// what actually makes a deploy take effect: a mutable tag yields an unchanged
// task definition, so CloudFormation creates no new revision and ECS re-pulls
// a cached digest (the live bundle stayed stale across "successful" deploys
// for exactly this reason). With the SHA tag every push is a new image URI,
// forcing a new task definition revision and a real fresh pull. Defaults to
// the mutable tags for local synth where no SHA is available.
const imageTag = process.env.IMAGE_TAG;
const backendImage = ecs.ContainerImage.fromRegistry(`${ECR_URI}:${imageTag ? `backend-${imageTag}` : "backend"}`);
const webImage = ecs.ContainerImage.fromRegistry(`${ECR_URI}:${imageTag ? `web-${imageTag}` : "web"}`);

// The self-hosted model endpoint (private DNS from the model stack). The
// hackathon deployment uses Amazon Bedrock instead (MODEL_PROVIDER=bedrock in
// the backend task env), so the GPU model stack is OFF by default — no EC2 GPU
// instance, no vLLM, no HF download. Set MODEL_DEPLOY=true to bring it back.
const MODEL_DNS = "model.finne.local";
const deployModel = process.env.MODEL_DEPLOY === "true";
const modelBaseUrl = deployModel ? `http://${MODEL_DNS}:8000/v1` : "disabled";

// 1. App stack (backend + web). Depends on ECR images existing.
const appStack = new FinneStack(app, "FinneStack", {
  env,
  backendImage,
  webImage,
  modelBaseUrl,
  tags: { Project: "Finne", Stage: "staging" },
});

// 2. Model stack (GPU EC2 vLLM). Reuses the app stack's VPC + backend SG.
if (deployModel) {
  new FinneModelStack(app, "FinneModelStack", {
    env,
    vpc: appStack.vpc,
    backendSg: appStack.backendSg,
    modelName: process.env.MODEL_NAME ?? "Qwen/Qwen2.5-3B-Instruct",
    tags: { Project: "Finne", Stage: "staging", Component: "model" },
  });
}
