const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function resetDevUser() {
    const email = 'dev@example.com';
    const password = 'password';
    const username = 'devuser';
    
    try {
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });
        
        if (existingUser) {
            console.log('Deleting existing user...');
            await prisma.user.delete({
                where: { email }
            });
        }
        
        const passwordHash = await bcrypt.hash(password, 10);
        
        const user = await prisma.user.create({
            data: {
                username,
                email,
                password_hash: passwordHash
            }
        });
        
        console.log('Dev user created successfully:', user);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

resetDevUser();