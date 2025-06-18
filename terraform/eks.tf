# EKS Cluster
module "eks" {
  source = "terraform-aws-modules/eks/aws"
  
  cluster_name    = local.name
  cluster_version = var.cluster_version
  
  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  cluster_endpoint_public_access = true
  
  # EKS Managed Node Groups
  eks_managed_node_groups = {
    main = {
      name           = "${local.name}-main"
      instance_types = var.instance_types
      
      min_size       = var.min_size
      max_size       = var.max_size
      desired_size   = var.desired_size
      
      ami_type               = "AL2_x86_64"
      capacity_type          = "ON_DEMAND"
      disk_size              = 50
      force_update_version   = false
      
      # Taints for GPU workloads (AI service)
      taints = var.environment == "production" ? {
        ai-workload = {
          key    = "ai-workload"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      } : {}
      
      labels = {
        Environment = var.environment
        NodeGroup   = "main"
      }
      
      update_config = {
        max_unavailable_percentage = 33
      }
      
      # Security group rules
      remote_access = {
        ec2_ssh_key = aws_key_pair.eks_nodes.key_name
        source_security_group_ids = [aws_security_group.remote_access.id]
      }
    }
    
    # GPU node group for AI workloads (production only)
    gpu = var.environment == "production" ? {
      name           = "${local.name}-gpu"
      instance_types = ["g4dn.xlarge"]
      
      min_size     = 0
      max_size     = 3
      desired_size = 1
      
      ami_type               = "AL2_x86_64_GPU"
      capacity_type          = "SPOT"
      disk_size              = 100
      force_update_version   = false
      
      taints = {
        nvidia-gpu = {
          key    = "nvidia.com/gpu"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      }
      
      labels = {
        Environment = var.environment
        NodeGroup   = "gpu"
        "node.kubernetes.io/instance-type" = "gpu"
      }
      
      remote_access = {
        ec2_ssh_key = aws_key_pair.eks_nodes.key_name
        source_security_group_ids = [aws_security_group.remote_access.id]
      }
    } : {}
  }
  
  # Cluster access entry
  access_entries = {
    admin = {
      kubernetes_groups = []
      principal_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
      
      policy_associations = {
        admin = {
          policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = {
            type = "cluster"
          }
        }
      }
    }
  }
  
  # Cluster addons
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent    = true
      before_compute = true
      configuration_values = jsonencode({
        env = {
          ENABLE_PREFIX_DELEGATION = "true"
          WARM_PREFIX_TARGET       = "1"
        }
      })
    }
    aws-ebs-csi-driver = {
      most_recent              = true
      service_account_role_arn = module.ebs_csi_irsa_role.iam_role_arn
    }
  }
  
  tags = local.tags
}

# Key pair for SSH access to nodes
resource "tls_private_key" "eks_nodes" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "eks_nodes" {
  key_name   = "${local.name}-nodes"
  public_key = tls_private_key.eks_nodes.public_key_openssh
  
  tags = local.tags
}

# Store private key in AWS Systems Manager Parameter Store
resource "aws_ssm_parameter" "eks_nodes_private_key" {
  name  = "/${local.name}/eks/nodes/private-key"
  type  = "SecureString"
  value = tls_private_key.eks_nodes.private_key_pem
  
  tags = local.tags
}

# Security group for remote access
resource "aws_security_group" "remote_access" {
  name_prefix = "${local.name}-remote-access"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port = 22
    to_port   = 22
    protocol  = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }
  
  tags = merge(local.tags, {
    Name = "${local.name}-remote-access"
  })
}

# EBS CSI Driver IAM role
module "ebs_csi_irsa_role" {
  source = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  
  role_name             = "${local.name}-ebs-csi"
  attach_ebs_csi_policy = true
  
  oidc_providers = {
    ex = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }
  
  tags = local.tags
}

# AWS Load Balancer Controller IAM role
module "aws_load_balancer_controller_irsa_role" {
  source = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  
  role_name                              = "${local.name}-aws-load-balancer-controller"
  attach_load_balancer_controller_policy = true
  
  oidc_providers = {
    ex = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:aws-load-balancer-controller"]
    }
  }
  
  tags = local.tags
}

# Cluster Autoscaler IAM role
module "cluster_autoscaler_irsa_role" {
  source = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  
  role_name                        = "${local.name}-cluster-autoscaler"
  attach_cluster_autoscaler_policy = true
  cluster_autoscaler_cluster_names = [module.eks.cluster_name]
  
  oidc_providers = {
    ex = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:cluster-autoscaler"]
    }
  }
  
  tags = local.tags
}