# Secrets Manager — Claude OAuth refresh token
#
# D3 default: shared Bonecho team seat. The server fetches this token at startup
# and uses it when issuing slot-key credentials to competitors. The token is
# written manually (or via a rotate script) — Terraform only provisions the
# placeholder; the actual value is set out-of-band.

resource "aws_secretsmanager_secret" "claude_oauth" {
  name        = "killswitch/prod/claude-oauth-refresh-token"
  description = "Claude subscription OAuth refresh token (shared Bonecho team seat)"

  recovery_window_in_days = 7
}

# Placeholder — real value set manually after `terraform apply`
resource "aws_secretsmanager_secret_version" "claude_oauth_placeholder" {
  secret_id = aws_secretsmanager_secret.claude_oauth.id
  secret_string = jsonencode({
    CLAUDE_REFRESH_TOKEN = "REPLACE_ME"
  })

  lifecycle {
    # Never overwrite after the real token is set
    ignore_changes = [secret_string]
  }
}

# Grant EC2 read access
resource "aws_iam_role_policy" "ec2_secrets" {
  name = "killswitch-read-secrets"
  role = var.ec2_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.claude_oauth.arn
    }]
  })
}
