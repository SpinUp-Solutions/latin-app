import StarterKit from '@tiptap/starter-kit';
import { Extension } from '@tiptap/core';
import { Tooltip } from '@/src/components/ui/core/tooltip-extension';
import { DiagrammingExtensions } from '@/src/components/ui/core/diagramming-extensions';

export type EditorMode = 'admin' | 'student' | 'readonly';

export interface ExtensionSetOptions {
  mode: EditorMode;
  enableTooltips?: boolean;
  enableAnnotations?: boolean;
}

const getStarterKitConfig = (mode: EditorMode) => {
  const baseConfig = {
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    blockquote: false,
    codeBlock: false,
    hardBreak: false,
    horizontalRule: false,
  };

  if (mode === 'readonly') {
    return {
      ...baseConfig,
      // Disable all text editing features for readonly mode
      paragraph: false,
      text: false,
    };
  }

  return baseConfig;
};

export const createExtensionSet = ({
  mode,
  enableTooltips = true,
  enableAnnotations = true,
}: ExtensionSetOptions): Extension[] => {
  const extensions: Extension[] = [
    StarterKit.configure(getStarterKitConfig(mode)),
  ];

  // Add tooltips for all modes except when explicitly disabled
  if (enableTooltips) {
    extensions.push(Tooltip);
  }

  // Add diagramming annotations for admin and student modes
  if (enableAnnotations && (mode === 'admin' || mode === 'student')) {
    extensions.push(...DiagrammingExtensions);
  }

  return extensions;
};

// Convenience functions for common use cases
export const getAdminExtensions = (options?: Partial<ExtensionSetOptions>) =>
  createExtensionSet({ mode: 'admin', ...options });

export const getStudentExtensions = (options?: Partial<ExtensionSetOptions>) =>
  createExtensionSet({ mode: 'student', ...options });

export const getReadonlyExtensions = (options?: Partial<ExtensionSetOptions>) =>
  createExtensionSet({ mode: 'readonly', ...options });

// Extension presets for specific use cases
export const EXTENSION_PRESETS = {
  ADMIN_FULL: () => getAdminExtensions(),
  STUDENT_PRACTICE: () => getStudentExtensions({ enableTooltips: false }),
  STUDENT_WITH_TOOLTIPS: () => getStudentExtensions(),
  READONLY_WITH_TOOLTIPS: () => getReadonlyExtensions(),
  READONLY_SIMPLE: () => getReadonlyExtensions({ enableTooltips: false, enableAnnotations: false }),
} as const;