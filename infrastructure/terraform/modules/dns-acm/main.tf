# DNS + ACM module
#
# Creates:
#   - Route53 hosted zone for killswitch.bonecho.ai
#   - ACM cert in primary region for ALB (api.*, preview.*)
#   - ACM cert in us-east-1 for CloudFront (killswitch.bonecho.ai)
#   Both certs use DNS validation so Terraform can auto-validate.

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

locals {
  zone_name = var.zone_name
}

resource "aws_route53_zone" "main" {
  name = local.zone_name
}

# ----- ALB cert (primary region) -----

resource "aws_acm_certificate" "alb" {
  domain_name               = "*.${local.zone_name}"
  subject_alternative_names = [local.zone_name]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "alb_validation" {
  for_each = {
    for dvo in aws_acm_certificate.alb.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }

  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.value]
}

resource "aws_acm_certificate_validation" "alb" {
  certificate_arn         = aws_acm_certificate.alb.arn
  validation_record_fqdns = [for r in aws_route53_record.alb_validation : r.fqdn]
}

# ----- CloudFront cert (must be us-east-1) -----

resource "aws_acm_certificate" "cf" {
  provider                  = aws.us_east_1
  domain_name               = "*.${local.zone_name}"
  subject_alternative_names = [local.zone_name]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cf_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cf.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }

  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.value]
}

resource "aws_acm_certificate_validation" "cf" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cf.arn
  validation_record_fqdns = [for r in aws_route53_record.cf_validation : r.fqdn]
}
