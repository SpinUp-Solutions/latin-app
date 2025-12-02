import StarterKit from '@tiptap/starter-kit';
import { Extensions } from '@tiptap/core';
import { Tooltip } from '@/src/components/ui/core/tooltip-extension';
import { Hyperlink } from '@/src/components/ui/core/hyperlink-extension';
import { DiagrammingExtensions } from '@/src/components/ui/core/diagramming-extensions';

export type EditorMode = 'admin' | 'student' | 'readonly' | 'simple';

export interface ExtensionSetOptions {
  mode: EditorMode;
  enableTooltips?: boolean;
  enableHyperlinks?: boolean;
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
  } as const;

  if (mode === 'readonly') {
    return {
      ...baseConfig,
      // Disable all text editing features for readonly mode
      paragraph: false,
      text: false,
    } as const;
  }

  if (mode === 'simple') {
    return {
      ...baseConfig,
      // Keep only basic text and formatting (bold, italic) for simple mode
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
      dropcursor: false,
      gapcursor: false,
    } as const;
  }

  return baseConfig;
};

export const createExtensionSet = ({
  mode,
  enableTooltips = true,
  enableHyperlinks = true,
  enableAnnotations = true,
}: ExtensionSetOptions): Extensions => {
  const extensions: Extensions = [StarterKit.configure(getStarterKitConfig(mode))];

  if (enableTooltips) {
    extensions.push(Tooltip);
  }

  if (enableHyperlinks) {
    extensions.push(Hyperlink);
  }

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

export const getSimpleExtensions = (options?: Partial<ExtensionSetOptions>) =>
  createExtensionSet({ mode: 'simple', enableTooltips: false, enableAnnotations: false, ...options });
