// Usage: pnpm admin:create <email>
// Creates the admin account, or changes its password when the email already exists.
// The password is typed twice without echo. Without a TTY (host shell), ADMIN_PASSWORD is read
// from the environment instead.
import 'dotenv/config';
import {
  ADMIN_PASSWORD_MAX_LENGTH,
  ADMIN_PASSWORD_MIN_LENGTH,
  loginInputSchema,
} from '@tatamap/shared';
import { hashPassword } from '../src/auth/password';
import { createPrisma } from '../src/db';

/** Reads a line from the TTY without echoing it. */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') return finish();
        if (char === '\u0003') return finish(new Error('Cancelled'));
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const fromEnv = process.env.ADMIN_PASSWORD;
    if (!fromEnv) throw new Error('No TTY: set ADMIN_PASSWORD in the environment.');
    console.warn('Warning: reading the password from ADMIN_PASSWORD (no TTY).');
    return fromEnv;
  }
  const first = await readHidden('Password: ');
  const second = await readHidden('Repeat the password: ');
  if (first !== second) throw new Error('The two passwords differ.');
  return first;
}

async function main(): Promise<void> {
  const rawEmail = process.argv[2];
  if (!rawEmail) throw new Error('Usage: pnpm admin:create <email>');
  // Same normalisation as the login (trim-less, lower-cased), so the stored email always matches.
  const parsed = loginInputSchema.shape.email.safeParse(rawEmail);
  if (!parsed.success) throw new Error('Invalid email address.');
  const email = parsed.data;

  const password = await readPassword();
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH || password.length > ADMIN_PASSWORD_MAX_LENGTH) {
    throw new Error(
      `The password must have ${ADMIN_PASSWORD_MIN_LENGTH} to ${ADMIN_PASSWORD_MAX_LENGTH} characters.`,
    );
  }

  // `PRISMA_TARGET=test` targets the test database (same convention as the seed).
  const urlVariable = process.env.PRISMA_TARGET === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const databaseUrl = process.env[urlVariable];
  if (!databaseUrl) throw new Error(`${urlVariable} is required`);

  const passwordHash = await hashPassword(password);
  const prisma = createPrisma(databaseUrl);
  try {
    await prisma.admin.upsert({
      where: { email },
      create: { email, passwordHash },
      // Changing the password also revokes every session issued before.
      update: { passwordHash, sessionVersion: { increment: 1 } },
    });
  } finally {
    await prisma.$disconnect();
  }
  console.log(`Admin ${email} is ready.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
