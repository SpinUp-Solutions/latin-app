import { deepStrictEqual } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentData, type DocumentSnapshot } from 'firebase-admin/firestore';
import {
  LEGACY_LEARNING_UNIT_FIELDS,
  planLegacyLearningUnitFieldRepair,
} from '../src/lib/learning-units/legacy-field-repair';
import { normalizeLearningUnit } from '../src/lib/learning-units/domain';
import { validateLessonProgression } from '../src/utils/lessonProgress';

const PRODUCTION_PROJECT_ID = 'latin-app-prod';
const TARGET_DOCUMENT_IDS = ['lesson-1757796411836', 'lesson-1753896166956', 'lesson-1752695094203'] as const;

type CommandOptions = {
  apply: boolean;
  backupDir: string;
  projectId: string;
};

type BeforeImage = {
  id: string;
  path: string;
  createTime: string;
  updateTime: string;
  data: DocumentData;
};

function usage() {
  return [
    'Usage:',
    '  npm run repair:legacy-learning-units -- --project latin-app-prod [--backup-dir PATH] [--apply]',
    '',
    'Without --apply, the command is read-only and prints the proposed field deletions.',
  ].join('\n');
}

export function parseCommandOptions(argv: string[]): CommandOptions {
  let apply = false;
  let backupDir = path.resolve('.prod-repair-backups');
  let projectId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    if (argument === '--project' || argument === '--backup-dir') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value\n\n${usage()}`);
      if (argument === '--project') projectId = value;
      else backupDir = path.resolve(value);
      index += 1;
      continue;
    }
    if (argument.startsWith('--project=')) {
      projectId = argument.slice('--project='.length);
      continue;
    }
    if (argument.startsWith('--backup-dir=')) {
      backupDir = path.resolve(argument.slice('--backup-dir='.length));
      continue;
    }
    if (argument === '--help' || argument === '-h') throw new Error(usage());
    throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
  }

  if (projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error(`Refusing to run: --project must explicitly equal ${PRODUCTION_PROJECT_ID}`);
  }
  return { apply, backupDir, projectId };
}

function timestampForFilename() {
  return new Date().toISOString().replaceAll(':', '-');
}

function toBeforeImage(snapshot: DocumentSnapshot): BeforeImage {
  if (!snapshot.exists || !snapshot.createTime || !snapshot.updateTime) {
    throw new Error(`Required document ${snapshot.ref.path} does not exist`);
  }
  return {
    id: snapshot.id,
    path: snapshot.ref.path,
    createTime: snapshot.createTime.toDate().toISOString(),
    updateTime: snapshot.updateTime.toDate().toISOString(),
    data: snapshot.data()!,
  };
}

function assertJsonRoundTrip(beforeImages: BeforeImage[]) {
  const serialized = JSON.stringify(beforeImages);
  deepStrictEqual(JSON.parse(serialized), beforeImages);
}

async function verifyProductionCollection(
  db: ReturnType<typeof getFirestore>,
  projectedDocuments: ReadonlyMap<string, DocumentData> = new Map()
) {
  const [allUnits, pathSnapshot] = await Promise.all([
    db.collection('lessons').get(),
    db.collection('learningPaths').doc('default').get(),
  ]);
  const failures: string[] = [];
  for (const snapshot of allUnits.docs) {
    try {
      normalizeLearningUnit(projectedDocuments.get(snapshot.id) ?? snapshot.data(), snapshot.id);
    } catch (error) {
      failures.push(`${snapshot.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Post-repair collection validation failed:\n${failures.join('\n')}`);
  }

  if (!pathSnapshot.exists) throw new Error('The production Learning Path does not exist');
  const unitIds = pathSnapshot.data()?.unitIds;
  if (!Array.isArray(unitIds)) throw new Error('The production Learning Path unitIds field is invalid');
  const unitSnapshots = unitIds.length
    ? await db.getAll(...unitIds.map(unitId => db.collection('lessons').doc(unitId)))
    : [];
  for (const snapshot of unitSnapshots) {
    if (!snapshot.exists) throw new Error(`Placed learning unit ${snapshot.id} does not exist`);
    const unit = normalizeLearningUnit(projectedDocuments.get(snapshot.id) ?? snapshot.data(), snapshot.id);
    if (unit.kind === 'lesson') {
      if (unit.type !== 'normal') throw new Error(`Placed lesson ${unit.id} is not a normal lesson`);
      const progressionErrors = validateLessonProgression(unit);
      if (progressionErrors.length > 0) {
        throw new Error(`Placed lesson ${unit.id} is incomplete: ${progressionErrors.join(' ')}`);
      }
    }
  }
  return { allUnitCount: allUnits.size, pathUnitCount: unitIds.length };
}

export async function runRepairCommand(options: CommandOptions) {
  const app = initializeApp(
    { credential: applicationDefault(), projectId: options.projectId },
    `legacy-learning-unit-repair-${Date.now()}`
  );
  try {
    const db = getFirestore(app);
    const refs = TARGET_DOCUMENT_IDS.map(id => db.collection('lessons').doc(id));
    const snapshots = await db.getAll(...refs);
    const beforeImages = snapshots.map(toBeforeImage);
    const plans = beforeImages.map(beforeImage => ({
      id: beforeImage.id,
      ...planLegacyLearningUnitFieldRepair(beforeImage.data, beforeImage.id),
    }));
    const summary = plans.map(plan => ({
      id: plan.id,
      status: plan.status,
      removedFields: plan.removedFields,
    }));
    const projectedDocuments = new Map(plans.map(plan => [plan.id, plan.repairedData]));
    const projectedVerification = await verifyProductionCollection(db, projectedDocuments);

    console.log(
      JSON.stringify(
        {
          mode: options.apply ? 'apply' : 'dry-run',
          projectId: options.projectId,
          summary,
          projectedVerification,
        },
        null,
        2
      )
    );
    if (!options.apply) return { applied: false, summary };

    assertJsonRoundTrip(beforeImages);
    await mkdir(options.backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(options.backupDir, `legacy-learning-unit-fields-${timestampForFilename()}.json`);
    await writeFile(
      backupPath,
      `${JSON.stringify(
        {
          formatVersion: 1,
          projectId: options.projectId,
          createdAt: new Date().toISOString(),
          approvedFields: LEGACY_LEARNING_UNIT_FIELDS,
          documents: beforeImages,
        },
        null,
        2
      )}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 }
    );

    await db.runTransaction(async transaction => {
      const currentSnapshots = await transaction.getAll(...refs);
      for (let index = 0; index < currentSnapshots.length; index += 1) {
        const current = currentSnapshots[index];
        const beforeImage = beforeImages[index];
        if (!current.exists || current.updateTime?.toDate().toISOString() !== beforeImage.updateTime) {
          throw new Error(`Document ${beforeImage.path} changed after backup; aborting without writes`);
        }
        deepStrictEqual(current.data(), beforeImage.data);
        const plan = planLegacyLearningUnitFieldRepair(current.data(), current.id);
        if (plan.status === 'clean') continue;
        transaction.update(
          current.ref,
          Object.fromEntries(plan.removedFields.map(field => [field, FieldValue.delete()]))
        );
      }
    });

    const verification = await verifyProductionCollection(db);
    console.log(JSON.stringify({ applied: true, backupPath, verification }, null, 2));
    return { applied: true, backupPath, summary, verification };
  } finally {
    await deleteApp(app);
  }
}

const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  Promise.resolve()
    .then(() => runRepairCommand(parseCommandOptions(process.argv.slice(2))))
    .catch(error => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      process.exitCode = 1;
    });
}
