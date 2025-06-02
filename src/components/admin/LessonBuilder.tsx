'use client';

import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import {
  Plus,
  Edit,
  Trash2,
  BookOpen,
  Target,
  Type,
  Lightbulb,
  Table,
  Book,
  Users,
  FileText,
  Zap,
  Search,
} from 'lucide-react';
import { Lesson, IntroductionPage, ExercisePage } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';
import { ContentEditor } from './ContentEditor';
import { LessonPlayer } from '@/src/components/ui/lesson/lesson-player';

interface LessonBuilderProps {
  initialLesson?: Lesson;
  onSave: (lesson: Lesson) => void;
}

export const LessonBuilder: React.FC<LessonBuilderProps> = ({ initialLesson, onSave }) => {
  const [lesson, setLesson] = useState<Lesson>(
    initialLesson || {
      id: `lesson-${Date.now()}`,
      title: 'New Lesson',
      description: '',
      introduction: [],
      exercises: [],
    }
  );

  const [editingContent, setEditingContent] = useState<{
    content: RenderableContentItem;
    pageType: 'introduction' | 'exercises';
    pageIndex: number;
    itemIndex: number;
  } | null>(null);

  // Add new introduction page
  const addIntroductionPage = () => {
    const newPage: IntroductionPage = {
      id: `intro-page-${Date.now()}`,
      title: 'New Introduction Page',
      items: [],
      audioPath: null,
    };

    setLesson(prev => ({
      ...prev,
      introduction: [...prev.introduction, newPage],
    }));
  };

  // Add new exercise page
  const addExercisePage = () => {
    const newPage: ExercisePage = {
      id: `exercise-page-${Date.now()}`,
      title: 'New Exercise Page',
      items: [],
      audioPath: null,
    };

    setLesson(prev => ({
      ...prev,
      exercises: [...prev.exercises, newPage],
    }));
  };

  // Add content to a page
  const addContentToPage = (pageType: 'introduction' | 'exercises', pageIndex: number, contentType: string) => {
    const newContent = createNewContent(contentType);

    setLesson(prev => {
      if (pageType === 'introduction') {
        const newIntroduction = [...prev.introduction];
        newIntroduction[pageIndex] = {
          ...newIntroduction[pageIndex],
          items: [...newIntroduction[pageIndex].items, newContent],
        };
        return {
          ...prev,
          introduction: newIntroduction,
        };
      } else {
        const newExercises = [...prev.exercises];
        newExercises[pageIndex] = {
          ...newExercises[pageIndex],
          items: [...newExercises[pageIndex].items, newContent],
        };
        return {
          ...prev,
          exercises: newExercises,
        };
      }
    });
  };

  // Create new content based on type
  const createNewContent = (type: string): RenderableContentItem => {
    const baseId = `${type}-${Date.now()}`;

    switch (type) {
      case 'text':
        return {
          id: baseId,
          type: 'text',
          title: 'New Text Block',
          content: 'Enter your text here...',
          audioPath: null,
        };
      case 'emphasis':
        return {
          id: baseId,
          type: 'emphasis',
          title: 'Important Note',
          content: 'Enter emphasized content here...',
          audioPath: null,
        };
      case 'table':
        return {
          id: baseId,
          type: 'table',
          title: 'New Table',
          audioPath: null,
          tableData: {
            title: 'Table Title',
            columns: [
              { id: 'col1', header: 'Column 1' },
              { id: 'col2', header: 'Column 2' },
            ],
            rows: [
              {
                id: 'row1',
                cells: { col1: 'Cell 1', col2: 'Cell 2' },
              },
            ],
          },
        };
      case 'vocabulary':
        return {
          id: baseId,
          type: 'vocabulary',
          title: 'Vocabulary List',
          vocabularyItems: [],
          studyMode: 'flashcards',
        };
      case 'matching':
        return {
          id: baseId,
          type: 'matching',
          title: 'Matching Exercise',
          instructions: 'Match the items from the left column with the right column.',
          audioPath: null,
          data: {
            leftColumn: ['Item 1', 'Item 2'],
            rightColumn: ['Match A', 'Match B'],
            answers: {
              'Item 1': 'Match A',
              'Item 2': 'Match B',
            },
          },
        };
      case 'fill':
        return {
          id: baseId,
          type: 'fill',
          title: 'Fill in the Blanks',
          instructions: 'Complete the sentences by filling in the blanks.',
          audioPath: null,
          data: {
            items: [
              {
                text: 'Sample sentence',
                answer: 'answer',
              },
            ],
          },
        };
      case 'text-selection':
        return {
          id: baseId,
          type: 'text-selection',
          title: 'Text Selection Exercise',
          instructions: 'Select the correct words in the passage.',
          audioPath: null,
          data: {
            passage: 'Sample passage with selectable words.',
            questions: [
              {
                id: 'q1',
                text: 'Select the correct word',
                correctWord: 'correct',
                explanation: 'This is the correct selection.',
              },
            ],
          },
        };
      case 'verb-analysis':
        return {
          id: baseId,
          type: 'verb-analysis',
          title: 'Verb Analysis Exercise',
          instructions: 'Analyze the verbs in the passage.',
          audioPath: null,
          data: {
            passage: 'Passage with verbs to analyze.',
            verbs: [
              {
                word: 'verb',
                correctPronoun: 'he/she/it',
                explanation: 'This verb is third person singular.',
              },
            ],
          },
        };
      case 'verb-conjugation':
        return {
          id: baseId,
          type: 'verb-conjugation',
          title: 'Verb Conjugation Exercise',
          instructions: 'Practice verb conjugations.',
          audioPath: null,
          data: {
            passage: {
              latin: 'Latin passage',
              translation: 'English translation',
              specialVocab: {},
            },
            conjugationTask: {
              instructions: 'Conjugate the verb',
              answer: 'correct conjugation',
            },
            livingLatinPractice: {
              examples: [
                {
                  latin: 'Latin example',
                  translation: 'English example',
                },
              ],
              exercises: [
                {
                  english: 'English phrase',
                  answer: 'Latin answer',
                },
              ],
            },
          },
        };
      default:
        throw new Error(`Unknown content type: ${type}`);
    }
  };

  // Edit content item
  const editContent = (pageType: 'introduction' | 'exercises', pageIndex: number, itemIndex: number) => {
    const content =
      pageType === 'introduction'
        ? lesson.introduction[pageIndex].items[itemIndex]
        : lesson.exercises[pageIndex].items[itemIndex];

    setEditingContent({
      content,
      pageType,
      pageIndex,
      itemIndex,
    });
  };

  // Save edited content
  const saveEditedContent = (updatedContent: RenderableContentItem) => {
    if (!editingContent) return;

    setLesson(prev => {
      const newLesson = { ...prev };
      if (editingContent.pageType === 'introduction') {
        newLesson.introduction[editingContent.pageIndex].items[editingContent.itemIndex] = updatedContent;
      } else {
        newLesson.exercises[editingContent.pageIndex].items[editingContent.itemIndex] = updatedContent;
      }
      return newLesson;
    });

    setEditingContent(null);
  };

  // Remove content item
  const removeContent = (pageType: 'introduction' | 'exercises', pageIndex: number, itemIndex: number) => {
    setLesson(prev => {
      if (pageType === 'introduction') {
        const newIntroduction = [...prev.introduction];
        newIntroduction[pageIndex] = {
          ...newIntroduction[pageIndex],
          items: newIntroduction[pageIndex].items.filter((_, index) => index !== itemIndex),
        };
        return {
          ...prev,
          introduction: newIntroduction,
        };
      } else {
        const newExercises = [...prev.exercises];
        newExercises[pageIndex] = {
          ...newExercises[pageIndex],
          items: newExercises[pageIndex].items.filter((_, index) => index !== itemIndex),
        };
        return {
          ...prev,
          exercises: newExercises,
        };
      }
    });
  };

  // Remove page
  const removePage = (pageType: 'introduction' | 'exercises', pageIndex: number) => {
    setLesson(prev => {
      if (pageType === 'introduction') {
        return {
          ...prev,
          introduction: prev.introduction.filter((_, index) => index !== pageIndex),
        };
      } else {
        return {
          ...prev,
          exercises: prev.exercises.filter((_, index) => index !== pageIndex),
        };
      }
    });
  };

  // Content type icons and labels
  const contentTypes = [
    { type: 'text', icon: Type, label: 'Text Block' },
    { type: 'emphasis', icon: Lightbulb, label: 'Emphasis' },
    { type: 'table', icon: Table, label: 'Table' },
    { type: 'vocabulary', icon: Book, label: 'Vocabulary' },
  ];

  const exerciseTypes = [
    // Exercise-specific types
    { type: 'matching', icon: Target, label: 'Matching' },
    { type: 'fill', icon: Target, label: 'Fill-in-Blank' },
    { type: 'text-selection', icon: Search, label: 'Text Selection' },
    { type: 'verb-analysis', icon: Zap, label: 'Verb Analysis' },
    { type: 'verb-conjugation', icon: Users, label: 'Verb Conjugation' },
    // Content types also available in exercises
    { type: 'text', icon: FileText, label: 'Text Block' },
    { type: 'emphasis', icon: Lightbulb, label: 'Emphasis' },
    { type: 'table', icon: Table, label: 'Table' },
    { type: 'vocabulary', icon: Book, label: 'Vocabulary' },
  ];

  return (
    <>
      <div className="flex h-screen bg-roman-marble">
        {/* Left Panel - Editor */}
        <div className="w-1/2 overflow-y-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-serif text-gray-800">Lesson Builder</h1>
              <p className="text-roman-stone">Create and edit lesson content</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => onSave(lesson)}>Save Lesson</Button>
            </div>
          </div>

          {/* Lesson Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Lesson Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">ID</label>
                <input
                  type="text"
                  value={lesson.id}
                  onChange={e => setLesson(prev => ({ ...prev, id: e.target.value }))}
                  className="w-full p-2 border rounded-md"
                  placeholder="lesson-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={lesson.title}
                  onChange={e => setLesson(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-2 border rounded-md"
                  placeholder="Enter lesson title..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={lesson.description || ''}
                  onChange={e => setLesson(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-2 border rounded-md"
                  rows={2}
                  placeholder="Enter lesson description..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Introduction Pages */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Introduction Pages ({lesson.introduction.length})
                </span>
                <Button onClick={addIntroductionPage} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Page
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {lesson.introduction.map((page, pageIndex) => (
                <div key={page.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={page.title || ''}
                      onChange={e => {
                        setLesson(prev => {
                          const newLesson = { ...prev };
                          newLesson.introduction[pageIndex].title = e.target.value;
                          return newLesson;
                        });
                      }}
                      className="text-lg font-medium bg-transparent border-none outline-none"
                      placeholder="Page title..."
                    />
                    <Button variant="ghost" size="sm" onClick={() => removePage('introduction', pageIndex)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Content Items */}
                  <div className="space-y-2">
                    {page.items.map((item, itemIndex) => (
                      <div key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                        <div className="flex items-center gap-2">
                          {item.type === 'text' && <Type className="h-4 w-4" />}
                          {item.type === 'emphasis' && <Lightbulb className="h-4 w-4" />}
                          {item.type === 'table' && <Table className="h-4 w-4" />}
                          {item.type === 'vocabulary' && <Book className="h-4 w-4" />}
                          <span className="font-medium">{item.title}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editContent('introduction', pageIndex, itemIndex)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeContent('introduction', pageIndex, itemIndex)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Content Buttons */}
                  <div className="flex gap-2 pt-2 border-t">
                    {contentTypes.map(({ type, icon: Icon, label }) => (
                      <Button
                        key={type}
                        variant="outline"
                        size="sm"
                        onClick={() => addContentToPage('introduction', pageIndex, type)}>
                        <Icon className="h-4 w-4 mr-1" />
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Exercise Pages */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Exercise Pages ({lesson.exercises.length})
                </span>
                <Button onClick={addExercisePage} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Page
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {lesson.exercises.map((page, pageIndex) => (
                <div key={page.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={page.title || ''}
                      onChange={e => {
                        setLesson(prev => {
                          const newLesson = { ...prev };
                          newLesson.exercises[pageIndex].title = e.target.value;
                          return newLesson;
                        });
                      }}
                      className="text-lg font-medium bg-transparent border-none outline-none"
                      placeholder="Page title..."
                    />
                    <Button variant="ghost" size="sm" onClick={() => removePage('exercises', pageIndex)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Content Items */}
                  <div className="space-y-2">
                    {page.items.map((item, itemIndex) => (
                      <div key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4" />
                          <span className="font-medium">{item.title}</span>
                          <span className="text-sm text-gray-500">({item.type})</span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editContent('exercises', pageIndex, itemIndex)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeContent('exercises', pageIndex, itemIndex)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Content Buttons */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    {exerciseTypes.map(({ type, icon: Icon, label }) => (
                      <Button
                        key={type}
                        variant="outline"
                        size="sm"
                        onClick={() => addContentToPage('exercises', pageIndex, type)}>
                        <Icon className="h-4 w-4 mr-1" />
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Live Preview */}
        <div className="w-1/2 border-l border-border bg-white overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-border p-4 z-10">
            <h2 className="text-xl font-serif text-gray-800 flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Live Preview
            </h2>
            <p className="text-sm text-roman-stone">See how your lesson will look to students</p>
          </div>
          <div className="p-4">
            {lesson.introduction.length > 0 || lesson.exercises.length > 0 ? (
              <LessonPlayer lesson={lesson} />
            ) : (
              <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg">
                <div className="text-center">
                  <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Add pages to see preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Editor Modal */}
      {editingContent && (
        <ContentEditor
          content={editingContent.content}
          onSave={saveEditedContent}
          onClose={() => setEditingContent(null)}
        />
      )}
    </>
  );
};
