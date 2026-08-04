#!/usr/bin/env node
/* ============================================================================
   Finné CDK app entry point.
   Bootstraps and deploys the FinneStack to us-east-1.
   ========================================================================== */

import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { FinneStack } from "../lib/finne-stack";

// Target account/region are read from the environment (AWS_ACCOUNT_ID /
// AWS_REGION / CDK_DEFAULT_* set by the local AWS profile or CI), never
// hardcoded in the repo. See the .env / .env.example at the repo root.
const account = process.env.AWS_ACCOUNT_ID ?? process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1";
if (!account) {
  throw new Error(
    "AWS_ACCOUNT_ID is not set. Export it (or run with an AWS profile) before synth/deploy."
  );
}

const app = new cdk.App();

// For the hackathon, use locally-built Docker images (CDK builds them via
// `docker build` against the Dockerfiles in the repo). For production, these
// would be ECR image refs after a CI push.
const backendImage = ecs.ContainerImage.fromAsset("../..", {
  file: "backend/Dockerfile",
});

const webImage = ecs.ContainerImage.fromAsset("../..", {
  file: "web/Dockerfile",
});

new FinneStack(app, "FinneStack", {
  env: { account, region },
  backendImage,
  webImage,
  tags: {
    Project: "Finne",
    Stage: "staging",
  },
});
