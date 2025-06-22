const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');
  
  try {
    // Create default roles
    console.log('Creating default roles...');
    const roles = await Promise.all([
      prisma.role.upsert({
        where: { name: 'admin' },
        update: {},
        create: {
          name: 'admin',
          description: 'System administrator with full access'
        }
      }),
      prisma.role.upsert({
        where: { name: 'doctor' },
        update: {},
        create: {
          name: 'doctor',
          description: 'Medical doctor with clinical access'
        }
      }),
      prisma.role.upsert({
        where: { name: 'nurse' },
        update: {},
        create: {
          name: 'nurse',
          description: 'Nurse with patient care access'
        }
      }),
      prisma.role.upsert({
        where: { name: 'auditor' },
        update: {},
        create: {
          name: 'auditor',
          description: 'Auditor with compliance monitoring access'
        }
      }),
      prisma.role.upsert({
        where: { name: 'analyst' },
        update: {},
        create: {
          name: 'analyst',
          description: 'Data analyst with reporting access'
        }
      }),
      prisma.role.upsert({
        where: { name: 'reviewer' },
        update: {},
        create: {
          name: 'reviewer',
          description: 'Authorization reviewer'
        }
      })
    ]);
    console.log(`✅ Created ${roles.length} roles`);

    // Create default permissions
    console.log('Creating default permissions...');
    const permissions = await Promise.all([
      // User management permissions
      prisma.permission.upsert({
        where: { resource_action: { resource: 'users', action: 'create' } },
        update: {},
        create: { resource: 'users', action: 'create', description: 'Create users' }
      }),
      prisma.permission.upsert({
        where: { resource_action: { resource: 'users', action: 'read' } },
        update: {},
        create: { resource: 'users', action: 'read', description: 'View users' }
      }),
      prisma.permission.upsert({
        where: { resource_action: { resource: 'users', action: 'update' } },
        update: {},
        create: { resource: 'users', action: 'update', description: 'Update users' }
      }),
      prisma.permission.upsert({
        where: { resource_action: { resource: 'users', action: 'delete' } },
        update: {},
        create: { resource: 'users', action: 'delete', description: 'Delete users' }
      }),
      // Case management permissions
      prisma.permission.upsert({
        where: { resource_action: { resource: 'cases', action: 'create' } },
        update: {},
        create: { resource: 'cases', action: 'create', description: 'Create cases' }
      }),
      prisma.permission.upsert({
        where: { resource_action: { resource: 'cases', action: 'read' } },
        update: {},
        create: { resource: 'cases', action: 'read', description: 'View cases' }
      }),
      prisma.permission.upsert({
        where: { resource_action: { resource: 'cases', action: 'update' } },
        update: {},
        create: { resource: 'cases', action: 'update', description: 'Update cases' }
      }),
      // Authorization permissions
      prisma.permission.upsert({
        where: { resource_action: { resource: 'authorizations', action: 'approve' } },
        update: {},
        create: { resource: 'authorizations', action: 'approve', description: 'Approve authorizations' }
      }),
      prisma.permission.upsert({
        where: { resource_action: { resource: 'authorizations', action: 'deny' } },
        update: {},
        create: { resource: 'authorizations', action: 'deny', description: 'Deny authorizations' }
      }),
      // Analytics permissions
      prisma.permission.upsert({
        where: { resource_action: { resource: 'analytics', action: 'read' } },
        update: {},
        create: { resource: 'analytics', action: 'read', description: 'View analytics' }
      })
    ]);
    console.log(`✅ Created ${permissions.length} permissions`);

    // Create default organization
    console.log('Creating default organization...');
    const organization = await prisma.organization.upsert({
      where: { taxId: 'TAX001-AUSTA' },
      update: {},
      create: {
        name: 'AUSTA Health System',
        type: 'provider',
        status: 'active',
        taxId: 'TAX001-AUSTA',
        metadata: {
          description: 'Default healthcare organization for AUSTA Cockpit',
          established: new Date().getFullYear()
        }
      }
    });
    console.log(`✅ Created organization: ${organization.name}`);

    // Create default admin user
    console.log('Creating default admin user...');
    const hashedPassword = await argon2.hash('admin123');
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@austa.com' },
      update: {
        password: hashedPassword
      },
      create: {
        email: 'admin@austa.com',
        name: 'System Administrator',
        firstName: 'System',
        lastName: 'Administrator',
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        organizationId: organization.id,
        isActive: true
      }
    });
    console.log(`✅ Created admin user: ${adminUser.email}`);

    // Assign admin role to admin user
    const adminRole = roles.find(r => r.name === 'admin');
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: adminUser.id,
          roleId: adminRole.id
        }
      },
      update: {},
      create: {
        userId: adminUser.id,
        roleId: adminRole.id
      }
    });

    // Assign all permissions to admin role
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: permission.id
          }
        },
        update: {},
        create: {
          roleId: adminRole.id,
          permissionId: permission.id
        }
      });
    }
    console.log(`✅ Assigned permissions to admin role`);

    // Create sample medical procedures
    console.log('Creating sample medical procedures...');
    const procedures = await Promise.all([
      prisma.procedure.upsert({
        where: { code: 'MRI001' },
        update: {},
        create: {
          code: 'MRI001',
          name: 'Brain MRI with Contrast',
          category: 'Imaging',
          subcategory: 'MRI',
          typicalDurationMinutes: 45,
          requiresPreauth: true,
          riskLevel: 'low',
          guidelines: {
            indications: ['Headache with neurological symptoms', 'Suspected brain tumor'],
            contraindications: ['Metallic implants', 'Pregnancy (first trimester)']
          }
        }
      }),
      prisma.procedure.upsert({
        where: { code: 'SURG001' },
        update: {},
        create: {
          code: 'SURG001',
          name: 'Knee Arthroscopy',
          category: 'Surgery',
          subcategory: 'Orthopedic',
          typicalDurationMinutes: 90,
          requiresPreauth: true,
          riskLevel: 'medium',
          guidelines: {
            indications: ['Meniscal tear', 'Ligament injury'],
            requirements: ['Pre-operative clearance', 'Anesthesia consultation']
          }
        }
      }),
      prisma.procedure.upsert({
        where: { code: 'LAB001' },
        update: {},
        create: {
          code: 'LAB001',
          name: 'Complete Blood Count',
          category: 'Laboratory',
          subcategory: 'Hematology',
          typicalDurationMinutes: 15,
          requiresPreauth: false,
          riskLevel: 'low',
          guidelines: {
            indications: ['Routine screening', 'Anemia evaluation']
          }
        }
      })
    ]);
    console.log(`✅ Created ${procedures.length} sample procedures`);

    // Create sample patients
    console.log('Creating sample patients...');
    const patients = await Promise.all([
      prisma.patient.upsert({
        where: { patientCode: 'PAT001' },
        update: {},
        create: {
          patientCode: 'PAT001',
          birthYear: 1985,
          gender: 'Female',
          insuranceType: 'PPO',
          riskCategory: 'low',
          chronicConditions: ['Hypertension'],
          metadata: {
            lastVisit: new Date().toISOString(),
            primaryPhysician: 'Dr. Smith'
          }
        }
      }),
      prisma.patient.upsert({
        where: { patientCode: 'PAT002' },
        update: {},
        create: {
          patientCode: 'PAT002',
          birthYear: 1960,
          gender: 'Male',
          insuranceType: 'HMO',
          riskCategory: 'medium',
          chronicConditions: ['Diabetes', 'Heart Disease'],
          metadata: {
            lastVisit: new Date().toISOString(),
            primaryPhysician: 'Dr. Johnson'
          }
        }
      })
    ]);
    console.log(`✅ Created ${patients.length} sample patients`);

    // Create fraud indicators
    console.log('Creating fraud indicators...');
    const fraudIndicators = await Promise.all([
      prisma.fraudIndicator.upsert({
        where: { name: 'Unusual Billing Pattern' },
        update: {},
        create: {
          name: 'Unusual Billing Pattern',
          category: 'Billing',
          severity: 'medium',
          active: true,
          detectionLogic: {
            rule: 'multiple_procedures_same_day',
            threshold: 5,
            description: 'Flags when more than 5 procedures are billed on the same day'
          }
        }
      }),
      prisma.fraudIndicator.upsert({
        where: { name: 'Duplicate Claims' },
        update: {},
        create: {
          name: 'Duplicate Claims',
          category: 'Claims',
          severity: 'high',
          active: true,
          detectionLogic: {
            rule: 'duplicate_claim_submission',
            lookbackDays: 30,
            description: 'Flags duplicate claims submitted within 30 days'
          }
        }
      })
    ]);
    console.log(`✅ Created ${fraudIndicators.length} fraud indicators`);

    // Create AI models
    console.log('Creating AI models...');
    const aiModels = await Promise.all([
      prisma.aIModel.upsert({
        where: { name_version: { name: 'Authorization Predictor', version: '1.0' } },
        update: {},
        create: {
          name: 'Authorization Predictor',
          version: '1.0',
          type: 'authorization',
          status: 'active',
          accuracyScore: 92.5,
          configuration: {
            algorithm: 'ensemble',
            features: ['patient_age', 'procedure_type', 'medical_history'],
            threshold: 0.8
          },
          deployedAt: new Date()
        }
      }),
      prisma.aIModel.upsert({
        where: { name_version: { name: 'Fraud Detector', version: '2.1' } },
        update: {},
        create: {
          name: 'Fraud Detector',
          version: '2.1',
          type: 'fraud_detection',
          status: 'active',
          accuracyScore: 88.3,
          configuration: {
            algorithm: 'neural_network',
            features: ['billing_pattern', 'provider_history', 'claim_frequency'],
            threshold: 0.75
          },
          deployedAt: new Date()
        }
      })
    ]);
    console.log(`✅ Created ${aiModels.length} AI models`);

    // Create API key for development
    console.log('Creating development API key...');
    const apiKey = await prisma.aPIKey.upsert({
      where: { key: 'dev-api-key-12345' },
      update: {},
      create: {
        name: 'Development API Key',
        key: 'dev-api-key-12345',
        isActive: true,
        permissions: ['read', 'write'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
      }
    });
    console.log(`✅ Created development API key: ${apiKey.name}`);

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  }
}

main()
  .then(async () => {
    console.log('\n🎉 Database seeding completed successfully!');
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('\n💥 Database seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });