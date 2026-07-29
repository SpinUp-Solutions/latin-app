import { seedAcceptanceData } from './fixtures/seed';

export default async function globalSetup() {
  await seedAcceptanceData();
}
