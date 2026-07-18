require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@ucr-erp.local';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    const password = await bcrypt.hash('Admin@123', 10);
    await prisma.user.create({
      data: {
        name: 'System Admin',
        email: adminEmail,
        password,
        role: 'ADMIN',
      },
    });
    console.log(`Created admin user: ${adminEmail} / Admin@123`);
  } else {
    console.log('Admin user already exists, skipping.');
  }

  const vehicleCount = await prisma.vehicle.count();
  if (vehicleCount === 0) {
    await prisma.vehicle.createMany({
      data: [
        {
          regNumber: 'KA01AB1234',
          make: 'Toyota',
          model: 'Etios',
          year: 2021,
          category: 'Sedan',
          seatingCapacity: 4,
          fuelType: 'PETROL',
          transmission: 'MANUAL',
          dailyRate: 2000,
          hourlyRate: 150,
          odometer: 32000,
        },
        {
          regNumber: 'KA01CD5678',
          make: 'Maruti Suzuki',
          model: 'Ertiga',
          year: 2022,
          category: 'MUV',
          seatingCapacity: 7,
          fuelType: 'DIESEL',
          transmission: 'MANUAL',
          dailyRate: 2800,
          hourlyRate: 200,
          odometer: 18500,
        },
        {
          regNumber: 'KA05EF9012',
          make: 'Hyundai',
          model: 'Verna',
          year: 2023,
          category: 'Sedan',
          seatingCapacity: 4,
          fuelType: 'PETROL',
          transmission: 'AUTOMATIC',
          dailyRate: 3200,
          hourlyRate: 250,
          odometer: 9000,
        },
      ],
    });
    console.log('Seeded sample vehicles.');
  }

  const driverCount = await prisma.driver.count();
  if (driverCount === 0) {
    await prisma.driver.createMany({
      data: [
        {
          name: 'Ramesh Kumar',
          phone: '9000000001',
          licenseNumber: 'DL-0001-2020',
          status: 'ACTIVE',
          salary: 18000,
        },
        {
          name: 'Suresh Babu',
          phone: '9000000002',
          licenseNumber: 'DL-0002-2019',
          status: 'ACTIVE',
          salary: 18000,
        },
      ],
    });
    console.log('Seeded sample drivers.');
  }

  const customerCount = await prisma.customer.count();
  if (customerCount === 0) {
    await prisma.customer.create({
      data: {
        name: 'Anita Sharma',
        email: 'anita.sharma@example.com',
        phone: '9111111111',
        licenseNumber: 'MH12-2018-0099887',
      },
    });
    console.log('Seeded sample customer.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
