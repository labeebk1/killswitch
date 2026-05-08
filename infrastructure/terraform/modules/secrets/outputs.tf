output "secret_arn" { value = aws_secretsmanager_secret.claude_oauth.arn }
output "secret_name" { value = aws_secretsmanager_secret.claude_oauth.name }
