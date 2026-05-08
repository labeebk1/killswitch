variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
}

variable "zone_name" {
  description = "Root hosted zone name"
  type        = string
  default     = "killswitch.bonecho.ai"
}

variable "vpc_id" {
  description = "VPC ID for EC2 and ALB"
  type        = string
}

variable "subnet_ids" {
  description = "At least two subnets in different AZs for ALB"
  type        = list(string)
}

variable "instance_type" {
  description = "EC2 instance type — see sizing notes in alb-ec2 module"
  type        = string
  default     = "c6gn.2xlarge"
}

variable "ami_id" {
  description = "Ubuntu 24.04 LTS arm64 AMI (us-east-1)"
  type        = string
}

variable "key_name" {
  description = "EC2 SSH key pair name for break-glass access"
  type        = string
  default     = ""
}
