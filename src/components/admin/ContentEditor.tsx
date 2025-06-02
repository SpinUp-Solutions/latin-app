'use client';

import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { X, Plus, Trash2 } from 'lucide-react';
import { RenderableContentItem } from '@/src/types/page';
import { TextContent, EmphasisContent, TableContent, VocabularyContent } from '@/src/types/lesson';

interface ContentEditorProps {
  content: RenderableContentItem;
  onSave: (content: RenderableContentItem) => void;
  onClose: () => void;
}

export const ContentEditor: React.FC<ContentEditorProps> = ({ content, onSave, onClose }) => {
  const [editedContent, setEditedContent] = useState<RenderableContentItem>(content);

  const handleSave = () => {
    onSave(editedContent);
    onClose();
  };

  const renderEditor = () => {
    switch (editedContent.type) {
      case 'text':
        return <TextEditor content={editedContent as TextContent} onChange={setEditedContent} />;
      case 'emphasis':
        return <EmphasisEditor content={editedContent as EmphasisContent} onChange={setEditedContent} />;
      case 'table':
        return <TableEditor content={editedContent as TableContent} onChange={setEditedContent} />;
      case 'vocabulary':
        return <VocabularyEditor content={editedContent as VocabularyContent} onChange={setEditedContent} />;
      default:
        return <div>Editor not implemented for type: {editedContent.type}</div>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">Edit {editedContent.type} Content</h2>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4">{renderEditor()}</div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
};

// Text Content Editor
const TextEditor: React.FC<{
  content: TextContent;
  onChange: (content: RenderableContentItem) => void;
}> = ({ content, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          type="text"
          value={content.title || ''}
          onChange={e => onChange({ ...content, title: e.target.value })}
          className="w-full p-2 border rounded-md"
          placeholder="Enter title..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Content</label>
        <textarea
          value={content.content}
          onChange={e => onChange({ ...content, content: e.target.value })}
          className="w-full p-2 border rounded-md"
          rows={6}
          placeholder="Enter your text content..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Audio Path (optional)</label>
        <input
          type="text"
          value={content.audioPath || ''}
          onChange={e => onChange({ ...content, audioPath: e.target.value || null })}
          className="w-full p-2 border rounded-md"
          placeholder="/assets/audio/example.mp3"
        />
      </div>
    </div>
  );
};

// Emphasis Content Editor
const EmphasisEditor: React.FC<{
  content: EmphasisContent;
  onChange: (content: RenderableContentItem) => void;
}> = ({ content, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          type="text"
          value={content.title || ''}
          onChange={e => onChange({ ...content, title: e.target.value })}
          className="w-full p-2 border rounded-md"
          placeholder="Enter title..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Emphasized Content</label>
        <textarea
          value={content.content}
          onChange={e => onChange({ ...content, content: e.target.value })}
          className="w-full p-2 border rounded-md"
          rows={4}
          placeholder="Enter emphasized content..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Audio Path (optional)</label>
        <input
          type="text"
          value={content.audioPath || ''}
          onChange={e => onChange({ ...content, audioPath: e.target.value || null })}
          className="w-full p-2 border rounded-md"
          placeholder="/assets/audio/example.mp3"
        />
      </div>
    </div>
  );
};

// Table Content Editor
const TableEditor: React.FC<{
  content: TableContent;
  onChange: (content: RenderableContentItem) => void;
}> = ({ content, onChange }) => {
  const addColumn = () => {
    const newColumn = {
      id: `col-${Date.now()}`,
      header: 'New Column',
    };

    const updatedContent = {
      ...content,
      tableData: {
        ...content.tableData,
        columns: [...content.tableData.columns, newColumn],
        rows: content.tableData.rows.map((row: any) => ({
          ...row,
          cells: { ...row.cells, [newColumn.id]: '' },
        })),
      },
    };

    onChange(updatedContent);
  };

  const addRow = () => {
    const newRow = {
      id: `row-${Date.now()}`,
      cells: content.tableData.columns.reduce((acc: Record<string, string>, col: any) => {
        acc[col.id] = '';
        return acc;
      }, {}),
    };

    const updatedContent = {
      ...content,
      tableData: {
        ...content.tableData,
        rows: [...content.tableData.rows, newRow],
      },
    };

    onChange(updatedContent);
  };

  const updateCell = (rowId: string, colId: string, value: string) => {
    const updatedContent = {
      ...content,
      tableData: {
        ...content.tableData,
        rows: content.tableData.rows.map((row: any) =>
          row.id === rowId ? { ...row, cells: { ...row.cells, [colId]: value } } : row
        ),
      },
    };

    onChange(updatedContent);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Table Title</label>
        <input
          type="text"
          value={content.tableData.title}
          onChange={e =>
            onChange({
              ...content,
              tableData: { ...content.tableData, title: e.target.value },
            })
          }
          className="w-full p-2 border rounded-md"
          placeholder="Enter table title..."
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Table Data</label>
          <div className="flex gap-2">
            <Button onClick={addColumn} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Add Column
            </Button>
            <Button onClick={addRow} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Add Row
            </Button>
          </div>
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Row</th>
                {content.tableData.columns.map((col: any) => (
                  <th key={col.id} className="p-2 text-left">
                    <input
                      type="text"
                      value={col.header}
                      onChange={e => {
                        const updatedContent = {
                          ...content,
                          tableData: {
                            ...content.tableData,
                            columns: content.tableData.columns.map((c: any) =>
                              c.id === col.id ? { ...c, header: e.target.value } : c
                            ),
                          },
                        };
                        onChange(updatedContent);
                      }}
                      className="w-full p-1 border rounded text-sm"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.tableData.rows.map((row: any) => (
                <tr key={row.id} className="border-t">
                  <td className="p-2 text-sm text-gray-500">{row.id}</td>
                  {content.tableData.columns.map((col: any) => (
                    <td key={col.id} className="p-2">
                      <input
                        type="text"
                        value={row.cells[col.id] || ''}
                        onChange={e => updateCell(row.id, col.id, e.target.value)}
                        className="w-full p-1 border rounded text-sm"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Vocabulary Content Editor
const VocabularyEditor: React.FC<{
  content: VocabularyContent;
  onChange: (content: RenderableContentItem) => void;
}> = ({ content, onChange }) => {
  const addVocabularyItem = () => {
    const newItem = {
      id: `vocab-${Date.now()}`,
      latin: '',
      english: '',
      pronunciation: '',
      partOfSpeech: '',
      example: '',
      notes: '',
    };

    const updatedContent = {
      ...content,
      vocabularyItems: [...content.vocabularyItems, newItem],
    };

    onChange(updatedContent);
  };

  const updateVocabularyItem = (index: number, field: string, value: string) => {
    const updatedContent = {
      ...content,
      vocabularyItems: content.vocabularyItems.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    };

    onChange(updatedContent);
  };

  const removeVocabularyItem = (index: number) => {
    const updatedContent = {
      ...content,
      vocabularyItems: content.vocabularyItems.filter((_, i) => i !== index),
    };

    onChange(updatedContent);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          type="text"
          value={content.title || ''}
          onChange={e => onChange({ ...content, title: e.target.value })}
          className="w-full p-2 border rounded-md"
          placeholder="Enter vocabulary list title..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Study Mode</label>
        <select
          value={content.studyMode || 'flashcards'}
          onChange={e => onChange({ ...content, studyMode: e.target.value as any })}
          className="w-full p-2 border rounded-md">
          <option value="flashcards">Flashcards</option>
          <option value="list">List</option>
          <option value="quiz">Quiz</option>
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Vocabulary Items</label>
          <Button onClick={addVocabularyItem} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Add Word
          </Button>
        </div>

        <div className="space-y-4">
          {content.vocabularyItems.map((item, index) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-medium">Word {index + 1}</h4>
                  <Button onClick={() => removeVocabularyItem(index)} size="sm" variant="ghost">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Latin</label>
                    <input
                      type="text"
                      value={item.latin}
                      onChange={e => updateVocabularyItem(index, 'latin', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="Latin word..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">English</label>
                    <input
                      type="text"
                      value={item.english}
                      onChange={e => updateVocabularyItem(index, 'english', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="English translation..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Pronunciation</label>
                    <input
                      type="text"
                      value={item.pronunciation || ''}
                      onChange={e => updateVocabularyItem(index, 'pronunciation', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="Pronunciation..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Part of Speech</label>
                    <input
                      type="text"
                      value={item.partOfSpeech || ''}
                      onChange={e => updateVocabularyItem(index, 'partOfSpeech', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="noun, verb, etc..."
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Example</label>
                    <input
                      type="text"
                      value={item.example || ''}
                      onChange={e => updateVocabularyItem(index, 'example', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="Example sentence..."
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Notes</label>
                    <textarea
                      value={item.notes || ''}
                      onChange={e => updateVocabularyItem(index, 'notes', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      rows={2}
                      placeholder="Additional notes..."
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
