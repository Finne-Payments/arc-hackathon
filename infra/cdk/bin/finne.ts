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
const backendImage = ecs.ContainerImage.fromRegistry(`${ECR_URI}:backend`);
const webImage = ecs.ContainerImage.fromRegistry(`${ECR_URI}:web`);

// The self-hosted model endpoint (private DNS from the model stack). Passed to
// the app stack so the backend's MODEL_BASE_URL points at it. If MODEL_DEPLOY
// is "false", the app runs models-unplugged (FIN-105, P8).
const MODEL_DNS = "model.finne.local";
const deployModel = (process.env.MODEL_DEPLOY ?? "true") !== "false";
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
