output "alb_dns_name" { value = aws_lb.main.dns_name }
output "alb_arn_suffix" { value = aws_lb.main.arn_suffix }
output "instance_id" { value = aws_instance.app.id }
output "instance_role_name" { value = aws_iam_role.ec2.name }
