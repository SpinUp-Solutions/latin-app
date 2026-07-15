import { createHash } from 'node:crypto';
import type {
  DocumentData,
  DocumentSnapshot,
  Firestore,
  Query,
  QuerySnapshot,
  Transaction,
} from 'firebase-admin/firestore';
import { PRACTICE_CATEGORIES_COLLECTION, PRACTICE_CATEGORY_MEMBERSHIPS_COLLECTION } from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import type { Lesson, LessonSummary } from '@/src/types/lesson';
import type {
  PracticeCategory,
  PracticeCategoryLesson,
  PracticeCategoryMembership,
  PracticeCategoryStatus,
  PracticeCategoryWithCounts,
  PracticeLessonType,
} from '@/src/types/practice-category';
import { toLessonSummary } from '@/src/utils/lessonSummary';
import { isCategorisableLesson, normalizeCategoryName } from './domain';
import {
  practiceCategoryDocumentSchema,
  practiceCategoryMembershipDocumentSchema,
  type CreatePracticeCategoryInput,
  type UpdatePracticeCategoryInput,
} from './schemas';

export type PracticeCategoryErrorCode =
  | 'CATEGORY_NAME_CONFLICT'
  | 'CATEGORY_NOT_FOUND'
  | 'LESSON_ALREADY_EXISTS'
  | 'LESSON_NOT_FOUND'
  | 'INELIGIBLE_LESSON'
  | 'CATEGORY_TYPE_MISMATCH'
  | 'CATEGORY_ARCHIVED'
  | 'CATEGORY_NOT_ARCHIVED'
  | 'CATEGORY_NOT_EMPTY'
  | 'STALE_CATEGORY_ORDER'
  | 'STALE_LESSON_ORDER'
  | 'STALE_CATEGORY_DATA';

export class PracticeCategoryError extends Error {
  constructor(
    public readonly code: PracticeCategoryErrorCode,
    message: string,
    public readonly status: 400 | 404 | 409 = 400
  ) {
    super(message);
    this.name = 'PracticeCategoryError';
  }
}

export type LessonCategoryAssignments = {
  practiceCategoryIds: string[];
  practiceCategories: PracticeCategory[];
  memberships: PracticeCategoryMembership[];
};

export type PracticeCategoryLessonDetail = {
  category: PracticeCategoryWithCounts;
  lessons: PracticeCategoryLesson[];
};

type ReconcileInTransactionInput = {
  lessonId: string;
  lesson: DocumentData;
  desiredCategoryIds?: string[];
  actorId: string;
  requireCategorisable?: boolean;
};

const categoryTypeLabels: Record<PracticeLessonType, string> = {
  vocab: 'Vocabulary',
  'sentence-diagramming': 'Sentence Diagramming',
  listening: 'Listening',
};

const byCategoryOrder = (a: PracticeCategory, b: PracticeCategory) =>
  a.categoryOrder - b.categoryOrder || a.id.localeCompare(b.id);

const byLessonOrder = (a: PracticeCategoryMembership, b: PracticeCategoryMembership) =>
  a.lessonOrder - b.lessonOrder || a.id.localeCompare(b.id);

const unique = <T>(values: T[]) => [...new Set(values)];

export function getPracticeCategoryMembershipId(categoryId: string, lessonId: string): string {
  return createHash('sha256')
    .update(JSON.stringify([categoryId, lessonId]))
    .digest('base64url');
}

function categoryFromSnapshot(snapshot: DocumentSnapshot): PracticeCategory {
  const data = snapshot.data() ?? {};
  const parsed = practiceCategoryDocumentSchema.safeParse({
    ...data,
    id: snapshot.id,
    categoryOrder: data.categoryOrder === undefined ? Number.MAX_SAFE_INTEGER : data.categoryOrder,
  });
  if (!parsed.success) {
    throw new PracticeCategoryError(
      'STALE_CATEGORY_DATA',
      `Category ${snapshot.id} contains invalid persisted data`,
      409
    );
  }
  return parsed.data;
}

function membershipFromSnapshot(snapshot: DocumentSnapshot): PracticeCategoryMembership {
  const data = snapshot.data() ?? {};
  const parsed = practiceCategoryMembershipDocumentSchema.safeParse({
    ...data,
    id: snapshot.id,
    lessonOrder: data.lessonOrder === undefined ? Number.MAX_SAFE_INTEGER : data.lessonOrder,
  });
  if (!parsed.success) {
    throw new PracticeCategoryError(
      'STALE_CATEGORY_DATA',
      `Category membership ${snapshot.id} contains invalid persisted data`,
      409
    );
  }
  return parsed.data;
}

function assertExactScope(
  actualIds: string[],
  orderedIds: string[],
  code: 'STALE_CATEGORY_ORDER' | 'STALE_LESSON_ORDER'
) {
  const actual = new Set(actualIds);
  const supplied = new Set(orderedIds);
  if (supplied.size !== orderedIds.length || actual.size !== supplied.size || orderedIds.some(id => !actual.has(id))) {
    throw new PracticeCategoryError(code, 'The ordered list changed elsewhere. Refresh it and try again.', 409);
  }
}

export class PracticeCategoryService {
  constructor(private readonly db: Firestore = adminDb) {}

  private get categories() {
    return this.db.collection(PRACTICE_CATEGORIES_COLLECTION);
  }

  private get memberships() {
    return this.db.collection(PRACTICE_CATEGORY_MEMBERSHIPS_COLLECTION);
  }

  private activeCategoriesQuery(lessonType: PracticeLessonType) {
    return this.categories.where('lessonType', '==', lessonType).where('status', '==', 'active');
  }

  private categoryMembershipsQuery(categoryId: string) {
    return this.memberships.where('categoryId', '==', categoryId);
  }

  async listCategories(options: {
    lessonType?: PracticeLessonType;
    status?: PracticeCategoryStatus;
    includeCounts?: boolean;
  }): Promise<PracticeCategoryWithCounts[] | PracticeCategory[]> {
    let query: Query = this.categories;
    if (options.lessonType) query = query.where('lessonType', '==', options.lessonType);
    if (options.status) query = query.where('status', '==', options.status);
    const snapshot = await query.get();
    const categories = snapshot.docs.map(categoryFromSnapshot).sort(byCategoryOrder);
    return options.includeCounts ? this.withCategoryCounts(categories) : categories;
  }

  async getCategory(categoryId: string): Promise<PracticeCategoryWithCounts> {
    const snapshot = await this.categories.doc(categoryId).get();
    if (!snapshot.exists) {
      throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
    }
    const [category] = await this.withCategoryCounts([categoryFromSnapshot(snapshot)]);
    return category;
  }

  private async withCategoryCounts(categories: PracticeCategory[]): Promise<PracticeCategoryWithCounts[]> {
    if (categories.length === 0) return [];

    const categoryIdChunks: string[][] = [];
    for (let index = 0; index < categories.length; index += 30) {
      categoryIdChunks.push(categories.slice(index, index + 30).map(category => category.id));
    }
    const membershipSnapshots = await Promise.all(
      categoryIdChunks.map(categoryIds => this.memberships.where('categoryId', 'in', categoryIds).get())
    );
    const membershipsByCategory = new Map<string, PracticeCategoryMembership[]>();
    membershipSnapshots.forEach(snapshot => {
      snapshot.docs.map(membershipFromSnapshot).forEach(membership => {
        const memberships = membershipsByCategory.get(membership.categoryId) ?? [];
        memberships.push(membership);
        membershipsByCategory.set(membership.categoryId, memberships);
      });
    });
    const categoryMemberships = categories.map(category => membershipsByCategory.get(category.id) ?? []);
    const lessonIds = unique(
      categoryMemberships.flatMap(memberships => memberships.map(membership => membership.lessonId))
    );
    const lessonSnapshots = lessonIds.length
      ? await this.db.getAll(...lessonIds.map(id => this.db.collection('lessons').doc(id)))
      : [];
    const lessonsById = new Map(lessonSnapshots.filter(doc => doc.exists).map(doc => [doc.id, doc.data()]));

    return categories.map((category, index) => {
      const memberships = categoryMemberships[index];
      let liveLessonCount = 0;
      let draftLessonCount = 0;
      for (const membership of memberships) {
        const lesson = lessonsById.get(membership.lessonId);
        if (!lesson) continue;
        if (lesson.isLive) liveLessonCount += 1;
        else draftLessonCount += 1;
      }
      return {
        ...category,
        assignedLessonCount: memberships.length,
        liveLessonCount,
        draftLessonCount,
      };
    });
  }

  async createCategory(input: CreatePracticeCategoryInput, actorId: string): Promise<PracticeCategory> {
    const ref = this.categories.doc();
    const normalizedName = normalizeCategoryName(input.name);

    return this.db.runTransaction(async transaction => {
      const conflictQuery = this.categories
        .where('lessonType', '==', input.lessonType)
        .where('normalizedName', '==', normalizedName)
        .limit(1);
      const [conflictSnapshot, activeSnapshot] = await Promise.all([
        transaction.get(conflictQuery),
        transaction.get(this.activeCategoriesQuery(input.lessonType)),
      ]);

      if (!conflictSnapshot.empty) {
        throw new PracticeCategoryError(
          'CATEGORY_NAME_CONFLICT',
          `A ${categoryTypeLabels[input.lessonType]} category with this name already exists`,
          409
        );
      }

      const now = new Date().toISOString();
      const activeCategories = activeSnapshot.docs.map(categoryFromSnapshot).sort(byCategoryOrder);
      activeCategories.forEach((category, index) => {
        if (category.categoryOrder !== index) {
          transaction.update(this.categories.doc(category.id), {
            categoryOrder: index,
            updatedAt: now,
            updatedBy: actorId,
          });
        }
      });
      const category: PracticeCategory = {
        id: ref.id,
        lessonType: input.lessonType,
        name: input.name.trim(),
        normalizedName,
        ...(input.description ? { description: input.description } : {}),
        status: 'active',
        categoryOrder: activeCategories.length,
        createdAt: now,
        createdBy: actorId,
        updatedAt: now,
        updatedBy: actorId,
      };
      transaction.create(ref, category);
      return category;
    });
  }

  async updateCategory(
    categoryId: string,
    input: UpdatePracticeCategoryInput,
    actorId: string
  ): Promise<PracticeCategory> {
    const ref = this.categories.doc(categoryId);
    return this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
      }
      const current = categoryFromSnapshot(snapshot);
      const nextNormalizedName = input.name === undefined ? current.normalizedName : normalizeCategoryName(input.name);

      let conflictSnapshot: QuerySnapshot | undefined;
      if (nextNormalizedName !== current.normalizedName) {
        conflictSnapshot = await transaction.get(
          this.categories
            .where('lessonType', '==', current.lessonType)
            .where('normalizedName', '==', nextNormalizedName)
            .limit(1)
        );
      }

      const changesStatus = input.status !== undefined && input.status !== current.status;
      const activeSnapshot = changesStatus
        ? await transaction.get(this.activeCategoriesQuery(current.lessonType))
        : undefined;

      if (conflictSnapshot && !conflictSnapshot.empty && conflictSnapshot.docs.some(doc => doc.id !== categoryId)) {
        throw new PracticeCategoryError(
          'CATEGORY_NAME_CONFLICT',
          `A ${categoryTypeLabels[current.lessonType]} category with this name already exists`,
          409
        );
      }

      const now = new Date().toISOString();
      const updated: PracticeCategory = {
        ...current,
        name: input.name === undefined ? current.name : input.name.trim(),
        normalizedName: nextNormalizedName,
        status: input.status ?? current.status,
        updatedAt: now,
        updatedBy: actorId,
      };
      if (Object.prototype.hasOwnProperty.call(input, 'description')) {
        if (input.description === undefined) delete updated.description;
        else updated.description = input.description;
      }

      if (changesStatus && activeSnapshot) {
        const active = activeSnapshot.docs.map(categoryFromSnapshot).sort(byCategoryOrder);
        if (input.status === 'archived') {
          const remaining = active.filter(category => category.id !== categoryId);
          remaining.forEach((category, index) => {
            if (category.categoryOrder !== index) {
              transaction.update(this.categories.doc(category.id), {
                categoryOrder: index,
                updatedAt: now,
                updatedBy: actorId,
              });
            }
          });
        } else {
          active.forEach((category, index) => {
            if (category.categoryOrder !== index) {
              transaction.update(this.categories.doc(category.id), {
                categoryOrder: index,
                updatedAt: now,
                updatedBy: actorId,
              });
            }
          });
          updated.categoryOrder = active.length;
        }
      }

      transaction.set(ref, updated);
      return updated;
    });
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const ref = this.categories.doc(categoryId);
    await this.db.runTransaction(async transaction => {
      const [categorySnapshot, membershipSnapshot] = await Promise.all([
        transaction.get(ref),
        transaction.get(this.memberships.where('categoryId', '==', categoryId).limit(1)),
      ]);
      if (!categorySnapshot.exists) {
        throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
      }
      const category = categoryFromSnapshot(categorySnapshot);
      if (category.status !== 'archived') {
        throw new PracticeCategoryError(
          'CATEGORY_NOT_ARCHIVED',
          'Archive the category before deleting it permanently',
          409
        );
      }
      if (!membershipSnapshot.empty) {
        throw new PracticeCategoryError(
          'CATEGORY_NOT_EMPTY',
          'Remove every lesson from this category before deleting it permanently',
          409
        );
      }
      transaction.delete(ref);
    });
  }

  async reorderCategories(
    lessonType: PracticeLessonType,
    orderedCategoryIds: string[],
    actorId: string
  ): Promise<PracticeCategory[]> {
    return this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(this.activeCategoriesQuery(lessonType));
      const categories = snapshot.docs.map(categoryFromSnapshot);
      assertExactScope(
        categories.map(category => category.id),
        orderedCategoryIds,
        'STALE_CATEGORY_ORDER'
      );

      const now = new Date().toISOString();
      const byId = new Map(categories.map(category => [category.id, category]));
      const ordered = orderedCategoryIds.map((id, index) => ({ ...byId.get(id)!, categoryOrder: index }));
      ordered.forEach(category => {
        transaction.update(this.categories.doc(category.id), {
          categoryOrder: category.categoryOrder,
          updatedAt: now,
          updatedBy: actorId,
        });
        category.updatedAt = now;
        category.updatedBy = actorId;
      });
      return ordered;
    });
  }

  async getCategoryLessons(categoryId: string): Promise<PracticeCategoryLessonDetail> {
    const categoryRef = this.categories.doc(categoryId);
    const [categorySnapshot, membershipSnapshot] = await Promise.all([
      categoryRef.get(),
      this.categoryMembershipsQuery(categoryId).get(),
    ]);
    if (!categorySnapshot.exists) {
      throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
    }

    const category = categoryFromSnapshot(categorySnapshot);
    const memberships = membershipSnapshot.docs.map(membershipFromSnapshot).sort(byLessonOrder);
    const assignedSnapshots = memberships.length
      ? await this.db.getAll(...memberships.map(membership => this.db.collection('lessons').doc(membership.lessonId)))
      : [];
    const assignedById = new Map(assignedSnapshots.map(snapshot => [snapshot.id, snapshot]));
    const lessons = memberships.map(membership => {
      const lessonSnapshot = assignedById.get(membership.lessonId);
      if (!lessonSnapshot?.exists) {
        throw new PracticeCategoryError(
          'STALE_CATEGORY_DATA',
          `Category membership references missing lesson ${membership.lessonId}`,
          409
        );
      }
      const lesson = lessonSnapshot.data() as Partial<Lesson>;
      if (!isCategorisableLesson(lesson) || lesson.type !== category.lessonType) {
        throw new PracticeCategoryError(
          'STALE_CATEGORY_DATA',
          `Category membership references an incompatible lesson ${membership.lessonId}`,
          409
        );
      }
      return {
        ...toLessonSummary(lessonSnapshot.id, lesson),
        membershipId: membership.id,
        lessonOrder: membership.lessonOrder,
      };
    });

    const liveLessonCount = assignedSnapshots.filter(snapshot => snapshot.exists && snapshot.data()?.isLive).length;
    const categoryWithCounts: PracticeCategoryWithCounts = {
      ...category,
      assignedLessonCount: memberships.length,
      liveLessonCount,
      draftLessonCount: assignedSnapshots.filter(snapshot => snapshot.exists).length - liveLessonCount,
    };

    return { category: categoryWithCounts, lessons };
  }

  async getAvailableCategoryLessons(categoryId: string): Promise<LessonSummary[]> {
    const categoryRef = this.categories.doc(categoryId);
    const [categorySnapshot, membershipSnapshot] = await Promise.all([
      categoryRef.get(),
      this.categoryMembershipsQuery(categoryId).get(),
    ]);
    if (!categorySnapshot.exists) {
      throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
    }

    const category = categoryFromSnapshot(categorySnapshot);
    const assignedIds = new Set(membershipSnapshot.docs.map(snapshot => membershipFromSnapshot(snapshot).lessonId));
    const allTypeLessonsSnapshot = await this.db.collection('lessons').where('type', '==', category.lessonType).get();

    return allTypeLessonsSnapshot.docs
      .filter(snapshot => !assignedIds.has(snapshot.id) && isCategorisableLesson(snapshot.data()))
      .map(snapshot => toLessonSummary(snapshot.id, snapshot.data() as Partial<Lesson>))
      .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }

  async addLessons(categoryId: string, lessonIds: string[], actorId: string): Promise<PracticeCategoryMembership[]> {
    const categoryRef = this.categories.doc(categoryId);
    return this.db.runTransaction(async transaction => {
      const [categorySnapshot, membershipSnapshot] = await Promise.all([
        transaction.get(categoryRef),
        transaction.get(this.categoryMembershipsQuery(categoryId)),
      ]);
      if (!categorySnapshot.exists) {
        throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
      }
      const category = categoryFromSnapshot(categorySnapshot);
      const currentDocs = membershipSnapshot.docs
        .map(snapshot => ({ snapshot, membership: membershipFromSnapshot(snapshot) }))
        .sort((a, b) => byLessonOrder(a.membership, b.membership));
      const current = currentDocs.map(item => item.membership);
      const currentByLessonId = new Map(current.map(membership => [membership.lessonId, membership]));
      if (category.status !== 'active' && lessonIds.some(lessonId => !currentByLessonId.has(lessonId))) {
        throw new PracticeCategoryError(
          'CATEGORY_ARCHIVED',
          'Archived categories cannot receive new lesson assignments',
          409
        );
      }

      const lessonSnapshots = await transaction.getAll(
        ...lessonIds.map(lessonId => this.db.collection('lessons').doc(lessonId))
      );
      const lessonById = new Map(lessonSnapshots.map(snapshot => [snapshot.id, snapshot]));

      lessonIds.forEach(lessonId => {
        const lessonSnapshot = lessonById.get(lessonId);
        if (!lessonSnapshot?.exists) {
          throw new PracticeCategoryError('LESSON_NOT_FOUND', `Lesson ${lessonId} not found`, 404);
        }
        const lesson = lessonSnapshot.data();
        if (!isCategorisableLesson(lesson)) {
          throw new PracticeCategoryError(
            'INELIGIBLE_LESSON',
            `Lesson ${lessonId} is not eligible for practice categories`,
            400
          );
        }
        if (lesson.type !== category.lessonType) {
          throw new PracticeCategoryError(
            'CATEGORY_TYPE_MISMATCH',
            `Lesson ${lessonId} does not match this category's lesson type`,
            400
          );
        }
      });

      const now = new Date().toISOString();
      const compactedCurrent = currentDocs.map((item, index) => {
        if (item.membership.lessonOrder !== index) {
          transaction.update(item.snapshot.ref, {
            lessonOrder: index,
            updatedAt: now,
            updatedBy: actorId,
          });
          return { ...item.membership, lessonOrder: index, updatedAt: now, updatedBy: actorId };
        }
        return item.membership;
      });
      const compactedByLessonId = new Map(compactedCurrent.map(membership => [membership.lessonId, membership]));
      const result: PracticeCategoryMembership[] = [];
      let nextOrder = compactedCurrent.length;
      lessonIds.forEach(lessonId => {
        const existing = compactedByLessonId.get(lessonId);
        if (existing) {
          result.push(existing);
          return;
        }
        const id = getPracticeCategoryMembershipId(categoryId, lessonId);
        const membership: PracticeCategoryMembership = {
          id,
          categoryId,
          lessonId,
          lessonOrder: nextOrder++,
          createdAt: now,
          createdBy: actorId,
          updatedAt: now,
          updatedBy: actorId,
        };
        transaction.create(this.memberships.doc(id), membership);
        result.push(membership);
      });
      return result;
    });
  }

  async removeLesson(categoryId: string, lessonId: string, actorId: string): Promise<boolean> {
    const categoryRef = this.categories.doc(categoryId);
    return this.db.runTransaction(async transaction => {
      const [categorySnapshot, membershipSnapshot] = await Promise.all([
        transaction.get(categoryRef),
        transaction.get(this.categoryMembershipsQuery(categoryId)),
      ]);
      if (!categorySnapshot.exists) {
        throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
      }
      categoryFromSnapshot(categorySnapshot);

      const currentDocs = membershipSnapshot.docs
        .map(snapshot => ({ snapshot, membership: membershipFromSnapshot(snapshot) }))
        .sort((a, b) => byLessonOrder(a.membership, b.membership));
      const target = currentDocs.find(item => item.membership.lessonId === lessonId);
      if (!target) return false;

      const now = new Date().toISOString();
      transaction.delete(target.snapshot.ref);
      currentDocs
        .filter(item => item.membership.lessonId !== lessonId)
        .forEach((item, index) => {
          if (item.membership.lessonOrder !== index) {
            transaction.update(item.snapshot.ref, {
              lessonOrder: index,
              updatedAt: now,
              updatedBy: actorId,
            });
          }
        });
      return true;
    });
  }

  async reorderLessons(
    categoryId: string,
    orderedLessonIds: string[],
    actorId: string
  ): Promise<PracticeCategoryMembership[]> {
    const categoryRef = this.categories.doc(categoryId);
    return this.db.runTransaction(async transaction => {
      const [categorySnapshot, membershipSnapshot] = await Promise.all([
        transaction.get(categoryRef),
        transaction.get(this.categoryMembershipsQuery(categoryId)),
      ]);
      if (!categorySnapshot.exists) {
        throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
      }
      const category = categoryFromSnapshot(categorySnapshot);
      if (category.status !== 'active') {
        throw new PracticeCategoryError('CATEGORY_ARCHIVED', 'Restore the category before reordering its lessons', 409);
      }

      const currentDocs = membershipSnapshot.docs.map(snapshot => ({
        snapshot,
        membership: membershipFromSnapshot(snapshot),
      }));
      assertExactScope(
        currentDocs.map(item => item.membership.lessonId),
        orderedLessonIds,
        'STALE_LESSON_ORDER'
      );

      const now = new Date().toISOString();
      const byLessonId = new Map(currentDocs.map(item => [item.membership.lessonId, item]));
      return orderedLessonIds.map((lessonId, index) => {
        const item = byLessonId.get(lessonId)!;
        transaction.update(item.snapshot.ref, {
          lessonOrder: index,
          updatedAt: now,
          updatedBy: actorId,
        });
        return { ...item.membership, lessonOrder: index, updatedAt: now, updatedBy: actorId };
      });
    });
  }

  async getAssignmentsForLessonIds(lessonIds: string[]): Promise<Map<string, LessonCategoryAssignments>> {
    const ids = unique(lessonIds);
    const result = new Map<string, LessonCategoryAssignments>(
      ids.map(id => [id, { practiceCategoryIds: [], practiceCategories: [], memberships: [] }])
    );
    if (ids.length === 0) return result;

    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += 30) chunks.push(ids.slice(index, index + 30));
    const snapshots = await Promise.all(chunks.map(chunk => this.memberships.where('lessonId', 'in', chunk).get()));
    const memberships = snapshots.flatMap(snapshot => snapshot.docs.map(membershipFromSnapshot));
    const categoryIds = unique(memberships.map(membership => membership.categoryId));
    const categorySnapshots = categoryIds.length
      ? await this.db.getAll(...categoryIds.map(id => this.categories.doc(id)))
      : [];
    const categoriesById = new Map<string, PracticeCategory>();
    categorySnapshots.forEach(snapshot => {
      if (!snapshot.exists) {
        throw new PracticeCategoryError(
          'STALE_CATEGORY_DATA',
          `A lesson references missing category ${snapshot.id}`,
          409
        );
      }
      categoriesById.set(snapshot.id, categoryFromSnapshot(snapshot));
    });

    const membershipsByLesson = new Map<string, PracticeCategoryMembership[]>();
    memberships.forEach(membership => {
      const current = membershipsByLesson.get(membership.lessonId) ?? [];
      current.push(membership);
      membershipsByLesson.set(membership.lessonId, current);
    });
    ids.forEach(lessonId => {
      const lessonMemberships = membershipsByLesson.get(lessonId) ?? [];
      const categories = lessonMemberships
        .map(membership => categoriesById.get(membership.categoryId)!)
        .sort(byCategoryOrder);
      const membershipByCategory = new Map(lessonMemberships.map(item => [item.categoryId, item]));
      result.set(lessonId, {
        practiceCategoryIds: categories.map(category => category.id),
        practiceCategories: categories,
        memberships: categories.map(category => membershipByCategory.get(category.id)!),
      });
    });
    return result;
  }

  async getLessonCategories(lessonId: string): Promise<LessonCategoryAssignments> {
    const lessonSnapshot = await this.db.collection('lessons').doc(lessonId).get();
    if (!lessonSnapshot.exists) {
      throw new PracticeCategoryError('LESSON_NOT_FOUND', 'Lesson not found', 404);
    }
    return (await this.getAssignmentsForLessonIds([lessonId])).get(lessonId)!;
  }

  async reconcileLessonCategories(
    lessonId: string,
    desiredCategoryIds: string[],
    actorId: string
  ): Promise<LessonCategoryAssignments> {
    return this.db.runTransaction(async transaction => {
      const lessonSnapshot = await transaction.get(this.db.collection('lessons').doc(lessonId));
      if (!lessonSnapshot.exists) {
        throw new PracticeCategoryError('LESSON_NOT_FOUND', 'Lesson not found', 404);
      }
      return this.reconcileLessonCategoriesInTransaction(transaction, {
        lessonId,
        lesson: lessonSnapshot.data()!,
        desiredCategoryIds,
        actorId,
        requireCategorisable: true,
      });
    });
  }

  async reconcileLessonCategoriesInTransaction(
    transaction: Transaction,
    input: ReconcileInTransactionInput
  ): Promise<LessonCategoryAssignments> {
    const existingSnapshot = await transaction.get(this.memberships.where('lessonId', '==', input.lessonId));
    const existingDocs = existingSnapshot.docs.map(snapshot => ({
      snapshot,
      membership: membershipFromSnapshot(snapshot),
    }));
    const existingByCategory = new Map(existingDocs.map(item => [item.membership.categoryId, item]));
    const desiredIds = input.desiredCategoryIds ?? existingDocs.map(item => item.membership.categoryId);

    if (new Set(desiredIds).size !== desiredIds.length) {
      throw new PracticeCategoryError('STALE_CATEGORY_DATA', 'practiceCategoryIds must not contain duplicates', 400);
    }
    if (
      (input.requireCategorisable || desiredIds.length > 0 || existingDocs.length > 0) &&
      !isCategorisableLesson(input.lesson)
    ) {
      throw new PracticeCategoryError(
        'INELIGIBLE_LESSON',
        'Only vocabulary, sentence-diagramming, and listening lessons can use practice categories',
        400
      );
    }

    const categorySnapshots = desiredIds.length
      ? await transaction.getAll(...desiredIds.map(id => this.categories.doc(id)))
      : [];
    const categoriesById = new Map<string, PracticeCategory>();
    categorySnapshots.forEach(snapshot => {
      if (!snapshot.exists) {
        throw new PracticeCategoryError('CATEGORY_NOT_FOUND', `Practice category ${snapshot.id} not found`, 404);
      }
      const category = categoryFromSnapshot(snapshot);
      if (category.lessonType !== input.lesson.type) {
        throw new PracticeCategoryError(
          'CATEGORY_TYPE_MISMATCH',
          `Category ${category.name} does not match this lesson's type`,
          400
        );
      }
      if (category.status === 'archived' && !existingByCategory.has(category.id)) {
        throw new PracticeCategoryError(
          'CATEGORY_ARCHIVED',
          `Archived category ${category.name} cannot receive new assignments`,
          409
        );
      }
      categoriesById.set(category.id, category);
    });

    const desiredSet = new Set(desiredIds);
    const toRemove = existingDocs.filter(item => !desiredSet.has(item.membership.categoryId));
    const toAdd = desiredIds.filter(categoryId => !existingByCategory.has(categoryId));
    const changedCategoryIds = unique([...toRemove.map(item => item.membership.categoryId), ...toAdd]);
    const changedScopeSnapshots = await Promise.all(
      changedCategoryIds.map(categoryId => transaction.get(this.categoryMembershipsQuery(categoryId)))
    );
    const scopes = new Map(
      changedCategoryIds.map((categoryId, index) => [
        categoryId,
        changedScopeSnapshots[index].docs
          .map(snapshot => ({ snapshot, membership: membershipFromSnapshot(snapshot) }))
          .sort((a, b) => byLessonOrder(a.membership, b.membership)),
      ])
    );

    const now = new Date().toISOString();
    toRemove.forEach(item => transaction.delete(item.snapshot.ref));
    const addedByCategory = new Map<string, PracticeCategoryMembership>();
    changedCategoryIds.forEach(categoryId => {
      const remaining = (scopes.get(categoryId) ?? []).filter(item => item.membership.lessonId !== input.lessonId);
      remaining.forEach((item, index) => {
        if (item.membership.lessonOrder !== index) {
          transaction.update(item.snapshot.ref, {
            lessonOrder: index,
            updatedAt: now,
            updatedBy: input.actorId,
          });
        }
      });

      if (toAdd.includes(categoryId)) {
        const id = getPracticeCategoryMembershipId(categoryId, input.lessonId);
        const membership: PracticeCategoryMembership = {
          id,
          categoryId,
          lessonId: input.lessonId,
          lessonOrder: remaining.length,
          createdAt: now,
          createdBy: input.actorId,
          updatedAt: now,
          updatedBy: input.actorId,
        };
        transaction.create(this.memberships.doc(id), membership);
        addedByCategory.set(categoryId, membership);
      }
    });

    const categories = desiredIds.map(id => categoriesById.get(id)!).sort(byCategoryOrder);
    return {
      practiceCategoryIds: categories.map(category => category.id),
      practiceCategories: categories,
      memberships: categories.map(category => {
        const existing = existingByCategory.get(category.id)?.membership;
        return existing ?? addedByCategory.get(category.id)!;
      }),
    };
  }

  async deleteLessonWithMemberships(lessonId: string, actorId: string): Promise<number> {
    const lessonRef = this.db.collection('lessons').doc(lessonId);
    return this.db.runTransaction(async transaction => {
      const lessonSnapshot = await transaction.get(lessonRef);
      if (!lessonSnapshot.exists) {
        throw new PracticeCategoryError('LESSON_NOT_FOUND', 'Lesson not found', 404);
      }
      const lessonMembershipSnapshot = await transaction.get(this.memberships.where('lessonId', '==', lessonId));
      const lessonMembershipDocs = lessonMembershipSnapshot.docs.map(snapshot => ({
        snapshot,
        membership: membershipFromSnapshot(snapshot),
      }));
      const categoryIds = unique(lessonMembershipDocs.map(item => item.membership.categoryId));
      const categoryScopes = await Promise.all(
        categoryIds.map(categoryId => transaction.get(this.categoryMembershipsQuery(categoryId)))
      );

      const now = new Date().toISOString();
      transaction.delete(lessonRef);
      lessonMembershipDocs.forEach(item => transaction.delete(item.snapshot.ref));
      categoryScopes.forEach(snapshot => {
        snapshot.docs
          .map(item => ({ snapshot: item, membership: membershipFromSnapshot(item) }))
          .filter(item => item.membership.lessonId !== lessonId)
          .sort((a, b) => byLessonOrder(a.membership, b.membership))
          .forEach((item, index) => {
            if (item.membership.lessonOrder !== index) {
              transaction.update(item.snapshot.ref, {
                lessonOrder: index,
                updatedAt: now,
                updatedBy: actorId,
              });
            }
          });
      });
      return lessonMembershipDocs.length;
    });
  }
}

export const practiceCategoryService = new PracticeCategoryService();
