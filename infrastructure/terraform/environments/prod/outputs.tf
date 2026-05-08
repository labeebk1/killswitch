output "alb_dns_name" {
  description = "ALB DNS name (before Route53 alias)"
  value       = module.alb_ec2.alb_dns_name
}

output "viewer_cloudfront_domain" {
  description = "CloudFront distribution domain for the viewer SPA"
  value       = module.cdn_spa.cloudfront_domain
}

output "spa_bucket_name" {
  description = "S3 bucket for viewer SPA assets"
  value       = module.cdn_spa.bucket_name
}

output "secret_arn" {
  description = "Secrets Manager ARN for the Claude OAuth refresh token"
  value       = module.secrets.secret_arn
  sensitive   = true
}

output "log_group_name" {
  description = "CloudWatch Log Group for the Node service"
  value       = module.observability.log_group_name
}

output "dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = module.observability.dashboard_name
}
