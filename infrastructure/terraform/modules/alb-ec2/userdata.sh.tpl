#!/bin/bash
set -euo pipefail

# Bootstrap the Killswitch Node service on an Ubuntu 24.04 LTS (arm64) instance.

export DEBIAN_FRONTEND=noninteractive

# --- system deps ---
apt-get update -y
apt-get install -y curl unzip jq awscli

# --- CloudWatch agent ---
curl -sO https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/arm64/latest/amazon-cloudwatch-agent.deb
dpkg -i amazon-cloudwatch-agent.deb

cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'CWCONFIG'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/killswitch/app.log",
            "log_group_name": "${log_group_name}",
            "log_stream_name": "{instance_id}/app",
            "timezone": "UTC"
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "Killswitch",
    "metrics_collected": {
      "cpu": { "measurement": ["cpu_usage_active"], "metrics_collection_interval": 30 },
      "mem": { "measurement": ["mem_used_percent"], "metrics_collection_interval": 30 },
      "net": {
        "measurement": ["net_bytes_sent", "net_bytes_recv"],
        "metrics_collection_interval": 10
      }
    }
  }
}
CWCONFIG

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# --- Node 22 ---
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# --- app directory ---
mkdir -p /var/log/killswitch
mkdir -p /opt/killswitch

# --- pull Claude OAuth refresh token from Secrets Manager ---
aws secretsmanager get-secret-value \
  --region ${aws_region} \
  --secret-id "${secrets_arn}" \
  --query SecretString \
  --output text > /opt/killswitch/.env

chmod 600 /opt/killswitch/.env

# The actual app is deployed via the CI/CD pipeline (SSM RunCommand or CodeDeploy).
# This userdata only provisions the runtime; the app binary is not yet present.
echo "Bootstrap complete. Waiting for app deployment."
