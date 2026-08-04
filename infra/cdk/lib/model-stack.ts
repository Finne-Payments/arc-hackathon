/* ============================================================================
   Finné Model Stack (PRD Addendum A / FIN-100) — the self-hosted model service.

   A GPU EC2 instance running vLLM (OpenAI-compatible) in the same VPC as the
   backend. The backend reaches it over private DNS: http://model.finne.local:8000/v1.
   No external model API, no vendor key (P9/D7/FIN-102). The instance is in a
   private subnet with no public IP; access for ops is via SSM Session Manager.

   Served model is swappable by config (the swap rule, Addendum §G). Default
   Qwen/Qwen2.5-3B-Instruct (~3B, VRAM-safe on a single L4 / g5.xlarge). The
   weights are baked into a Docker image at build time (model/Dockerfile) so the
   instance does not re-download the model on boot — it builds the image once
   from the committed Dockerfile, then runs it.
   ========================================================================== */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

export interface FinneModelStackProps extends cdk.StackProps {
  /** The VPC shared with the app stack (private subnets, NAT egress). */
  vpc: ec2.Vpc;
  /** The backend's security group — the model allows ingress on :8000 only from it. */
  backendSg: ec2.SecurityGroup;
  /** Served model name (config only — swap by changing this + redeploying). */
  modelName?: string;
  /** Instance type. g5.xlarge = 1× L4 24GB (runs a 7B model comfortably). */
  instanceType?: string;
}

export class FinneModelStack extends cdk.Stack {
  /** The private DNS name the backend uses as MODEL_BASE_URL. */
  public readonly modelDnsName: string = "model.finne.local";

  constructor(scope: Construct, id: string, props: FinneModelStackProps) {
    super(scope, id, props);

    const modelName = props.modelName ?? "Qwen/Qwen2.5-3B-Instruct";
    const instanceType = ec2.InstanceType.of(
      ec2.InstanceClass.G5,
      (props.instanceType ?? "xlarge") as unknown as ec2.InstanceSize,
    );

    /* ── Security group: ingress :8000 from backend only ─────────────────── */
    const modelSg = new ec2.SecurityGroup(this, "ModelSg", {
      vpc: props.vpc,
      allowAllOutbound: true, // needs egress to pull the model from HuggingFace + apt
      description: "Self-hosted vLLM model service (P9/D7)",
    });
    modelSg.addIngressRule(props.backendSg, ec2.Port.tcp(8000), "From backend ECS");
    // SSM Session Manager for ops (no SSH key, no public IP needed).
    modelSg.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      "SSM (within VPC)",
    );

    /* ── IAM role: SSM managed instance (Session Manager access, no SSH) ──── */
    const instanceRole = new iam.Role(this, "ModelInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
      ],
    });

    /* ── User data: NVIDIA driver + Docker + vLLM ────────────────────────── */
    // Ubuntu 24.04 LTS deep-learning AMIs ship the NVIDIA driver; we use the
    // AWS DLAMI base via SSM parameter for the GPU + CUDA. Then build the
    // pre-baked vLLM image (model/Dockerfile) and run it with the GPU passed
    // through. Building the image bakes the weights in at BUILD time, so the
    // instance does not re-download the model on every boot — only on image
    // rebuild. This is the production equivalent of the compose pre-baked image.
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -eux",
      // NVIDIA driver — plain Ubuntu AMI doesn't ship one. The g5 instance has an
      // L4 GPU; the server-driver branch from ubuntu-drivers installs the matching
      // driver. Reboot is required after driver install.
      "apt-get update && apt-get install -y ubuntu-drivers-common",
      "ubuntu-drivers autoinstall",
      "systemctl reboot || true",
      // After reboot, the rest runs on next boot via a systemd one-shot unit.
      "cat > /etc/systemd/system/finne-model.service <<'UNIT'",
      "[Unit]",
      "Description=Build + run the Finné vLLM model service",
      "After=network-online.target docker.service",
      "Wants=network-online.target docker.service",
      "[Service]",
      "Type=oneshot",
      "RemainAfterExit=yes",
      "ExecStart=/usr/local/bin/finne-model-bootstrap.sh",
      "[Install]",
      "WantedBy=multi-user.target",
      "UNIT",
      "cat > /usr/local/bin/finne-model-bootstrap.sh <<'BOOTSTRAP'",
      "#!/usr/bin/env bash",
      "set -eux",
      "apt-get update && apt-get install -y docker.io",
      "mkdir -p /opt/finne-model && cd /opt/finne-model",
      // Write the Dockerfile inline (keeps the instance self-contained; the
      // committed copy lives at model/Dockerfile for local/CI builds). Keep this
      // in sync with model/Dockerfile when the base image or entrypoint changes.
      "cat > Dockerfile <<'DOCKERFILE'",
      `FROM vllm/vllm-openai:v0.7.3`,
      `ARG MODEL_NAME=${modelName}`,
      `ARG HF_HUB_TOKEN=""`,
      `ENV MODEL_NAME=\${MODEL_NAME} VLLM_MODEL=/models/\${MODEL_NAME} HF_HOME=/root/.cache/huggingface`,
      `USER root`,
      `RUN mkdir -p "\${VLLM_MODEL}" && \\`,
      `    huggingface-cli download "\${MODEL_NAME}" --local-dir "\${VLLM_MODEL}" \\`,
      `    \${HF_HUB_TOKEN:+--token "\${HF_HUB_TOKEN}"}`,
      `EXPOSE 8000`,
      `ENTRYPOINT vllm serve "$VLLM_MODEL"`,
      `CMD ["--port", "8000", "--max-model-len", "4096"]`,
      "DOCKERFILE",
      // Build once (downloads weights into the image), then run. --build-arg
      // passes the HF token only if present in the deployer's environment.
      `docker build -t finne-model:latest --build-arg MODEL_NAME="${modelName}" \\`,
      `  --build-arg HF_HUB_TOKEN="${process.env.HF_HUB_TOKEN ?? ""} .`,
      `docker run -d --name vllm --gpus all --restart unless-stopped -p 8000:8000 finne-model:latest`,
      // Wait for vLLM to be ready before signalling, but don't block boot forever.
      "timeout 300 bash -c 'until curl -sf http://localhost:8000/health; do sleep 5; done' || true",
      "BOOTSTRAP",
      "chmod +x /usr/local/bin/finne-model-bootstrap.sh",
      "systemctl enable --now finne-model.service",
    );

    /* ── EC2 instance in a private subnet (no public IP) ─────────────────── */
    const instance = new ec2.Instance(this, "ModelInstance", {
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType,
      // Ubuntu 24.04 AMI via the public SSM parameter (no live lookup at synth;
      // resolves at deploy time). The user-data installs the NVIDIA driver +
      // Docker; vLLM runs in a container with GPU passthrough.
      machineImage: ec2.MachineImage.fromSsmParameter(
        "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id",
      ),
      securityGroup: modelSg,
      role: instanceRole,
      userData: userData,
      userDataCausesReplacement: true, // model name change → new instance
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(100, { volumeType: ec2.EbsDeviceVolumeType.GP3 }),
        },
      ],
    });

    /* ── CloudMap private DNS so backend reaches http://model.finne.local ── */
    // A Route53 private hosted zone + a record pointing at the instance private IP.
    const zone = new route53.PrivateHostedZone(this, "ModelZone", {
      zoneName: "finne.local",
      vpc: props.vpc,
    });
    new route53.ARecord(this, "ModelRecord", {
      zone,
      recordName: "model",
      target: route53.RecordTarget.fromIpAddresses(instance.instancePrivateIp),
    });

    /* ── Outputs ─────────────────────────────────────────────────────────── */
    new cdk.CfnOutput(this, "ModelInstanceId", {
      value: instance.instanceId,
      description: "GPU EC2 instance running vLLM (SSM: aws ssm start-session --target <id>)",
    });
    new cdk.CfnOutput(this, "ModelDnsName", {
      value: this.modelDnsName,
      description: "Private DNS — set MODEL_BASE_URL=http://<this>:8000/v1 on the backend",
    });
    new cdk.CfnOutput(this, "ModelEndpoint", {
      value: `http://${this.modelDnsName}:8000/v1`,
      description: "The OpenAI-compatible model endpoint (reachable from the backend only)",
    });
  }
}
