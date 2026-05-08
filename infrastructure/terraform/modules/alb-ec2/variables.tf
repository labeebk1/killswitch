variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "aws_region" { type = string }
variable "instance_type" { type = string }
variable "ami_id" { type = string }
variable "key_name" { type = string; default = "" }
variable "alb_cert_arn" { type = string }
variable "api_zone_id" { type = string }
variable "api_hostname" { type = string }
variable "preview_hostname" { type = string }
variable "log_group_name" { type = string }
variable "secrets_arn" { type = string }
