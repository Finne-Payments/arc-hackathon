/* ============================================================================
   Finné CDK Stack (AWS-01, AWS-02, AWS-03).
   Provisions: VPC, ECS Fargate (backend + web), S3 evidence bucket,
   SQS queue + DLQ, KMS key, Secrets Manager, ALB, CloudWatch alarms.
   All in us-east-1, least-privilege, no static credentials.
   ========================================================================== */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as kms from "aws-cdk-lib/aws-kms";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";

export interface FinneStackProps extends cdk.StackProps {
  /** Docker images — built and pushed to ECR before deploy. */
  backendImage: ecs.ContainerImage;
  webImage: ecs.ContainerImage;
  /** The self-hosted model endpoint URL (private DNS from the model stack).
   *  Omit/leave "disabled" to run models-unplugged (FIN-105). */
  modelBaseUrl?: string;
}

export class FinneStack extends cdk.Stack {
  /** Exposed for cross-stack access (the model stack reuses the VPC + backend SG). */
  public vpc!: ec2.Vpc;
  public backendSg!: ec2.SecurityGroup;
  public cluster!: ecs.Cluster;

  constructor(scope: Construct, id: string, props: FinneStackProps) {
    super(scope, id, props);

    /* ======================================================================
       AWS-01: ECR repository (container images built + pushed by CI)
       The repo is part of the stack — no manual `aws ecr create-repository`.
       CI pushes :backend and :web tags here on every merge to main.
       ====================================================================== */
    const ecrRepo = ecr.Repository.fromRepositoryName(this, "FinneRepo", "finne");

    /* ======================================================================
       AWS-02: KMS key (encrypts S3 + SQS + secrets)
       ====================================================================== */
    const kmsKey = new kms.Key(this, "FinneKmsKey", {
      description: "Finné evidence encryption key",
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    /* ======================================================================
       AWS-02: S3 evidence bucket (private, versioned, KMS-encrypted)
       ====================================================================== */
    const evidenceBucket = new s3.Bucket(this, "EvidenceBucket", {
      bucketName: `finne-evidence-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kmsKey,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        { noncurrentVersionExpiration: cdk.Duration.days(90) },
      ],
    });

    /* ======================================================================
       AWS-02: SQS queue + DLQ (encrypted, visibility timeout, redrive)
       ====================================================================== */
    const dlq = new sqs.Queue(this, "JobDLQ", {
      queueName: "finne-jobs-dlq",
      encryptionMasterKey: kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const jobQueue = new sqs.Queue(this, "JobQueue", {
      queueName: "finne-jobs",
      visibilityTimeout: cdk.Duration.seconds(120),
      encryptionMasterKey: kmsKey,
      deadLetterQueue: { queue: dlq, maxReceiveCount: 8 },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    /* ======================================================================
       AWS-02: Secrets Manager — import the pre-created secret
       (created manually before deploy to hold Circle/Mongo/session secrets)
       ====================================================================== */
    const appSecrets = secretsmanager.Secret.fromSecretNameV2(this, "AppSecrets", "finne/app-secrets");

    /* ======================================================================
       AWS-01: VPC (public + private subnets for ECS)
       ====================================================================== */
    this.vpc = new ec2.Vpc(this, "FinneVpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "Private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    /* ======================================================================
       AWS-01: ECS cluster
       ====================================================================== */
    this.cluster = new ecs.Cluster(this, "FinneCluster", {
      clusterName: "finne",
      vpc: this.vpc,
      containerInsights: true,
    });

    /* ======================================================================
       AWS-03: Task execution role (pull from ECR, write logs, read secrets)
       ====================================================================== */
    const taskRole = new iam.Role(this, "FinneTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
      ],
    });

    // Grant the task access to S3, SQS, KMS, and Secrets
    evidenceBucket.grantReadWrite(taskRole);
    jobQueue.grantSendMessages(taskRole);
    jobQueue.grantConsumeMessages(taskRole);
    dlq.grantSendMessages(taskRole);
    kmsKey.grantEncryptDecrypt(taskRole);
    appSecrets.grantRead(taskRole);

    /* ======================================================================
       AWS-03: ALB (public, routes to backend + web)
       ====================================================================== */
    const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSg", {
      vpc: this.vpc,
      allowAllOutbound: true,
      description: "ALB security group",
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP");
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");

    const alb = new elbv2.ApplicationLoadBalancer(this, "FinneAlb", {
      vpc: this.vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    // Execution role for pulling ECR images + writing CloudWatch logs
    const execRole = new iam.Role(this, "FinneExecRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
      ],
    });
    ecrRepo.grantPull(execRole);
    // The execution role fetches secrets at task start (AWS-03). ECS uses it to
    // resolve the `secrets:` block on the container definition.
    appSecrets.grantRead(execRole);

    /* ======================================================================
       AWS-03: Backend Fargate service
       ====================================================================== */
    this.backendSg = new ec2.SecurityGroup(this, "BackendSg", {
      vpc: this.vpc,
      allowAllOutbound: true,
      description: "Backend service security group",
    });
    this.backendSg.addIngressRule(albSecurityGroup, ec2.Port.tcp(4000), "From ALB");

    const backendTaskDef = new ecs.FargateTaskDefinition(this, "BackendTaskDef", {
      memoryLimitMiB: 1024,
      cpu: 512,
      taskRole,
      executionRole: execRole,
    });

    backendTaskDef.addContainer("Backend", {
      image: props.backendImage,
      portMappings: [{ containerPort: 4000 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "finne-backend",
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
      environment: {
        NODE_ENV: "production",
        BACKEND_PORT: "4000",
        DEMO_MODE: "true",
        ARC_RPC_URL: "https://rpc.testnet.arc.io",
        ARC_CHAIN_ID: "5042002",
        ARC_USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
        CASE_REGISTRY_ADDRESS: "0x297730EaF53C95B9d8322b9Af5e48b47227D1e82",
        EVIDENCE_BUCKET: evidenceBucket.bucketName,
        SQS_QUEUE_URL: jobQueue.queueUrl,
        SQS_DLQ_URL: dlq.queueUrl,
        KMS_KEY_ID: kmsKey.keyId,
        // Self-hosted model service (P9/D7). Set by the model stack's CloudMap DNS.
        // When absent, the agent degrades to models-unplugged (FIN-105, P8).
        MODEL_BASE_URL: props.modelBaseUrl ?? "disabled",
        MODEL_NAME: "Qwen/Qwen2.5-3B-Instruct",
        MODEL_TIMEOUT_MS: "5000",
      },
      // Secrets pulled from Secrets Manager at task start (AWS-03). The
      // finne/app-secrets secret holds a JSON object with these keys; CI writes
      // them at deploy time. Secrets never appear in the CloudFormation template.
      secrets: {
        MONGO_URL: ecs.Secret.fromSecretsManager(appSecrets, "MONGO_URL"),
        SESSION_SECRET: ecs.Secret.fromSecretsManager(appSecrets, "SESSION_SECRET"),
        INTERNAL_TOKEN: ecs.Secret.fromSecretsManager(appSecrets, "INTERNAL_TOKEN"),
        CIRCLE_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, "CIRCLE_API_KEY"),
        CIRCLE_ENTITY_SECRET: ecs.Secret.fromSecretsManager(appSecrets, "CIRCLE_ENTITY_SECRET"),
        CIRCLE_WALLET_SET_ID: ecs.Secret.fromSecretsManager(appSecrets, "CIRCLE_WALLET_SET_ID"),
        REGISTRY_OPERATOR_PRIVATE_KEY: ecs.Secret.fromSecretsManager(appSecrets, "REGISTRY_OPERATOR_PRIVATE_KEY"),
      },
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:4000/health/live || exit 1"],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(15),
      },
    });

    const backendService = new ecs.FargateService(this, "BackendService", {
      cluster: this.cluster,
      taskDefinition: backendTaskDef,
      securityGroup: this.backendSg,
      desiredCount: 1,
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(30),
    });

    // ALB listener → backend on :4000 (the service IS the default target)
    const backendListener = alb.addListener("BackendListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [
        new elbv2.ApplicationTargetGroup(this, "BackendTargetGroup", {
          vpc: this.vpc,
          port: 4000,
          protocol: elbv2.ApplicationProtocol.HTTP,
          targets: [backendService],
          healthCheck: {
            path: "/health/live",
            interval: cdk.Duration.seconds(30),
            timeout: cdk.Duration.seconds(10),
            healthyThresholdCount: 2,
            unhealthyThresholdCount: 5,
          },
        }),
      ],
    });

    // Route /api/* path to the backend (so the web nginx proxy also works)
    backendListener.addTargets("BackendPathTarget", {
      priority: 10,
      conditions: [elbv2.ListenerCondition.pathPatterns(["/api/*", "/v1/*", "/health/*"])],
      port: 4000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [backendService],
    });

    /* ======================================================================
       AWS-03: Web Fargate service (nginx serving SPA + proxying /api)
       ====================================================================== */
    const webSg = new ec2.SecurityGroup(this, "WebSg", {
      vpc: this.vpc,
      allowAllOutbound: true,
      description: "Web service security group",
    });
    webSg.addIngressRule(albSecurityGroup, ec2.Port.tcp(80), "From ALB");

    const webTaskDef = new ecs.FargateTaskDefinition(this, "WebTaskDef", {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole: execRole,
    });

    webTaskDef.addContainer("Web", {
      image: props.webImage,
      portMappings: [{ containerPort: 80 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "finne-web",
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
      environment: {
        BACKEND_HOST: alb.loadBalancerDnsName,
      },
    });

    const webService = new ecs.FargateService(this, "WebService", {
      cluster: this.cluster,
      taskDefinition: webTaskDef,
      securityGroup: webSg,
      desiredCount: 1,
      assignPublicIp: false,
    });

    /* ======================================================================
       AWS-03: CloudWatch alarms
       ====================================================================== */
    new cloudwatch.Alarm(this, "BackendUnhealthyAlarm", {
      metric: backendService.metric("HealthyHostCount", { dimensions: { TargetGroup: "backend" } }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      alarmDescription: "Backend has no healthy hosts",
    });

    new cloudwatch.Alarm(this, "QueueDepthAlarm", {
      metric: jobQueue.metric("ApproximateNumberOfMessagesVisible"),
      threshold: 100,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: "Job queue depth > 100 messages",
    });

    new cloudwatch.Alarm(this, "DlqAlarm", {
      metric: dlq.metric("ApproximateNumberOfMessagesVisible"),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: "Messages in dead-letter queue",
    });

    /* ======================================================================
       Outputs (safe identifiers only — no secrets)
       ====================================================================== */
    new cdk.CfnOutput(this, "AlbUrl", {
      value: `http://${alb.loadBalancerDnsName}`,
      description: "Public URL for the Finné app",
    });

    new cdk.CfnOutput(this, "EcrRepoUri", {
      value: `${ecrRepo.repositoryUri}`,
      description: "ECR repository URI (push :backend and :web tags here)",
    });

    new cdk.CfnOutput(this, "EvidenceBucketName", {
      value: evidenceBucket.bucketName,
      description: "S3 evidence bucket name",
    });

    new cdk.CfnOutput(this, "JobQueueUrlOutput", {
      value: jobQueue.queueUrl,
      description: "SQS job queue URL",
    });

    new cdk.CfnOutput(this, "KmsKeyIdOutput", {
      value: kmsKey.keyId,
      description: "KMS key ID",
    });

    new cdk.CfnOutput(this, "SecretsArnOutput", {
      value: appSecrets.secretArn,
      description: "Secrets Manager ARN",
    });

    new cdk.CfnOutput(this, "BackendServiceArnOutput", {
      value: backendService.serviceArn,
      description: "Backend ECS service ARN",
    });

    new cdk.CfnOutput(this, "WebServiceArnOutput", {
      value: webService.serviceArn,
      description: "Web ECS service ARN",
    });
  }
}
