# Observability — CloudWatch log group, metric filters, alarms, dashboard
#
# The Node service emits pino structured logs to stdout → CloudWatch Logs Agent
# and exposes /metrics (Prometheus text format).
# This module wires up:
#   1. Log group + retention
#   2. Metric filters for the four required day-one metrics
#   3. A CloudWatch dashboard for ops visibility
#   4. Basic alarms

resource "aws_cloudwatch_log_group" "app" {
  name              = "/killswitch/prod/app"
  retention_in_days = 30
}

# ----- IAM: allow EC2 to put custom metrics -----

resource "aws_iam_role_policy" "ec2_cloudwatch_metrics" {
  name = "killswitch-put-metrics"
  role = var.ec2_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "cloudwatch:PutMetricData",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ]
      Resource = "*"
    }]
  })
}

# ----- Metric filters (pino JSON log → CloudWatch metric) -----
# Metric 1: per-slot agent messages sent

resource "aws_cloudwatch_log_metric_filter" "agent_messages_sent" {
  name           = "killswitch-agent-messages-sent"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.event = \"agent.message_sent\" }"

  metric_transformation {
    name          = "AgentMessagesSent"
    namespace     = "Killswitch"
    value         = "1"
    default_value = "0"
    dimensions = {
      Slot    = "$.slot"
      MatchId = "$.matchId"
    }
  }
}

# Metric 2a: tunnel requests
resource "aws_cloudwatch_log_metric_filter" "tunnel_requests" {
  name           = "killswitch-tunnel-requests"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.event = \"tunnel.request\" }"

  metric_transformation {
    name          = "TunnelRequests"
    namespace     = "Killswitch"
    value         = "1"
    default_value = "0"
    dimensions = {
      Slot    = "$.slot"
      MatchId = "$.matchId"
    }
  }
}

# Metric 2b: tunnel p99 latency (emitted as durationMs by the server)
resource "aws_cloudwatch_log_metric_filter" "tunnel_latency" {
  name           = "killswitch-tunnel-latency"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.event = \"tunnel.response\" }"

  metric_transformation {
    name          = "TunnelLatencyMs"
    namespace     = "Killswitch"
    value         = "$.durationMs"
    default_value = "0"
    unit          = "Milliseconds"
    dimensions = {
      Slot = "$.slot"
    }
  }
}

# Metric 3: WS hub fan-out size
resource "aws_cloudwatch_log_metric_filter" "ws_fanout" {
  name           = "killswitch-ws-fanout"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.event = \"ws.fanout\" }"

  metric_transformation {
    name          = "WsFanoutSize"
    namespace     = "Killswitch"
    value         = "$.subscriberCount"
    default_value = "0"
    dimensions = {
      Channel = "$.channel"
    }
  }
}

# Metric 4: CLI heartbeat last-seen (emits age of last heartbeat in ms)
resource "aws_cloudwatch_log_metric_filter" "cli_heartbeat_age" {
  name           = "killswitch-cli-heartbeat-age"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.event = \"cli.heartbeat\" }"

  metric_transformation {
    name          = "CliHeartbeatAgeMs"
    namespace     = "Killswitch"
    value         = "$.ageMs"
    default_value = "0"
    unit          = "Milliseconds"
    dimensions = {
      Slot    = "$.slot"
      MatchId = "$.matchId"
    }
  }
}

# ----- Alarms -----

resource "aws_cloudwatch_metric_alarm" "high_tunnel_latency" {
  alarm_name          = "killswitch-high-tunnel-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "TunnelLatencyMs"
  namespace           = "Killswitch"
  period              = 60
  statistic           = "p99"
  threshold           = 2000
  alarm_description   = "Tunnel p99 latency > 2s for 2 minutes"
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "cli_heartbeat_stale" {
  alarm_name          = "killswitch-cli-heartbeat-stale"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CliHeartbeatAgeMs"
  namespace           = "Killswitch"
  period              = 60
  statistic           = "Maximum"
  threshold           = 35000
  alarm_description   = "CLI heartbeat not seen in >35s (reconnect window is 30s)"
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_host" {
  alarm_name          = "killswitch-unhealthy-host"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 30
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "ALB reports unhealthy targets"
  treat_missing_data  = "breaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }
}

# ----- Dashboard -----

resource "aws_cloudwatch_dashboard" "killswitch" {
  dashboard_name = "Killswitch"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "Tunnel Latency p99 (ms)"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["Killswitch", "TunnelLatencyMs", { stat = "p99", period = 60 }]
          ]
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "Agent Messages Sent (per slot)"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["Killswitch", "AgentMessagesSent", { stat = "Sum", period = 60 }]
          ]
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "WS Fan-out Size"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["Killswitch", "WsFanoutSize", { stat = "Maximum", period = 30 }]
          ]
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "CLI Heartbeat Age (ms)"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["Killswitch", "CliHeartbeatAgeMs", { stat = "Maximum", period = 30 }]
          ]
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "Tunnel Requests/min"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["Killswitch", "TunnelRequests", { stat = "Sum", period = 60 }]
          ]
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "ALB Healthy Hosts"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", "LoadBalancer", var.alb_arn_suffix, { stat = "Minimum", period = 30 }]
          ]
        }
      }
    ]
  })
}
