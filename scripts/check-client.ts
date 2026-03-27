import { db } from '../src/db/index.js';
import { onpremDeployments } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

const result = await db.select({
  clientName: onpremDeployments.clientName,
  clientStatus: onpremDeployments.clientStatus,
  nextScheduledPatchDate: onpremDeployments.nextScheduledPatchDate,
  currentVersion: onpremDeployments.currentVersion,
  environmentType: onpremDeployments.environmentType,
  maintenancePlan: onpremDeployments.maintenancePlan,
  firstDeploymentDate: onpremDeployments.firstDeploymentDate,
  lastPatchDate: onpremDeployments.lastPatchDate,
}).from(onpremDeployments).where(eq(onpremDeployments.id, '350335aa-eada-4c78-a0ac-9ac0b51250f2'));

console.log(JSON.stringify(result[0], null, 2));
