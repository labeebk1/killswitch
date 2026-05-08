terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "bonecho-tfstate"
    key            = "killswitch/prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "bonecho-tfstate-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "killswitch"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}

# ACM cert must be in us-east-1 for CloudFront
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "killswitch"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

module "dns_acm" {
  source = "../../modules/dns-acm"

  zone_name    = var.zone_name
  aws_region   = var.aws_region
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
}

module "alb_ec2" {
  source = "../../modules/alb-ec2"

  vpc_id             = var.vpc_id
  subnet_ids         = var.subnet_ids
  aws_region         = var.aws_region
  instance_type      = var.instance_type
  ami_id             = var.ami_id
  key_name           = var.key_name
  alb_cert_arn       = module.dns_acm.alb_cert_arn
  api_zone_id        = module.dns_acm.zone_id
  api_hostname       = "api.${var.zone_name}"
  preview_hostname   = "preview.${var.zone_name}"
  log_group_name     = module.observability.log_group_name
  secrets_arn        = module.secrets.secret_arn

  depends_on = [module.dns_acm]
}

module "cdn_spa" {
  source = "../../modules/cdn-spa"

  zone_name          = var.zone_name
  viewer_hostname    = var.zone_name
  cf_cert_arn        = module.dns_acm.cf_cert_arn
  zone_id            = module.dns_acm.zone_id

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  depends_on = [module.dns_acm]
}

module "secrets" {
  source = "../../modules/secrets"

  aws_region    = var.aws_region
  ec2_role_name = module.alb_ec2.instance_role_name
}

module "observability" {
  source = "../../modules/observability"

  aws_region        = var.aws_region
  ec2_instance_id   = module.alb_ec2.instance_id
  ec2_role_name     = module.alb_ec2.instance_role_name
  alb_arn_suffix    = module.alb_ec2.alb_arn_suffix
}
