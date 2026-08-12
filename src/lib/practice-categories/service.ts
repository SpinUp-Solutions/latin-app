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
  PracticeCategorySelection,
  PracticeCategoryStatus,
  PracticeCategoryWithCounts,
  PracticeLessonType,
  PracticeTag,
} from '@/src/types/practice-category';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { assertVocabularyPoolAssignmentsAllowedInTransaction } from '@/src/lib/vocabulary-pools/assignment.server';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { assertUnitDeletionAllowedInTransaction } from '@/src/lib/learning-units/learning-path-service';
import { toLessonSummary } from '@/src/utils/lessonSummary';
import { isCategorisableLesson, normalizeCategoryName, normalizeTagName } from './domain';
import {
  practiceCategoryDocumentSchema,
  practiceCategoryMembershipDocumentSchema,
  type CreatePracticeCategoryInput,
  type CreatePracticeTagInput,
  type UpdatePracticeCategoryInput,
  type UpdatePracticeTagInput,
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
  | 'TAG_NAME_CONFLICT'
  | 'TAG_NOT_FOUND'
  | 'TAG_ARCHIVED'
  | 'TAG_NOT_ARCHIVED'
  | 'TAG_IN_USE'
  | 'TAG_CATEGORY_MISMATCH'
  | 'STALE_TAG_ORDER'
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
  practiceCategorySelections: PracticeCategorySelection[];
  practiceCategoryIds: string[];
  practiceCategories: PracticeCategory[];
  memberships: PracticeCategoryMembership[];
};

export type PracticeCategoryLessonDetail = {
  category: PracticeCategoryWithCounts;
  lessons: PracticeCategoryLesson[];
  tagUsageCounts: Record<string, number>;
};

type ReconcileInTransactionInput = {
  lessonId: string;
  lesson: DocumentData;
  desiredCategorySelections?: PracticeCategorySelection[];
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

const byTagOrder = (a: PracticeTag, b: PracticeTag) => a.tagOrder - b.tagOrder || a.id.localeCompare(b.id);

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
  code: 'STALE_CATEGORY_ORDER' | 'STALE_LESSON_ORDER' | 'STALE_TAG_ORDER'
) {
  const actual = new Set(actualIds);
  const supplied = new Set(orderedIds);
  if (supplied.size !== orderedIds.length || actual.size !== supplied.size || orderedIds.some(id => !actual.has(id))) {
    throw new PracticeCategoryError(code, 'The ordered list changed elsewhere. Refresh it and try again.', 409);
  }
}

function sameIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
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
        if (!lesson || !isCategorisableLesson(lesson) || lesson.type !== category.lessonType) continue;
        if (lesson.isLive) liveLessonCount += 1;
        else draftLessonCount += 1;
      }
      const assignedLessonCount = memberships.filter(membership => {
        const lesson = lessonsById.get(membership.lessonId);
        return Boolean(lesson && isCategorisableLesson(lesson) && lesson.type === category.lessonType);
      }).length;
      return {
        ...category,
        assignedLessonCount,
        liveLessonCount,
        draftLessonCount,
      };
    });
  }

  async createCategory(input: CreatePracticeCategoryInput, actorId: string): Promise<PracticeCategory> {
    const ref = this.categories.doc();
    const normalizedName = normalizeCategoryName(input.name);

    return runVocabularyContentMutation(this.db, async transaction => {
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
        tags: [],
        createdAt: now,
        createdBy: actorId,
        updatedAt: now,
        updatedBy: actorId,
      };
      transaction.create(ref, category);
      return category;
    });
  }

  async createTag(categoryId: string, input: CreatePracticeTagInput, actorId: string): Promise<PracticeTag> {
    const categoryRef = this.categories.doc(categoryId);
    const tagId = this.categories.doc().id;
    return runVocabularyContentMutation(this.db, async transaction => {
      const snapshot = await transaction.get(categoryRef);
      if (!snapshot.exists) {
        throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
      }
      const category = categoryFromSnapshot(snapshot);
      if (category.status !== 'active') {
        throw new PracticeCategoryError('CATEGORY_ARCHIVED', 'Restore the category before creating tags', 409);
      }

      const normalizedName = normalizeTagName(input.name);
      if (category.tags.some(tag => tag.normalizedName === normalizedName)) {
        throw new PracticeCategoryError(
          'TAG_NAME_CONFLICT',
          `A tag named ${input.name.trim()} already exists in ${category.name}`,
          409
        );
      }

      const now = new Date().toISOString();
      const activeTags = category.tags.filter(tag => tag.status === 'active').sort(byTagOrder);
      const compacted = category.tags.map(tag => {
        if (tag.status !== 'active') return tag;
        const tagOrder = activeTags.findIndex(active => active.id === tag.id);
        return tag.tagOrder === tagOrder ? tag : { ...tag, tagOrder, updatedAt: now, updatedBy: actorId };
      });
      const tag: PracticeTag = {
        id: tagId,
        name: input.name.trim(),
        normalizedName,
        status: 'active',
        tagOrder: activeTags.length,
        createdAt: now,
        createdBy: actorId,
        updatedAt: now,
        updatedBy: actorId,
      };
      transaction.update(categoryRef, {
        tags: [...compacted, tag],
        updatedAt: now,
        updatedBy: actorId,
      });
      return tag;
    });
  }

  async updateTag(
    categoryId: string,
    tagId: string,
    input: UpdatePracticeTagInput,
    actorId: string
  ): Promise<PracticeTag> {
    const categoryRef = this.categories.doc(categoryId);
    return runVocabularyContentMutation(this.db, async transaction => {
      const snapshot = await transaction.get(categoryRef);
      if (!snapshot.exists) {
        throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
      }
      const category = categoryFromSnapshot(snapshot);
      const current = category.tags.find(tag => tag.id === tagId);
      if (!current) {
        throw new PracticeCategoryError('TAG_NOT_FOUND', 'Practice tag not found', 404);
      }

      const normalizedName = input.name === undefined ? current.normalizedName : normalizeTagName(input.name);
      if (category.tags.some(tag => tag.id !== tagId && tag.normalizedName === normalizedName)) {
        throw new PracticeCategoryError(
          'TAG_NAME_CONFLICT',
          `A tag named ${input.name?.trim() ?? current.name} already exists in ${category.name}`,
          409
        );
      }

      const now = new Date().toISOString();
      const nextStatus = input.status ?? current.status;
      const changesStatus = nextStatus !== current.status;
      const activeWithoutCurrent = category.tags
        .filter(tag => tag.status === 'active' && tag.id !== tagId)
        .sort(byTagOrder);
      const nextOrder = changesStatus && nextStatus === 'active' ? activeWithoutCurrent.length : current.tagOrder;
      const updated: PracticeTag = {
        ...current,
        name: input.name === undefined ? current.name : input.name.trim(),
        normalizedName,
        status: nextStatus,
        tagOrder: nextOrder,
        updatedAt: now,
        updatedBy: actorId,
      };

      const tags = category.tags.map(tag => (tag.id === tagId ? updated : tag));
      if (changesStatus && nextStatus === 'archived') {
        const remainingActive = tags.filter(tag => tag.status === 'active').sort(byTagOrder);
        remainingActive.forEach((tag, index) => {
          const target = tags.find(item => item.id === tag.id)!;
          const previousOrder = target.tagOrder;
          target.tagOrder = index;
          if (previousOrder !== index) {
            target.updatedAt = now;
            target.updatedBy = actorId;
          }
        });
      }

      transaction.update(categoryRef, { tags, updatedAt: now, updatedBy: actorId });
      return updated;
    });
  }

  async deleteTag(categoryId: string, tagId: string, actorId: string): Promise<void> {
    const categoryRef = this.categories.doc(categoryId);
    await runVocabularyContentMutation(this.db, async transaction => {
      const [categorySnapshot, membershipSnapshot] = await Promise.all([
        transaction.get(categoryRef),
        transaction.get(this.categoryMembershipsQuery(categoryId)),
      ]);
      if (!categorySnapshot.exists) {
        throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
      }
      const category = categoryFromSnapshot(categorySnapshot);
      const tag = category.tags.find(item => item.id === tagId);
      if (!tag) {
        throw new PracticeCategoryError('TAG_NOT_FOUND', 'Practice tag not found', 404);
      }
      if (tag.status !== 'archived') {
        throw new PracticeCategoryError('TAG_NOT_ARCHIVED', 'Archive the tag before deleting it permanently', 409);
      }
      const inUse = membershipSnapshot.docs
        .map(membershipFromSnapshot)
        .some(membership => membership.tagIds.includes(tagId));
      if (inUse) {
        throw new PracticeCategoryError(
          'TAG_IN_USE',
          'Remove this tag from every lesson before deleting it permanently',
          409
        );
      }
      transaction.update(categoryRef, {
        tags: category.tags.filter(item => item.id !== tagId),
        updatedAt: new Date().toISOString(),
        updatedBy: actorId,
      });
    });
  }

  async reorderTags(categoryId: string, orderedTagIds: string[], actorId: string): Promise<PracticeTag[]> {
    const categoryRef = this.categories.doc(categoryId);
    return runVocabularyContentMutation(this.db, async transaction => {
      const snapshot = await transaction.get(categoryRef);
      if (!snapshot.exists) {
        throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
      }
      const category = categoryFromSnapshot(snapshot);
      if (category.status !== 'active') {
        throw new PracticeCategoryError('CATEGORY_ARCHIVED', 'Restore the category before reordering tags', 409);
      }
      const activeTags = category.tags.filter(tag => tag.status === 'active');
      assertExactScope(
        activeTags.map(tag => tag.id),
        orderedTagIds,
        'STALE_TAG_ORDER'
      );

      const now = new Date().toISOString();
      const orderById = new Map(orderedTagIds.map((id, index) => [id, index]));
      const tags = category.tags.map(tag =>
        tag.status === 'active' ? { ...tag, tagOrder: orderById.get(tag.id)!, updatedAt: now, updatedBy: actorId } : tag
      );
      transaction.update(categoryRef, { tags, updatedAt: now, updatedBy: actorId });
      return tags.filter(tag => tag.status === 'active').sort(byTagOrder);
    });
  }

  async updateCategory(
    categoryId: string,
    input: UpdatePracticeCategoryInput,
    actorId: string
  ): Promise<PracticeCategory> {
    const ref = this.categories.doc(categoryId);
    return runVocabularyContentMutation(this.db, async transaction => {
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
    await runVocabularyContentMutation(this.db, async transaction => {
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
    return runVocabularyContentMutation(this.db, async transaction => {
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
        tagIds: membership.tagIds,
      };
    });

    const validLessonSnapshots = assignedSnapshots.filter(
      snapshot =>
        snapshot.exists && isCategorisableLesson(snapshot.data()) && snapshot.data()?.type === category.lessonType
    );
    const liveLessonCount = validLessonSnapshots.filter(snapshot => snapshot.data()?.isLive).length;
    const categoryWithCounts: PracticeCategoryWithCounts = {
      ...category,
      assignedLessonCount: validLessonSnapshots.length,
      liveLessonCount,
      draftLessonCount: validLessonSnapshots.length - liveLessonCount,
    };
    const tagUsageCounts = Object.fromEntries(category.tags.map(tag => [tag.id, 0]));
    memberships.forEach(membership => {
      membership.tagIds.forEach(tagId => {
        if (Object.prototype.hasOwnProperty.call(tagUsageCounts, tagId)) {
          tagUsageCounts[tagId] += 1;
        }
      });
    });

    return { category: categoryWithCounts, lessons, tagUsageCounts };
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
    return runVocabularyContentMutation(this.db, async transaction => {
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
          tagIds: [],
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
    return runVocabularyContentMutation(this.db, async transaction => {
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
    return runVocabularyContentMutation(this.db, async transaction => {
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

  async replaceMembershipTags(
    categoryId: string,
    lessonId: string,
    tagIds: string[],
    actorId: string
  ): Promise<PracticeCategoryMembership> {
    const categoryRef = this.categories.doc(categoryId);
    const membershipRef = this.memberships.doc(getPracticeCategoryMembershipId(categoryId, lessonId));
    return runVocabularyContentMutation(this.db, async transaction => {
      const [categorySnapshot, membershipSnapshot] = await Promise.all([
        transaction.get(categoryRef),
        transaction.get(membershipRef),
      ]);
      if (!categorySnapshot.exists) {
        throw new PracticeCategoryError('CATEGORY_NOT_FOUND', 'Practice category not found', 404);
      }
      if (!membershipSnapshot.exists) {
        throw new PracticeCategoryError('LESSON_NOT_FOUND', 'Lesson is not assigned to this category', 404);
      }

      const category = categoryFromSnapshot(categorySnapshot);
      const membership = membershipFromSnapshot(membershipSnapshot);
      if (new Set(tagIds).size !== tagIds.length) {
        throw new PracticeCategoryError('TAG_CATEGORY_MISMATCH', 'tagIds must not contain duplicates', 400);
      }
      const tagsById = new Map(category.tags.map(tag => [tag.id, tag]));
      const existingTagIds = new Set(membership.tagIds);
      for (const tagId of tagIds) {
        const tag = tagsById.get(tagId);
        if (!tag) {
          throw new PracticeCategoryError(
            'TAG_CATEGORY_MISMATCH',
            'A selected tag does not belong to this category',
            400
          );
        }
        if (tag.status === 'archived' && !existingTagIds.has(tagId)) {
          throw new PracticeCategoryError('TAG_ARCHIVED', `Archived tag ${tag.name} cannot be newly assigned`, 409);
        }
      }
      if (category.status === 'archived' && tagIds.some(tagId => !existingTagIds.has(tagId))) {
        throw new PracticeCategoryError(
          'CATEGORY_ARCHIVED',
          'Archived categories cannot receive new tag assignments',
          409
        );
      }

      const normalizedTagIds = category.tags
        .filter(tag => tagIds.includes(tag.id))
        .sort(byTagOrder)
        .map(tag => tag.id);
      if (sameIds(membership.tagIds, normalizedTagIds)) return membership;

      const updated = {
        ...membership,
        tagIds: normalizedTagIds,
        updatedAt: new Date().toISOString(),
        updatedBy: actorId,
      };
      transaction.update(membershipRef, {
        tagIds: updated.tagIds,
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy,
      });
      return updated;
    });
  }

  async getAssignmentsForLessonIds(lessonIds: string[]): Promise<Map<string, LessonCategoryAssignments>> {
    const ids = unique(lessonIds);
    const result = new Map<string, LessonCategoryAssignments>(
      ids.map(id => [
        id,
        {
          practiceCategorySelections: [],
          practiceCategoryIds: [],
          practiceCategories: [],
          memberships: [],
        },
      ])
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
        practiceCategorySelections: categories.map(category => ({
          categoryId: category.id,
          tagIds: [...membershipByCategory.get(category.id)!.tagIds],
        })),
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
    if (!isLessonDocumentData(lessonSnapshot.data())) {
      throw new PracticeCategoryError('LESSON_NOT_FOUND', 'Lesson not found', 404);
    }
    return (await this.getAssignmentsForLessonIds([lessonId])).get(lessonId)!;
  }

  async reconcileLessonCategories(
    lessonId: string,
    desiredCategories: PracticeCategorySelection[] | string[],
    actorId: string
  ): Promise<LessonCategoryAssignments> {
    return runVocabularyContentMutation(this.db, async transaction => {
      const lessonSnapshot = await transaction.get(this.db.collection('lessons').doc(lessonId));
      if (!lessonSnapshot.exists) {
        throw new PracticeCategoryError('LESSON_NOT_FOUND', 'Lesson not found', 404);
      }
      if (!isLessonDocumentData(lessonSnapshot.data())) {
        throw new PracticeCategoryError('LESSON_NOT_FOUND', 'Lesson not found', 404);
      }
      return this.reconcileLessonCategoriesInTransaction(transaction, {
        lessonId,
        lesson: lessonSnapshot.data()!,
        ...(desiredCategories.length > 0 && typeof desiredCategories[0] !== 'string'
          ? { desiredCategorySelections: desiredCategories as PracticeCategorySelection[] }
          : { desiredCategoryIds: desiredCategories as string[] }),
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
    const desiredSelections =
      input.desiredCategorySelections ??
      (input.desiredCategoryIds
        ? input.desiredCategoryIds.map(categoryId => ({
            categoryId,
            tagIds: [...(existingByCategory.get(categoryId)?.membership.tagIds ?? [])],
          }))
        : existingDocs.map(item => ({
            categoryId: item.membership.categoryId,
            tagIds: [...item.membership.tagIds],
          })));
    const desiredIds = desiredSelections.map(selection => selection.categoryId);

    if (new Set(desiredIds).size !== desiredIds.length) {
      throw new PracticeCategoryError(
        'STALE_CATEGORY_DATA',
        'practiceCategorySelections must not contain duplicate categories',
        400
      );
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
    const desiredTagsByCategory = new Map<string, string[]>();
    desiredSelections.forEach(selection => {
      if (new Set(selection.tagIds).size !== selection.tagIds.length) {
        throw new PracticeCategoryError('TAG_CATEGORY_MISMATCH', 'tagIds must not contain duplicates', 400);
      }
      const category = categoriesById.get(selection.categoryId)!;
      const tagsById = new Map(category.tags.map(tag => [tag.id, tag]));
      const existingTagIds = new Set(existingByCategory.get(selection.categoryId)?.membership.tagIds ?? []);
      selection.tagIds.forEach(tagId => {
        const tag = tagsById.get(tagId);
        if (!tag) {
          throw new PracticeCategoryError(
            'TAG_CATEGORY_MISMATCH',
            `A selected tag does not belong to category ${category.name}`,
            400
          );
        }
        if (tag.status === 'archived' && !existingTagIds.has(tagId)) {
          throw new PracticeCategoryError('TAG_ARCHIVED', `Archived tag ${tag.name} cannot be newly assigned`, 409);
        }
      });
      desiredTagsByCategory.set(
        selection.categoryId,
        category.tags
          .filter(tag => selection.tagIds.includes(tag.id))
          .sort(byTagOrder)
          .map(tag => tag.id)
      );
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
    const updatedByCategory = new Map<string, PracticeCategoryMembership>();
    existingDocs
      .filter(item => desiredSet.has(item.membership.categoryId))
      .forEach(item => {
        const tagIds = desiredTagsByCategory.get(item.membership.categoryId) ?? [];
        if (sameIds(item.membership.tagIds, tagIds)) return;
        const updated = {
          ...item.membership,
          tagIds,
          updatedAt: now,
          updatedBy: input.actorId,
        };
        transaction.update(item.snapshot.ref, {
          tagIds,
          updatedAt: now,
          updatedBy: input.actorId,
        });
        updatedByCategory.set(item.membership.categoryId, updated);
      });
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
          tagIds: desiredTagsByCategory.get(categoryId) ?? [],
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
      practiceCategorySelections: categories.map(category => ({
        categoryId: category.id,
        tagIds: [
          ...(updatedByCategory.get(category.id)?.tagIds ??
            existingByCategory.get(category.id)?.membership.tagIds ??
            addedByCategory.get(category.id)?.tagIds ??
            []),
        ],
      })),
      practiceCategoryIds: categories.map(category => category.id),
      practiceCategories: categories,
      memberships: categories.map(category => {
        const existing = updatedByCategory.get(category.id) ?? existingByCategory.get(category.id)?.membership;
        return existing ?? addedByCategory.get(category.id)!;
      }),
    };
  }

  async deleteLessonWithMemberships(lessonId: string, actorId: string): Promise<number> {
    const lessonRef = this.db.collection('lessons').doc(lessonId);
    return runVocabularyContentMutation(this.db, async transaction => {
      const lessonSnapshot = await transaction.get(lessonRef);
      if (!lessonSnapshot.exists) {
        throw new PracticeCategoryError('LESSON_NOT_FOUND', 'Lesson not found', 404);
      }
      if (!isLessonDocumentData(lessonSnapshot.data())) {
        throw new PracticeCategoryError('LESSON_NOT_FOUND', 'Lesson not found', 404);
      }
      const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
        transaction,
        this.db,
        lessonSnapshot.data(),
        {}
      );
      await assertUnitDeletionAllowedInTransaction(transaction, this.db, lessonId);
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
      applyVocabularyPoolAssignmentRevisions();
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
